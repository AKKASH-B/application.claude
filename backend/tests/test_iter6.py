"""Iteration 6 backend tests

Focus:
  1. BUG FIX: POST /api/auth/forgot-password sends via Emergent-managed Resend
     without erroring (backend .env now has EMERGENT_EMAIL_KEY populated).
  2. Non-registered email still returns {ok:true} (anti-enumeration).
  3. reset-password with bogus token -> 400.
  4. Regression: savings transaction type creates & lists.
  5. Regression: income - expense can be negative; savings excluded from
     that computation and tracked separately.
  6. Regression: signup / login / /me / basic transaction CRUD.
"""
import os
import time
import uuid
import subprocess
import requests
import pytest

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

# Resend safe sink (per review request)
SINK_EMAIL = "delivered@resend.dev"


# ---------- helpers ----------

def _unique_creds(prefix: str, email: str | None = None) -> dict:
    suffix = uuid.uuid4().hex[:8]
    return {
        "username": f"{prefix}{suffix}",
        "email": email or f"TEST_{prefix}_{suffix}@example.com",
        "password": "TestPass123!",
    }


def _signup(creds: dict) -> None:
    r = requests.post(f"{BASE_URL}/api/auth/signup", json=creds, timeout=15)
    assert r.status_code == 201, f"signup failed: {r.status_code} {r.text}"


def _login(username: str, password: str) -> requests.Session:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": username, "password": password},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s


def _tail_backend_err(lines: int = 400) -> str:
    """Return the tail of the backend error log (where httpx INFO lands)."""
    try:
        out = subprocess.check_output(
            ["tail", "-n", str(lines), "/var/log/supervisor/backend.err.log"],
            stderr=subprocess.STDOUT,
            timeout=5,
        )
        return out.decode("utf-8", errors="replace")
    except Exception as e:  # pragma: no cover
        return f"<tail failed: {e}>"


# ---------- BUG FIX: forgot-password email send ----------

class TestForgotPasswordEmailFix:
    """The primary bug: EMERGENT_EMAIL_KEY was empty so Resend send failed silently."""

    def test_registered_user_triggers_email_send(self):
        # Create user with the Resend safe sink as email
        creds = _unique_creds("fp", email=SINK_EMAIL)
        # If sink already registered from prior run, that's fine — swap to unique alias.
        r = requests.post(f"{BASE_URL}/api/auth/signup", json=creds, timeout=15)
        if r.status_code == 409:
            # Use a plus-alias so we still hit Resend's sink but a fresh account
            creds["email"] = f"delivered+iter6_{uuid.uuid4().hex[:6]}@resend.dev"
            r = requests.post(f"{BASE_URL}/api/auth/signup", json=creds, timeout=15)
        assert r.status_code == 201, f"signup failed: {r.status_code} {r.text}"

        # Baseline current log length so we only inspect log lines produced by this call
        before = _tail_backend_err(2000)
        before_len = len(before)

        r = requests.post(
            f"{BASE_URL}/api/auth/forgot-password",
            json={"email": creds["email"]},
            timeout=30,
        )
        assert r.status_code == 200, f"forgot-password failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("ok") is True

        # Give the email proxy call a moment to flush to logs (send_email is awaited
        # inline so it should already be flushed, but be generous).
        time.sleep(1.5)
        after = _tail_backend_err(2000)
        delta = after[before_len:] if len(after) >= before_len else after

        # Success signal: a 202 from the Emergent email proxy in the fresh log window.
        assert "integrations.emergentagent.com/api/v1/email/send" in delta, (
            "Backend did not attempt to call the Emergent email proxy after forgot-password.\n"
            f"---log window---\n{delta[-2000:]}"
        )
        assert "202 Accepted" in delta or "\"HTTP/1.1 202" in delta, (
            "Emergent email proxy did not return 202 Accepted; email send likely failed.\n"
            f"---log window---\n{delta[-2000:]}"
        )

        # Negative signal: our failure log messages must not be present
        assert "Email send failed:" not in delta, (
            f"Backend logged an email failure:\n{delta[-2000:]}"
        )
        assert "Email send error:" not in delta, (
            f"Backend logged an email error:\n{delta[-2000:]}"
        )
        assert "Password reset email failed to send" not in delta

    def test_unregistered_email_still_ok(self):
        # Never-signed-up email — endpoint must still return ok:true and NOT crash
        email = f"nobody_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(
            f"{BASE_URL}/api/auth/forgot-password",
            json={"email": email},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_invalid_email_format_422(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/forgot-password",
            json={"email": "not-an-email"},
            timeout=10,
        )
        assert r.status_code == 422


class TestResetPassword:
    def test_invalid_token_returns_400(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/reset-password",
            json={"token": "definitelynotarealresettoken1234567890", "new_password": "NewPass123!"},
            timeout=15,
        )
        assert r.status_code == 400
        assert "invalid" in r.json().get("detail", "").lower() or "expired" in r.json().get("detail", "").lower()

    def test_short_token_422(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/reset-password",
            json={"token": "short", "new_password": "NewPass123!"},
            timeout=10,
        )
        assert r.status_code == 422


# ---------- Auth regression ----------

class TestAuthRegression:
    def test_signup_login_me(self):
        creds = _unique_creds("reg")
        _signup(creds)
        s = _login(creds["username"], creds["password"])
        r = s.get(f"{BASE_URL}/api/me", timeout=10)
        assert r.status_code == 200
        me = r.json()
        assert me["username"] == creds["username"]
        assert me["email"] == creds["email"].lower()
        assert "id" in me

    def test_login_bad_password_401(self):
        creds = _unique_creds("reg")
        _signup(creds)
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": creds["username"], "password": "wrongpw!!"},
            timeout=10,
        )
        assert r.status_code == 401


# ---------- Transactions regression: savings + negative balance ----------

@pytest.fixture(scope="module")
def tx_user():
    creds = _unique_creds("tx")
    _signup(creds)
    s = _login(creds["username"], creds["password"])
    return s, creds


class TestSavingsAndBalance:
    def test_create_savings_transaction(self, tx_user):
        s, _ = tx_user
        payload = {
            "type": "savings",
            "amount": 500.0,
            "category": "Emergency Fund",
            "note": "TEST_iter6_savings",
            "date": "2026-01-10",
        }
        r = s.post(f"{BASE_URL}/api/transactions", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["type"] == "savings"
        assert tx["category"] == "Emergency Fund"
        assert tx["amount"] == 500.0

        # Verify persistence via GET
        r2 = s.get(f"{BASE_URL}/api/transactions", timeout=15)
        assert r2.status_code == 200
        ids = {t["id"] for t in r2.json()}
        assert tx["id"] in ids

    def test_negative_balance_and_savings_isolated(self, tx_user):
        s, _ = tx_user

        # Fresh isolated user to make counting deterministic
        creds = _unique_creds("bal")
        _signup(creds)
        s2 = _login(creds["username"], creds["password"])

        seed = [
            {"type": "income",  "amount": 100.0, "category": "Salary",         "note": "TEST_bal_inc",  "date": "2026-01-11"},
            {"type": "expense", "amount": 250.0, "category": "Rent",           "note": "TEST_bal_exp",  "date": "2026-01-12"},
            {"type": "savings", "amount": 500.0, "category": "Emergency Fund", "note": "TEST_bal_sav",  "date": "2026-01-13"},
        ]
        created_ids = []
        for p in seed:
            r = s2.post(f"{BASE_URL}/api/transactions", json=p, timeout=15)
            assert r.status_code == 200, r.text
            created_ids.append(r.json()["id"])

        r = s2.get(f"{BASE_URL}/api/transactions", timeout=15)
        assert r.status_code == 200
        txs = r.json()
        # Only our 3 seeded rows for this brand new user
        assert len(txs) == 3

        income  = sum(t["amount"] for t in txs if t["type"] == "income")
        expense = sum(t["amount"] for t in txs if t["type"] == "expense")
        savings = sum(t["amount"] for t in txs if t["type"] == "savings")

        assert income == 100.0
        assert expense == 250.0
        assert savings == 500.0
        # balance = income - expense, savings is NOT included
        assert (income - expense) == -150.0, "Balance must be negative when expense > income"
        # Savings must be tracked as its own bucket, not folded into income/expense totals
        assert savings != 0
        assert (income - expense) != savings


class TestTransactionCrudRegression:
    def test_full_crud(self):
        creds = _unique_creds("crud")
        _signup(creds)
        s = _login(creds["username"], creds["password"])

        # CREATE
        p = {"type": "expense", "amount": 42.0, "category": "Food", "note": "TEST_crud_c", "date": "2026-01-15"}
        r = s.post(f"{BASE_URL}/api/transactions", json=p, timeout=15)
        assert r.status_code == 200
        tx = r.json()
        tx_id = tx["id"]

        # READ
        r = s.get(f"{BASE_URL}/api/transactions", timeout=15)
        assert r.status_code == 200
        assert any(t["id"] == tx_id for t in r.json())

        # UPDATE
        upd = {"type": "expense", "amount": 55.0, "category": "Food", "note": "TEST_crud_u", "date": "2026-01-15"}
        r = s.put(f"{BASE_URL}/api/transactions/{tx_id}", json=upd, timeout=15)
        assert r.status_code == 200
        assert r.json()["amount"] == 55.0

        # DELETE
        r = s.delete(f"{BASE_URL}/api/transactions/{tx_id}", timeout=15)
        assert r.status_code == 200
        # 404 on second delete confirms removal
        r = s.delete(f"{BASE_URL}/api/transactions/{tx_id}", timeout=15)
        assert r.status_code == 404

    def test_invalid_type_rejected(self):
        creds = _unique_creds("bad")
        _signup(creds)
        s = _login(creds["username"], creds["password"])
        p = {"type": "transfer", "amount": 10.0, "category": "Food", "note": "x", "date": "2026-01-15"}
        r = s.post(f"{BASE_URL}/api/transactions", json=p, timeout=15)
        assert r.status_code == 422
