"""Tests for offline-first sales sync and idempotency."""
import uuid
from datetime import datetime, timedelta


def test_sale_with_offline_id_persists_and_is_idempotent(client, vendor, item):
    headers, _ = vendor
    offline_id = f"off-{uuid.uuid4()}"

    # Initial creation with offline_id
    res1 = client.post(
        "/api/sales",
        headers=headers,
        json={
            "payment_mode": "cash",
            "offline_id": offline_id,
            "items": [{"item_id": item["id"], "qty": 2}],
        },
    )
    assert res1.status_code in (200, 201)
    data1 = res1.json()
    assert data1["sale"]["offline_id"] == offline_id
    sale_id = data1["sale"]["id"]

    # Check stock decreased by 2
    stock_after_first = client.get(f"/api/inventory/{item['id']}", headers=headers).json()["current_qty"]

    # Submitting the identical offline_id again should be idempotent
    res2 = client.post(
        "/api/sales",
        headers=headers,
        json={
            "payment_mode": "cash",
            "offline_id": offline_id,
            "items": [{"item_id": item["id"], "qty": 2}],
        },
    )
    assert res2.status_code in (200, 201)
    data2 = res2.json()
    assert data2["sale"]["id"] == sale_id

    # Stock should NOT have been deducted a second time
    stock_after_second = client.get(f"/api/inventory/{item['id']}", headers=headers).json()["current_qty"]
    assert stock_after_second == stock_after_first


def test_batch_sync_sales_and_idempotency(client, vendor, item):
    headers, _ = vendor
    offline_id_1 = f"off-{uuid.uuid4()}"
    offline_id_2 = f"off-{uuid.uuid4()}"

    # Create customer for khata test
    cust_res = client.post(
        "/api/customers",
        headers=headers,
        json={"name": "Ramesh Khata", "phone": "+91 9876543210"},
    )
    assert cust_res.status_code == 201
    customer = cust_res.json()

    initial_stock = client.get(f"/api/inventory/{item['id']}", headers=headers).json()["current_qty"]
    initial_khata = client.get(f"/api/customers/{customer['id']}", headers=headers).json()["total_credit_balance"]

    past_time = (datetime.utcnow() - timedelta(hours=2)).isoformat()

    batch_payload = {
        "sales": [
            {
                "offline_id": offline_id_1,
                "payment_mode": "cash",
                "items": [{"item_id": item["id"], "qty": 1}],
                "created_at": past_time,
            },
            {
                "offline_id": offline_id_2,
                "payment_mode": "khata",
                "customer_id": customer["id"],
                "items": [{"item_id": item["id"], "qty": 2}],
                "created_at": past_time,
            },
        ]
    }

    res = client.post("/api/sales/sync-batch", headers=headers, json=batch_payload)
    assert res.status_code == 200
    res_data = res.json()
    assert res_data["synced_count"] == 2
    assert offline_id_1 in res_data["synced_ids"]
    assert offline_id_2 in res_data["synced_ids"]
    assert len(res_data["duplicates_skipped"]) == 0

    # Stock should have decreased by 3 (1 + 2)
    stock_after = client.get(f"/api/inventory/{item['id']}", headers=headers).json()["current_qty"]
    assert stock_after == initial_stock - 3

    # Customer khata should reflect the 2 units sale
    cust_after = client.get(f"/api/customers/{customer['id']}", headers=headers).json()
    assert cust_after["total_credit_balance"] > initial_khata

    # Retrying the batch sync with the same IDs should skip all duplicates without re-deducting stock
    res_retry = client.post("/api/sales/sync-batch", headers=headers, json=batch_payload)
    assert res_retry.status_code == 200
    retry_data = res_retry.json()
    assert retry_data["synced_count"] == 0
    assert len(retry_data["duplicates_skipped"]) == 2
    assert offline_id_1 in retry_data["duplicates_skipped"]
    assert offline_id_2 in retry_data["duplicates_skipped"]

    # Stock and khata balance must remain untouched
    stock_retry = client.get(f"/api/inventory/{item['id']}", headers=headers).json()["current_qty"]
    assert stock_retry == stock_after
    cust_retry = client.get(f"/api/customers/{customer['id']}", headers=headers).json()
    assert cust_retry["total_credit_balance"] == cust_after["total_credit_balance"]
