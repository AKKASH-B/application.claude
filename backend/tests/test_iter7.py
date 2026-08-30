"""Iteration 7 backend tests

Focus:
  1. Savings goal endpoints (GET/PUT/DELETE /api/savings-goal)
     - GET returns null when none set
     - PUT upserts and returns {id, target, updated_at}
     - PUT again updates same goal (id stable, no duplicate)
     - DELETE removes it (subsequent GET returns null)
     - PUT with target <= 0 returns 422
     - Endpoints require auth (401 without token)
  2. Per-user isolation for savings goals
  3. Regression: negative balance scenario (income=100, expense=250 => -150)
     and savings excluded from balance (no changes needed on backend—balance
     computed on frontend, but backend correctness is verified by listing).
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


def _unique_creds(prefix: str) -> dict:
    suffix = uuid.uuid4().hex[:8]
    return {
        "username": f"{prefix}{suffix}",
        "email": f"TEST_{prefix}_{suffix}@example.com",
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


@pytest.fixture(scope="module")
def session_a():
    creds = _unique_creds("sga")
    _signup(creds)
    return _login(creds["username"], creds["password"])


@pytest.fixture(scope="module")
def session_b():
    creds = _unique_creds("sgb")
    _signup(creds)
    return _login(creds["username"], creds["password"])


# ---------- Savings goal endpoints ----------

class TestSavingsGoalAuth:
    def test_get_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/savings-goal", timeout=10)
        assert r.status_code == 401

    def test_put_requires_auth(self):
        r = requests.put(f"{BASE_URL}/api/savings-goal", json={"target": 1000}, timeout=10)
        assert r.status_code == 401

    def test_delete_requires_auth(self):
        r = requests.delete(f"{BASE_URL}/api/savings-goal", timeout=10)
        assert r.status_code == 401


class TestSavingsGoalCRUD:
    def test_get_null_when_none_set(self, session_a):
        r = session_a.get(f"{BASE_URL}/api/savings-goal", timeout=10)
        assert r.status_code == 200
        # Endpoint returns Optional[SavingsGoal] => null when absent
        assert r.json() is None

    def test_put_upsert_creates_goal(self, session_a):
        r = session_a.put(f"{BASE_URL}/api/savings-goal", json={"target": 10000}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "id" in body and isinstance(body["id"], str) and len(body["id"]) > 0
        assert body["target"] == 10000
        assert "updated_at" in body and body["updated_at"]

        # GET verifies persistence
        r2 = session_a.get(f"{BASE_URL}/api/savings-goal", timeout=10)
        assert r2.status_code == 200
        got = r2.json()
        assert got is not None
        assert got["id"] == body["id"]
        assert got["target"] == 10000

    def test_put_again_updates_same_goal(self, session_a):
        # Read current id first
        r0 = session_a.get(f"{BASE_URL}/api/savings-goal", timeout=10)
        assert r0.status_code == 200
        original = r0.json()
        assert original is not None
        original_id = original["id"]

        r = session_a.put(f"{BASE_URL}/api/savings-goal", json={"target": 25000.5}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["id"] == original_id, "PUT must update same doc, not create a duplicate"
        assert body["target"] == 25000.5

        # There must still be exactly one goal returned via GET (single-doc endpoint)
        r2 = session_a.get(f"{BASE_URL}/api/savings-goal", timeout=10)
        got = r2.json()
        assert got["id"] == original_id
        assert got["target"] == 25000.5

    def test_put_zero_or_negative_returns_422(self, session_a):
        for bad in (0, -1, -100.5):
            r = session_a.put(f"{BASE_URL}/api/savings-goal", json={"target": bad}, timeout=10)
            assert r.status_code == 422, f"expected 422 for target={bad}, got {r.status_code} {r.text}"

    def test_put_missing_target_422(self, session_a):
        r = session_a.put(f"{BASE_URL}/api/savings-goal", json={}, timeout=10)
        assert r.status_code == 422

    def test_delete_removes_goal(self, session_a):
        r = session_a.delete(f"{BASE_URL}/api/savings-goal", timeout=10)
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # GET now returns null
        r2 = session_a.get(f"{BASE_URL}/api/savings-goal", timeout=10)
        assert r2.status_code == 200
        assert r2.json() is None

        # Second delete returns 404 (nothing to delete)
        r3 = session_a.delete(f"{BASE_URL}/api/savings-goal", timeout=10)
        assert r3.status_code == 404


class TestSavingsGoalIsolation:
    def test_goal_is_per_user(self, session_a, session_b):
        # user A sets a goal
        ra = session_a.put(f"{BASE_URL}/api/savings-goal", json={"target": 5000}, timeout=10)
        assert ra.status_code == 200
        goal_a = ra.json()

        # user B's GET must be null (never set)
        rb = session_b.get(f"{BASE_URL}/api/savings-goal", timeout=10)
        assert rb.status_code == 200
        assert rb.json() is None, "User B must not see user A's savings goal"

        # user B sets a different goal
        rb2 = session_b.put(f"{BASE_URL}/api/savings-goal", json={"target": 9999}, timeout=10)
        assert rb2.status_code == 200
        goal_b = rb2.json()
        assert goal_b["id"] != goal_a["id"]
        assert goal_b["target"] == 9999

        # user A's goal is untouched
        ra2 = session_a.get(f"{BASE_URL}/api/savings-goal", timeout=10)
        assert ra2.status_code == 200
        got_a = ra2.json()
        assert got_a is not None
        assert got_a["id"] == goal_a["id"]
        assert got_a["target"] == 5000

        # Cleanup
        session_a.delete(f"{BASE_URL}/api/savings-goal", timeout=10)
        session_b.delete(f"{BASE_URL}/api/savings-goal", timeout=10)


# ---------- Regression: negative balance + savings isolation ----------

class TestBalanceAndSavingsRegression:
    def test_income_minus_expense_negative_savings_isolated(self):
        creds = _unique_creds("bal")
        _signup(creds)
        s = _login(creds["username"], creds["password"])

        seed = [
            {"type": "income",  "amount": 100.0, "category": "Salary",         "note": "TEST_bal_inc", "date": "2026-01-11"},
            {"type": "expense", "amount": 250.0, "category": "Rent",           "note": "TEST_bal_exp", "date": "2026-01-12"},
            {"type": "savings", "amount": 6000.0,"category": "Emergency Fund", "note": "TEST_bal_sav", "date": "2026-01-13"},
        ]
        for p in seed:
            r = s.post(f"{BASE_URL}/api/transactions", json=p, timeout=15)
            assert r.status_code == 200, r.text

        txs = s.get(f"{BASE_URL}/api/transactions", timeout=15).json()
        assert len(txs) == 3
        income = sum(t["amount"] for t in txs if t["type"] == "income")
        expense = sum(t["amount"] for t in txs if t["type"] == "expense")
        savings = sum(t["amount"] for t in txs if t["type"] == "savings")
        assert income == 100.0
        assert expense == 250.0
        assert savings == 6000.0
        assert (income - expense) == -150.0

        # % vs a 10000 target => 60%
        s.put(f"{BASE_URL}/api/savings-goal", json={"target": 10000}, timeout=10)
        pct = round(savings / 10000 * 100)
        assert pct == 60
        s.delete(f"{BASE_URL}/api/savings-goal", timeout=10)
