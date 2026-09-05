"""FastAPI-facing security layer: thin wrappers over crypto_utils plus the
dependency that establishes who is calling.
"""
import hmac
from typing import Optional, Tuple

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

import crypto_utils
import models
from config import settings
from database import get_db


def hash_password(password: str) -> str:
    return crypto_utils.hash_password(password)


def verify_password(password: str, stored: Optional[str]) -> Tuple[bool, bool]:
    return crypto_utils.verify_password(password, stored)


def generate_otp() -> str:
    return crypto_utils.generate_otp()


def hash_otp(code: str) -> str:
    return crypto_utils.hash_otp(code, settings.SECRET_KEY)


def verify_otp_code(submitted: str, stored_hash: Optional[str]) -> bool:
    # No live code means there is nothing to verify against -- not even in
    # DEBUG_OTP. Checking the fixed code first, as this used to, let the debug
    # shortcut sail past a code that had just been burned for too many wrong
    # guesses, so the attempt limit did nothing in the mode most runs use.
    if not stored_hash:
        return False
    if settings.DEBUG_OTP and hmac.compare_digest(submitted, settings.DEBUG_OTP_CODE):
        return True
    return hmac.compare_digest(hash_otp(submitted), stored_hash)


def create_access_token(
    vendor_id: str, expires_minutes: Optional[int] = None, *, epoch: int = 0
) -> str:
    return crypto_utils.create_access_token(
        vendor_id,
        settings.SECRET_KEY,
        expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        purpose=crypto_utils.PURPOSE_ACCESS,
        epoch=epoch,
    )


def decode_access_token(token: str) -> dict:
    return crypto_utils.decode_access_token(
        token, settings.SECRET_KEY, purpose=crypto_utils.PURPOSE_ACCESS
    )


def create_challenge_token(vendor_id: str) -> str:
    """Proof that this caller just got the password right.

    The OTP step consumes this instead of a vendor_id supplied by the client.
    Without it the two steps are not a chain: anyone holding an account id could
    ask for a code and then work through six digits at their leisure.
    """
    return crypto_utils.create_access_token(
        vendor_id,
        settings.SECRET_KEY,
        settings.CHALLENGE_TOKEN_EXPIRE_MINUTES,
        purpose=crypto_utils.PURPOSE_CHALLENGE,
    )


def decode_challenge_token(token: str) -> dict:
    return crypto_utils.decode_access_token(
        token, settings.SECRET_KEY, purpose=crypto_utils.PURPOSE_CHALLENGE
    )


def create_reset_token(vendor_id: str, nonce: str) -> str:
    """A single-use password-reset link.

    The nonce is signed in and its hash is stored on the account, so the link
    stops working the moment it is used -- a reset mail sitting in an inbox is
    not a standing key to the shop.
    """
    return crypto_utils.create_access_token(
        vendor_id,
        settings.SECRET_KEY,
        settings.RESET_TOKEN_EXPIRE_MINUTES,
        purpose=crypto_utils.PURPOSE_RESET,
        nonce=nonce,
    )


def decode_reset_token(token: str) -> dict:
    return crypto_utils.decode_access_token(
        token, settings.SECRET_KEY, purpose=crypto_utils.PURPOSE_RESET
    )


def generate_reset_nonce() -> str:
    return crypto_utils.secrets.token_urlsafe(24)


def hash_nonce(nonce: str) -> str:
    return crypto_utils.hash_otp(nonce, settings.SECRET_KEY)


_bearer = HTTPBearer(auto_error=False)

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_vendor(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> models.Vendor:
    """Resolve the caller from their bearer token.

    The single place a vendor identity is established. No endpoint accepts a
    vendor_id from the client -- that was how the original build let anyone read
    any store's data by editing the URL.
    """
    if credentials is None or not credentials.credentials:
        raise CREDENTIALS_ERROR

    try:
        payload = decode_access_token(credentials.credentials)
    except ValueError:
        raise CREDENTIALS_ERROR

    vendor = db.query(models.Vendor).filter(models.Vendor.id == payload["sub"]).first()
    if vendor is None:
        raise CREDENTIALS_ERROR

    # Tokens issued before the account's epoch was raised are dead: that is what
    # a password change and "sign out everywhere" actually do, since there is no
    # server-side session to delete.
    if int(payload.get("epoch", 0)) != int(vendor.token_epoch or 0):
        raise CREDENTIALS_ERROR

    return vendor
