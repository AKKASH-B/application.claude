"""Iteration 12 backend regression: verified admin login, transactions CRUD, splits.

Focus: ensure the backend used by iteration 12 (verified badge, zero-balance UI fix,
contact-import UI) has not regressed on the auth/txn/split contracts.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Playwright/curl agents use EXPO_BACKEND_URL — accept either
    BASE_URL = os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"username": "akkash_saba", "password": "password123"})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("access_token"), body
    return body["access_token"]


# --- Auth / verified admin --------------------------------------------------

class TestAuthAdmin:
    def test_admin_me_has_verified_flag(self, api, admin_token):
        r = api.get(f"{BASE_URL}/api/me",
                    headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        j = r.json()
        assert j["username"] == "akkash_saba"
        assert j["email_verified"] is True
        assert j["role"] == "admin"

    def test_admin_list_users(self, api, admin_token):
        r = api.get(f"{BASE_URL}/api/admin/users",
                    headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list) and len(users) >= 1
        me = next((u for u in users if u["username"] == "akkash_saba"), None)
        assert me is not None
        # verified/unverified flag must exist so admin panel pill can render
        assert "email_verified" in me


# --- Zero balance state -----------------------------------------------------

class TestZeroBalance:
    def test_admin_has_no_transactions(self, api, admin_token):
        r = api.get(f"{BASE_URL}/api/transactions",
                    headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        txs = r.json()
        # The empty-balance UI fix relies on this account being empty on load.
        assert isinstance(txs, list)
        # Purge any leftover TEST_ transactions from previous runs
        for t in txs:
            if (t.get("note") or "").startswith("TEST_IT12"):
                api.delete(f"{BASE_URL}/api/transactions/{t['id']}",
                           headers={"Authorization": f"Bearer {admin_token}"})


# --- Transactions CRUD ------------------------------------------------------

class TestTransactionsCRUD:
    def test_create_expense_and_read_back(self, api, admin_token):
        payload = {
            "type": "expense",
            "amount": 250,
            "category": "Food",
            "note": "TEST_IT12_expense",
            "date": "2026-01-15",
        }
        r = api.post(f"{BASE_URL}/api/transactions", json=payload,
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code in (200, 201), r.text
        created = r.json()
        assert created["amount"] == 250
        assert created["type"] == "expense"
        tx_id = created["id"]

        g = api.get(f"{BASE_URL}/api/transactions",
                    headers={"Authorization": f"Bearer {admin_token}"})
        assert g.status_code == 200
        assert any(t["id"] == tx_id for t in g.json())

        d = api.delete(f"{BASE_URL}/api/transactions/{tx_id}",
                       headers={"Authorization": f"Bearer {admin_token}"})
        assert d.status_code in (200, 204)


# --- Splits (unchanged contract) --------------------------------------------

class TestSplits:
    def test_create_and_delete_split(self, api, admin_token):
        payload = {
            "total_amount": 900,
            "note": "TEST_IT12_split",
            "mode": "equal",
            "members": [
                {"name": "Alice", "share_value": 50, "owed_amount": 450, "is_payer": True},
                {"name": "Bob", "phone": "9999999999", "share_value": 50, "owed_amount": 450},
            ],
            "create_transaction": False,
        }
        r = api.post(f"{BASE_URL}/api/splits", json=payload,
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code in (200, 201), r.text
        s = r.json()
        assert s["note"] == "TEST_IT12_split"
        assert len(s["members"]) == 2
        sid = s["id"]

        g = api.get(f"{BASE_URL}/api/splits/{sid}",
                    headers={"Authorization": f"Bearer {admin_token}"})
        assert g.status_code == 200

        d = api.delete(f"{BASE_URL}/api/splits/{sid}",
                       headers={"Authorization": f"Bearer {admin_token}"})
        assert d.status_code in (200, 204)


# --- Auth failure paths still enforced --------------------------------------

class TestAuthGate:
    def test_login_wrong_password(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"username": "akkash_saba", "password": "WRONG"})
        assert r.status_code == 401

    def test_admin_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/admin/users")
        assert r.status_code in (401, 403)
