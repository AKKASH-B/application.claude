import os
import uuid

import requests


BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL")


def test_auth_and_transaction_isolation():
    assert BASE_URL
    suffix = uuid.uuid4().hex[:10]
    one = {"email": f"TEST_one_{suffix}@example.com", "password": "TestPass123!"}
    two = {"email": f"TEST_two_{suffix}@example.com", "password": "TestPass123!"}
    sessions = []
    try:
        anonymous = requests.get(f"{BASE_URL}/api/transactions", timeout=15)
        assert anonymous.status_code == 401
        for credentials in (one, two):
            created = requests.post(f"{BASE_URL}/api/auth/signup", json=credentials, timeout=15)
            assert created.status_code == 201
            login = requests.post(f"{BASE_URL}/api/auth/login", json=credentials, timeout=15)
            assert login.status_code == 200
            session = requests.Session()
            session.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
            assert session.get(f"{BASE_URL}/api/me", timeout=15).json()["email"] == credentials["email"].lower()
            sessions.append(session)
        payload = {"type": "expense", "amount": 23, "category": "TEST_Isolation", "note": "TEST", "date": "2026-01-01"}
        made = sessions[0].post(f"{BASE_URL}/api/transactions", json=payload, timeout=15)
        assert made.status_code == 200
        tx_id = made.json()["id"]
        assert any(x["id"] == tx_id for x in sessions[0].get(f"{BASE_URL}/api/transactions", timeout=15).json())
        assert not any(x["id"] == tx_id for x in sessions[1].get(f"{BASE_URL}/api/transactions", timeout=15).json())
        logout = sessions[0].post(f"{BASE_URL}/api/auth/logout", timeout=15)
        assert logout.status_code == 200
        assert sessions[0].get(f"{BASE_URL}/api/me", timeout=15).status_code == 401
    finally:
        for session in sessions:
            session.post(f"{BASE_URL}/api/auth/logout", timeout=15)