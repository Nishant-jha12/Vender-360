"""Security primitives. Runs on the standard library alone -- no FastAPI or
database needed -- so it works anywhere python does.

    python -m pytest tests/test_crypto.py
"""
import base64
import hashlib
import json
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import crypto_utils as c  # noqa: E402

SECRET = "test-secret-not-used-anywhere-real"


# --------------------------------------------------------------------------
# Passwords
# --------------------------------------------------------------------------
def test_correct_password_verifies():
    stored = c.hash_password("hunter2-and-then-some")
    valid, needs_rehash = c.verify_password("hunter2-and-then-some", stored)
    assert valid is True
    assert needs_rehash is False


def test_wrong_password_rejected():
    stored = c.hash_password("hunter2-and-then-some")
    valid, _ = c.verify_password("hunter3-and-then-some", stored)
    assert valid is False


def test_same_password_hashes_differently():
    """Salting: two hashes of one password must not match, or the whole
    database falls to a single rainbow table."""
    assert c.hash_password("same-password") != c.hash_password("same-password")


def test_hash_records_its_parameters():
    stored = c.hash_password("whatever-goes-here")
    algorithm, iterations, salt, digest = stored.split("$")
    assert algorithm == "pbkdf2_sha256"
    assert int(iterations) >= 200_000
    assert len(salt) == 32  # 16 bytes hex
    assert len(digest) == 64  # sha256 hex


def test_legacy_sha256_hash_still_verifies_and_asks_for_rehash():
    """Accounts created by the original build must still be able to log in,
    and their hash must be upgraded when they do."""
    legacy = hashlib.sha256(b"old-prototype-password").hexdigest()
    valid, needs_rehash = c.verify_password("old-prototype-password", legacy)
    assert valid is True
    assert needs_rehash is True


def test_legacy_hash_rejects_wrong_password():
    legacy = hashlib.sha256(b"old-prototype-password").hexdigest()
    valid, _ = c.verify_password("not-the-password", legacy)
    assert valid is False


def test_empty_stored_hash_is_never_valid():
    assert c.verify_password("anything", None) == (False, False)
    assert c.verify_password("anything", "") == (False, False)


def test_corrupt_hash_does_not_raise():
    valid, _ = c.verify_password("anything", "pbkdf2_sha256$not$a$hash")
    assert valid is False


# --------------------------------------------------------------------------
# JWT
# --------------------------------------------------------------------------
def test_round_trip():
    token = c.create_access_token("vendor-123", SECRET, expires_minutes=60)
    payload = c.decode_access_token(token, SECRET)
    assert payload["sub"] == "vendor-123"


def test_token_signed_with_another_secret_is_rejected():
    token = c.create_access_token("vendor-123", "attacker-secret", expires_minutes=60)
    with pytest.raises(ValueError):
        c.decode_access_token(token, SECRET)


def test_tampered_payload_is_rejected():
    """Editing the subject to impersonate another vendor must fail."""
    token = c.create_access_token("vendor-123", SECRET, expires_minutes=60)
    header, payload_segment, signature = token.split(".")

    padding = "=" * (-len(payload_segment) % 4)
    payload = json.loads(base64.urlsafe_b64decode(payload_segment + padding))
    payload["sub"] = "someone-elses-vendor-id"
    forged = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()

    with pytest.raises(ValueError):
        c.decode_access_token(f"{header}.{forged}.{signature}", SECRET)


def test_expired_token_is_rejected():
    token = c.create_access_token("vendor-123", SECRET, expires_minutes=-1)
    with pytest.raises(ValueError):
        c.decode_access_token(token, SECRET)


def test_alg_none_token_is_rejected():
    """The classic JWT bypass: claim no algorithm and send no signature."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    payload = base64.urlsafe_b64encode(
        json.dumps({"sub": "vendor-123", "exp": int(time.time()) + 999}).encode()
    ).rstrip(b"=").decode()

    with pytest.raises(ValueError):
        c.decode_access_token(f"{header}.{payload}.", SECRET)


def test_malformed_tokens_raise_cleanly():
    for junk in ("", "not-a-token", "a.b", "a.b.c.d"):
        with pytest.raises(ValueError):
            c.decode_access_token(junk, SECRET)


# --------------------------------------------------------------------------
# OTP
# --------------------------------------------------------------------------
def test_otp_is_six_digits():
    for _ in range(50):
        code = c.generate_otp()
        assert len(code) == 6 and code.isdigit()


def test_otp_hash_is_stable_and_secret_dependent():
    assert c.hash_otp("123456", SECRET) == c.hash_otp("123456", SECRET)
    assert c.hash_otp("123456", SECRET) != c.hash_otp("123456", "another-secret")
