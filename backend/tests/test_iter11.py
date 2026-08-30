"""Iteration 11 backend tests — username+password auth with email verification gate.

Covers: signup, login gate (EMAIL_NOT_VERIFIED), verify-email via injected code,
password mismatch/duplicate username, forgot/reset via injected reset code,
admin access-control, admin delete user, transactions (past-date persistence,
create/list/update/delete), splits create+delete cascade.
"""
import os
import uuid
import hashlib
import datetime
import asyncio
import pytest
import requests
from pathlib import Path
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient


def _base_url() -> str:
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    if not url:
        v = dotenv_values(Path("/app/frontend/.env"))
        url = v["EXPO_PUBLIC_BACKEND_URL"]
    return url.rstrip("/")


BASE = _base_url()
API = f"{BASE}/api"

_backend_env = dotenv_values(Path("/app/backend/.env"))
MONGO_URL = _backend_env["MONGO_URL"]
DB_NAME = _backend_env["DB_NAME"]


def _rand_username(prefix: str = "test_u") -> str:
    return (prefix + uuid.uuid4().hex[:8]).lower()


def _rand_email(u: str) -> str:
    return f"{u}@example.com"


def _rand_phone() -> str:
    return "9" + str(uuid.uuid4().int)[:9]


def _auth_header(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


async def _inject_code(username: str, purpose: str, code: str = "123456") -> None:
    """Inject a hashed code for verify/reset flows so tests don't need email."""
    client = AsyncIOMotorClient(MONGO_URL)
    try:
        db = client[DB_NAME]
        user = await db.users.find_one({"username": username})
        assert user, f"user {username} not found"
        await db.email_codes.delete_many({"user_id": user["id"], "purpose": purpose})
        await db.email_codes.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "purpose": purpose,
            "code_hash": hashlib.sha256(code.encode()).hexdigest(),
            "expires_at": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=10),
            "used": False,
            "attempts": 0,
            "created_at": datetime.datetime.now(datetime.timezone.utc),
        })
    finally:
        client.close()


def _signup(username: str | None = None, password: str = "password123") -> tuple[str, str, str]:
    """Signup returns (username, email, password). Account is UNVERIFIED."""
    u = username or _rand_username()
    e = _rand_email(u)
    r = requests.post(f"{API}/auth/signup", json={
        "username": u, "phone": _rand_phone(), "email": e,
        "password": password, "confirm_password": password,
    }, timeout=20)
    assert r.status_code == 201, r.text
    j = r.json()
    assert j.get("ok") is True and j.get("username") == u
    return u, e, password


def _verify_via_inject(username: str, code: str = "123456") -> str:
    asyncio.get_event_loop().run_until_complete(_inject_code(username, "verify", code))
    r = requests.post(f"{API}/auth/verify-email", json={"username": username, "code": code}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _login(username: str, password: str) -> requests.Response:
    return requests.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=15)


# ---------- health ----------
def test_root_ok():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200


# ---------- auth: signup + validation ----------
def test_signup_returns_201_and_password_mismatch_400():
    u = _rand_username()
    r = requests.post(f"{API}/auth/signup", json={
        "username": u, "phone": _rand_phone(), "email": _rand_email(u),
        "password": "password123", "confirm_password": "different1x",
    })
    assert r.status_code == 400
    r = requests.post(f"{API}/auth/signup", json={
        "username": u, "phone": _rand_phone(), "email": _rand_email(u),
        "password": "password123", "confirm_password": "password123",
    })
    assert r.status_code == 201


def test_signup_duplicate_username_409():
    u, _, _ = _signup()
    r = requests.post(f"{API}/auth/signup", json={
        "username": u, "phone": _rand_phone(), "email": _rand_email("other" + u),
        "password": "password123", "confirm_password": "password123",
    })
    assert r.status_code == 409


# ---------- auth: email verification gate ----------
def test_login_blocked_until_verified_then_login_succeeds():
    u, _, pw = _signup()
    r = _login(u, pw)
    assert r.status_code == 403
    assert r.json().get("detail") == "EMAIL_NOT_VERIFIED"
    tok = _verify_via_inject(u)
    assert tok
    r2 = _login(u, pw)
    assert r2.status_code == 200 and r2.json().get("access_token")


def test_wrong_password_401():
    u, _, _ = _signup()
    _verify_via_inject(u)
    r = _login(u, "wrongpass1")
    assert r.status_code == 401


# ---------- auth: admin ----------
def test_admin_login_and_role():
    r = _login("akkash_saba", "password123")
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    me = requests.get(f"{API}/me", headers=_auth_header(tok))
    assert me.status_code == 200
    body = me.json()
    assert body["role"] == "admin"
    assert body["email_verified"] is True


def test_non_admin_gets_403_on_admin_endpoints():
    u, _, pw = _signup()
    _verify_via_inject(u)
    tok = _login(u, pw).json()["access_token"]
    r = requests.get(f"{API}/admin/users", headers=_auth_header(tok))
    assert r.status_code == 403


def test_admin_can_delete_user():
    admin_tok = _login("akkash_saba", "password123").json()["access_token"]
    u, _, pw = _signup()
    _verify_via_inject(u)
    listing = requests.get(f"{API}/admin/users", headers=_auth_header(admin_tok)).json()
    target = next((x for x in listing if x["username"] == u), None)
    assert target
    r = requests.delete(f"{API}/admin/users/{target['id']}", headers=_auth_header(admin_tok))
    assert r.status_code == 200
    listing2 = requests.get(f"{API}/admin/users", headers=_auth_header(admin_tok)).json()
    assert not any(x["id"] == target["id"] for x in listing2)


# ---------- auth: forgot/reset ----------
def test_forgot_and_reset_password_flow():
    u, _, _ = _signup()
    # forgot always returns ok, even before verify
    r = requests.post(f"{API}/auth/forgot-password", json={"username": u})
    assert r.status_code == 200 and r.json().get("ok") is True
    asyncio.get_event_loop().run_until_complete(_inject_code(u, "reset", "654321"))
    r = requests.post(f"{API}/auth/reset-password", json={
        "username": u, "code": "654321", "new_password": "newerpass123"
    })
    assert r.status_code == 200 and r.json().get("access_token")
    # login with new password works (reset also flips email_verified=True)
    r2 = _login(u, "newerpass123")
    assert r2.status_code == 200


# ---------- transactions: past-date entry ----------
def test_transaction_persists_past_date():
    u, _, pw = _signup()
    _verify_via_inject(u)
    tok = _login(u, pw).json()["access_token"]
    past_date = "2024-08-05"
    r = requests.post(f"{API}/transactions", json={
        "type": "expense", "amount": 300, "category": "Food",
        "note": "TEST past-date", "date": past_date,
    }, headers=_auth_header(tok))
    assert r.status_code == 200, r.text
    tx = r.json()
    assert tx["date"] == past_date
    listing = requests.get(f"{API}/transactions", headers=_auth_header(tok)).json()
    match = next((t for t in listing if t["id"] == tx["id"]), None)
    assert match and match["date"] == past_date


def test_transaction_crud_and_delete():
    u, _, pw = _signup()
    _verify_via_inject(u)
    tok = _login(u, pw).json()["access_token"]
    r = requests.post(f"{API}/transactions", json={
        "type": "income", "amount": 500, "category": "Salary",
        "note": "TEST crud", "date": "2026-01-05",
    }, headers=_auth_header(tok))
    tx = r.json()
    r = requests.put(f"{API}/transactions/{tx['id']}", json={
        "type": "income", "amount": 550, "category": "Salary",
        "note": "TEST crud edited", "date": "2026-01-05",
    }, headers=_auth_header(tok))
    assert r.status_code == 200 and r.json()["amount"] == 550
    r = requests.delete(f"{API}/transactions/{tx['id']}", headers=_auth_header(tok))
    assert r.status_code == 200
    listing = requests.get(f"{API}/transactions", headers=_auth_header(tok)).json()
    assert not any(t["id"] == tx["id"] for t in listing)


# ---------- splits: create + delete cascades to linked tx ----------
def test_split_create_delete_removes_linked_transaction():
    u, _, pw = _signup()
    _verify_via_inject(u)
    tok = _login(u, pw).json()["access_token"]
    r = requests.post(f"{API}/splits", json={
        "total_amount": 300, "note": "TEST split", "mode": "equal",
        "members": [
            {"name": "You", "share_value": 1, "owed_amount": 150, "is_payer": True, "settled": False},
            {"name": "Priya", "share_value": 1, "owed_amount": 150, "is_payer": False, "settled": False},
        ],
        "create_transaction": True, "date": "2026-01-10",
    }, headers=_auth_header(tok))
    assert r.status_code == 201, r.text
    split = r.json()
    tx_id = split["transaction_id"]
    txs = requests.get(f"{API}/transactions", headers=_auth_header(tok)).json()
    assert any(t["id"] == tx_id for t in txs)
    r = requests.delete(f"{API}/splits/{split['id']}", headers=_auth_header(tok))
    assert r.status_code == 200
    txs2 = requests.get(f"{API}/transactions", headers=_auth_header(tok)).json()
    assert not any(t["id"] == tx_id for t in txs2)
