"""Password hashing and JWT, on the standard library only.

Kept free of FastAPI and SQLAlchemy imports so the security primitives can be
unit-tested on their own.

PBKDF2-HMAC-SHA256 is a standards-based password hash (Django's default).
bcrypt or argon2 would be a reasonable swap later; neither is needed for this
to be correct, and avoiding them keeps the project installable with nothing but
the core requirements.
"""
import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Optional, Tuple

PBKDF2_ITERATIONS = 240_000
ALGORITHM_TAG = "pbkdf2_sha256"


# --------------------------------------------------------------------------
# Passwords
# --------------------------------------------------------------------------
def hash_password(password: str) -> str:
    """Return pbkdf2_sha256$iterations$salt_hex$hash_hex."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"{ALGORITHM_TAG}${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: Optional[str]) -> Tuple[bool, bool]:
    """Check a password. Returns (is_valid, needs_rehash).

    Hashes written by the original unsalted-SHA256 scheme still verify, but
    report needs_rehash so the caller can upgrade them transparently on the next
    successful login.
    """
    if not stored:
        return False, False

    if stored.startswith(ALGORITHM_TAG + "$"):
        try:
            _, iterations, salt_hex, expected_hex = stored.split("$", 3)
            digest = hashlib.pbkdf2_hmac(
                "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
            )
        except (ValueError, TypeError):
            return False, False
        return hmac.compare_digest(digest.hex(), expected_hex), False

    if len(stored) == 64:  # legacy bare SHA-256 hex
        legacy = hashlib.sha256(password.encode("utf-8")).hexdigest()
        if hmac.compare_digest(legacy, stored):
            return True, True

    return False, False


# --------------------------------------------------------------------------
# OTP
# --------------------------------------------------------------------------
def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(code: str, secret: str) -> str:
    """OTPs live for minutes, so one salted SHA-256 pass is adequate."""
    return hashlib.sha256((code + secret).encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------
# JWT (HS256)
# --------------------------------------------------------------------------
def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(segment: str) -> bytes:
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + padding)


def _sign(signing_input: bytes, secret: str) -> str:
    return _b64url_encode(hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest())


def create_access_token(subject: str, secret: str, expires_minutes: int) -> str:
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + expires_minutes * 60,
        "jti": secrets.token_hex(8),
    }
    header_segment = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_segment = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_segment}.{payload_segment}".encode("ascii")
    return f"{header_segment}.{payload_segment}.{_sign(signing_input, secret)}"


def decode_access_token(token: str, secret: str) -> dict:
    """Verify signature and expiry. Raises ValueError on any problem."""
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Malformed token")
    header_segment, payload_segment, signature = parts

    signing_input = f"{header_segment}.{payload_segment}".encode("ascii")
    if not hmac.compare_digest(_sign(signing_input, secret), signature):
        raise ValueError("Bad signature")

    try:
        header = json.loads(_b64url_decode(header_segment))
        payload = json.loads(_b64url_decode(payload_segment))
    except (ValueError, TypeError):
        raise ValueError("Malformed token payload")

    # Only ever accept the algorithm we issue, so a token claiming
    # {"alg": "none"} can never be honoured.
    if header.get("alg") != "HS256":
        raise ValueError("Unexpected algorithm")

    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("Token expired")

    if not payload.get("sub"):
        raise ValueError("Token has no subject")

    return payload
