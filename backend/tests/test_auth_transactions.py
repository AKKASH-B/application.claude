"""Live API test: sign-up, login, data isolation between users, logout.
Run against a deployed or local backend:  EXPO_PUBLIC_BACKEND_URL=http://localhost:8001 pytest backend/tests/test_auth_transactions.py
"""
import os
import uuid

import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL")


def _account(tag: str, suffix: str) -> dict:
    return {"username": f"t_{tag}_{suffix}", "email": f"t_{tag}_{suffix}@example.com", "pin": "482913"}


def test_auth_and_transaction_isolation():
    assert BASE_URL
    suffix = uuid.uuid4().hex[:8]
    one, two = _account("one", suffix), _account("two", suffix)
    sessions = []
    try:
        assert requests.get(f"{BASE_URL}/api/transactions", timeout=15).status_code == 401
        for acct in (one, two):
            created = requests.post(f"{BASE_URL}/api/auth/signup", json=acct, timeout=15)
            assert created.status_code == 201
            login = requests.post(f"{BASE_URL}/api/auth/login", json={"username": acct["username"], "pin": acct["pin"]}, timeout=15)
            assert login.status_code == 200
            session = requests.Session()
            session.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
            me = session.get(f"{BASE_URL}/api/me", timeout=15).json()
            assert me["username"] == acct["username"] and me["email"] == acct["email"]
            sessions.append(session)

        # Same email can't be registered twice
        dup = requests.post(f"{BASE_URL}/api/auth/signup", json={**two, "username": f"t_dup_{suffix}"}, timeout=15)
        assert dup.status_code == 409

        payload = {"type": "expense", "amount": 23, "category": "Food", "note": "TEST", "date": "2026-01-01"}
        made = sessions[0].post(f"{BASE_URL}/api/transactions", json=payload, timeout=15)
        assert made.status_code == 200
        tx_id = made.json()["id"]
        assert any(x["id"] == tx_id for x in sessions[0].get(f"{BASE_URL}/api/transactions", timeout=15).json())
        assert not any(x["id"] == tx_id for x in sessions[1].get(f"{BASE_URL}/api/transactions", timeout=15).json())

        assert sessions[0].post(f"{BASE_URL}/api/auth/logout", timeout=15).status_code == 200
        assert sessions[0].get(f"{BASE_URL}/api/me", timeout=15).status_code == 401
    finally:
        # Clean up the test accounts through the real delete-account endpoint
        for acct, session in zip((one, two), sessions):
            login = requests.post(f"{BASE_URL}/api/auth/login", json={"username": acct["username"], "pin": acct["pin"]}, timeout=15)
            if login.status_code == 200:
                s = requests.Session()
                s.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
                s.post(f"{BASE_URL}/api/me/delete", json={"current_pin": acct["pin"]}, timeout=15)


def test_recovery_request_never_leaks_code_or_account_existence():
    assert BASE_URL
    unknown = requests.post(f"{BASE_URL}/api/auth/request-otp", json={"email": f"nobody_{uuid.uuid4().hex[:8]}@example.com"}, timeout=15)
    assert unknown.status_code == 200
    body = unknown.json()
    assert "otp" not in body and "code" not in body
    bad = requests.post(f"{BASE_URL}/api/auth/reset-pin", json={"email": "nobody@example.com", "otp": "000000", "new_pin": "135790"}, timeout=15)
    assert bad.status_code == 401
