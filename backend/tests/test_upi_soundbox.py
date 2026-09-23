"""Tests for UPI Soundbox dynamic intents, simulation, and auto-reconciliation."""
import pytest


def test_upi_intent_lifecycle_and_simulation(client, vendor):
    headers, _ = vendor

    # 1. First ensure vendor has UPI ID configured
    patch_res = client.put(
        "/api/vendor/me",
        headers=headers,
        json={
            "name": "Test Owner",
            "store_name": "Sharma Supermarket",
            "upi_id": "sharmakirana@okhdfcbank",
        },
    )
    assert patch_res.status_code == 200

    # 2. Create dynamic UPI payment intent
    create_res = client.post(
        "/api/checkout/create-intent",
        headers=headers,
        json={"amount": 420.50, "note": "Rice & Sugar"},
    )
    assert create_res.status_code == 200
    intent = create_res.json()
    assert intent["status"] == "pending"
    assert intent["amount"] == 420.50
    assert intent["txn_ref"].startswith("V360-")
    assert "tr=" in intent["upi_url"]
    assert "am=420.50" in intent["upi_url"]
    assert intent["qr_base64"] is not None

    txn_ref = intent["txn_ref"]

    # 3. Check status before payment
    status_res = client.get(f"/api/checkout/intent/{txn_ref}/status", headers=headers)
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "pending"

    # 4. Simulate customer scanning QR and completing payment on PhonePe/GPay
    sim_res = client.post(
        "/api/checkout/simulate-payment",
        headers=headers,
        json={
            "txn_ref": txn_ref,
            "payer_name": "Rahul Verma (GPay)",
            "payer_vpa": "rahul@oksbi",
        },
    )
    assert sim_res.status_code == 200
    completed_intent = sim_res.json()
    assert completed_intent["status"] == "completed"
    assert completed_intent["payer_name"] == "Rahul Verma (GPay)"
    assert completed_intent["bank_ref_num"] is not None
    assert len(completed_intent["bank_ref_num"]) == 12
    assert completed_intent["completed_at"] is not None

    # 5. Check status after payment
    status_after = client.get(f"/api/checkout/intent/{txn_ref}/status", headers=headers).json()
    assert status_after["status"] == "completed"
    assert status_after["bank_ref_num"] == completed_intent["bank_ref_num"]

    # 6. Check recent payments list
    recent_res = client.get("/api/checkout/recent-payments", headers=headers)
    assert recent_res.status_code == 200
    recent_list = recent_res.json()
    assert any(p["txn_ref"] == txn_ref for p in recent_list)


def test_upi_webhook_reconciliation(client, vendor):
    headers, _ = vendor

    # Setup UPI ID
    client.put(
        "/api/vendor/me",
        headers=headers,
        json={"name": "Test Owner", "store_name": "Sharma Supermarket", "upi_id": "kirana@upi"},
    )

    # Create Intent
    intent = client.post(
        "/api/checkout/create-intent",
        headers=headers,
        json={"amount": 150.0},
    ).json()

    txn_ref = intent["txn_ref"]

    # Trigger webhook
    webhook_res = client.post(
        "/api/checkout/webhook",
        json={
            "txn_ref": txn_ref,
            "amount": 150.0,
            "status": "completed",
            "bank_ref_num": "498273615201",
            "payer_name": "Deepak Patel",
            "payer_vpa": "deepak@paytm",
        },
    )
    assert webhook_res.status_code == 200

    # Verify reconciliation
    status = client.get(f"/api/checkout/intent/{txn_ref}/status", headers=headers).json()
    assert status["status"] == "completed"
    assert status["bank_ref_num"] == "498273615201"
    assert status["payer_name"] == "Deepak Patel"
