"""The paths where being wrong costs money: stock movement, margin, khata
balance -- plus the tenant isolation that used to be missing entirely.
"""
import pytest

from datetime import datetime, timedelta

from conftest import sign_in


def _other_vendor(client, name):
    """A second shop, for the tenant-isolation cases."""
    return sign_in(
        client,
        name=name.title(),
        username=name,
        email=f"{name}@example.com",
        phone=f"+91 9{abs(hash(name)) % 1000000000:09d}",
        password="another-good-password",
    )


# --------------------------------------------------------------------------
# Access control
# --------------------------------------------------------------------------
def test_endpoints_require_a_token(client):
    for method, path in [
        ("get", "/api/inventory"),
        ("get", "/api/customers"),
        ("get", "/api/analytics/sales-trend"),
        ("get", "/api/vendor/me"),
        ("post", "/api/sales"),
    ]:
        response = getattr(client, method)(path)
        assert response.status_code == 401, f"{method.upper()} {path} was reachable without a token"


def test_a_vendor_cannot_touch_another_vendors_stock(client, vendor, item):
    """The original build took vendor_id from the URL, so changing it exposed
    someone else's shop. Identity now comes from the token only."""
    other_headers, _ = _other_vendor(client, "otherowner")

    assert client.get(f"/api/inventory/{item['id']}", headers=other_headers).status_code == 404
    assert client.get("/api/inventory", headers=other_headers).json() == []


def test_garbage_token_is_rejected(client):
    response = client.get("/api/inventory", headers={"Authorization": "Bearer not.a.token"})
    assert response.status_code == 401


# --------------------------------------------------------------------------
# Billing: stock and margin
# --------------------------------------------------------------------------
def test_a_sale_reduces_stock(client, vendor, item):
    headers, _ = vendor
    response = client.post(
        "/api/sales",
        headers=headers,
        json={"payment_mode": "cash", "items": [{"item_id": item["id"], "qty": 3}]},
    )
    assert response.status_code == 201, response.text

    after = client.get(f"/api/inventory/{item['id']}", headers=headers).json()
    assert after["current_qty"] == 17  # 20 - 3


def test_sale_totals_and_margin(client, vendor, item):
    headers, _ = vendor
    response = client.post(
        "/api/sales",
        headers=headers,
        json={"payment_mode": "cash", "items": [{"item_id": item["id"], "qty": 4}]},
    ).json()

    # 4 x 33.00 sold, 4 x 27.00 cost
    assert response["sale"]["total_amount"] == 132.0
    assert response["sale"]["profit"] == 24.0


def test_overselling_is_allowed_but_flagged(client, vendor, item):
    """A customer is standing at the counter -- never block the sale. Clamp the
    count at zero and tell the shopkeeper the count is wrong."""
    headers, _ = vendor
    response = client.post(
        "/api/sales",
        headers=headers,
        json={"payment_mode": "cash", "items": [{"item_id": item["id"], "qty": 25}]},
    )
    assert response.status_code == 201
    assert response.json()["stock_warnings"], "expected a warning about the stock count"

    after = client.get(f"/api/inventory/{item['id']}", headers=headers).json()
    assert after["current_qty"] == 0  # clamped, never negative


def test_price_override_is_respected(client, vendor, item):
    headers, _ = vendor
    response = client.post(
        "/api/sales",
        headers=headers,
        json={"payment_mode": "cash", "items": [{"item_id": item["id"], "qty": 2, "unit_price": 30.0}]},
    ).json()
    assert response["sale"]["total_amount"] == 60.0


def test_voiding_a_sale_restores_stock(client, vendor, item):
    headers, _ = vendor
    sale = client.post(
        "/api/sales",
        headers=headers,
        json={"payment_mode": "cash", "items": [{"item_id": item["id"], "qty": 5}]},
    ).json()["sale"]

    assert client.delete(f"/api/sales/{sale['id']}", headers=headers).status_code == 204
    after = client.get(f"/api/inventory/{item['id']}", headers=headers).json()
    assert after["current_qty"] == 20


def test_selling_another_vendors_item_fails(client, vendor, item):
    other_headers, _ = _other_vendor(client, "othertwo")

    response = client.post(
        "/api/sales",
        headers=other_headers,
        json={"payment_mode": "cash", "items": [{"item_id": item["id"], "qty": 1}]},
    )
    assert response.status_code == 404


# --------------------------------------------------------------------------
# Khata balance arithmetic
# --------------------------------------------------------------------------
def _make_customer(client, headers, balance=0.0):
    return client.post(
        "/api/customers",
        headers=headers,
        json={"name": "Test Customer", "phone": "+91 9876543210", "initial_credit_balance": balance},
    ).json()


def test_credit_increases_balance(client, vendor):
    headers, _ = vendor
    customer = _make_customer(client, headers, 100.0)
    updated = client.post(
        f"/api/customers/{customer['id']}/transaction",
        headers=headers,
        json={"amount": 250.0, "transaction_type": "credit"},
    ).json()
    assert updated["total_credit_balance"] == 350.0


def test_payment_reduces_balance(client, vendor):
    headers, _ = vendor
    customer = _make_customer(client, headers, 1000.0)
    updated = client.post(
        f"/api/customers/{customer['id']}/transaction",
        headers=headers,
        json={"amount": 400.0, "transaction_type": "payment"},
    ).json()
    assert updated["total_credit_balance"] == 600.0


def test_overpayment_becomes_an_advance_instead_of_vanishing(client, vendor):
    """The old max(0.0, balance - amount) silently ate the difference: paying
    Rs 2000 against Rs 1450 destroyed Rs 550 of the customer's money."""
    headers, _ = vendor
    customer = _make_customer(client, headers, 1450.0)
    updated = client.post(
        f"/api/customers/{customer['id']}/transaction",
        headers=headers,
        json={"amount": 2000.0, "transaction_type": "payment"},
    ).json()
    assert updated["total_credit_balance"] == -550.0


def test_khata_sale_adds_to_the_customers_balance(client, vendor, item):
    headers, _ = vendor
    customer = _make_customer(client, headers, 0.0)
    response = client.post(
        "/api/sales",
        headers=headers,
        json={
            "payment_mode": "khata",
            "customer_id": customer["id"],
            "items": [{"item_id": item["id"], "qty": 2}],
        },
    ).json()
    assert response["customer_balance"] == 66.0  # 2 x 33.00


def test_khata_sale_needs_a_customer(client, vendor, item):
    headers, _ = vendor
    response = client.post(
        "/api/sales",
        headers=headers,
        json={"payment_mode": "khata", "items": [{"item_id": item["id"], "qty": 1}]},
    )
    assert response.status_code == 400


def test_negative_and_zero_transactions_are_rejected(client, vendor):
    headers, _ = vendor
    customer = _make_customer(client, headers, 100.0)
    for amount in (0, -50):
        response = client.post(
            f"/api/customers/{customer['id']}/transaction",
            headers=headers,
            json={"amount": amount, "transaction_type": "credit"},
        )
        assert response.status_code == 422


# --------------------------------------------------------------------------
# Analytics honesty
# --------------------------------------------------------------------------
def test_analytics_report_no_data_rather_than_inventing_it(client, vendor):
    headers, _ = vendor
    assert client.get("/api/analytics/sales-trend", headers=headers).json()["has_data"] is False
    assert client.get("/api/analytics/health-score", headers=headers).json()["has_data"] is False
    assert client.get("/api/analytics/forecast", headers=headers).json()["has_data"] is False


def test_sales_trend_reflects_actual_sales(client, vendor, item):
    headers, _ = vendor
    client.post(
        "/api/sales",
        headers=headers,
        json={"payment_mode": "cash", "items": [{"item_id": item["id"], "qty": 2}]},
    )
    trend = client.get("/api/analytics/sales-trend", headers=headers).json()
    assert trend["has_data"] is True
    assert trend["today_sales"] == 66.0
    assert trend["today_profit"] == 12.0  # 2 x (33 - 27)


def test_day_close_splits_by_payment_mode(client, vendor, item):
    headers, _ = vendor
    client.post("/api/sales", headers=headers,
                json={"payment_mode": "cash", "items": [{"item_id": item["id"], "qty": 1}]})
    client.post("/api/sales", headers=headers,
                json={"payment_mode": "upi", "items": [{"item_id": item["id"], "qty": 2}]})

    summary = client.get("/api/sales/day-close", headers=headers).json()
    assert summary["bill_count"] == 2
    assert summary["by_payment_mode"]["cash"] == 33.0
    assert summary["by_payment_mode"]["upi"] == 66.0
    assert summary["revenue"] == 99.0


# --------------------------------------------------------------------------
# Auth behaviour
# --------------------------------------------------------------------------
def test_duplicate_username_is_rejected(client, vendor):
    response = client.post(
        "/api/auth/signup",
        json={
            "name": "Copycat", "username": "testowner", "email": "different@example.com",
            "phone": "+91 9333333333", "password": "a-good-password",
        },
    )
    assert response.status_code == 409


def test_short_passwords_are_rejected(client):
    response = client.post(
        "/api/auth/signup",
        json={
            "name": "Short", "username": "shortpw", "email": "short@example.com",
            "phone": "+91 9444444444", "password": "abc",
        },
    )
    assert response.status_code == 422


def test_wrong_password_gives_the_same_error_as_unknown_user(client, vendor):
    unknown = client.post("/api/auth/login", json={"identifier": "ghost", "password": "whatever1"})
    wrong = client.post("/api/auth/login", json={"identifier": "testowner", "password": "wrongpassword"})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json()["detail"] == wrong.json()["detail"]


def test_login_does_not_return_a_token_before_otp(client, vendor):
    response = client.post(
        "/api/auth/login", json={"identifier": "testowner", "password": "a-good-password"}
    ).json()
    assert "token" not in response
    assert response["vendor_id"]


# --------------------------------------------------------------------------
# Inventory
# --------------------------------------------------------------------------
def test_expiring_soon_suggests_a_price_above_cost(client, vendor):

    headers, _ = vendor
    client.post(
        "/api/inventory",
        headers=headers,
        json={
            "sku_name": "Nearly Expired Dahi",
            "current_qty": 10,
            "cost_price": 30.0,
            "selling_price": 38.0,
            "expiry_date": (datetime.utcnow() + timedelta(days=1)).isoformat(),
        },
    )
    expiring = client.get("/api/inventory/expiring-soon", headers=headers).json()
    assert len(expiring) == 1
    assert expiring[0]["estimated_loss_risk"] == 300.0
    # 30% off 38.00 is 26.60, which is below the 30.00 cost -- clamp to cost.
    assert expiring[0]["suggested_price"] >= 30.0


def test_deleting_an_item_hides_it_but_keeps_sale_history(client, vendor, item):
    headers, _ = vendor
    client.post("/api/sales", headers=headers,
                json={"payment_mode": "cash", "items": [{"item_id": item["id"], "qty": 1}]})

    assert client.delete(f"/api/inventory/{item['id']}", headers=headers).status_code == 204
    assert client.get("/api/inventory", headers=headers).json() == []

    recent = client.get("/api/sales/recent", headers=headers).json()
    assert recent[0]["line_items"][0]["sku_name"] == "Test Milk 500ml"


def test_duplicate_barcode_is_rejected(client, vendor):
    headers, _ = vendor
    payload = {"sku_name": "A", "barcode": "8901234567890", "current_qty": 1}
    assert client.post("/api/inventory", headers=headers, json=payload).status_code == 201
    payload["sku_name"] = "B"
    assert client.post("/api/inventory", headers=headers, json=payload).status_code == 409


# --------------------------------------------------------------------------
# Stock intake -- scanning a delivery in
# --------------------------------------------------------------------------
def _loose(client, headers, **overrides):
    payload = {
        "sku_name": "Parle-G 100g", "barcode": "8901719101090", "current_qty": 4,
        "cost_price": 8.0, "selling_price": 10.0, "pack_type": "loose", "gst_rate": 5.0,
    }
    payload.update(overrides)
    res = client.post("/api/inventory", headers=headers, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _carton(client, headers, **overrides):
    payload = {
        "sku_name": "Maggi 70g", "barcode": "8901058000108", "current_qty": 0,
        "cost_price": 11.0, "selling_price": 14.0, "pack_type": "carton",
        "units_per_pack": 24, "gst_rate": 12.0, "hsn_code": "1902",
    }
    payload.update(overrides)
    res = client.post("/api/inventory", headers=headers, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def test_scanning_a_loose_item_restocks_it_immediately(client, vendor):
    headers, _ = vendor
    product = _loose(client, headers)

    res = client.post("/api/intake/scan", headers=headers, json={"barcode": product["barcode"]})
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["status"] == "applied"
    assert body["line"]["qty_units"] == 1
    assert body["item"]["current_qty"] == 5


def test_scanning_a_carton_asks_before_writing_stock(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers)

    body = client.post("/api/intake/scan", headers=headers,
                       json={"barcode": product["barcode"]}).json()

    assert body["status"] == "confirm"
    assert body["suggestion"]["units_per_pack"] == 24
    assert body["suggestion"]["qty_units"] == 24
    # Nothing moved yet -- that is the whole point of the confirm step.
    assert client.get(f"/api/inventory/{product['id']}", headers=headers).json()["current_qty"] == 0


def test_confirming_a_carton_adds_the_whole_pack(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers)

    body = client.post("/api/intake/confirm", headers=headers, json={
        "item_id": product["id"], "packs": 2, "batch_no": "B12",
        "expiry_date": "2027-01-31T00:00:00",
    }).json()

    assert body["line"]["qty_units"] == 48
    assert body["item"]["current_qty"] == 48
    assert body["line"]["batch_no"] == "B12"


def test_confirm_remembers_the_pack_size_for_next_time(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers, units_per_pack=1, pack_type="carton")

    client.post("/api/intake/confirm", headers=headers,
                json={"item_id": product["id"], "packs": 1, "units_per_pack": 30,
                      "unit_cost": 9.5, "remember": True})

    updated = client.get(f"/api/inventory/{product['id']}", headers=headers).json()
    assert updated["units_per_pack"] == 30
    assert updated["cost_price"] == 9.5


def test_repeat_scans_of_one_item_become_a_single_counted_line(client, vendor):
    headers, _ = vendor
    product = _loose(client, headers)

    for _ in range(3):
        client.post("/api/intake/scan", headers=headers, json={"barcode": product["barcode"]})

    session = client.get("/api/intake/session/current", headers=headers).json()
    assert len(session["lines"]) == 1
    assert session["lines"][0]["qty_units"] == 3


def test_an_unknown_barcode_is_reported_not_invented(client, vendor):
    headers, _ = vendor
    body = client.post("/api/intake/scan", headers=headers, json={"barcode": "0000000000000"}).json()
    assert body["status"] == "unknown"
    assert body["barcode"] == "0000000000000"


def test_undoing_a_scan_takes_the_stock_back_off(client, vendor):
    headers, _ = vendor
    product = _loose(client, headers)

    line = client.post("/api/intake/scan", headers=headers,
                       json={"barcode": product["barcode"], "packs": 6}).json()["line"]
    assert client.get(f"/api/inventory/{product['id']}", headers=headers).json()["current_qty"] == 10

    assert client.delete(f"/api/intake/lines/{line['id']}", headers=headers).status_code == 204
    assert client.get(f"/api/inventory/{product['id']}", headers=headers).json()["current_qty"] == 4


def test_summary_totals_gst_and_splits_it_evenly(client, vendor):
    headers, _ = vendor
    loose = _loose(client, headers)                       # 5% GST, cost 8.00
    carton = _carton(client, headers)                     # 12% GST, cost 11.00

    client.post("/api/intake/scan", headers=headers, json={"barcode": loose["barcode"], "packs": 10})
    client.post("/api/intake/confirm", headers=headers, json={"item_id": carton["id"], "packs": 1})

    intake_id = client.get("/api/intake/session/current", headers=headers).json()["id"]
    summary = client.post(f"/api/intake/session/{intake_id}/close", headers=headers).json()

    # 10 x 8.00 = 80.00 taxable at 5%; 24 x 11.00 = 264.00 taxable at 12%.
    assert summary["totals"]["taxable_value"] == 344.0
    assert summary["totals"]["gst_amount"] == 35.68   # 4.00 + 31.68
    assert summary["totals"]["grand_total"] == 379.68

    by_rate = {row["rate"]: row for row in summary["gst_breakup"]}
    assert by_rate[5.0]["cgst"] == 2.0 and by_rate[5.0]["sgst"] == 2.0
    assert by_rate[12.0]["cgst"] == 15.84 and by_rate[12.0]["sgst"] == 15.84


def test_summary_says_when_it_is_not_a_valid_gst_claim(client, vendor):
    headers, _ = vendor
    product = _loose(client, headers)
    client.post("/api/intake/scan", headers=headers, json={"barcode": product["barcode"]})

    intake_id = client.get("/api/intake/session/current", headers=headers).json()["id"]
    summary = client.get(f"/api/intake/session/{intake_id}/summary", headers=headers).json()

    # No GSTIN on the store yet, so the document must not claim to be one.
    assert summary["gst_ready"] is False

    client.put("/api/vendor/me", headers=headers, json={
        "name": "Test Owner", "store_name": "Test Store", "gstin": "27AAPFU0939F1ZV",
    })
    summary = client.get(f"/api/intake/session/{intake_id}/summary", headers=headers).json()
    assert summary["gst_ready"] is True
    assert summary["store"]["gstin"] == "27AAPFU0939F1ZV"


def test_closing_an_empty_delivery_is_rejected(client, vendor):
    headers, _ = vendor
    intake_id = client.post("/api/intake/session", headers=headers).json()["id"]
    assert client.post(f"/api/intake/session/{intake_id}/close", headers=headers).status_code == 400


def test_a_vendor_cannot_scan_into_another_vendors_intake(client, vendor):
    headers, _ = vendor
    intake_id = client.post("/api/intake/session", headers=headers).json()["id"]

    other_headers, _ = _other_vendor(client, "otherintake")

    assert client.get(f"/api/intake/session/{intake_id}/summary",
                      headers=other_headers).status_code == 404
    assert client.put(f"/api/intake/session/{intake_id}", headers=other_headers,
                      json={"supplier_name": "Hijack"}).status_code == 404


# --------------------------------------------------------------------------
# Stock intake -- cost, expiry and tax basis
# --------------------------------------------------------------------------
def test_new_batch_does_not_hide_older_expiry(client, vendor):
    headers, _ = vendor
    soon = (datetime.utcnow() + timedelta(days=3)).isoformat()
    product = _carton(client, headers, current_qty=6, expiry_date=soon)

    # A fresh carton dated well into next year arrives behind stock that is
    # about to go off. The alert has to stay on the older date.
    client.post("/api/intake/confirm", headers=headers, json={
        "item_id": product["id"], "packs": 1,
        "expiry_date": (datetime.utcnow() + timedelta(days=400)).isoformat(),
    })

    updated = client.get(f"/api/inventory/{product['id']}", headers=headers).json()
    assert updated["expiry_date"][:10] == soon[:10]
    assert len(client.get("/api/inventory/expiring-soon", headers=headers).json()) == 1


def test_expiry_moves_forward_when_no_old_stock_remains(client, vendor):
    headers, _ = vendor
    stale = (datetime.utcnow() - timedelta(days=5)).isoformat()
    product = _carton(client, headers, current_qty=0, expiry_date=stale)

    fresh = (datetime.utcnow() + timedelta(days=200)).isoformat()
    client.post("/api/intake/confirm", headers=headers,
                json={"item_id": product["id"], "packs": 1, "expiry_date": fresh})

    # Nothing was left to protect, so the shelf now genuinely holds the new lot.
    updated = client.get(f"/api/inventory/{product['id']}", headers=headers).json()
    assert updated["expiry_date"][:10] == fresh[:10]


def test_cost_price_is_weighted_not_overwritten(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers, current_qty=10, cost_price=10.0, units_per_pack=10)

    # 10 units held at Rs 10 + 10 units arriving at Rs 20 = Rs 15 average.
    client.post("/api/intake/confirm", headers=headers,
                json={"item_id": product["id"], "packs": 1, "unit_cost": 20.0})

    assert client.get(f"/api/inventory/{product['id']}", headers=headers).json()["cost_price"] == 15.0


def test_first_delivery_takes_the_cost_it_arrived_at(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers, current_qty=0, cost_price=0.0)

    client.post("/api/intake/confirm", headers=headers,
                json={"item_id": product["id"], "packs": 1, "unit_cost": 9.5})

    # Nothing to blend with, so no averaging against a zero cost.
    assert client.get(f"/api/inventory/{product['id']}", headers=headers).json()["cost_price"] == 9.5


def test_undo_restores_cost_and_expiry(client, vendor):
    headers, _ = vendor
    original_expiry = (datetime.utcnow() + timedelta(days=300)).isoformat()
    product = _carton(client, headers, current_qty=10, cost_price=10.0,
                      units_per_pack=10, expiry_date=original_expiry)

    line = client.post("/api/intake/confirm", headers=headers, json={
        "item_id": product["id"], "packs": 1, "unit_cost": 20.0,
        "expiry_date": (datetime.utcnow() + timedelta(days=9)).isoformat(),
    }).json()["line"]

    assert client.delete(f"/api/intake/lines/{line['id']}", headers=headers).status_code == 204

    # An average cannot be un-blended, and an expiry left behind by departed
    # stock would warn about goods that are gone -- so both are recorded.
    restored = client.get(f"/api/inventory/{product['id']}", headers=headers).json()
    assert restored["cost_price"] == 10.0
    assert restored["expiry_date"][:10] == original_expiry[:10]
    assert restored["current_qty"] == 10


def test_repeat_scans_undo_back_to_before_the_first(client, vendor):
    headers, _ = vendor
    product = _loose(client, headers, current_qty=10, cost_price=10.0)

    line = None
    for _ in range(3):
        line = client.post("/api/intake/scan", headers=headers,
                           json={"barcode": product["barcode"]}).json()["line"]

    client.delete(f"/api/intake/lines/{line['id']}", headers=headers)
    assert client.get(f"/api/inventory/{product['id']}", headers=headers).json()["current_qty"] == 10


def test_interstate_supplier_is_igst(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers)
    client.put("/api/vendor/me", headers=headers, json={
        "name": "Test Owner", "store_name": "Test Store", "gstin": "27AAPFU0939F1ZV",
    })
    client.post("/api/intake/confirm", headers=headers, json={"item_id": product["id"], "packs": 1})

    intake_id = client.get("/api/intake/session/current", headers=headers).json()["id"]
    # State code 29 against the store's 27, so this is an inter-state purchase.
    client.put(f"/api/intake/session/{intake_id}", headers=headers,
               json={"supplier_gstin": "29AAPFU0939F1ZV"})

    summary = client.get(f"/api/intake/session/{intake_id}/summary", headers=headers).json()
    assert summary["interstate"] is True
    assert summary["tax_basis_assumed"] is False
    row = summary["gst_breakup"][0]
    assert row["igst"] == 31.68 and row["cgst"] == 0.0 and row["sgst"] == 0.0


def test_same_state_supplier_splits_into_cgst_and_sgst(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers)
    client.put("/api/vendor/me", headers=headers, json={
        "name": "Test Owner", "store_name": "Test Store", "gstin": "27AAPFU0939F1ZV",
    })
    client.post("/api/intake/confirm", headers=headers, json={"item_id": product["id"], "packs": 1})

    intake_id = client.get("/api/intake/session/current", headers=headers).json()["id"]
    client.put(f"/api/intake/session/{intake_id}", headers=headers,
               json={"supplier_gstin": "27ZZPFU0939F1ZV"})

    summary = client.get(f"/api/intake/session/{intake_id}/summary", headers=headers).json()
    assert summary["interstate"] is False
    row = summary["gst_breakup"][0]
    assert row["cgst"] == 15.84 and row["sgst"] == 15.84 and row["igst"] == 0.0


def test_unknown_gstins_admit_the_split_was_assumed(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers)
    client.post("/api/intake/confirm", headers=headers, json={"item_id": product["id"], "packs": 1})

    intake_id = client.get("/api/intake/session/current", headers=headers).json()["id"]
    summary = client.get(f"/api/intake/session/{intake_id}/summary", headers=headers).json()

    # No GSTIN either side: fall back to a local split, but say so.
    assert summary["interstate"] is False
    assert summary["tax_basis_assumed"] is True


def test_seeding_clears_old_intakes(client, vendor):
    headers, _ = vendor
    product = _loose(client, headers)
    client.post("/api/intake/scan", headers=headers, json={"barcode": product["barcode"]})
    assert client.get("/api/intake/session/current", headers=headers).json() is not None

    assert client.post("/api/demo/seed", headers=headers).status_code == 200

    # "Load sample data" says it replaces everything, so a delivery pointing at
    # now-deleted products must not survive it.
    assert client.get("/api/intake/session/current", headers=headers).json() is None
    assert client.get("/api/intake/sessions", headers=headers).json() == []


def test_browser_style_utc_dates_do_not_break_the_expiry_comparison(client, vendor):
    headers, _ = vendor
    soon = datetime.utcnow() + timedelta(days=3)
    # Exactly what Date.toISOString() sends from the browser, Z and all. Parsed
    # naively this is timezone-aware and cannot be compared with what the
    # database returns, which used to take the confirm endpoint down with a 500.
    product = _carton(client, headers, current_qty=6,
                      expiry_date=soon.isoformat(timespec="milliseconds") + "Z")

    later = (datetime.utcnow() + timedelta(days=400)).isoformat(timespec="milliseconds") + "Z"
    res = client.post("/api/intake/confirm", headers=headers,
                      json={"item_id": product["id"], "packs": 1, "expiry_date": later})

    assert res.status_code == 200, res.text
    updated = client.get(f"/api/inventory/{product['id']}", headers=headers).json()
    assert updated["expiry_date"][:10] == soon.date().isoformat()


# --------------------------------------------------------------------------
# Batch-level stock (FEFO)
# --------------------------------------------------------------------------
def _lot(client, headers, item_id, *, qty, cost, days=None, batch_no=None):
    """Receive one dated lot, without letting it rewrite the product's price."""
    payload = {
        "item_id": item_id, "packs": qty, "units_per_pack": 1,
        "unit_cost": cost, "batch_no": batch_no, "remember": False,
    }
    if days is not None:
        payload["expiry_date"] = (datetime.utcnow() + timedelta(days=days)).isoformat()
    res = client.post("/api/intake/confirm", headers=headers, json=payload)
    assert res.status_code == 200, res.text
    return res.json()["line"]


def _batches(client, headers, item_id):
    return client.get(f"/api/inventory/{item_id}/batches", headers=headers).json()


def test_sale_depletes_earliest_expiry_first(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers, current_qty=0)
    _lot(client, headers, product["id"], qty=6, cost=10.0, days=5, batch_no="SOON")
    _lot(client, headers, product["id"], qty=10, cost=20.0, days=60, batch_no="LATER")

    client.post("/api/sales", headers=headers,
                json={"payment_mode": "cash", "items": [{"item_id": product["id"], "qty": 8}]})

    remaining = {b["batch_no"]: b["qty_remaining"] for b in _batches(client, headers, product["id"])}
    # The short-dated lot empties before the long-dated one is touched.
    assert "SOON" not in remaining
    assert remaining["LATER"] == 8


def test_sale_cost_is_the_blend_of_lots_consumed(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers, current_qty=0)
    _lot(client, headers, product["id"], qty=6, cost=10.0, days=5, batch_no="SOON")
    _lot(client, headers, product["id"], qty=10, cost=20.0, days=60, batch_no="LATER")

    sale = client.post("/api/sales", headers=headers,
                       json={"payment_mode": "cash",
                             "items": [{"item_id": product["id"], "qty": 8}]}).json()["sale"]

    # 6 units at Rs 10 plus 2 at Rs 20 is Rs 100 of goods, sold at 8 x Rs 14.
    assert sale["total_amount"] == 112.0
    assert sale["profit"] == 12.0


def test_undated_lots_are_consumed_last(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers, current_qty=0)
    _lot(client, headers, product["id"], qty=5, cost=10.0, batch_no="NODATE")
    _lot(client, headers, product["id"], qty=5, cost=10.0, days=30, batch_no="DATED")

    client.post("/api/sales", headers=headers,
                json={"payment_mode": "cash", "items": [{"item_id": product["id"], "qty": 5}]})

    remaining = {b["batch_no"]: b["qty_remaining"] for b in _batches(client, headers, product["id"])}
    # A lot with no date is not urgent, it is unknown -- dated stock moves first.
    assert remaining == {"NODATE": 5}


def test_void_returns_stock_to_its_own_lots(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers, current_qty=0)
    _lot(client, headers, product["id"], qty=6, cost=10.0, days=5, batch_no="SOON")
    _lot(client, headers, product["id"], qty=10, cost=20.0, days=60, batch_no="LATER")

    sale = client.post("/api/sales", headers=headers,
                       json={"payment_mode": "cash",
                             "items": [{"item_id": product["id"], "qty": 8}]}).json()["sale"]
    client.delete(f"/api/sales/{sale['id']}", headers=headers)

    remaining = {b["batch_no"]: b["qty_remaining"] for b in _batches(client, headers, product["id"])}
    # Not all 8 onto the newest lot: each goes back where it came from.
    assert remaining == {"SOON": 6, "LATER": 10}


def test_two_lots_of_one_product_alert_separately(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers, current_qty=0)
    _lot(client, headers, product["id"], qty=4, cost=10.0, days=2, batch_no="URGENT")
    _lot(client, headers, product["id"], qty=9, cost=12.0, days=6, batch_no="SOON")
    _lot(client, headers, product["id"], qty=50, cost=15.0, days=300, batch_no="FINE")

    expiring = client.get("/api/inventory/expiring-soon", headers=headers).json()

    assert [row["batch_no"] for row in expiring] == ["URGENT", "SOON"]
    assert expiring[0]["urgency"] == "critical"
    # The money at risk is this lot's, not the whole shelf's.
    assert expiring[0]["estimated_loss_risk"] == 40.0
    assert expiring[1]["estimated_loss_risk"] == 108.0


def test_current_qty_always_equals_the_sum_of_its_lots(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers, current_qty=0)
    _lot(client, headers, product["id"], qty=10, cost=10.0, days=5)
    _lot(client, headers, product["id"], qty=7, cost=12.0, days=40)
    client.post("/api/sales", headers=headers,
                json={"payment_mode": "cash", "items": [{"item_id": product["id"], "qty": 12}]})
    client.post(f"/api/inventory/{product['id']}/adjust", headers=headers,
                json={"qty_change": -2, "reason": "Damaged"})

    item = client.get(f"/api/inventory/{product['id']}", headers=headers).json()
    lots = sum(b["qty_remaining"] for b in _batches(client, headers, product["id"]))
    # The cached total on the product is the invariant this whole phase rests on.
    assert item["current_qty"] == lots == 3


def test_the_product_shows_the_soonest_live_lot(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers, current_qty=0)
    _lot(client, headers, product["id"], qty=3, cost=10.0, days=4, batch_no="SOON")
    _lot(client, headers, product["id"], qty=8, cost=10.0, days=90, batch_no="LATER")

    soon = client.get(f"/api/inventory/{product['id']}", headers=headers).json()["expiry_date"]

    # Sell the short-dated lot out and the product's date moves to what is left.
    client.post("/api/sales", headers=headers,
                json={"payment_mode": "cash", "items": [{"item_id": product["id"], "qty": 3}]})
    after = client.get(f"/api/inventory/{product['id']}", headers=headers).json()["expiry_date"]

    assert after > soon
    assert client.get("/api/inventory/expiring-soon", headers=headers).json() == []


def test_undoing_a_delivery_that_has_been_sold_is_refused(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers, current_qty=0)
    line = _lot(client, headers, product["id"], qty=5, cost=10.0, days=30, batch_no="B1")

    client.post("/api/sales", headers=headers,
                json={"payment_mode": "cash", "items": [{"item_id": product["id"], "qty": 2}]})

    res = client.delete(f"/api/intake/lines/{line['id']}", headers=headers)
    # Un-selling is not undo's business; say so rather than inventing a number.
    assert res.status_code == 409
    assert "already been sold" in res.json()["detail"]


def test_undoing_an_untouched_delivery_removes_its_lot(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers, current_qty=0)
    line = _lot(client, headers, product["id"], qty=5, cost=10.0, days=30, batch_no="B1")

    assert client.delete(f"/api/intake/lines/{line['id']}", headers=headers).status_code == 204
    assert _batches(client, headers, product["id"]) == []
    assert client.get(f"/api/inventory/{product['id']}", headers=headers).json()["current_qty"] == 0


def test_lots_are_scoped_to_one_vendor(client, vendor, item):
    headers, _ = vendor
    other_headers, _ = _other_vendor(client, "otherlots")

    assert client.get(f"/api/inventory/{item['id']}/batches", headers=other_headers).status_code == 404
    assert client.get("/api/inventory/expiring-soon", headers=other_headers).json() == []


def test_an_opening_quantity_becomes_a_lot(client, vendor, item):
    headers, _ = vendor
    # The item fixture is created with 20 in stock; that has to be backed by a
    # lot, or the first reconcile would reduce the product to nothing.
    lots = _batches(client, headers, item["id"])
    assert len(lots) == 1
    assert lots[0]["qty_remaining"] == 20
    assert lots[0]["unit_cost"] == 27.0


def _edit(client, headers, item, **changes):
    body = {
        "sku_name": item["sku_name"], "category": item["category"], "unit": item["unit"],
        "current_qty": item["current_qty"], "reorder_point": item["reorder_point"],
        "cost_price": item["cost_price"], "selling_price": item["selling_price"],
        "expiry_date": item.get("expiry_date"), "mfg_date": item.get("mfg_date"),
        "barcode": item.get("barcode"), "pack_type": item.get("pack_type", "loose"),
        "units_per_pack": item.get("units_per_pack", 1),
        "hsn_code": item.get("hsn_code"), "gst_rate": item.get("gst_rate", 0),
    }
    body.update(changes)
    res = client.put(f"/api/inventory/{item['id']}", headers=headers, json=body)
    assert res.status_code == 200, res.text
    return res.json()


def test_editing_a_product_dates_the_stock_it_already_has(client, vendor, item):
    """The edit form has one expiry box, so it has to mean the shelf.

    Applying it after the quantity change instead left the typed date on a small
    new lot while the bulk of the stock stayed undated -- and FEFO then sold the
    newest units first.
    """
    headers, _ = vendor
    expiry = (datetime.utcnow() + timedelta(days=120)).isoformat()

    updated = _edit(client, headers, item, current_qty=25, expiry_date=expiry)

    lots = _batches(client, headers, item["id"])
    assert updated["current_qty"] == 25
    # One lot, all of it dated -- not 20 undated plus 5 dated.
    assert len(lots) == 1
    assert lots[0]["qty_remaining"] == 25
    assert lots[0]["expiry_date"][:10] == expiry[:10]


def test_reducing_the_quantity_on_a_product_takes_it_off_the_soonest_lot(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers, current_qty=0)
    _lot(client, headers, product["id"], qty=4, cost=10.0, days=3, batch_no="SOON")
    _lot(client, headers, product["id"], qty=10, cost=10.0, days=90, batch_no="LATER")

    current = client.get(f"/api/inventory/{product['id']}", headers=headers).json()
    _edit(client, headers, current, current_qty=10)

    remaining = {b["batch_no"]: b["qty_remaining"] for b in _batches(client, headers, product["id"])}
    # A downward correction is spoilage or miscount on the oldest stock.
    assert remaining == {"LATER": 10}


def test_health_score_values_spoilage_from_lots(client, vendor):
    """Reaches past the has_data guard, which every other analytics test stops at.

    The spoilage term reads StockBatch now, so without a case that gets here a
    typo in that query would only ever surface in front of a shopkeeper.
    """
    headers, _ = vendor
    assert client.post("/api/demo/seed", headers=headers).status_code == 200

    score = client.get("/api/analytics/health-score", headers=headers).json()

    assert score["has_data"] is True
    assert 0 <= score["health_score"] <= 100
    assert "waste_control" in score["breakdown"]


def test_seeded_stock_is_backed_by_lots(client, vendor):
    headers, _ = vendor
    client.post("/api/demo/seed", headers=headers)

    for product in client.get("/api/inventory", headers=headers).json():
        lots = _batches(client, headers, product["id"])
        total = round(sum(b["qty_remaining"] for b in lots), 3)
        # Sample data has to satisfy the same invariant as real data, or the
        # first sale after a seed reconciles the shelf down to nothing.
        assert total == product["current_qty"], product["sku_name"]


# --------------------------------------------------------------------------
# Authentication hardening
# --------------------------------------------------------------------------
def _start_login(client, identifier="testowner", password="a-good-password"):
    return client.post("/api/auth/login", json={"identifier": identifier, "password": password})


def test_the_otp_step_cannot_be_reached_without_the_password(client, vendor):
    """The bypass this flow was built to close.

    verify-otp used to take a vendor_id straight from the caller, so knowing an
    account id was enough to finish signing in -- the password was decorative.
    """
    _, vendor_id = vendor

    for forged in (vendor_id, "not-a-token", ""):
        res = client.post("/api/auth/verify-otp", json={"challenge_token": forged, "otp": "123456"})
        assert res.status_code in (401, 422), f"{forged!r} was accepted"


def test_resend_otp_cannot_be_triggered_for_an_arbitrary_account(client, vendor):
    """Unauthenticated resend used to issue a fresh code for any vendor_id --
    free codes to brute force, and with a real provider, someone else's SMS bill."""
    _, vendor_id = vendor
    res = client.post("/api/auth/resend-otp", json={"challenge_token": vendor_id})
    assert res.status_code in (401, 422)


def test_a_challenge_token_is_not_a_session(client):
    """Half a login is not a login."""
    signup = client.post("/api/auth/signup", json={
        "name": "Halfway", "username": "halfway", "email": "half@example.com",
        "phone": "+91 9000000123", "password": "a-good-password",
    }).json()

    headers = {"Authorization": f"Bearer {signup['challenge_token']}"}
    assert client.get("/api/inventory", headers=headers).status_code == 401
    assert client.get("/api/vendor/me", headers=headers).status_code == 401


def test_a_session_token_cannot_stand_in_for_the_otp_step(client, vendor):
    headers, _ = vendor
    token = headers["Authorization"].split()[1]
    res = client.post("/api/auth/verify-otp", json={"challenge_token": token, "otp": "123456"})
    assert res.status_code == 401


def test_the_code_is_burned_after_repeated_wrong_guesses(client):
    """A million possibilities is only a search space while the tries are few."""
    signup = client.post("/api/auth/signup", json={
        "name": "Guessed At", "username": "guessed", "email": "guessed@example.com",
        "phone": "+91 9000000124", "password": "a-good-password",
    }).json()
    challenge = signup["challenge_token"]

    statuses = [
        client.post("/api/auth/verify-otp",
                    json={"challenge_token": challenge, "otp": f"{i:06d}"}).status_code
        for i in range(6)
    ]
    assert 429 in statuses, statuses

    # The real code is dead too, so a guesser cannot simply carry on.
    after = client.post("/api/auth/verify-otp", json={"challenge_token": challenge, "otp": "123456"})
    assert after.status_code in (401, 429)


def test_login_attempts_are_rate_limited(client, vendor):
    statuses = [_start_login(client, password="wrong-password").status_code for _ in range(12)]
    assert 429 in statuses, statuses


def test_signup_is_rate_limited(client):
    statuses = []
    for i in range(7):
        statuses.append(client.post("/api/auth/signup", json={
            "name": f"Spam {i}", "username": f"spam{i}", "email": f"spam{i}@example.com",
            "phone": f"+91 90000{i:05d}", "password": "a-good-password",
        }).status_code)
    assert 429 in statuses, statuses


def test_changing_the_password_ends_other_sessions(client, vendor):
    headers, _ = vendor
    assert client.get("/api/vendor/me", headers=headers).status_code == 200

    res = client.post("/api/auth/change-password", headers=headers, json={
        "current_password": "a-good-password", "new_password": "an-even-better-password",
    })
    assert res.status_code == 204

    # A token stolen before the change must stop working at the change.
    assert client.get("/api/vendor/me", headers=headers).status_code == 401


def test_change_password_rejects_the_wrong_current_password(client, vendor):
    headers, _ = vendor
    res = client.post("/api/auth/change-password", headers=headers, json={
        "current_password": "not-my-password", "new_password": "an-even-better-password",
    })
    assert res.status_code == 401
    assert client.get("/api/vendor/me", headers=headers).status_code == 200


def test_signing_out_everywhere_invalidates_the_token(client, vendor):
    """What a shopkeeper needs after losing the phone: clearing a browser only
    forgets the token locally."""
    headers, _ = vendor
    assert client.post("/api/auth/logout-all", headers=headers).status_code == 204
    assert client.get("/api/vendor/me", headers=headers).status_code == 401


def test_weak_passwords_are_rejected(client):
    for password in ("short1", "password123", "aaaaaaaaaaaa"):
        res = client.post("/api/auth/signup", json={
            "name": "Weak", "username": "weakling", "email": "weak@example.com",
            "phone": "+91 9000000125", "password": password,
        })
        assert res.status_code == 422, f"{password!r} was accepted"


# --------------------------------------------------------------------------
# Transport and exposure
# --------------------------------------------------------------------------
def test_responses_carry_security_headers(client):
    headers = client.get("/api/health").headers
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
    assert headers["Referrer-Policy"] == "no-referrer"
    # Shop data and tokens must not sit in a shared cache.
    assert headers["Cache-Control"] == "no-store"


def test_health_does_not_advertise_the_configuration(client):
    body = client.get("/api/health").json()
    # It used to report debug_otp, telling an anonymous caller whether the fixed
    # code would work before they tried it.
    assert body == {"status": "ok"}


def test_oversized_line_item_lists_are_rejected(client, vendor, item):
    headers, _ = vendor
    res = client.post("/api/sales", headers=headers, json={
        "payment_mode": "cash",
        "items": [{"item_id": item["id"], "qty": 1}] * 500,
    })
    assert res.status_code == 422


def test_production_configuration_is_validated():
    """The guard that stops an unsafe deployment from ever serving."""
    import config

    problems = config.validate_for_production()
    joined = " ".join(problems).lower()
    # The suite runs with DEBUG_OTP and DEMO_MODE on, so both must be named.
    assert any("debug_otp" in p.lower() for p in problems), problems
    assert "demo_mode" in joined


# --------------------------------------------------------------------------
# Password reset
# --------------------------------------------------------------------------
def test_forgot_password_answers_the_same_for_unknown_accounts(client, vendor):
    """Saying "no such account" here would be a free account-enumeration tool."""
    known = client.post("/api/auth/forgot-password", json={"identifier": "testowner"})
    unknown = client.post("/api/auth/forgot-password", json={"identifier": "nobody-at-all"})

    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()


def test_a_reset_link_changes_the_password_once(client, vendor, monkeypatch):
    import notifications

    sent = {}

    def capture(to, link):
        sent["link"] = link
        return notifications.DeliveryResult(True, "captured")

    monkeypatch.setattr(notifications, "send_password_reset", capture)

    headers, _ = vendor
    client.post("/api/auth/forgot-password", json={"identifier": "testowner"})
    token = sent["link"].split("token=")[1]

    first = client.post("/api/auth/reset-password", json={
        "reset_token": token, "new_password": "a-brand-new-password"})
    assert first.status_code == 204

    # The link is single use: a reset mail sitting in an inbox is not a key.
    second = client.post("/api/auth/reset-password", json={
        "reset_token": token, "new_password": "yet-another-password"})
    assert second.status_code == 400

    # And the reset ended every session that existed before it.
    assert client.get("/api/vendor/me", headers=headers).status_code == 401

    challenge = client.post("/api/auth/login", json={
        "identifier": "testowner", "password": "a-brand-new-password"}).json()
    assert challenge.get("challenge_token")


def test_a_forged_reset_token_is_rejected(client, vendor):
    headers, _ = vendor
    session_token = headers["Authorization"].split()[1]
    for token in (session_token, "not-a-token-at-all", "aaa.bbb.ccc"):
        res = client.post("/api/auth/reset-password", json={
            "reset_token": token, "new_password": "a-brand-new-password"})
        # 400 for a well-formed but invalid token, 422 for one that is not even
        # the right shape -- both are refusals.
        assert res.status_code in (400, 422), token


def test_weak_passwords_are_rejected_on_reset(client, vendor):
    res = client.post("/api/auth/reset-password", json={
        "reset_token": "x" * 40, "new_password": "password123"})
    assert res.status_code == 422


# --------------------------------------------------------------------------
# Delivery
# --------------------------------------------------------------------------
def test_codes_are_actually_handed_to_the_provider(client, monkeypatch):
    """Before this, codes were hashed, stored, and delivered to nobody."""
    import notifications

    calls = []
    monkeypatch.setattr(
        notifications,
        "send_otp",
        lambda to, code: calls.append((to, code)) or notifications.DeliveryResult(True),
    )

    client.post("/api/auth/signup", json={
        "name": "Delivered", "username": "delivered", "email": "d@example.com",
        "phone": "+91 9000000321", "password": "a-good-password",
    })
    assert len(calls) == 1
    assert calls[0][0] == "+91 9000000321"
    assert len(calls[0][1]) == 6


def test_no_provider_configured_is_reported_not_raised(monkeypatch):
    import notifications
    from config import settings

    monkeypatch.setattr(settings, "NOTIFY_PROVIDER", "none")
    result = notifications.send_otp("+91 9000000000", "123456")
    # A missing provider must not take a request down with a 500.
    assert result.delivered is False
    assert "provider" in result.detail


# --------------------------------------------------------------------------
# Deliveries list and purchase register
# --------------------------------------------------------------------------
def test_sessions_list_carries_totals_and_filters(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers, current_qty=0)
    _lot(client, headers, product["id"], qty=4, cost=25.0, days=90, batch_no="R1")

    intake_id = client.get("/api/intake/session/current", headers=headers).json()["id"]
    client.put(f"/api/intake/session/{intake_id}", headers=headers,
               json={"supplier_name": "Register Traders"})

    rows = client.get("/api/intake/sessions", headers=headers).json()
    assert len(rows) == 1
    # Totalled server-side, so listing fifty deliveries is one request not fifty-one.
    assert rows[0]["line_count"] == 1
    assert rows[0]["total_units"] == 4
    # 4 x Rs 25 is Rs 100 taxable, plus the carton fixture's 12% GST.
    assert rows[0]["taxable_value"] == 100.0
    assert rows[0]["grand_total"] == 112.0

    assert client.get("/api/intake/sessions", headers=headers,
                      params={"status": "closed"}).json() == []
    assert len(client.get("/api/intake/sessions", headers=headers,
                          params={"supplier": "register"}).json()) == 1


def test_purchase_register_totals_the_month(client, vendor):
    headers, _ = vendor
    client.put("/api/vendor/me", headers=headers, json={
        "name": "Test Owner", "store_name": "Test Store", "gstin": "27AAPFU0939F1ZV"})

    product = _carton(client, headers, current_qty=0)   # 12% GST
    _lot(client, headers, product["id"], qty=10, cost=20.0, days=90)
    intake_id = client.get("/api/intake/session/current", headers=headers).json()["id"]
    client.post(f"/api/intake/session/{intake_id}/close", headers=headers)

    month = datetime.utcnow().strftime("%Y-%m")
    register = client.get("/api/intake/register", headers=headers, params={"month": month}).json()

    assert register["totals"]["deliveries"] == 1
    assert register["totals"]["taxable_value"] == 200.0
    # An open delivery is not a filing; only closed ones count.
    assert all(e["id"] == intake_id for e in register["entries"])

    empty = client.get("/api/intake/register", headers=headers, params={"month": "2001-01"}).json()
    assert empty["totals"]["deliveries"] == 0


def test_register_rejects_a_nonsense_month(client, vendor):
    headers, _ = vendor
    assert client.get("/api/intake/register", headers=headers,
                      params={"month": "not-a-month"}).status_code == 422
    assert client.get("/api/intake/register", headers=headers,
                      params={"month": "2026-13"}).status_code == 422


def test_a_closed_delivery_can_be_reopened_until_it_sells(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers, current_qty=0)
    _lot(client, headers, product["id"], qty=6, cost=10.0, days=60, batch_no="RO")
    intake_id = client.get("/api/intake/session/current", headers=headers).json()["id"]
    client.post(f"/api/intake/session/{intake_id}/close", headers=headers)

    reopened = client.post(f"/api/intake/session/{intake_id}/reopen", headers=headers)
    assert reopened.status_code == 200
    assert reopened.json()["status"] == "open"

    client.post(f"/api/intake/session/{intake_id}/close", headers=headers)
    client.post("/api/sales", headers=headers,
                json={"payment_mode": "cash", "items": [{"item_id": product["id"], "qty": 2}]})

    # Once it has traded, editing history would make the numbers disagree with
    # what happened; a correcting intake is the honest fix.
    assert client.post(f"/api/intake/session/{intake_id}/reopen",
                       headers=headers).status_code == 409


def test_deliveries_are_scoped_to_one_vendor(client, vendor):
    headers, _ = vendor
    product = _carton(client, headers, current_qty=0)
    _lot(client, headers, product["id"], qty=2, cost=10.0, days=30)
    intake_id = client.get("/api/intake/session/current", headers=headers).json()["id"]

    other_headers, _ = _other_vendor(client, "otherregister")
    assert client.get("/api/intake/sessions", headers=other_headers).json() == []
    assert client.post(f"/api/intake/session/{intake_id}/reopen",
                       headers=other_headers).status_code == 404
    month = datetime.utcnow().strftime("%Y-%m")
    assert client.get("/api/intake/register", headers=other_headers,
                      params={"month": month}).json()["totals"]["deliveries"] == 0


# --------------------------------------------------------------------------
# Short-dated goods
# --------------------------------------------------------------------------
def test_a_carton_scan_flags_short_dated_stock(client, vendor):
    headers, _ = vendor
    soon = (datetime.utcnow() + timedelta(days=9)).isoformat()
    product = _carton(client, headers, current_qty=0, expiry_date=soon)

    body = client.post("/api/intake/scan", headers=headers,
                       json={"barcode": product["barcode"]}).json()

    # The confirm step is the last moment the carton can still be refused.
    assert body["suggestion"]["short_dated"] is True
    assert body["suggestion"]["days_to_expiry"] <= 9


def test_long_dated_stock_is_not_flagged(client, vendor):
    headers, _ = vendor
    later = (datetime.utcnow() + timedelta(days=200)).isoformat()
    product = _carton(client, headers, current_qty=0, expiry_date=later)

    body = client.post("/api/intake/scan", headers=headers,
                       json={"barcode": product["barcode"]}).json()
    assert body["suggestion"]["short_dated"] is False


# --------------------------------------------------------------------------
# Barcode lookup
# --------------------------------------------------------------------------
def test_the_number_alone_gives_check_digit_and_country(client, vendor):
    """Works with no network at all, which is the point -- a shop with patchy
    signal still gets told a barcode was misread."""
    headers, _ = vendor

    ok = client.get("/api/inventory/lookup/8901058000108", headers=headers).json()
    assert ok["check_digit_valid"] is True
    assert ok["country"] == "India"
    assert ok["symbology"] == "EAN-13"

    # One digit changed: caught before it becomes a product nobody can re-scan.
    bad = client.get("/api/inventory/lookup/8901058000109", headers=headers).json()
    assert bad["check_digit_valid"] is False


def test_lookup_reports_a_barcode_the_shop_already_stocks(client, vendor):
    headers, _ = vendor
    product = _loose(client, headers)

    body = client.get(f"/api/inventory/lookup/{product['barcode']}", headers=headers).json()
    assert body["known_locally"] is True
    assert body["item"]["sku_name"] == product["sku_name"]
    # No point asking a third party about a product we already have.
    assert body["product"] is None


def test_lookup_tolerates_spaces_and_dashes(client, vendor):
    headers, _ = vendor
    body = client.get("/api/inventory/lookup/890-1058 000108", headers=headers).json()
    assert body["barcode"] == "8901058000108"
    assert body["check_digit_valid"] is True


def test_lookup_is_scoped_to_one_vendor(client, vendor):
    headers, _ = vendor
    product = _loose(client, headers)
    other_headers, _ = _other_vendor(client, "otherlookup")

    mine = client.get(f"/api/inventory/lookup/{product['barcode']}", headers=headers).json()
    theirs = client.get(f"/api/inventory/lookup/{product['barcode']}", headers=other_headers).json()
    assert mine["known_locally"] is True
    assert theirs["known_locally"] is False


def test_lookup_requires_a_token(client):
    assert client.get("/api/inventory/lookup/8901058000108").status_code == 401


def test_external_lookup_is_off_unless_enabled(client, vendor, monkeypatch):
    """It sends the barcode to a third party, so it must be opted into."""
    import barcodes
    from config import settings

    monkeypatch.setattr(settings, "BARCODE_LOOKUP_ENABLED", False)
    called = []
    monkeypatch.setattr(barcodes, "_fetch_remote", lambda code: called.append(code))

    headers, _ = vendor
    body = client.get("/api/inventory/lookup/8901058000108", headers=headers).json()
    assert body["product"] is None
    assert called == []


def test_a_looked_up_barcode_is_cached_not_refetched(client, vendor, monkeypatch):
    import barcodes
    from config import settings

    monkeypatch.setattr(settings, "BARCODE_LOOKUP_ENABLED", True)
    calls = []

    def fake(code):
        calls.append(code)
        return {"sku_name": "Maggi Noodles 70g", "brand": "Nestle", "size": "70 g",
                "category": "Instant noodles", "image_url": None, "source": "Test DB"}

    monkeypatch.setattr(barcodes, "_fetch_remote", fake)
    headers, _ = vendor

    first = client.get("/api/inventory/lookup/8901058000108", headers=headers).json()
    second = client.get("/api/inventory/lookup/8901058000108", headers=headers).json()

    assert first["product"]["sku_name"] == "Maggi Noodles 70g"
    assert second["product"]["sku_name"] == "Maggi Noodles 70g"
    # Fetched once; the second scan is served from the cache, so it also works
    # with no signal.
    assert len(calls) == 1


def test_scanning_an_unknown_barcode_returns_the_product_details(client, vendor, monkeypatch):
    """The whole point: the form opens filled in rather than empty."""
    import barcodes
    from config import settings

    monkeypatch.setattr(settings, "BARCODE_LOOKUP_ENABLED", True)
    monkeypatch.setattr(barcodes, "_fetch_remote", lambda code: {
        "sku_name": "Britannia Good Day Cashew", "brand": "Britannia", "size": "100 g",
        "category": "Biscuits", "image_url": None, "source": "Test DB",
    })

    headers, _ = vendor
    body = client.post("/api/intake/scan", headers=headers,
                       json={"barcode": "8901063014916"}).json()

    assert body["status"] == "unknown"
    assert body["product"]["sku_name"] == "Britannia Good Day Cashew"
    assert body["details"]["country"] == "India"
    assert "found from the barcode" in body["message"]


def test_a_misread_barcode_is_never_looked_up(client, vendor, monkeypatch):
    """Looking up a mistyped number can only return someone else's product."""
    import barcodes
    from config import settings

    monkeypatch.setattr(settings, "BARCODE_LOOKUP_ENABLED", True)
    called = []
    monkeypatch.setattr(barcodes, "_fetch_remote", lambda code: called.append(code))

    headers, _ = vendor
    body = client.post("/api/intake/scan", headers=headers,
                       json={"barcode": "8901058000109"}).json()

    assert body["details"]["check_digit_valid"] is False
    assert body["product"] is None
    assert called == []
    assert "check digit" in body["message"]


def test_a_provider_failure_does_not_break_the_scan(client, vendor, monkeypatch):
    """A convenience lookup must never cost the shopkeeper the scan itself."""
    import barcodes
    from config import settings

    monkeypatch.setattr(settings, "BARCODE_LOOKUP_ENABLED", True)

    def boom(code):
        raise RuntimeError("provider exploded")

    monkeypatch.setattr(barcodes, "_fetch_remote", boom)
    headers, _ = vendor

    body = client.post("/api/intake/scan", headers=headers,
                       json={"barcode": "8901058000108"})
    assert body.status_code == 200, body.text
    payload = body.json()
    assert payload["status"] == "unknown"
    assert payload["product"] is None
    # The offline part still works even when the network part blew up.
    assert payload["details"]["country"] == "India"


def test_a_category_is_only_taken_when_it_is_english():
    """The provider bolts "en:" onto free text it does not recognise, so the
    prefix alone is no guarantee. A jar of Nutella really does offer both."""
    import barcodes

    nutella = {"categories_tags": [
        "en:breakfasts", "en:spreads", "en:sweet-spreads",
        "en:confectionary-based-spreads",
        "en:Petit-d\u00e9jeuners", "en:P\u00e2tes \u00e0 tartiner",
    ]}
    # The most specific real taxonomy entry, not the French text after it.
    assert barcodes._english_category(nutella) == "Confectionary based spreads"

    # Nothing usable is better than a foreign phrase in the shop's catalogue.
    assert barcodes._english_category({"categories_tags": ["en:P\u00e2tes \u00e0 tartiner"]}) is None
    assert barcodes._english_category({"categories_tags": ["fr:biscuits"]}) is None
    assert barcodes._english_category({}) is None


def test_a_brand_already_in_the_name_is_not_repeated():
    """Punctuation is ignored, or "Lay's" reads as absent from "Lays Classics"
    and the shopkeeper gets "Lay's Lays Classics Salted"."""
    import barcodes

    assert barcodes._mentions("Lays Classics Salted", "Lay's") is True
    assert barcodes._mentions("Good Day Cashew", "Britannia") is False


# --------------------------------------------------------------------------
# Security log and account lockout
# --------------------------------------------------------------------------
def _events(client, headers):
    response = client.get("/api/auth/security-log", headers=headers)
    assert response.status_code == 200, response.text
    return [row["event"] for row in response.json()]


def test_signing_in_is_written_to_the_security_log(client, vendor):
    headers, _ = vendor
    events = _events(client, headers)
    # Newest first, and both factors are separate lines: the password step can
    # succeed and the code step still fail.
    assert events[0] == "signed_in"
    assert "signup" in events and "otp.sent" in events


def test_a_wrong_password_is_recorded_against_the_account(client, vendor):
    headers, _ = vendor
    client.post("/api/auth/login", json={"identifier": "testowner", "password": "wrong-one"})

    log = client.get("/api/auth/security-log", headers=headers).json()
    failed = [row for row in log if row["event"] == "login.failed"]
    assert len(failed) == 1
    assert failed[0]["outcome"] == "denied"
    assert failed[0]["description"] == "Wrong password"


def test_the_log_says_which_device_in_words(client, vendor):
    headers, _ = vendor
    ua = ("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) "
          "Chrome/120.0 Mobile Safari/537.36")
    client.post(
        "/api/auth/login",
        json={"identifier": "testowner", "password": "wrong-one"},
        headers={"User-Agent": ua},
    )
    log = client.get("/api/auth/security-log", headers=headers).json()
    assert log[0]["device"] == "Chrome on Android"


def test_the_security_log_is_scoped_to_the_caller(client, vendor):
    """It carries addresses and devices, so the tenant boundary matters here
    more than anywhere else."""
    headers, _ = vendor
    client.post("/api/auth/login", json={"identifier": "testowner", "password": "wrong-one"})
    other_headers, _ = _other_vendor(client, "nosyneighbour")

    assert "login.failed" in _events(client, headers)
    assert "login.failed" not in _events(client, other_headers)


def test_the_security_log_requires_a_token(client):
    assert client.get("/api/auth/security-log").status_code == 401


def test_a_failed_login_for_an_unknown_account_is_still_recorded(client, db_session):
    """The most interesting row of all, and it belongs to no vendor."""
    import models

    client.post("/api/auth/login", json={"identifier": "ghost@example.com", "password": "guess"})
    row = (
        db_session.query(models.SecurityEvent)
        .filter(models.SecurityEvent.event == "login.failed")
        .one()
    )
    assert row.vendor_id is None
    assert row.identifier == "ghost@example.com"
    assert row.detail == "no such account"


def test_repeated_wrong_passwords_lock_the_account(client, vendor, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "LOGIN_MAX_FAILURES", 3)
    # High enough that the in-memory limiter is not what stops this.
    monkeypatch.setattr(settings, "LOGIN_RATE_LIMIT", 1000)

    headers, _ = vendor
    for _ in range(3):
        assert client.post(
            "/api/auth/login", json={"identifier": "testowner", "password": "wrong-one"}
        ).status_code == 401

    # Now even the correct password is refused, which is the point.
    locked = client.post(
        "/api/auth/login", json={"identifier": "testowner", "password": "a-good-password"}
    )
    assert locked.status_code == 429
    assert "Retry-After" in locked.headers
    assert "account.locked" in _events(client, headers)


def test_the_lock_survives_a_restart(client, vendor, monkeypatch):
    """The whole reason this is not left to the rate limiter, whose counters a
    deploy or a crash loop empties."""
    import ratelimit
    from config import settings

    monkeypatch.setattr(settings, "LOGIN_MAX_FAILURES", 3)
    monkeypatch.setattr(settings, "LOGIN_RATE_LIMIT", 1000)

    for _ in range(3):
        client.post("/api/auth/login", json={"identifier": "testowner", "password": "wrong-one"})

    ratelimit.reset()  # what a restart does to the in-memory counters

    assert client.post(
        "/api/auth/login", json={"identifier": "testowner", "password": "a-good-password"}
    ).status_code == 429


def test_a_good_password_clears_the_failure_count(client, vendor, monkeypatch):
    """Only consecutive failures should lock, or a shopkeeper who fumbles once a
    month is eventually locked out by their own history."""
    from config import settings

    monkeypatch.setattr(settings, "LOGIN_MAX_FAILURES", 3)
    monkeypatch.setattr(settings, "LOGIN_RATE_LIMIT", 1000)

    for _ in range(2):
        client.post("/api/auth/login", json={"identifier": "testowner", "password": "wrong-one"})
    assert client.post(
        "/api/auth/login", json={"identifier": "testowner", "password": "a-good-password"}
    ).status_code == 200

    for _ in range(2):
        client.post("/api/auth/login", json={"identifier": "testowner", "password": "wrong-one"})
    assert client.post(
        "/api/auth/login", json={"identifier": "testowner", "password": "a-good-password"}
    ).status_code == 200


def test_an_expired_lock_lets_the_owner_back_in(client, vendor, db_session, monkeypatch):
    import models
    from config import settings

    monkeypatch.setattr(settings, "LOGIN_MAX_FAILURES", 3)
    monkeypatch.setattr(settings, "LOGIN_RATE_LIMIT", 1000)

    for _ in range(3):
        client.post("/api/auth/login", json={"identifier": "testowner", "password": "wrong-one"})

    row = db_session.query(models.Vendor).filter(models.Vendor.username == "testowner").one()
    row.locked_until = datetime.utcnow() - timedelta(seconds=1)
    db_session.commit()

    assert client.post(
        "/api/auth/login", json={"identifier": "testowner", "password": "a-good-password"}
    ).status_code == 200


def test_changing_the_password_is_recorded(client, vendor):
    headers, _ = vendor
    assert client.post(
        "/api/auth/change-password",
        headers=headers,
        json={"current_password": "a-good-password", "new_password": "an-even-better-password"},
    ).status_code == 204

    # The old token is dead, so sign in again to read the log back.
    fresh = client.post(
        "/api/auth/login",
        json={"identifier": "testowner", "password": "an-even-better-password"},
    ).json()
    token = client.post(
        "/api/auth/verify-otp",
        json={"challenge_token": fresh["challenge_token"], "otp": "123456"},
    ).json()["token"]

    assert "password.changed" in _events(client, {"Authorization": f"Bearer {token}"})


def test_a_broken_audit_write_does_not_break_signing_in(client, vendor, monkeypatch):
    """A missing audit row is bad. A till that will not open is worse."""
    import models

    def explode(*args, **kwargs):
        raise RuntimeError("audit table is locked")

    monkeypatch.setattr(models, "SecurityEvent", explode)
    response = client.post(
        "/api/auth/login", json={"identifier": "testowner", "password": "a-good-password"}
    )
    assert response.status_code == 200


def test_old_events_are_pruned(client, vendor, db_session, monkeypatch):
    """Addresses and devices are personal data; they should not accumulate
    forever just because nobody deleted them."""
    import audit
    import models
    from config import settings

    headers, vendor_id = vendor
    stale = models.SecurityEvent(
        vendor_id=vendor_id, event="login.failed", outcome="denied",
        created_at=datetime.utcnow() - timedelta(days=settings.SECURITY_LOG_RETENTION_DAYS + 1),
    )
    db_session.add(stale)
    db_session.commit()
    assert "login.failed" in _events(client, headers)

    monkeypatch.setattr(audit, "_last_prune", None)  # "not pruned yet in this process"
    audit.record(db_session, audit.LOGIN_SUCCESS, vendor_id=vendor_id)

    assert "login.failed" not in _events(client, headers)


def test_non_finite_floats_return_422_not_500(client, vendor):
    """When a client submits non-finite floats like inf or -inf, Pydantic's
    RequestValidationError must be sanitized so JSON serialization returns 422
    rather than raising ValueError and converting to 500."""
    headers, _ = vendor
    # 1. Test positive infinity
    res = client.post(
        "/api/inventory",
        content=b'{"sku_name": "Test item", "selling_price": 1e9999, "category": "snacks", "unit": "pcs"}',
        headers={**headers, "Content-Type": "application/json"},
    )
    assert res.status_code == 422
    body = res.json()
    assert "detail" in body
    assert any("selling_price" in str(err.get("loc", [])) for err in body["detail"])

    # 2. Test negative infinity
    res = client.post(
        "/api/inventory",
        content=b'{"sku_name": "Test item", "selling_price": -1e9999, "category": "snacks", "unit": "pcs"}',
        headers={**headers, "Content-Type": "application/json"},
    )
    assert res.status_code == 422


def test_devanagari_and_non_ascii_otp_handled_safely(client):
    """Devanagari numerals (०-९) map to standard digits and non-ASCII inputs
    do not cause 500 crashes via hmac.compare_digest TypeError in DEBUG_OTP mode."""
    res = client.post(
        "/api/auth/signup",
        json={
            "name": "Devanagari Test",
            "username": "devanagari_user",
            "email": "devanagari@example.com",
            "phone": "+91 9123456780",
            "password": "strong-password-123",
        },
    )
    assert res.status_code == 200, res.text
    challenge = res.json()["challenge_token"]

    # 1. Non-digit Devanagari input returns 401, not 500
    res_invalid = client.post(
        "/api/auth/verify-otp",
        json={"challenge_token": challenge, "otp": "नमस्ते"},
    )
    assert res_invalid.status_code == 401
    assert res_invalid.json()["detail"] == "Incorrect verification code"

    # 2. Devanagari digits matching DEBUG_OTP_CODE (१२३४५६ -> 123456) succeed with 200
    res_valid = client.post(
        "/api/auth/verify-otp",
        json={"challenge_token": challenge, "otp": "१२३४५६"},
    )
    assert res_valid.status_code == 200
    assert "token" in res_valid.json()


