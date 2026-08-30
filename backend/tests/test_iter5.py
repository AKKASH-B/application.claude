"""Iteration 5 backend tests: change-password, CSV export, new categories.

Uses the QA account (qauser / SpendPulseQA2026!) — MUST be restored at end of run.
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
QA_USERNAME = "qauser"
QA_PASSWORD = "SpendPulseQA2026!"


def _login(username: str, password: str) -> requests.Session:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s


@pytest.fixture(scope="module")
def qa_session():
    return _login(QA_USERNAME, QA_PASSWORD)


@pytest.fixture(scope="module")
def scratch_user():
    """A disposable user we can safely change password on."""
    suffix = uuid.uuid4().hex[:8]
    creds = {"username": f"iter5{suffix}", "email": f"TEST_iter5_{suffix}@example.com", "password": "InitPass123!"}
    r = requests.post(f"{BASE_URL}/api/auth/signup", json=creds, timeout=15)
    assert r.status_code == 201, r.text
    s = _login(creds["username"], creds["password"])
    yield s, creds


# ---------- Change-password ----------

class TestChangePassword:
    def test_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/auth/change-password",
                          json={"current_password": "x" * 8, "new_password": "y" * 8}, timeout=10)
        assert r.status_code == 401

    def test_wrong_current_returns_401(self, scratch_user):
        s, creds = scratch_user
        r = s.post(f"{BASE_URL}/api/auth/change-password",
                   json={"current_password": "WrongPass999!", "new_password": "BrandNewPass1!"}, timeout=15)
        assert r.status_code == 401
        assert "current password" in r.json()["detail"].lower()

    def test_same_as_current_returns_400(self, scratch_user):
        s, creds = scratch_user
        r = s.post(f"{BASE_URL}/api/auth/change-password",
                   json={"current_password": creds["password"], "new_password": creds["password"]}, timeout=15)
        assert r.status_code == 400

    def test_short_new_password_returns_422(self, scratch_user):
        s, _ = scratch_user
        r = s.post(f"{BASE_URL}/api/auth/change-password",
                   json={"current_password": "InitPass123!", "new_password": "short"}, timeout=15)
        assert r.status_code == 422

    def test_successful_change_and_relogin(self, scratch_user):
        s, creds = scratch_user
        new_pw = "ChangedPass456!"
        r = s.post(f"{BASE_URL}/api/auth/change-password",
                   json={"current_password": creds["password"], "new_password": new_pw}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Old token still valid in same session (no revocation)
        me = s.get(f"{BASE_URL}/api/me", timeout=10)
        assert me.status_code == 200

        # Login with old password fails
        rold = requests.post(f"{BASE_URL}/api/auth/login",
                             json={"username": creds["username"], "password": creds["password"]}, timeout=15)
        assert rold.status_code == 401

        # Login with new password succeeds
        rnew = requests.post(f"{BASE_URL}/api/auth/login",
                             json={"username": creds["username"], "password": new_pw}, timeout=15)
        assert rnew.status_code == 200
        creds["password"] = new_pw  # update so teardown-ish operations work

    def test_qa_password_untouched(self, qa_session):
        """Sanity: make sure QA login still works with the documented password."""
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"username": QA_USERNAME, "password": QA_PASSWORD}, timeout=15)
        assert r.status_code == 200, "QA password appears to have drifted from test_credentials.md"


# ---------- CSV export ----------

class TestExportCSV:
    def test_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/transactions/export?month=2026-01", timeout=15)
        assert r.status_code == 401

    def test_invalid_month_returns_400(self, qa_session):
        r = qa_session.get(f"{BASE_URL}/api/transactions/export?month=2026-13-99", timeout=15)
        assert r.status_code == 400

    def test_export_returns_csv_with_header(self, qa_session):
        # Seed one transaction for a known month
        seed = {"type": "expense", "amount": 123.0, "category": "Rent", "note": "TEST_iter5_export", "date": "2026-01-15"}
        cr = qa_session.post(f"{BASE_URL}/api/transactions", json=seed, timeout=15)
        assert cr.status_code == 200, cr.text
        tx_id = cr.json()["id"]
        try:
            r = qa_session.get(f"{BASE_URL}/api/transactions/export?month=2026-01", timeout=15)
            assert r.status_code == 200
            assert "text/csv" in r.headers.get("content-type", "").lower()
            body = r.text
            lines = body.strip().split("\n")
            assert lines[0] == "date,type,category,amount,note"
            # Our seeded row should be present, and Rent + expense classified
            joined = "\n".join(lines[1:])
            assert "Rent" in joined
            assert "2026-01-15" in joined
        finally:
            qa_session.delete(f"{BASE_URL}/api/transactions/{tx_id}", timeout=15)

    def test_export_month_filter(self, qa_session):
        # Seed one Feb, one Jan; export Feb should not contain Jan row
        feb = {"type": "income", "amount": 500.0, "category": "Salary", "note": "TEST_feb", "date": "2026-02-10"}
        jan = {"type": "expense", "amount": 30.0, "category": "Food", "note": "TEST_jan", "date": "2026-01-05"}
        fid = qa_session.post(f"{BASE_URL}/api/transactions", json=feb, timeout=15).json()["id"]
        jid = qa_session.post(f"{BASE_URL}/api/transactions", json=jan, timeout=15).json()["id"]
        try:
            r = qa_session.get(f"{BASE_URL}/api/transactions/export?month=2026-02", timeout=15)
            assert r.status_code == 200
            assert "TEST_feb" in r.text
            assert "TEST_jan" not in r.text
        finally:
            qa_session.delete(f"{BASE_URL}/api/transactions/{fid}", timeout=15)
            qa_session.delete(f"{BASE_URL}/api/transactions/{jid}", timeout=15)

    def test_export_only_owner_transactions(self, qa_session):
        # Create scratch user, add tx, ensure it does NOT appear in qauser export
        suffix = uuid.uuid4().hex[:6]
        creds = {"username": f"other{suffix}", "email": f"TEST_other_{suffix}@example.com", "password": "OtherPass1!"}
        rs = requests.post(f"{BASE_URL}/api/auth/signup", json=creds, timeout=15)
        assert rs.status_code == 201
        rl = requests.post(f"{BASE_URL}/api/auth/login", json={"username": creds["username"], "password": creds["password"]}, timeout=15)
        other = requests.Session()
        other.headers["Authorization"] = f"Bearer {rl.json()['access_token']}"
        marker = f"TEST_leak_{suffix}"
        tx = other.post(f"{BASE_URL}/api/transactions", json={"type": "expense", "amount": 7, "category": "Food", "note": marker, "date": "2026-03-01"}, timeout=15).json()
        try:
            r = qa_session.get(f"{BASE_URL}/api/transactions/export?month=2026-03", timeout=15)
            assert r.status_code == 200
            assert marker not in r.text, "Owner isolation broken in export"
        finally:
            other.delete(f"{BASE_URL}/api/transactions/{tx['id']}", timeout=15)


# ---------- New category names round-trip ----------

class TestNewCategories:
    NEW_TRANSFERRED = ["Food", "Transport", "Bills", "Rent", "Shopping", "Health", "Travel", "Other"]
    NEW_RECEIVED = ["Salary", "Interest", "Trading", "Other"]

    @pytest.mark.parametrize("category", ["Rent", "Health", "Travel"])
    def test_create_transferred_categories(self, qa_session, category):
        payload = {"type": "expense", "amount": 10.0, "category": category, "note": f"TEST_iter5_{category}", "date": "2026-01-20"}
        r = qa_session.post(f"{BASE_URL}/api/transactions", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["category"] == category
        assert tx["type"] == "expense"
        # cleanup
        qa_session.delete(f"{BASE_URL}/api/transactions/{tx['id']}", timeout=15)

    @pytest.mark.parametrize("category", ["Salary", "Interest", "Trading"])
    def test_create_received_categories(self, qa_session, category):
        payload = {"type": "income", "amount": 1000.0, "category": category, "note": f"TEST_iter5_{category}", "date": "2026-01-21"}
        r = qa_session.post(f"{BASE_URL}/api/transactions", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["category"] == category
        assert tx["type"] == "income"
        qa_session.delete(f"{BASE_URL}/api/transactions/{tx['id']}", timeout=15)

    def test_update_to_rent(self, qa_session):
        # Create a Food expense, then PUT to Rent
        r = qa_session.post(f"{BASE_URL}/api/transactions",
                            json={"type": "expense", "amount": 20, "category": "Food", "note": "TEST_toRent", "date": "2026-01-22"}, timeout=15)
        tx = r.json()
        upd = {"type": "expense", "amount": 20, "category": "Rent", "note": "TEST_toRent2", "date": "2026-01-22"}
        r2 = qa_session.put(f"{BASE_URL}/api/transactions/{tx['id']}", json=upd, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["category"] == "Rent"
        qa_session.delete(f"{BASE_URL}/api/transactions/{tx['id']}", timeout=15)
