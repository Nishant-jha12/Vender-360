"""The paths where being wrong costs money: stock movement, margin, khata
balance -- plus the tenant isolation that used to be missing entirely.
"""


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
    other = client.post(
        "/api/auth/signup",
        json={
            "name": "Other Owner",
            "username": "otherowner",
            "email": "other@example.com",
            "phone": "+91 9111111111",
            "password": "another-password",
        },
    ).json()
    token = client.post(
        "/api/auth/verify-otp", json={"vendor_id": other["vendor_id"], "otp": "123456"}
    ).json()["token"]
    other_headers = {"Authorization": f"Bearer {token}"}

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
    other = client.post(
        "/api/auth/signup",
        json={
            "name": "Other", "username": "other2", "email": "other2@example.com",
            "phone": "+91 9222222222", "password": "another-password",
        },
    ).json()
    token = client.post(
        "/api/auth/verify-otp", json={"vendor_id": other["vendor_id"], "otp": "123456"}
    ).json()["token"]

    response = client.post(
        "/api/sales",
        headers={"Authorization": f"Bearer {token}"},
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
    from datetime import datetime, timedelta

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
