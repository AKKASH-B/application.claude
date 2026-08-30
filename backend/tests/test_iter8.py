"""Iteration 8 backend tests - Multiple savings goals + nudge + celebration.

Focus:
  1. /api/savings-goals CRUD (plural, multi-goal)
     - GET empty list initially
     - POST creates goal with optional target_date
     - PUT partial update: name, target, target_date, celebrated
     - DELETE removes goal + unassigns goal_id on transactions
  2. Validation: target<=0 => 422, target_date invalid => 422, target_date null ok
  3. Auth: all endpoints require Bearer token (401)
  4. Per-user isolation
  5. Transactions goal_id linkage
  6. Celebration persistence (celebrated=true sticks)
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
    creds = _unique_creds("mga")
    _signup(creds)
    return _login(creds["username"], creds["password"])


@pytest.fixture(scope="module")
def session_b():
    creds = _unique_creds("mgb")
    _signup(creds)
    return _login(creds["username"], creds["password"])


# ---------- Auth ----------
class TestGoalsAuth:
    def test_get_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/savings-goals", timeout=10)
        assert r.status_code == 401

    def test_post_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/savings-goals",
                          json={"name": "X", "target": 100}, timeout=10)
        assert r.status_code == 401

    def test_put_requires_auth(self):
        r = requests.put(f"{BASE_URL}/api/savings-goals/xyz",
                         json={"target": 200}, timeout=10)
        assert r.status_code == 401

    def test_delete_requires_auth(self):
        r = requests.delete(f"{BASE_URL}/api/savings-goals/xyz", timeout=10)
        assert r.status_code == 401


# ---------- CRUD ----------
class TestGoalsCRUD:
    def test_initial_empty_list(self, session_a):
        r = session_a.get(f"{BASE_URL}/api/savings-goals", timeout=10)
        assert r.status_code == 200
        assert r.json() == []

    def test_create_multiple_goals(self, session_a):
        g1 = session_a.post(f"{BASE_URL}/api/savings-goals",
                            json={"name": "Emergency Fund", "target": 10000},
                            timeout=10)
        assert g1.status_code == 200, g1.text
        b1 = g1.json()
        assert b1["name"] == "Emergency Fund"
        assert b1["target"] == 10000
        assert b1["target_date"] is None
        assert b1["celebrated"] is False
        assert isinstance(b1["id"], str) and len(b1["id"]) > 0

        g2 = session_a.post(f"{BASE_URL}/api/savings-goals",
                            json={"name": "Trip", "target": 5000, "target_date": "2026-12-01"},
                            timeout=10)
        assert g2.status_code == 200
        b2 = g2.json()
        assert b2["target_date"] == "2026-12-01"
        assert b2["id"] != b1["id"]

        r = session_a.get(f"{BASE_URL}/api/savings-goals", timeout=10)
        got = r.json()
        assert len(got) == 2
        ids = {x["id"] for x in got}
        assert b1["id"] in ids and b2["id"] in ids

    def test_partial_update_name_and_target(self, session_a):
        goals = session_a.get(f"{BASE_URL}/api/savings-goals").json()
        gid = goals[0]["id"]
        r = session_a.put(f"{BASE_URL}/api/savings-goals/{gid}",
                          json={"name": "Rainy Day"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["name"] == "Rainy Day"
        assert r.json()["target"] == goals[0]["target"]  # unchanged

        r2 = session_a.put(f"{BASE_URL}/api/savings-goals/{gid}",
                           json={"target": 15000}, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["target"] == 15000
        assert r2.json()["name"] == "Rainy Day"

    def test_update_target_date_and_null(self, session_a):
        goals = session_a.get(f"{BASE_URL}/api/savings-goals").json()
        gid = goals[0]["id"]
        r = session_a.put(f"{BASE_URL}/api/savings-goals/{gid}",
                          json={"target_date": "2027-06-15"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["target_date"] == "2027-06-15"

        r2 = session_a.put(f"{BASE_URL}/api/savings-goals/{gid}",
                           json={"target_date": None}, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["target_date"] is None

    def test_update_nonexistent_returns_404(self, session_a):
        r = session_a.put(f"{BASE_URL}/api/savings-goals/does-not-exist",
                          json={"target": 100}, timeout=10)
        assert r.status_code == 404


# ---------- Validation ----------
class TestGoalsValidation:
    def test_target_zero_or_negative_422(self, session_a):
        for bad in (0, -1, -100.5):
            r = session_a.post(f"{BASE_URL}/api/savings-goals",
                               json={"name": "Bad", "target": bad}, timeout=10)
            assert r.status_code == 422, f"target={bad} => {r.status_code}"

    def test_put_target_zero_422(self, session_a):
        g = session_a.post(f"{BASE_URL}/api/savings-goals",
                           json={"name": "PutValidate", "target": 500}, timeout=10).json()
        r = session_a.put(f"{BASE_URL}/api/savings-goals/{g['id']}",
                          json={"target": 0}, timeout=10)
        assert r.status_code == 422
        session_a.delete(f"{BASE_URL}/api/savings-goals/{g['id']}", timeout=10)

    def test_target_date_invalid_422(self, session_a):
        r = session_a.post(f"{BASE_URL}/api/savings-goals",
                           json={"name": "X", "target": 100, "target_date": "nope"},
                           timeout=10)
        assert r.status_code == 422

    def test_target_date_omitted_ok(self, session_a):
        r = session_a.post(f"{BASE_URL}/api/savings-goals",
                           json={"name": "NoDateGoal", "target": 300}, timeout=10)
        assert r.status_code == 200
        assert r.json()["target_date"] is None
        # cleanup
        session_a.delete(f"{BASE_URL}/api/savings-goals/{r.json()['id']}", timeout=10)

    def test_missing_name_or_target_422(self, session_a):
        r1 = session_a.post(f"{BASE_URL}/api/savings-goals",
                            json={"target": 100}, timeout=10)
        assert r1.status_code == 422
        r2 = session_a.post(f"{BASE_URL}/api/savings-goals",
                            json={"name": "OnlyName"}, timeout=10)
        assert r2.status_code == 422


# ---------- Transactions goal_id linkage ----------
class TestTransactionsGoalLink:
    def test_savings_tx_with_goal_id(self, session_a):
        goals = session_a.get(f"{BASE_URL}/api/savings-goals").json()
        gid = goals[0]["id"]
        r = session_a.post(f"{BASE_URL}/api/transactions", json={
            "type": "savings", "amount": 500, "category": "Emergency Fund",
            "note": "TEST_tx_gl", "date": "2026-01-14", "goal_id": gid,
        }, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["goal_id"] == gid
        assert body["type"] == "savings"

        # Verify persistence via GET
        txs = session_a.get(f"{BASE_URL}/api/transactions").json()
        found = [t for t in txs if t.get("id") == body["id"]]
        assert len(found) == 1 and found[0]["goal_id"] == gid

    def test_savings_tx_without_goal_id_ok(self, session_a):
        r = session_a.post(f"{BASE_URL}/api/transactions", json={
            "type": "savings", "amount": 200, "category": "General",
            "note": "TEST_tx_gen", "date": "2026-01-15",
        }, timeout=15)
        assert r.status_code == 200
        assert r.json().get("goal_id") is None


# ---------- Delete unassigns goal_id ----------
class TestDeleteUnassigns:
    def test_delete_goal_nulls_tx_goal_id(self, session_a):
        # Create a fresh goal, tag a transaction, then delete goal
        g = session_a.post(f"{BASE_URL}/api/savings-goals",
                           json={"name": "ToDelete", "target": 1000}, timeout=10).json()
        tx = session_a.post(f"{BASE_URL}/api/transactions", json={
            "type": "savings", "amount": 100, "category": "ToDelete",
            "note": "TEST_del_link", "date": "2026-01-16", "goal_id": g["id"],
        }, timeout=15).json()
        assert tx["goal_id"] == g["id"]

        d = session_a.delete(f"{BASE_URL}/api/savings-goals/{g['id']}", timeout=10)
        assert d.status_code == 200

        txs = session_a.get(f"{BASE_URL}/api/transactions").json()
        after = [t for t in txs if t["id"] == tx["id"]]
        assert len(after) == 1
        assert after[0]["goal_id"] is None, "Deleting goal must null goal_id on transactions"

    def test_delete_nonexistent_404(self, session_a):
        r = session_a.delete(f"{BASE_URL}/api/savings-goals/never-existed", timeout=10)
        assert r.status_code == 404


# ---------- Celebration persistence ----------
class TestCelebrationPersistence:
    def test_celebrated_flag_persists(self, session_a):
        g = session_a.post(f"{BASE_URL}/api/savings-goals",
                           json={"name": "PersistFlag", "target": 100}, timeout=10).json()
        assert g["celebrated"] is False

        r = session_a.put(f"{BASE_URL}/api/savings-goals/{g['id']}",
                          json={"celebrated": True}, timeout=10)
        assert r.status_code == 200
        assert r.json()["celebrated"] is True

        # subsequent GET stays true
        goals = session_a.get(f"{BASE_URL}/api/savings-goals").json()
        found = [x for x in goals if x["id"] == g["id"]]
        assert len(found) == 1 and found[0]["celebrated"] is True

        # cleanup
        session_a.delete(f"{BASE_URL}/api/savings-goals/{g['id']}", timeout=10)


# ---------- Per-user isolation ----------
class TestIsolation:
    def test_goals_are_per_user(self, session_a, session_b):
        gb = session_b.post(f"{BASE_URL}/api/savings-goals",
                            json={"name": "B-Goal", "target": 800}, timeout=10).json()
        list_a = session_a.get(f"{BASE_URL}/api/savings-goals").json()
        assert all(g["id"] != gb["id"] for g in list_a), "user A must not see user B's goal"

        # user A cannot update or delete user B's goal
        r_put = session_a.put(f"{BASE_URL}/api/savings-goals/{gb['id']}",
                              json={"target": 1}, timeout=10)
        assert r_put.status_code == 404
        r_del = session_a.delete(f"{BASE_URL}/api/savings-goals/{gb['id']}", timeout=10)
        assert r_del.status_code == 404

        # cleanup by owner
        session_b.delete(f"{BASE_URL}/api/savings-goals/{gb['id']}", timeout=10)
