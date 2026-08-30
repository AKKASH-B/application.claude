"""Iteration 3 tests: transaction edit/delete, isolation, forgot/reset password."""
import os
import uuid
import time

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


def _signup_login(suffix: str):
    creds = {
        "username": f"test{suffix}",
        "email": f"TEST_{suffix}@example.com",
        "password": "TestPass123!",
    }
    r = requests.post(f"{BASE_URL}/api/auth/signup", json=creds, timeout=15)
    assert r.status_code == 201, r.text
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": creds["username"], "password": creds["password"]},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s, creds


@pytest.fixture(scope="module")
def two_users():
    a_suffix = uuid.uuid4().hex[:8]
    b_suffix = uuid.uuid4().hex[:8]
    a, ac = _signup_login(a_suffix)
    b, bc = _signup_login(b_suffix)
    yield (a, ac, b, bc)
    for s in (a, b):
        try:
            s.post(f"{BASE_URL}/api/auth/logout", timeout=10)
        except Exception:
            pass


# ---------- Transactions: edit / delete / isolation ----------

def _make_tx(session, **overrides):
    payload = {
        "type": "expense",
        "amount": 50.0,
        "category": "TEST_Cat",
        "note": "TEST",
        "date": "2026-01-05",
    }
    payload.update(overrides)
    r = session.post(f"{BASE_URL}/api/transactions", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def test_update_transaction_updates_all_fields(two_users):
    a, _, _, _ = two_users
    tx = _make_tx(a, amount=10, category="Food", note="orig")
    updated = {
        "type": "income",
        "amount": 999.5,
        "category": "Salary",
        "note": "TEST_updated",
        "date": "2026-02-02",
    }
    r = a.put(f"{BASE_URL}/api/transactions/{tx['id']}", json=updated, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == tx["id"]
    for k, v in updated.items():
        assert body[k] == v, f"{k} mismatch"
    # Verify via GET
    got = a.get(f"{BASE_URL}/api/transactions", timeout=15).json()
    match = [x for x in got if x["id"] == tx["id"]][0]
    assert match["amount"] == 999.5
    assert match["category"] == "Salary"
    assert match["type"] == "income"


def test_update_other_users_transaction_returns_404(two_users):
    a, _, b, _ = two_users
    tx = _make_tx(a, note="TEST_isolate_edit")
    updated = {"type": "expense", "amount": 5, "category": "X", "note": "hax", "date": "2026-01-01"}
    r = b.put(f"{BASE_URL}/api/transactions/{tx['id']}", json=updated, timeout=15)
    assert r.status_code == 404, r.text
    # Ensure not modified
    orig = a.get(f"{BASE_URL}/api/transactions", timeout=15).json()
    m = [x for x in orig if x["id"] == tx["id"]][0]
    assert m["note"] == "TEST_isolate_edit"


def test_delete_transaction(two_users):
    a, _, _, _ = two_users
    tx = _make_tx(a, note="TEST_delete_me")
    r = a.delete(f"{BASE_URL}/api/transactions/{tx['id']}", timeout=15)
    assert r.status_code == 200
    assert r.json().get("ok") is True
    # 404 on re-delete
    r2 = a.delete(f"{BASE_URL}/api/transactions/{tx['id']}", timeout=15)
    assert r2.status_code == 404


def test_delete_other_users_transaction_returns_404(two_users):
    a, _, b, _ = two_users
    tx = _make_tx(a, note="TEST_isolate_delete")
    r = b.delete(f"{BASE_URL}/api/transactions/{tx['id']}", timeout=15)
    assert r.status_code == 404
    # still exists for owner
    got = a.get(f"{BASE_URL}/api/transactions", timeout=15).json()
    assert any(x["id"] == tx["id"] for x in got)
    # cleanup
    a.delete(f"{BASE_URL}/api/transactions/{tx['id']}", timeout=15)


def test_delete_missing_id_returns_404(two_users):
    a, _, _, _ = two_users
    r = a.delete(f"{BASE_URL}/api/transactions/{uuid.uuid4()}", timeout=15)
    assert r.status_code == 404


# ---------- Concurrent multi-user login ----------

def test_concurrent_sessions_are_isolated(two_users):
    a, ac, b, bc = two_users
    # Both /me still work independently
    ra = a.get(f"{BASE_URL}/api/me", timeout=15)
    rb = b.get(f"{BASE_URL}/api/me", timeout=15)
    assert ra.status_code == 200 and rb.status_code == 200
    assert ra.json()["username"] == ac["username"]
    assert rb.json()["username"] == bc["username"]
    # Transaction created by A is invisible to B
    tx = _make_tx(a, note="TEST_concurrent")
    b_list = b.get(f"{BASE_URL}/api/transactions", timeout=15).json()
    assert not any(x["id"] == tx["id"] for x in b_list)


# ---------- Forgot / Reset password ----------

def test_forgot_password_unregistered_returns_ok():
    r = requests.post(
        f"{BASE_URL}/api/auth/forgot-password",
        json={"email": f"nobody_{uuid.uuid4().hex[:6]}@example.com"},
        timeout=20,
    )
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_forgot_password_registered_returns_ok_and_sends():
    """Uses Resend sandbox address delivered@resend.dev. Signup with that email, then request reset."""
    suffix = uuid.uuid4().hex[:8]
    creds = {
        "username": f"deliv{suffix}",
        "email": "delivered@resend.dev",  # sandbox recipient
        "password": "TestPass123!",
    }
    r = requests.post(f"{BASE_URL}/api/auth/signup", json=creds, timeout=15)
    # if already exists from prior runs, that's ok
    if r.status_code == 409:
        pass
    else:
        assert r.status_code == 201, r.text
    fr = requests.post(
        f"{BASE_URL}/api/auth/forgot-password",
        json={"email": "delivered@resend.dev"},
        timeout=30,
    )
    assert fr.status_code == 200
    assert fr.json().get("ok") is True


def test_reset_token_invalid_returns_400():
    r = requests.post(
        f"{BASE_URL}/api/auth/reset-password",
        json={"token": "definitely_not_a_valid_token_" + uuid.uuid4().hex, "new_password": "NewPass123!"},
        timeout=15,
    )
    assert r.status_code == 400
    assert "invalid" in r.json()["detail"].lower() or "expired" in r.json()["detail"].lower()


def test_reset_token_single_use():
    """Insert a known reset token directly into MongoDB to verify single-use enforcement end-to-end."""
    try:
        import bcrypt
        from pymongo import MongoClient
        from datetime import datetime, timezone, timedelta
    except Exception:
        pytest.skip("pymongo/bcrypt not available in test env")

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    mc = MongoClient(mongo_url)
    db = mc[db_name]

    # Create user
    suffix = uuid.uuid4().hex[:8]
    creds = {"username": f"reset{suffix}", "email": f"TEST_reset_{suffix}@example.com", "password": "OldPass123!"}
    r = requests.post(f"{BASE_URL}/api/auth/signup", json=creds, timeout=15)
    assert r.status_code == 201, r.text
    user = db.users.find_one({"username": creds["username"]})
    assert user is not None

    raw_token = "TEST_singleuse_" + uuid.uuid4().hex
    token_hash = bcrypt.hashpw(raw_token.encode(), bcrypt.gensalt()).decode()
    db.password_resets.delete_many({"user_id": user["id"]})
    db.password_resets.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "token_hash": token_hash,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=30),
        "used": False,
        "created_at": datetime.now(timezone.utc),
    })

    # First use — should succeed and return a token
    r1 = requests.post(
        f"{BASE_URL}/api/auth/reset-password",
        json={"token": raw_token, "new_password": "NewPass123!"},
        timeout=15,
    )
    assert r1.status_code == 200, r1.text
    assert "access_token" in r1.json()

    # Second use — must be rejected with 400
    r2 = requests.post(
        f"{BASE_URL}/api/auth/reset-password",
        json={"token": raw_token, "new_password": "AnotherPass123!"},
        timeout=15,
    )
    assert r2.status_code == 400
    assert "invalid" in r2.json()["detail"].lower() or "expired" in r2.json()["detail"].lower()

    # Verify user can login with the NEW password
    lg = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": creds["username"], "password": "NewPass123!"},
        timeout=15,
    )
    assert lg.status_code == 200
