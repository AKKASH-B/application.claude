from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import PlainTextResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import bcrypt
import jwt
import os
import re
import logging
from pathlib import Path
from pydantic import BaseModel, Field, field_validator
from typing import Any, List, Literal, Optional
import uuid
import secrets
import string
import hmac
import hashlib
import asyncio
import smtplib
from email.message import EmailMessage
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
TOKEN_MINUTES = 60 * 24 * 7
bearer = HTTPBearer(auto_error=False)

# Accounts always promoted to admin.
ADMIN_USERNAMES = {u.strip().lower() for u in os.environ.get("ADMIN_USERNAMES", "").split(",") if u.strip()}
ADMIN_PHONES = {p.strip() for p in os.environ.get("ADMIN_PHONES", "").split(",") if p.strip()}

# Explicit allow-list instead of "*". The app authenticates with a Bearer token
# (not cookies), so allow_credentials=False below — that combination is also
# the only one browsers actually honor for "*" + credentialed requests, so the
# old "*" + allow_credentials=True pairing wasn't even doing what it looked like.
# Override with a comma-separated list in the ALLOWED_ORIGINS env var for other
# deployments (e.g. a local Expo dev server origin).
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "ALLOWED_ORIGINS",
        "https://spendpulse-tracker.vercel.app,http://localhost:8081,http://localhost:19006",
    ).split(",")
    if o.strip()
]

USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9_.]{3,30}$")
PIN_PATTERN = re.compile(r"^\d{6}$")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")

# --- Email (used for PIN-recovery codes) ---------------------------------
# Any SMTP provider works (Gmail app password, Brevo, Resend, Zoho...). Configure
# SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_FROM in the environment.
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "") or SMTP_USER
# Local testing only: when true AND SMTP is not configured, the code is printed to the
# server log instead of emailed. The code is NEVER returned in an API response.
DEV_LOG_OTP = os.environ.get("DEV_LOG_OTP", "").lower() in ("1", "true", "yes")

OTP_TTL_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_SECONDS = 60

logger = logging.getLogger(__name__)


def normalize_username(value: str) -> str:
    cleaned = (value or "").strip().lower()
    if not USERNAME_PATTERN.match(cleaned):
        raise ValueError("Username must be 3-30 characters (letters, numbers, dot, underscore).")
    return cleaned


def normalize_phone(value: str) -> str:
    cleaned = re.sub(r"[\s\-()]", "", (value or "").strip())
    prefix = ""
    if cleaned.startswith("+"):
        prefix = "+"
        cleaned = cleaned[1:]
    if not cleaned.isdigit() or not (8 <= len(cleaned) <= 15):
        raise ValueError("Enter a valid phone number (8-15 digits).")
    return prefix + cleaned


def normalize_email(value: str) -> str:
    cleaned = (value or "").strip().lower()
    if len(cleaned) > 120 or not EMAIL_PATTERN.match(cleaned):
        raise ValueError("Enter a valid email address.")
    return cleaned


def validate_pin(value: str) -> str:
    cleaned = (value or "").strip()
    if not PIN_PATTERN.match(cleaned):
        raise ValueError("PIN must be exactly 6 digits.")
    return cleaned


# NOTE: we deliberately do NOT enforce PIN uniqueness across users anymore.
# The old approach stored sha256(pin) ("pin_digest") to check for collisions.
# Because a 6-digit PIN only has 1,000,000 possible values, an unsalted SHA-256
# digest over that space can be reversed in well under a second with a
# precomputed table — so storing it effectively stored the PIN in the clear.
# Usernames are already globally unique and are what authentication keys off
# of, so two different users sharing the same PIN is not a security problem;
# it just no longer needs to be prevented.


LOGIN_MAX_ATTEMPTS = 5
LOGIN_LOCKOUT_MINUTES = 15
LOGIN_ATTEMPT_WINDOW_MINUTES = 15


# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class SignupInput(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    email: str = Field(max_length=120)
    phone: Optional[str] = None
    pin: str = Field(min_length=6, max_length=6)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return normalize_username(value)

    @field_validator("email")
    @classmethod
    def validate_email_field(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("phone")
    @classmethod
    def validate_phone_field(cls, value: Optional[str]) -> Optional[str]:
        if value is None or not value.strip():
            return None
        return normalize_phone(value)

    @field_validator("pin")
    @classmethod
    def validate_pin_field(cls, value: str) -> str:
        return validate_pin(value)


class LoginInput(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    pin: str = Field(min_length=6, max_length=6)

    @field_validator("username")
    @classmethod
    def lower_username(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("pin")
    @classmethod
    def validate_pin_field(cls, value: str) -> str:
        return validate_pin(value)


class ChangePinInput(BaseModel):
    current_pin: str = Field(min_length=6, max_length=6)
    new_pin: str = Field(min_length=6, max_length=6)

    @field_validator("current_pin", "new_pin")
    @classmethod
    def validate_pin_field(cls, value: str) -> str:
        return validate_pin(value)


class UserResponse(BaseModel):
    id: str
    username: str
    phone: str = ""
    email: str = ""
    role: str = "user"


class DeleteAccountInput(BaseModel):
    current_pin: str = Field(min_length=6, max_length=6)

    @field_validator("current_pin")
    @classmethod
    def validate_pin_field(cls, value: str) -> str:
        return validate_pin(value)


class AdminUserSummary(BaseModel):
    id: str
    username: str
    email: str = ""
    phone: str = ""
    role: str
    disabled: bool
    created_at: Optional[str] = None
    transaction_count: int
    balance: float


class AdminSetDisabledInput(BaseModel):
    disabled: bool


class AdminResetPinInput(BaseModel):
    new_pin: str = Field(min_length=6, max_length=6)

    @field_validator("new_pin")
    @classmethod
    def validate_pin_field(cls, value: str) -> str:
        return validate_pin(value)


class AdminTransactionUpdate(BaseModel):
    type: Optional[Literal["expense", "income", "savings"]] = None
    amount: Optional[float] = Field(default=None, gt=0)
    category: Optional[str] = Field(default=None, min_length=1, max_length=40)
    note: Optional[str] = Field(default=None, max_length=120)
    date: Optional[str] = Field(default=None, min_length=10, max_length=10)

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        try:
            datetime.strptime(value, "%Y-%m-%d")
        except ValueError as exc:
            raise ValueError("date must be a valid YYYY-MM-DD date") from exc
        return value


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class RequestOtpInput(BaseModel):
    email: str = Field(max_length=120)

    @field_validator("email")
    @classmethod
    def validate_email_field(cls, value: str) -> str:
        return normalize_email(value)


class ResetPinInput(BaseModel):
    email: str = Field(max_length=120)
    otp: str = Field(min_length=6, max_length=6)
    new_pin: str = Field(min_length=6, max_length=6)

    @field_validator("email")
    @classmethod
    def validate_email_field(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("otp", "new_pin")
    @classmethod
    def validate_numeric(cls, value: str) -> str:
        if not value.isdigit():
            raise ValueError("must contain only digits")
        return value

    @field_validator("new_pin")
    @classmethod
    def validate_pin_field(cls, value: str) -> str:
        return validate_pin(value)


class SetEmailInput(BaseModel):
    email: str = Field(max_length=120)
    current_pin: str = Field(min_length=6, max_length=6)

    @field_validator("email")
    @classmethod
    def validate_email_field(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("current_pin")
    @classmethod
    def validate_pin_field(cls, value: str) -> str:
        return validate_pin(value)


class VerifyEmailInput(BaseModel):
    email: str = Field(max_length=120)
    otp: str = Field(min_length=6, max_length=6)

    @field_validator("email")
    @classmethod
    def validate_email_field(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("otp")
    @classmethod
    def validate_numeric(cls, value: str) -> str:
        if not value.isdigit():
            raise ValueError("must contain only digits")
        return value


class TransactionCreate(BaseModel):
    type: Literal["expense", "income", "savings"]
    amount: float = Field(gt=0)
    category: str = Field(min_length=1, max_length=40)
    note: Optional[str] = Field(default="", max_length=120)
    date: str = Field(min_length=10, max_length=10)
    goal_id: Optional[str] = Field(default=None, max_length=64)

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        try:
            datetime.strptime(value, "%Y-%m-%d")
        except ValueError as exc:
            raise ValueError("date must be a valid YYYY-MM-DD date") from exc
        return value


class Transaction(TransactionCreate):
    id: str
    created_at: str


class BudgetUpsert(BaseModel):
    category: str = Field(min_length=1, max_length=40)
    monthly_limit: float = Field(gt=0)


class Budget(BaseModel):
    id: str
    category: str
    monthly_limit: float
    updated_at: str


class SavingsGoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    target: float = Field(gt=0)
    target_date: Optional[str] = Field(default=None)

    @field_validator("target_date")
    @classmethod
    def validate_target_date(cls, value: Optional[str]) -> Optional[str]:
        if value in (None, ""):
            return None
        try:
            datetime.strptime(value, "%Y-%m-%d")
        except ValueError as exc:
            raise ValueError("target_date must be a valid YYYY-MM-DD date") from exc
        return value


class SavingsGoalUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=40)
    target: Optional[float] = Field(default=None, gt=0)
    target_date: Optional[str] = Field(default=None)
    celebrated: Optional[bool] = None

    @field_validator("target_date")
    @classmethod
    def validate_target_date(cls, value: Optional[str]) -> Optional[str]:
        if value in (None, ""):
            return value
        try:
            datetime.strptime(value, "%Y-%m-%d")
        except ValueError as exc:
            raise ValueError("target_date must be a valid YYYY-MM-DD date") from exc
        return value


class SavingsGoal(BaseModel):
    id: str
    name: str
    target: float
    target_date: Optional[str] = None
    celebrated: bool = False
    created_at: str
    updated_at: str


# ---------- Split / Friends models ----------
SplitMode = Literal["equal", "unequal", "shares"]


class FriendCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    phone: Optional[str] = Field(default=None, max_length=20)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class Friend(BaseModel):
    id: str
    name: str
    phone: Optional[str] = None
    created_at: str


class SplitMemberInput(BaseModel):
    id: Optional[str] = Field(default=None, max_length=64)
    name: str = Field(min_length=1, max_length=40)
    phone: Optional[str] = Field(default=None, max_length=20)
    share_value: float = Field(ge=0)
    owed_amount: float = Field(ge=0)
    settled: bool = False
    is_payer: bool = False

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return value.strip()


class SplitMember(BaseModel):
    id: str
    name: str
    phone: Optional[str] = None
    share_value: float
    owed_amount: float
    settled: bool
    is_payer: bool


class SplitSessionCreate(BaseModel):
    total_amount: float = Field(gt=0)
    note: Optional[str] = Field(default="", max_length=120)
    mode: SplitMode
    members: List[SplitMemberInput]
    transaction_id: Optional[str] = Field(default=None, max_length=64)
    create_transaction: bool = True
    date: Optional[str] = Field(default=None, min_length=10, max_length=10)
    category: Optional[str] = Field(default="Split", max_length=40)

    @field_validator("members")
    @classmethod
    def validate_members(cls, value: List[SplitMemberInput]) -> List[SplitMemberInput]:
        if len(value) < 2:
            raise ValueError("A split needs at least 2 members")
        if len(value) > 10:
            raise ValueError("A split can have at most 10 members")
        payers = [m for m in value if m.is_payer]
        if len(payers) != 1:
            raise ValueError("Exactly one member must be marked as the payer")
        return value

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        try:
            datetime.strptime(value, "%Y-%m-%d")
        except ValueError as exc:
            raise ValueError("date must be a valid YYYY-MM-DD date") from exc
        return value


class SplitSessionUpdate(BaseModel):
    total_amount: Optional[float] = Field(default=None, gt=0)
    note: Optional[str] = Field(default=None, max_length=120)
    mode: Optional[SplitMode] = None
    members: Optional[List[SplitMemberInput]] = None

    @field_validator("members")
    @classmethod
    def validate_members(cls, value: Optional[List[SplitMemberInput]]) -> Optional[List[SplitMemberInput]]:
        if value is None:
            return value
        if len(value) < 2:
            raise ValueError("A split needs at least 2 members")
        if len(value) > 10:
            raise ValueError("A split can have at most 10 members")
        payers = [m for m in value if m.is_payer]
        if len(payers) != 1:
            raise ValueError("Exactly one member must be marked as the payer")
        return value


class SplitMemberSettleInput(BaseModel):
    settled: bool


class SplitSession(BaseModel):
    id: str
    total_amount: float
    note: str = ""
    mode: SplitMode
    members: List[SplitMember]
    transaction_id: Optional[str] = None
    finalized: bool = False
    created_at: str
    updated_at: str


def _round2(value: float) -> float:
    return round(float(value) + 1e-9, 2)


def _validate_split_math(total: float, mode: SplitMode, members: List[SplitMemberInput]) -> None:
    total_owed = sum(m.owed_amount for m in members)
    if abs(total_owed - total) > 0.011:
        raise HTTPException(status_code=400, detail=f"Member amounts (₹{total_owed:.2f}) do not sum to total (₹{total:.2f})")
    if mode == "shares":
        total_shares = sum(m.share_value for m in members)
        if total_shares <= 0:
            raise HTTPException(status_code=400, detail="Total shares must be greater than zero")


def _apply_members(members: List[SplitMemberInput]) -> List[dict]:
    out: List[dict] = []
    for m in members:
        out.append({
            "id": m.id or str(uuid.uuid4()),
            "name": m.name,
            "phone": m.phone,
            "share_value": float(m.share_value),
            "owed_amount": _round2(m.owed_amount),
            "settled": bool(m.settled),
            "is_payer": bool(m.is_payer),
        })
    return out


def create_token(user_id: str, token_version: int = 0) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user_id, "jti": str(uuid.uuid4()), "iat": now, "exp": now + timedelta(minutes=TOKEN_MINUTES), "tv": token_version},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def _admin_claim_key(username: Optional[str], phone: Optional[str]) -> Optional[str]:
    # ADMIN_USERNAMES / ADMIN_PHONES just say which identity is ALLOWED to hold
    # the admin slot; db.admin_claims records who actually holds it. Without the
    # claims table, deleting an admin account frees their username, and the next
    # person to sign up with that exact username would silently inherit admin —
    # this closes that hole by making the claim persist independently of the
    # user record.
    if username and username in ADMIN_USERNAMES:
        return f"username:{username}"
    if phone and phone in ADMIN_PHONES:
        return f"phone:{phone}"
    return None


async def _is_admin_identity(doc: dict[str, Any]) -> bool:
    key = _admin_claim_key(doc.get("username"), doc.get("phone"))
    if key is None:
        return False
    claim = await db.admin_claims.find_one({"key": key}, {"_id": 0})
    return bool(claim) and claim.get("owner_user_id") == doc.get("id")


async def _claim_admin_role(user_id: str, username: Optional[str], phone: Optional[str]) -> str:
    """Grant admin at signup only if nobody has ever claimed this reserved
    username/phone before. First claim wins, permanently — even if that user
    is later deleted, the slot stays claimed and won't silently pass to
    whoever re-registers the freed username next."""
    key = _admin_claim_key(username, phone)
    if key is None:
        return "user"
    result = await db.admin_claims.update_one(
        {"key": key},
        {"$setOnInsert": {"key": key, "owner_user_id": user_id, "claimed_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    if result.upserted_id is not None:
        return "admin"
    existing = await db.admin_claims.find_one({"key": key}, {"_id": 0})
    return "admin" if existing and existing.get("owner_user_id") == user_id else "user"


def _to_user_response(doc: dict[str, Any]) -> UserResponse:
    return UserResponse(
        id=doc["id"],
        username=doc.get("username") or "user",
        phone=doc.get("phone") or "",
        email=doc.get("email") or "",
        role=doc.get("role") or "user",
    )


def _get_client_ip(request: Request) -> str:
    """Extract the client IP from the request, accounting for proxies."""
    if request.client:
        return request.client.host
    return "unknown"


def _generate_otp() -> str:
    """Generate a 6-digit one-time code."""
    return ''.join(secrets.choice(string.digits) for _ in range(6))


def _hash_otp(purpose: str, email: str, otp: str) -> str:
    # Codes are stored hashed (keyed with the JWT secret), never in plain text.
    return hmac.new(JWT_SECRET.encode(), f"{purpose}|{email}|{otp}".encode(), hashlib.sha256).hexdigest()


async def _store_otp(purpose: str, email: str, otp: str, user_id: Optional[str] = None) -> None:
    now = datetime.now(timezone.utc)
    await db.otp_tokens.update_one(
        {"purpose": purpose, "email": email},
        {"$set": {
            "otp_hash": _hash_otp(purpose, email, otp),
            "user_id": user_id,
            "attempts": 0,
            "sent_at": now.isoformat(),
            "expires_at": (now + timedelta(minutes=OTP_TTL_MINUTES)).isoformat(),
        }},
        upsert=True,
    )


async def _otp_resend_wait(purpose: str, email: str) -> int:
    """Seconds the caller must still wait before another code may be sent."""
    doc = await db.otp_tokens.find_one({"purpose": purpose, "email": email}, {"_id": 0, "sent_at": 1})
    if not doc or not doc.get("sent_at"):
        return 0
    elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(doc["sent_at"])).total_seconds()
    return max(0, int(OTP_RESEND_SECONDS - elapsed))


async def _verify_otp(purpose: str, email: str, otp: str) -> Optional[dict]:
    """Return the stored code record if `otp` is valid, else None.
    Codes are single-use, expire, and are burned after OTP_MAX_ATTEMPTS wrong guesses."""
    doc = await db.otp_tokens.find_one({"purpose": purpose, "email": email}, {"_id": 0})
    if not doc:
        return None
    if datetime.now(timezone.utc) > datetime.fromisoformat(doc["expires_at"]):
        await db.otp_tokens.delete_one({"purpose": purpose, "email": email})
        return None
    if doc.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
        await db.otp_tokens.delete_one({"purpose": purpose, "email": email})
        return None
    if not hmac.compare_digest(doc.get("otp_hash", ""), _hash_otp(purpose, email, otp)):
        await db.otp_tokens.update_one({"purpose": purpose, "email": email}, {"$inc": {"attempts": 1}})
        return None
    await db.otp_tokens.delete_one({"purpose": purpose, "email": email})
    return doc


def _send_email_sync(to_email: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    msg.set_content(body)
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        if SMTP_USER:
            smtp.login(SMTP_USER, SMTP_PASSWORD)
        smtp.send_message(msg)


async def _send_code_email(to_email: str, code: str, purpose: str) -> None:
    """Email a verification code. Never raises to the caller's response path with details."""
    what = "reset your SpendPulse PIN" if purpose == "reset" else "verify your email for SpendPulse"
    body = (
        f"Your SpendPulse code is: {code}\n\n"
        f"Use it to {what}. It expires in {OTP_TTL_MINUTES} minutes.\n\n"
        "If you didn't request this, you can ignore this email — your PIN has not been changed."
    )
    if not SMTP_HOST:
        if DEV_LOG_OTP:
            logger.warning("DEV_LOG_OTP: %s code for %s is %s", purpose, to_email, code)
            return
        logger.error("SMTP is not configured; cannot send %s code", purpose)
        raise HTTPException(status_code=503, detail="Email service is not available right now. Please try again later.")
    try:
        await asyncio.to_thread(_send_email_sync, to_email, "Your SpendPulse code", body)
    except Exception:
        logger.exception("Failed to send %s email", purpose)
        raise HTTPException(status_code=503, detail="Couldn't send the email. Please try again in a moment.")


async def _login_lockout_remaining_seconds(username: str, ip: str) -> int:
    doc = await db.login_attempts.find_one({"username": username, "ip": ip}, {"_id": 0})
    if not doc or not doc.get("locked_until"):
        return 0
    locked_until = datetime.fromisoformat(doc["locked_until"])
    remaining = (locked_until - datetime.now(timezone.utc)).total_seconds()
    return max(0, int(remaining))


async def _record_login_failure(username: str, ip: str) -> None:
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=LOGIN_ATTEMPT_WINDOW_MINUTES)
    doc = await db.login_attempts.find_one({"username": username, "ip": ip}, {"_id": 0})
    if doc and doc.get("first_attempt_at"):
        first_attempt = datetime.fromisoformat(doc["first_attempt_at"])
        if first_attempt < window_start:
            doc = None  # previous failures aged out of the window — start counting fresh
    count = (doc.get("count", 0) if doc else 0) + 1
    update: dict[str, Any] = {
        "username": username,
        "ip": ip,
        "count": count,
        "first_attempt_at": doc.get("first_attempt_at") if doc else now.isoformat(),
        "last_attempt_at": now.isoformat(),
    }
    if count >= LOGIN_MAX_ATTEMPTS:
        update["locked_until"] = (now + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)).isoformat()
        update["count"] = 0
    await db.login_attempts.update_one({"username": username, "ip": ip}, {"$set": update}, upsert=True)


async def _clear_login_failures(username: str, ip: str) -> None:
    await db.login_attempts.delete_one({"username": username, "ip": ip})


async def _ensure_role(doc: dict[str, Any]) -> dict[str, Any]:
    desired_role = "admin" if await _is_admin_identity(doc) else (doc.get("role") or "user")
    updates: dict[str, Any] = {}
    if doc.get("role") != desired_role and desired_role == "admin":
        updates["role"] = desired_role
    if "disabled" not in doc:
        updates["disabled"] = False
    if updates:
        await db.users.update_one({"id": doc["id"]}, {"$set": updates})
        doc.update(updates)
    doc.setdefault("role", desired_role)
    doc.setdefault("disabled", False)
    return doc


async def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict[str, Any]:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("missing user")
    except (jwt.InvalidTokenError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "username": 1, "phone": 1, "email": 1, "role": 1, "disabled": 1, "token_version": 1})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    if await db.revoked_tokens.find_one({"token": credentials.credentials}, {"_id": 0}):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session ended")
    # Verify token version matches (PIN change invalidates old tokens)
    token_version = payload.get("tv", 0)
    user_version = user.get("token_version", 0)
    if token_version != user_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired — please log in again")
    await _ensure_role(user)
    if user.get("disabled"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been disabled")
    return user


async def current_admin(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}


@api_router.post("/auth/signup", response_model=TokenResponse, status_code=201)
async def signup(input: SignupInput):
    if await db.users.find_one({"username": input.username}, {"_id": 0}):
        raise HTTPException(status_code=409, detail="Username already taken. Please choose another username.")
    if await db.users.find_one({"email": input.email}, {"_id": 0}):
        raise HTTPException(status_code=409, detail="That email is already registered. Try logging in instead.")
    user_id = str(uuid.uuid4())
    role = await _claim_admin_role(user_id, input.username, input.phone)
    user = {
        "id": user_id,
        "username": input.username,
        "email": input.email,
        "phone": input.phone or "",
        "pin_hash": bcrypt.hashpw(input.pin.encode(), bcrypt.gensalt()).decode(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "role": role,
        "disabled": False,
        "token_version": 0,
    }
    await db.users.insert_one(user)
    return TokenResponse(access_token=create_token(user["id"], 0), expires_in=TOKEN_MINUTES * 60)


@api_router.post("/auth/login", response_model=TokenResponse)
async def login(input: LoginInput, request: Request):
    client_ip = _get_client_ip(request)
    locked_seconds = await _login_lockout_remaining_seconds(input.username, client_ip)
    if locked_seconds > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Try again in {locked_seconds // 60 + 1} minute(s).",
        )
    user = await db.users.find_one({"username": input.username}, {"_id": 0})
    valid = user and bcrypt.checkpw(input.pin.encode(), user["pin_hash"].encode())
    if not valid:
        await _record_login_failure(input.username, client_ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or PIN")
    await _clear_login_failures(input.username, client_ip)
    await _ensure_role(user)
    if user.get("disabled"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been disabled")
    return TokenResponse(access_token=create_token(user["id"], user.get("token_version", 0)), expires_in=TOKEN_MINUTES * 60)


@api_router.get("/me", response_model=UserResponse)
async def me(user: dict[str, Any] = Depends(current_user)):
    return _to_user_response(user)


@api_router.post("/me/delete")
async def delete_my_account(input: DeleteAccountInput, user: dict[str, Any] = Depends(current_user)):
    """Permanently delete the signed-in user's account and all of their data (required by app stores)."""
    if user.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Admin accounts can't be deleted from the app.")
    stored = await db.users.find_one({"id": user["id"]}, {"_id": 0, "pin_hash": 1, "username": 1, "email": 1})
    if not stored or not bcrypt.checkpw(input.current_pin.encode(), stored["pin_hash"].encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current PIN is incorrect")
    uid = user["id"]
    await db.transactions.delete_many({"owner_id": uid})
    await db.budgets.delete_many({"owner_id": uid})
    await db.savings_goals.delete_many({"owner_id": uid})
    await db.splits.delete_many({"owner_id": uid})
    await db.friends.delete_many({"owner_id": uid})
    await db.login_attempts.delete_many({"username": stored.get("username")})
    if stored.get("email"):
        await db.otp_tokens.delete_many({"email": stored["email"]})
    await db.users.delete_one({"id": uid})
    return {"ok": True}


@api_router.post("/auth/logout")
async def logout(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), user: dict[str, Any] = Depends(current_user)):
    if credentials:
        try:
            payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM], options={"verify_exp": False})
            await db.revoked_tokens.update_one({"token": credentials.credentials}, {"$set": {"token": credentials.credentials, "expires_at": datetime.fromtimestamp(payload["exp"], tz=timezone.utc)}}, upsert=True)
        except (jwt.InvalidTokenError, KeyError):
            pass
    return {"ok": True, "user_id": user["id"]}


@api_router.post("/auth/change-pin")
async def change_pin(input: ChangePinInput, user: dict[str, Any] = Depends(current_user)):
    if input.current_pin == input.new_pin:
        raise HTTPException(status_code=400, detail="New PIN must be different from the current one")
    stored = await db.users.find_one({"id": user["id"]}, {"_id": 0, "pin_hash": 1, "token_version": 1})
    if not stored or not bcrypt.checkpw(input.current_pin.encode(), stored["pin_hash"].encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current PIN is incorrect")
    new_hash = bcrypt.hashpw(input.new_pin.encode(), bcrypt.gensalt()).decode()
    new_version = (stored.get("token_version", 0) or 0) + 1
    await db.users.update_one({"id": user["id"]}, {"$set": {"pin_hash": new_hash, "token_version": new_version}})
    return {"ok": True}


RECOVERY_REPLY = {"ok": True, "message": "If that email is registered, a 6-digit code is on its way. It's valid for 10 minutes."}


@api_router.post("/auth/request-otp")
async def request_otp(input: RequestOtpInput, request: Request):
    """Email a 6-digit code to the registered address so a forgotten PIN can be reset.
    The reply is identical whether or not the email is registered (no account enumeration),
    and the code is never returned in the response."""
    # Throttle per client IP so this can't be used to spam inboxes.
    ip = _get_client_ip(request)
    since = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    recent = await db.otp_requests.count_documents({"ip": ip, "at": {"$gte": since}})
    if recent >= 10:
        raise HTTPException(status_code=429, detail="Too many requests. Please try again in a few minutes.")
    await db.otp_requests.insert_one({"ip": ip, "at": datetime.now(timezone.utc).isoformat(), "expires_at": datetime.now(timezone.utc) + timedelta(minutes=30)})

    user = await db.users.find_one({"email": input.email}, {"_id": 0, "id": 1, "disabled": 1})
    if not user or user.get("disabled"):
        return RECOVERY_REPLY
    if await _otp_resend_wait("reset", input.email) > 0:
        return RECOVERY_REPLY  # a code was just sent; don't send another yet
    otp = _generate_otp()
    await _store_otp("reset", input.email, otp, user["id"])
    await _send_code_email(input.email, otp, "reset")
    return RECOVERY_REPLY


@api_router.post("/auth/reset-pin")
async def reset_pin(input: ResetPinInput):
    """Set a new PIN using the emailed code."""
    record = await _verify_otp("reset", input.email, input.otp)
    if not record:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="That code is invalid or has expired. Request a new one.")
    user = await db.users.find_one({"id": record.get("user_id"), "email": input.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="That code is invalid or has expired. Request a new one.")
    if bcrypt.checkpw(input.new_pin.encode(), user["pin_hash"].encode()):
        raise HTTPException(status_code=400, detail="New PIN must be different from the current one")
    # Reset PIN, bump token_version to sign out every existing session, clear any lockout.
    new_hash = bcrypt.hashpw(input.new_pin.encode(), bcrypt.gensalt()).decode()
    new_version = (user.get("token_version", 0) or 0) + 1
    await db.users.update_one({"id": user["id"]}, {"$set": {"pin_hash": new_hash, "token_version": new_version}})
    await db.login_attempts.delete_many({"username": user["username"]})
    return {"ok": True, "message": "PIN reset successfully. Please log in with your new PIN."}


@api_router.post("/auth/set-email")
async def set_email(input: SetEmailInput, user: dict[str, Any] = Depends(current_user)):
    """Signed-in users add or change their recovery email. Needs the current PIN, then a code sent to the new address."""
    stored = await db.users.find_one({"id": user["id"]}, {"_id": 0, "pin_hash": 1})
    if not stored or not bcrypt.checkpw(input.current_pin.encode(), stored["pin_hash"].encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current PIN is incorrect")
    taken = await db.users.find_one({"email": input.email, "id": {"$ne": user["id"]}}, {"_id": 0, "id": 1})
    if taken:
        raise HTTPException(status_code=409, detail="That email is already used by another account.")
    wait = await _otp_resend_wait("verify", input.email)
    if wait > 0:
        raise HTTPException(status_code=429, detail=f"Please wait {wait}s before requesting another code.")
    otp = _generate_otp()
    await _store_otp("verify", input.email, otp, user["id"])
    await _send_code_email(input.email, otp, "verify")
    return {"ok": True, "message": "We emailed a 6-digit code to that address."}


@api_router.post("/auth/verify-email")
async def verify_email(input: VerifyEmailInput, user: dict[str, Any] = Depends(current_user)):
    record = await _verify_otp("verify", input.email, input.otp)
    if not record or record.get("user_id") != user["id"]:
        raise HTTPException(status_code=400, detail="That code is invalid or has expired.")
    if await db.users.find_one({"email": input.email, "id": {"$ne": user["id"]}}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=409, detail="That email is already used by another account.")
    await db.users.update_one({"id": user["id"]}, {"$set": {"email": input.email}})
    return {"ok": True, "email": input.email}


@api_router.get("/transactions", response_model=List[Transaction])
async def get_transactions(user: dict[str, Any] = Depends(current_user)):
    docs = await db.transactions.find({"owner_id": user["id"]}, {"_id": 0, "owner_id": 0}).sort("date", -1).to_list(5000)
    return [Transaction(**doc) for doc in docs]


@api_router.get("/transactions/export", response_class=PlainTextResponse)
async def export_transactions(month: Optional[str] = None, user: dict[str, Any] = Depends(current_user)):
    query: dict[str, Any] = {"owner_id": user["id"]}
    if month:
        if not re.match(r"^\d{4}-\d{2}$", month):
            raise HTTPException(status_code=400, detail="month must be YYYY-MM")
        query["date"] = {"$regex": f"^{month}"}
    docs = await db.transactions.find(query, {"_id": 0, "owner_id": 0}).sort("date", -1).to_list(5000)
    lines = ["date,type,category,amount,note"]
    def cell(value: Any) -> str:
        # Quote every text cell and neutralise spreadsheet formulas (=, +, -, @) so a crafted
        # note can't run as a formula when the CSV is opened in Excel/Sheets.
        text = str(value or "").replace('"', '""')
        if text[:1] in ("=", "+", "-", "@", "\t", "\r"):
            text = "'" + text
        return f'"{text}"'

    for d in docs:
        lines.append(f'{d["date"]},{d["type"]},{cell(d.get("category"))},{d["amount"]},{cell(d.get("note"))}')
    csv = "\n".join(lines) + "\n"
    return PlainTextResponse(content=csv, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="spendpulse-{month or "all"}.csv"'})


@api_router.post("/transactions", response_model=Transaction)
async def create_transaction(input: TransactionCreate, user: dict[str, Any] = Depends(current_user)):
    transaction = Transaction(
        id=str(uuid.uuid4()),
        created_at=datetime.now(timezone.utc).isoformat(),
        **input.model_dump(),
    )
    await db.transactions.insert_one({**transaction.model_dump(), "owner_id": user["id"]})
    return transaction


@api_router.put("/transactions/{transaction_id}", response_model=Transaction)
async def update_transaction(transaction_id: str, input: TransactionCreate, user: dict[str, Any] = Depends(current_user)):
    updated = await db.transactions.find_one_and_update(
        {"id": transaction_id, "owner_id": user["id"]},
        {"$set": input.model_dump()},
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0},
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return Transaction(**updated)


@api_router.delete("/transactions/{transaction_id}")
async def delete_transaction(transaction_id: str, user: dict[str, Any] = Depends(current_user)):
    result = await db.transactions.delete_one({"id": transaction_id, "owner_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"ok": True}


@api_router.get("/budgets", response_model=List[Budget])
async def get_budgets(user: dict[str, Any] = Depends(current_user)):
    docs = await db.budgets.find({"owner_id": user["id"]}, {"_id": 0, "owner_id": 0}).to_list(200)
    return [Budget(**doc) for doc in docs]


@api_router.put("/budgets", response_model=Budget)
async def upsert_budget(input: BudgetUpsert, user: dict[str, Any] = Depends(current_user)):
    now = datetime.now(timezone.utc).isoformat()
    updated = await db.budgets.find_one_and_update(
        {"owner_id": user["id"], "category": input.category},
        {
            "$set": {"monthly_limit": input.monthly_limit, "updated_at": now, "category": input.category},
            "$setOnInsert": {"id": str(uuid.uuid4()), "owner_id": user["id"]},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0, "owner_id": 0},
    )
    return Budget(**updated)


@api_router.delete("/budgets/{category}")
async def delete_budget(category: str, user: dict[str, Any] = Depends(current_user)):
    result = await db.budgets.delete_one({"owner_id": user["id"], "category": category})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    return {"ok": True}


@api_router.get("/savings-goals", response_model=List[SavingsGoal])
async def get_savings_goals(user: dict[str, Any] = Depends(current_user)):
    docs = await db.savings_goals.find({"owner_id": user["id"]}, {"_id": 0, "owner_id": 0}).sort("created_at", 1).to_list(100)
    goals = []
    for doc in docs:
        doc.setdefault("name", "Savings goal")
        doc.setdefault("celebrated", False)
        doc.setdefault("created_at", doc.get("updated_at") or datetime.now(timezone.utc).isoformat())
        doc.setdefault("updated_at", doc.get("created_at"))
        goals.append(SavingsGoal(**doc))
    return goals


@api_router.post("/savings-goals", response_model=SavingsGoal)
async def create_savings_goal(input: SavingsGoalCreate, user: dict[str, Any] = Depends(current_user)):
    now = datetime.now(timezone.utc).isoformat()
    goal = SavingsGoal(
        id=str(uuid.uuid4()),
        name=input.name,
        target=input.target,
        target_date=input.target_date,
        celebrated=False,
        created_at=now,
        updated_at=now,
    )
    await db.savings_goals.insert_one({**goal.model_dump(), "owner_id": user["id"]})
    return goal


@api_router.put("/savings-goals/{goal_id}", response_model=SavingsGoal)
async def update_savings_goal(goal_id: str, input: SavingsGoalUpdate, user: dict[str, Any] = Depends(current_user)):
    changes = input.model_dump(exclude_unset=True)
    changes["updated_at"] = datetime.now(timezone.utc).isoformat()
    updated = await db.savings_goals.find_one_and_update(
        {"id": goal_id, "owner_id": user["id"]},
        {"$set": changes},
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0, "owner_id": 0},
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Savings goal not found")
    return SavingsGoal(**updated)


@api_router.delete("/savings-goals/{goal_id}")
async def delete_savings_goal(goal_id: str, user: dict[str, Any] = Depends(current_user)):
    result = await db.savings_goals.delete_one({"id": goal_id, "owner_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Savings goal not found")
    await db.transactions.update_many(
        {"owner_id": user["id"], "goal_id": goal_id},
        {"$set": {"goal_id": None}},
    )
    return {"ok": True}

# ---------- Admin ----------
@api_router.get("/admin/users", response_model=List[AdminUserSummary])
async def admin_list_users(admin: dict[str, Any] = Depends(current_admin)):
    users = await db.users.find({}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    summaries: List[AdminUserSummary] = []
    for u in users:
        await _ensure_role(u)
        txs = await db.transactions.find({"owner_id": u["id"]}, {"_id": 0, "type": 1, "amount": 1}).to_list(10000)
        balance = sum(t["amount"] if t["type"] == "income" else (-t["amount"] if t["type"] == "expense" else 0) for t in txs)
        summaries.append(AdminUserSummary(
            id=u["id"], username=u.get("username") or "user", email=u.get("email") or "", phone=u.get("phone") or "",
            role=u.get("role") or "user", disabled=bool(u.get("disabled")),
            created_at=u.get("created_at"), transaction_count=len(txs), balance=balance,
        ))
    return summaries


@api_router.put("/admin/users/{user_id}/disable")
async def admin_set_disabled(user_id: str, input: AdminSetDisabledInput, admin: dict[str, Any] = Depends(current_admin)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["id"] == admin["id"] and input.disabled:
        raise HTTPException(status_code=400, detail="You can't disable your own account")
    await db.users.update_one({"id": user_id}, {"$set": {"disabled": input.disabled}})
    return {"ok": True, "disabled": input.disabled}


@api_router.post("/admin/users/{user_id}/reset-pin")
async def admin_reset_pin(user_id: str, input: AdminResetPinInput, admin: dict[str, Any] = Depends(current_admin)):
    # There is currently no self-service "forgot PIN" flow (the earlier email-based
    # reset was removed), so a locked-out user's only recovery path is an admin
    # resetting their PIN here. Also clears any login lockout on that username.
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    new_hash = bcrypt.hashpw(input.new_pin.encode(), bcrypt.gensalt()).decode()
    new_version = (target.get("token_version", 0) or 0) + 1
    await db.users.update_one({"id": user_id}, {"$set": {"pin_hash": new_hash, "token_version": new_version}})
    await db.login_attempts.delete_many({"username": target.get("username") or ""})
    return {"ok": True}


@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict[str, Any] = Depends(current_admin)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["id"] == admin["id"]:
        raise HTTPException(status_code=400, detail="You can't delete your own account")
    await db.users.delete_one({"id": user_id})
    await db.transactions.delete_many({"owner_id": user_id})
    await db.budgets.delete_many({"owner_id": user_id})
    await db.savings_goals.delete_many({"owner_id": user_id})
    await db.splits.delete_many({"owner_id": user_id})
    await db.friends.delete_many({"owner_id": user_id})
    return {"ok": True}


@api_router.get("/admin/users/{user_id}/transactions", response_model=List[Transaction])
async def admin_user_transactions(user_id: str, admin: dict[str, Any] = Depends(current_admin)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    docs = await db.transactions.find({"owner_id": user_id}, {"_id": 0, "owner_id": 0}).sort("date", -1).to_list(5000)
    return [Transaction(**doc) for doc in docs]


@api_router.put("/admin/transactions/{transaction_id}", response_model=Transaction)
async def admin_update_transaction(transaction_id: str, input: AdminTransactionUpdate, admin: dict[str, Any] = Depends(current_admin)):
    changes = input.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No changes provided")
    updated = await db.transactions.find_one_and_update(
        {"id": transaction_id},
        {"$set": changes},
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0, "owner_id": 0},
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return Transaction(**updated)


@api_router.delete("/admin/transactions/{transaction_id}")
async def admin_delete_transaction(transaction_id: str, admin: dict[str, Any] = Depends(current_admin)):
    result = await db.transactions.delete_one({"id": transaction_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"ok": True}


# ---------- Friends ----------
@api_router.get("/friends", response_model=List[Friend])
async def list_friends(user: dict[str, Any] = Depends(current_user)):
    docs = await db.friends.find({"owner_id": user["id"]}, {"_id": 0, "owner_id": 0, "name_lower": 0}).sort("name", 1).to_list(500)
    return [Friend(**doc) for doc in docs]


@api_router.post("/friends", response_model=Friend)
async def add_friend(input: FriendCreate, user: dict[str, Any] = Depends(current_user)):
    normalized_name = input.name.strip().lower()
    if not normalized_name:
        raise HTTPException(status_code=400, detail="Name is required")
    existing = await db.friends.find_one(
        {"owner_id": user["id"], "name_lower": normalized_name},
        {"_id": 0, "owner_id": 0, "name_lower": 0},
    )
    if existing:
        return Friend(**existing)
    friend = Friend(
        id=str(uuid.uuid4()),
        name=input.name,
        phone=input.phone,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    doc = friend.model_dump()
    doc["owner_id"] = user["id"]
    doc["name_lower"] = normalized_name
    await db.friends.insert_one(doc)
    return friend


@api_router.delete("/friends/{friend_id}")
async def remove_friend(friend_id: str, user: dict[str, Any] = Depends(current_user)):
    result = await db.friends.delete_one({"id": friend_id, "owner_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Friend not found")
    return {"ok": True}


# ---------- Splits ----------
async def _persist_friends_from_members(owner_id: str, members: List[dict]) -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    for m in members:
        if m.get("is_payer"):
            continue
        name_lower = m["name"].strip().lower()
        if not name_lower:
            continue
        existing = await db.friends.find_one({"owner_id": owner_id, "name_lower": name_lower}, {"_id": 0})
        if existing:
            if m.get("phone") and not existing.get("phone"):
                await db.friends.update_one({"id": existing["id"]}, {"$set": {"phone": m["phone"]}})
            continue
        await db.friends.insert_one({
            "id": str(uuid.uuid4()),
            "owner_id": owner_id,
            "name": m["name"],
            "name_lower": name_lower,
            "phone": m.get("phone"),
            "created_at": now_iso,
        })


async def _serialize_split(doc: dict) -> SplitSession:
    doc.pop("_id", None)
    doc.pop("owner_id", None)
    return SplitSession(**doc)


@api_router.get("/splits", response_model=List[SplitSession])
async def list_splits(user: dict[str, Any] = Depends(current_user)):
    docs = await db.splits.find({"owner_id": user["id"]}, {"_id": 0, "owner_id": 0}).sort("created_at", -1).to_list(500)
    return [SplitSession(**doc) for doc in docs]


@api_router.get("/splits/{split_id}", response_model=SplitSession)
async def get_split(split_id: str, user: dict[str, Any] = Depends(current_user)):
    doc = await db.splits.find_one({"id": split_id, "owner_id": user["id"]}, {"_id": 0, "owner_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Split not found")
    return SplitSession(**doc)


@api_router.post("/splits", response_model=SplitSession, status_code=201)
async def create_split(input: SplitSessionCreate, user: dict[str, Any] = Depends(current_user)):
    _validate_split_math(input.total_amount, input.mode, input.members)
    members = _apply_members(input.members)
    now_iso = datetime.now(timezone.utc).isoformat()
    tx_id: Optional[str] = input.transaction_id

    if input.create_transaction and not tx_id:
        payer = next((m for m in members if m["is_payer"]), None)
        note_parts = ["Split"]
        if payer:
            note_parts.append(f"paid by {payer['name']}")
        if input.note:
            note_parts.append(input.note)
        tx_doc = {
            "id": str(uuid.uuid4()),
            "type": "expense",
            "amount": _round2(input.total_amount),
            "category": (input.category or "Split").strip() or "Split",
            "note": " · ".join(note_parts)[:120],
            "date": input.date or datetime.now(timezone.utc).date().isoformat(),
            "goal_id": None,
            "created_at": now_iso,
            "owner_id": user["id"],
        }
        await db.transactions.insert_one(tx_doc)
        tx_id = tx_doc["id"]

    split_doc = {
        "id": str(uuid.uuid4()),
        "owner_id": user["id"],
        "total_amount": _round2(input.total_amount),
        "note": input.note or "",
        "mode": input.mode,
        "members": members,
        "transaction_id": tx_id,
        "finalized": False,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.splits.insert_one(split_doc)
    await _persist_friends_from_members(user["id"], members)
    return await _serialize_split(dict(split_doc))


@api_router.put("/splits/{split_id}", response_model=SplitSession)
async def update_split(split_id: str, input: SplitSessionUpdate, user: dict[str, Any] = Depends(current_user)):
    existing = await db.splits.find_one({"id": split_id, "owner_id": user["id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Split not found")
    if existing.get("finalized"):
        raise HTTPException(status_code=400, detail="Cannot edit a finalized split")

    new_total = input.total_amount if input.total_amount is not None else existing["total_amount"]
    new_mode = input.mode if input.mode is not None else existing["mode"]
    new_members_input = input.members
    if new_members_input is not None:
        _validate_split_math(new_total, new_mode, new_members_input)
        new_members = _apply_members(new_members_input)
    else:
        new_members = existing["members"]

    now_iso = datetime.now(timezone.utc).isoformat()
    changes: dict[str, Any] = {
        "total_amount": _round2(new_total),
        "mode": new_mode,
        "members": new_members,
        "updated_at": now_iso,
    }
    if input.note is not None:
        changes["note"] = input.note

    tx_id = existing.get("transaction_id")
    if tx_id:
        payer = next((m for m in new_members if m.get("is_payer")), None)
        note_parts = ["Split"]
        if payer:
            note_parts.append(f"paid by {payer['name']}")
        if changes.get("note") or existing.get("note"):
            note_parts.append(changes.get("note") if changes.get("note") is not None else existing.get("note"))
        await db.transactions.update_one(
            {"id": tx_id, "owner_id": user["id"]},
            {"$set": {"amount": _round2(new_total), "note": " · ".join([p for p in note_parts if p])[:120]}},
        )

    updated = await db.splits.find_one_and_update(
        {"id": split_id, "owner_id": user["id"]},
        {"$set": changes},
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0, "owner_id": 0},
    )
    if new_members_input is not None:
        await _persist_friends_from_members(user["id"], new_members)
    return SplitSession(**updated)


@api_router.put("/splits/{split_id}/members/{member_id}/settle", response_model=SplitSession)
async def toggle_split_member_settled(split_id: str, member_id: str, input: SplitMemberSettleInput, user: dict[str, Any] = Depends(current_user)):
    existing = await db.splits.find_one({"id": split_id, "owner_id": user["id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Split not found")
    if existing.get("finalized") and not input.settled:
        raise HTTPException(status_code=400, detail="Cannot unsettle members in a finalized split")
    members = existing["members"]
    hit = False
    for m in members:
        if m["id"] == member_id:
            m["settled"] = bool(input.settled)
            hit = True
            break
    if not hit:
        raise HTTPException(status_code=404, detail="Member not found in this split")
    finalized = all(m.get("settled") or m.get("is_payer") for m in members)
    updated = await db.splits.find_one_and_update(
        {"id": split_id, "owner_id": user["id"]},
        {"$set": {"members": members, "finalized": finalized, "updated_at": datetime.now(timezone.utc).isoformat()}},
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0, "owner_id": 0},
    )
    return SplitSession(**updated)


@api_router.delete("/splits/{split_id}")
async def delete_split(split_id: str, user: dict[str, Any] = Depends(current_user)):
    existing = await db.splits.find_one({"id": split_id, "owner_id": user["id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Split not found")
    tx_id = existing.get("transaction_id")
    await db.splits.delete_one({"id": split_id, "owner_id": user["id"]})
    if tx_id:
        await db.transactions.delete_one({"id": tx_id, "owner_id": user["id"]})
    return {"ok": True}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)


@app.on_event("startup")
async def _startup_indexes():
    try:
        await db.users.create_index("username", unique=True, partialFilterExpression={"username": {"$exists": True}})
        # Attempts are tracked per (username, ip); drop the old username-only unique index if present.
        try:
            await db.login_attempts.drop_index("username_1")
        except Exception:
            pass
        await db.login_attempts.create_index([("username", 1), ("ip", 1)], unique=True)
        await db.admin_claims.create_index("key", unique=True)
        await db.users.create_index("email", unique=True, partialFilterExpression={"email": {"$type": "string"}})
        await db.otp_tokens.delete_many({"purpose": {"$exists": False}})  # old phone-OTP records
        await db.otp_tokens.create_index([("purpose", 1), ("email", 1)], unique=True)
        await db.otp_requests.create_index("expires_at", expireAfterSeconds=0)
        # TTL index: Mongo auto-deletes a revoked_tokens doc once its expires_at
        # (the JWT's own expiry) is in the past, so the denylist self-cleans
        # instead of growing forever.
        await db.revoked_tokens.create_index("expires_at", expireAfterSeconds=0)
    except Exception as exc:  # pragma: no cover
        logger.warning("Index creation skipped: %s", exc)


@app.on_event("startup")
async def _backfill_admin_claims():
    # One-time migration for deployments upgrading from the old env-var-only
    # admin check: register a claim for whichever existing user already holds
    # each reserved admin username/phone, so they keep admin after this change
    # (new signups going forward go through _claim_admin_role instead).
    try:
        for username in ADMIN_USERNAMES:
            key = f"username:{username}"
            if await db.admin_claims.find_one({"key": key}, {"_id": 0}):
                continue
            existing_user = await db.users.find_one({"username": username}, {"_id": 0, "id": 1})
            if existing_user:
                await db.admin_claims.update_one(
                    {"key": key},
                    {"$setOnInsert": {"key": key, "owner_user_id": existing_user["id"], "claimed_at": datetime.now(timezone.utc).isoformat()}},
                    upsert=True,
                )
        for phone in ADMIN_PHONES:
            key = f"phone:{phone}"
            if await db.admin_claims.find_one({"key": key}, {"_id": 0}):
                continue
            existing_user = await db.users.find_one({"phone": phone}, {"_id": 0, "id": 1})
            if existing_user:
                await db.admin_claims.update_one(
                    {"key": key},
                    {"$setOnInsert": {"key": key, "owner_user_id": existing_user["id"], "claimed_at": datetime.now(timezone.utc).isoformat()}},
                    upsert=True,
                )
    except Exception as exc:  # pragma: no cover
        logger.warning("Admin claim backfill skipped: %s", exc)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
