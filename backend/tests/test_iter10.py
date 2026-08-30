"""Iteration 10 backend tests - focus on auth (mobile+OTP), split add/delete, admin delete."""
import os, uuid, requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
if not BASE:
    # fall back to same var used by frontend, from .env
    from pathlib import Path
    from dotenv import dotenv_values
    v = dotenv_values(Path("/app/frontend/.env"))
    BASE = v["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

API = f"{BASE}/api"


def _rand_mobile():
    # 10 digits, unlikely collision
    return "9" + str(uuid.uuid4().int)[:9]


def _signup(name="TEST_User"):
    m = _rand_mobile()
    r = requests.post(f"{API}/auth/send-otp", json={"mobile": m, "purpose": "signup"}, timeout=15)
    assert r.status_code == 200, r.text
    otp = r.json()["demo_otp"]
    r = requests.post(f"{API}/auth/signup", json={
        "name": name, "mobile": m, "password": "password123",
        "confirm_password": "password123", "otp": otp,
    }, timeout=15)
    assert r.status_code == 201, r.text
    return m, r.json()["access_token"]


# ---------- Auth ----------
def test_send_otp_returns_demo_otp():
    m = _rand_mobile()
    r = requests.post(f"{API}/auth/send-otp", json={"mobile": m, "purpose": "signup"})
    assert r.status_code == 200
    assert "demo_otp" in r.json() and len(r.json()["demo_otp"]) == 6


def test_signup_login_wrong_password_and_duplicate():
    m, tok = _signup()
    # login ok
    r = requests.post(f"{API}/auth/login", json={"mobile": m, "password": "password123"})
    assert r.status_code == 200 and r.json().get("access_token")
    # wrong password
    r = requests.post(f"{API}/auth/login", json={"mobile": m, "password": "wrongpass"})
    assert r.status_code == 401
    # duplicate signup
    r = requests.post(f"{API}/auth/send-otp", json={"mobile": m, "purpose": "signup"})
    assert r.status_code == 409


def test_password_mismatch_rejected():
    m = _rand_mobile()
    r = requests.post(f"{API}/auth/send-otp", json={"mobile": m, "purpose": "signup"})
    otp = r.json()["demo_otp"]
    r = requests.post(f"{API}/auth/signup", json={
        "name": "TEST_x", "mobile": m, "password": "password123",
        "confirm_password": "different1", "otp": otp,
    })
    assert r.status_code == 400


def test_reset_password_works():
    m, _ = _signup()
    r = requests.post(f"{API}/auth/send-otp", json={"mobile": m, "purpose": "reset"})
    assert r.status_code == 200
    otp = r.json()["demo_otp"]
    r = requests.post(f"{API}/auth/reset-password", json={"mobile": m, "otp": otp, "new_password": "newpass123"})
    assert r.status_code == 200
    r = requests.post(f"{API}/auth/login", json={"mobile": m, "password": "newpass123"})
    assert r.status_code == 200


# ---------- Split ----------
def _auth(tok): return {"Authorization": f"Bearer {tok}"}


def test_split_create_delete_removes_linked_tx():
    _, tok = _signup()
    payload = {
        "total_amount": 300, "note": "TEST split", "mode": "equal",
        "members": [
            {"name": "You", "share_value": 1, "owed_amount": 150, "is_payer": True, "settled": False},
            {"name": "Priya", "share_value": 1, "owed_amount": 150, "is_payer": False, "settled": False},
        ],
        "create_transaction": True, "date": "2026-01-10",
    }
    r = requests.post(f"{API}/splits", json=payload, headers=_auth(tok))
    assert r.status_code == 201, r.text
    split = r.json()
    tx_id = split["transaction_id"]
    assert tx_id
    # confirm tx exists
    r = requests.get(f"{API}/transactions", headers=_auth(tok))
    assert any(t["id"] == tx_id for t in r.json())
    # delete split
    r = requests.delete(f"{API}/splits/{split['id']}", headers=_auth(tok))
    assert r.status_code == 200
    # tx should also be gone
    r = requests.get(f"{API}/transactions", headers=_auth(tok))
    assert not any(t["id"] == tx_id for t in r.json())
    # split gone
    r = requests.get(f"{API}/splits/{split['id']}", headers=_auth(tok))
    assert r.status_code == 404


def test_friends_add_and_list():
    _, tok = _signup()
    r = requests.post(f"{API}/friends", json={"name": "TEST_Alice", "phone": "9990001111"}, headers=_auth(tok))
    assert r.status_code == 200
    r = requests.get(f"{API}/friends", headers=_auth(tok))
    assert any(f["name"] == "TEST_Alice" for f in r.json())


# ---------- Date-wise transaction ----------
def test_transaction_stores_chosen_date():
    _, tok = _signup()
    r = requests.post(f"{API}/transactions", json={
        "type": "expense", "amount": 250, "category": "Food", "note": "TEST", "date": "2025-12-15",
    }, headers=_auth(tok))
    assert r.status_code == 200
    tx = r.json()
    assert tx["date"] == "2025-12-15"
    r = requests.get(f"{API}/transactions", headers=_auth(tok))
    assert any(t["id"] == tx["id"] and t["date"] == "2025-12-15" for t in r.json())


# ---------- Admin ----------
def test_admin_access_control_and_delete_user():
    # admin exists (mobile 9876543210 / password123)
    r = requests.post(f"{API}/auth/login", json={"mobile": "9876543210", "password": "password123"})
    if r.status_code != 200:
        # skip if admin fixture missing
        import pytest
        pytest.skip("admin account not present in DB")
    admin_tok = r.json()["access_token"]
    # non-admin should get 403 on admin endpoints
    _, user_tok = _signup()
    r = requests.get(f"{API}/admin/users", headers=_auth(user_tok))
    assert r.status_code == 403
    # admin can list
    r = requests.get(f"{API}/admin/users", headers=_auth(admin_tok))
    assert r.status_code == 200
    users = r.json()
    # create a throwaway user and delete via admin
    m, _ = _signup(name="TEST_ToDelete")
    r = requests.get(f"{API}/admin/users", headers=_auth(admin_tok))
    target = next((u for u in r.json() if u["mobile"] == m), None)
    assert target is not None
    r = requests.delete(f"{API}/admin/users/{target['id']}", headers=_auth(admin_tok))
    assert r.status_code == 200
    r = requests.get(f"{API}/admin/users", headers=_auth(admin_tok))
    assert not any(u["id"] == target["id"] for u in r.json())
