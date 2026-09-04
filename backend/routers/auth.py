"""Signup, login, OTP verification.

Login is two steps: credentials are checked first, then a one-time code. Only
after the OTP succeeds is a signed JWT issued. Nothing downstream trusts a
vendor_id supplied by the client -- see security.get_current_vendor.
"""
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
import security
from config import settings
from database import get_db

router = APIRouter()
log = logging.getLogger("vendor360.auth")


def _issue_otp(vendor: models.Vendor, db: Session) -> str:
    code = security.generate_otp()
    vendor.otp_code_hash = security.hash_otp(code)
    vendor.otp_expires_at = datetime.utcnow() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)
    db.commit()

    # No SMS/email provider is wired up. Printing it keeps the flow usable in
    # development; swap this for a real provider call before going live.
    log.warning("OTP for %s (%s): %s", vendor.username or vendor.email, vendor.id, code)
    return code


@router.post("/signup", response_model=schemas.ChallengeResponse)
def signup(req: schemas.SignupRequest, db: Session = Depends(get_db)):
    existing = (
        db.query(models.Vendor)
        .filter((models.Vendor.username == req.username) | (models.Vendor.email == req.email))
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="That username or email is already registered")

    vendor = models.Vendor(
        name=req.name.strip(),
        username=req.username,
        email=req.email,
        phone=req.phone.strip(),
        password_hash=security.hash_password(req.password),
        store_name=(req.store_name or f"{req.name.strip()}'s Store"),
    )
    db.add(vendor)
    db.commit()
    db.refresh(vendor)

    code = _issue_otp(vendor, db)
    return schemas.ChallengeResponse(
        message="Account created. Enter the verification code to finish signing in.",
        vendor_id=vendor.id,
        debug_otp=code if settings.DEBUG_OTP else None,
    )


@router.post("/login", response_model=schemas.ChallengeResponse)
def login(req: schemas.LoginRequest, db: Session = Depends(get_db)):
    identifier = req.identifier.strip().lower()
    vendor = (
        db.query(models.Vendor)
        .filter((models.Vendor.username == identifier) | (models.Vendor.email == identifier))
        .first()
    )

    is_valid, needs_rehash = security.verify_password(req.password, vendor.password_hash if vendor else None)

    # Same message and roughly the same work either way, so this endpoint does
    # not reveal which usernames exist.
    if not vendor or not is_valid:
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    if needs_rehash:
        # Silently upgrade the old unsalted SHA-256 hash now that we have the
        # plaintext in hand.
        vendor.password_hash = security.hash_password(req.password)
        db.commit()

    code = _issue_otp(vendor, db)
    return schemas.ChallengeResponse(
        message="Verification code sent to your registered phone.",
        vendor_id=vendor.id,
        debug_otp=code if settings.DEBUG_OTP else None,
    )


@router.post("/verify-otp", response_model=schemas.TokenResponse)
def verify_otp(req: schemas.OTPRequest, db: Session = Depends(get_db)):
    vendor = db.query(models.Vendor).filter(models.Vendor.id == req.vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=401, detail="Verification failed. Start again.")

    expired = vendor.otp_expires_at is not None and vendor.otp_expires_at < datetime.utcnow()
    if expired and not settings.DEBUG_OTP:
        raise HTTPException(status_code=401, detail="That code has expired. Request a new one.")

    if not security.verify_otp_code(req.otp.strip(), vendor.otp_code_hash):
        raise HTTPException(status_code=401, detail="Incorrect verification code")

    # One-time really means one time.
    vendor.otp_code_hash = None
    vendor.otp_expires_at = None
    db.commit()

    return schemas.TokenResponse(
        message="Signed in",
        token=security.create_access_token(vendor.id),
        vendor_id=vendor.id,
        name=vendor.name,
        store_name=vendor.store_name,
    )


@router.post("/resend-otp", response_model=schemas.ChallengeResponse)
def resend_otp(req: schemas.OTPRequest, db: Session = Depends(get_db)):
    vendor = db.query(models.Vendor).filter(models.Vendor.id == req.vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Unknown account")
    code = _issue_otp(vendor, db)
    return schemas.ChallengeResponse(
        message="A new code is on its way.",
        vendor_id=vendor.id,
        debug_otp=code if settings.DEBUG_OTP else None,
    )


@router.get("/me", response_model=schemas.VendorResponse)
def me(vendor: models.Vendor = Depends(security.get_current_vendor), db: Session = Depends(get_db)):
    """Lets the frontend confirm a stored token is still valid on boot."""
    total_items = (
        db.query(models.InventoryItem)
        .filter(
            models.InventoryItem.vendor_id == vendor.id,
            models.InventoryItem.is_archived.is_(False),
        )
        .count()
    )
    return schemas.VendorResponse(
        id=vendor.id,
        vendor_code=vendor.vendor_code,
        name=vendor.name,
        store_name=vendor.store_name,
        phone=vendor.phone,
        upi_id=vendor.upi_id,
        total_items=total_items,
    )
