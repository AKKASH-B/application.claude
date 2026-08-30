import os
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


def test_transactions_crud_and_validation():
    assert BASE_URL
    session = requests.Session()
    login = session.post(f"{BASE_URL}/api/auth/login", json={"email": "qa@spendpulse.dev", "password": "SpendPulseQA2026!"}, timeout=15)
    assert login.status_code == 200
    session.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
    response = session.get(f"{BASE_URL}/api/transactions", timeout=15)
    assert response.status_code == 200
    assert isinstance(response.json(), list)

    invalid = session.post(
        f"{BASE_URL}/api/transactions",
        json={"type": "expense", "amount": 0, "category": "Food", "date": "2026-01-01"},
        timeout=15,
    )
    assert invalid.status_code == 422

    payload = {
        "type": "expense",
        "amount": 17.5,
        "category": "TEST_Food",
        "note": "TEST_transaction",
        "date": "2026-01-01",
    }
    created_response = session.post(f"{BASE_URL}/api/transactions", json=payload, timeout=15)
    assert created_response.status_code == 200
    created = created_response.json()
    assert created["amount"] == payload["amount"]
    assert created["category"] == payload["category"]
    transaction_id = created["id"]
    try:
        records = session.get(f"{BASE_URL}/api/transactions", timeout=15).json()
        assert any(item["id"] == transaction_id for item in records)
    finally:
        deleted = session.delete(f"{BASE_URL}/api/transactions/{transaction_id}", timeout=15)
        assert deleted.status_code == 200
        missing = session.delete(f"{BASE_URL}/api/transactions/{transaction_id}", timeout=15)
        assert missing.status_code == 404