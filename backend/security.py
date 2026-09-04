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
    if settings.DEBUG_OTP and hmac.compare_digest(submitted, settings.DEBUG_OTP_CODE):
        return True
    if not stored_hash:
        return False
    return hmac.compare_digest(hash_otp(submitted), stored_hash)


def create_access_token(vendor_id: str, expires_minutes: Optional[int] = None) -> str:
    return crypto_utils.create_access_token(
        vendor_id, settings.SECRET_KEY, expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )


def decode_access_token(token: str) -> dict:
    return crypto_utils.decode_access_token(token, settings.SECRET_KEY)


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
    return vendor
