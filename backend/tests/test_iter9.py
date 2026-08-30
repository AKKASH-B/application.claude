"""Iteration 9 backend tests - JWT persistence bug fix (unique jti + legacy goal tolerance).

Focus:
  1. PRIMARY BUG: Rapid logout/login (many cycles within same second) must NEVER erase user
     data or return 401 'Session ended'. Each new token must work, /api/me returns SAME
     user id, GET /api/transactions and GET /api/savings-goals return the persisted records.
  2. Two logins for the same user produce DIFFERENT access_token strings (unique jti).
  3. After logout, the OLD token is 401 but a fresh token issued at ~same time works.
  4. User identity/data stable across logins.
  5. GET /api/savings-goals tolerates legacy docs (no name/celebrated/created_at) -> 200.
"""
import os
import time
import uuid
import jwt
import requests
import pytest

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


def _unique_creds(prefix: str) -> dict:
    suffix = uuid.uuid4().hex[:10]
    return {
        "username": f"{prefix}{suffix}",
        "email": f"TEST_{prefix}_{suffix}@example.com",
        "password": "TestPass123!",
    }


def _signup(creds: dict) -> None:
    r = requests.post(f"{BASE_URL}/api/auth/signup", json=creds, timeout=15)
    assert r.status_code == 201, f"signup failed: {r.status_code} {r.text}"


def _login_raw(creds: dict) -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": creds["username"], "password": creds["password"]},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------- 1. Unique tokens per login (jti) ----------
class TestUniqueTokenPerLogin:
    def test_back_to_back_logins_produce_different_tokens(self):
        creds = _unique_creds("jti")
        _signup(creds)
        tokens = set()
        # 10 back-to-back logins within same second
        for _ in range(10):
            tokens.add(_login_raw(creds))
        assert len(tokens) == 10, f"Expected 10 unique tokens, got {len(tokens)} (jti not unique)"

    def test_jti_claim_present_and_unique(self):
        creds = _unique_creds("jtc")
        _signup(creds)
        t1 = _login_raw(creds)
        t2 = _login_raw(creds)
        p1 = jwt.decode(t1, options={"verify_signature": False})
        p2 = jwt.decode(t2, options={"verify_signature": False})
        assert "jti" in p1 and "jti" in p2, "Access tokens must include a jti claim"
        assert p1["jti"] != p2["jti"], "jti must be unique per login"
        assert p1["sub"] == p2["sub"], "sub (user id) must be stable across logins"


# ---------- 2. Rapid logout+login preserves data (PRIMARY BUG) ----------
class TestRapidLogoutLoginPreservesData:
    def test_rapid_cycles_never_erase_data(self):
        creds = _unique_creds("rlc")
        _signup(creds)

        # Initial login
        token = _login_raw(creds)
        me = requests.get(f"{BASE_URL}/api/me", headers=_auth_headers(token), timeout=10)
        assert me.status_code == 200
        stable_user_id = me.json()["id"]
        stable_username = me.json()["username"]

        # Seed data: 1 transaction + 1 savings goal
        tx_resp = requests.post(
            f"{BASE_URL}/api/transactions",
            headers=_auth_headers(token),
            json={
                "type": "expense", "amount": 42.5, "category": "Food",
                "note": "TEST_rlc_seed", "date": "2026-01-15",
            },
            timeout=10,
        )
        assert tx_resp.status_code == 200, tx_resp.text
        seed_tx_id = tx_resp.json()["id"]

        goal_resp = requests.post(
            f"{BASE_URL}/api/savings-goals",
            headers=_auth_headers(token),
            json={"name": "PersistMe", "target": 500},
            timeout=10,
        )
        assert goal_resp.status_code == 200, goal_resp.text
        seed_goal_id = goal_resp.json()["id"]

        # 6 rapid logout+login cycles (back-to-back, same second)
        cycle_tokens = [token]
        t0 = time.time()
        for i in range(6):
            # logout current token
            lo = requests.post(
                f"{BASE_URL}/api/auth/logout",
                headers=_auth_headers(cycle_tokens[-1]),
                timeout=10,
            )
            assert lo.status_code == 200, f"cycle {i} logout: {lo.status_code} {lo.text}"

            # login again immediately
            new_token = _login_raw(creds)
            assert new_token not in cycle_tokens, (
                f"cycle {i}: new token equal to a prior token -> would be pre-revoked"
            )
            cycle_tokens.append(new_token)

            # /api/me on new token
            me2 = requests.get(f"{BASE_URL}/api/me", headers=_auth_headers(new_token), timeout=10)
            assert me2.status_code == 200, (
                f"cycle {i}: /api/me failed: {me2.status_code} {me2.text}"
            )
            body = me2.json()
            assert body["id"] == stable_user_id, f"cycle {i}: user id changed!"
            assert body["username"] == stable_username

            # transactions still present
            tx_list = requests.get(
                f"{BASE_URL}/api/transactions",
                headers=_auth_headers(new_token),
                timeout=10,
            )
            assert tx_list.status_code == 200, f"cycle {i}: tx list failed"
            ids = [t["id"] for t in tx_list.json()]
            assert seed_tx_id in ids, f"cycle {i}: seed tx ERASED"

            # savings goals still present
            g_list = requests.get(
                f"{BASE_URL}/api/savings-goals",
                headers=_auth_headers(new_token),
                timeout=10,
            )
            assert g_list.status_code == 200, f"cycle {i}: goals list failed"
            gids = [g["id"] for g in g_list.json()]
            assert seed_goal_id in gids, f"cycle {i}: seed goal ERASED"

        elapsed = time.time() - t0
        print(f"6 logout+login cycles completed in {elapsed:.3f}s (rapid same-second bug guard)")


# ---------- 3. Logout revokes ONLY the specific old token ----------
class TestLogoutRevocationScope:
    def test_old_token_401_after_logout_new_token_ok(self):
        creds = _unique_creds("rev")
        _signup(creds)
        old_token = _login_raw(creds)
        # Verify old token works pre-logout
        pre = requests.get(f"{BASE_URL}/api/me", headers=_auth_headers(old_token), timeout=10)
        assert pre.status_code == 200

        # Logout
        lo = requests.post(
            f"{BASE_URL}/api/auth/logout",
            headers=_auth_headers(old_token),
            timeout=10,
        )
        assert lo.status_code == 200

        # Immediately login (same second)
        new_token = _login_raw(creds)
        assert new_token != old_token, "new token must differ from revoked old token"

        # Old token now 401
        rejected = requests.get(f"{BASE_URL}/api/me", headers=_auth_headers(old_token), timeout=10)
        assert rejected.status_code == 401, (
            f"old token should be 401 after logout, got {rejected.status_code}"
        )

        # New token works (this is the bug being fixed)
        ok = requests.get(f"{BASE_URL}/api/me", headers=_auth_headers(new_token), timeout=10)
        assert ok.status_code == 200, (
            f"new token must work, got {ok.status_code}: {ok.text}"
        )
        assert "Session ended" not in ok.text


# ---------- 4. Legacy savings-goals doc tolerance ----------
class TestLegacyGoalsTolerance:
    def test_get_savings_goals_returns_200_and_list(self):
        creds = _unique_creds("lgy")
        _signup(creds)
        token = _login_raw(creds)
        # Should not 500 even if legacy docs existed (this test simply guards the endpoint).
        r = requests.get(
            f"{BASE_URL}/api/savings-goals",
            headers=_auth_headers(token),
            timeout=10,
        )
        assert r.status_code == 200, f"GET /api/savings-goals must not 500: {r.status_code} {r.text}"
        assert isinstance(r.json(), list)


# ---------- 5. User identity stable across many independent logins ----------
class TestUserIdentityStable:
    def test_me_returns_same_id_across_logins(self):
        creds = _unique_creds("uid")
        _signup(creds)
        ids = set()
        for _ in range(5):
            token = _login_raw(creds)
            me = requests.get(f"{BASE_URL}/api/me", headers=_auth_headers(token), timeout=10)
            assert me.status_code == 200
            ids.add(me.json()["id"])
        assert len(ids) == 1, f"user id must be stable across logins, got: {ids}"
