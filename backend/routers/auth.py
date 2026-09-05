"""Signup, login, OTP verification.

Login is two steps, and they are cryptographically chained. A correct password
returns a short-lived *challenge token*; the OTP step consumes that token rather
than an account id supplied by the caller. This is the whole point of the second
factor: before, possession of a vendor_id was enough to request a fresh code and
then guess six digits without limit, so the password was not actually required.

Nothing downstream trusts a vendor_id from the client -- see
security.get_current_vendor.
"""
import hmac
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

import models
import notifications
import ratelimit
import schemas
import security
from config import settings
from database import get_db

router = APIRouter()
log = logging.getLogger("vendor360.auth")

# Verifying against a real-looking hash costs the same as verifying against a
# stored one, so an unknown username takes as long as a wrong password. Without
# this, response time alone tells an attacker which accounts exist.
_DUMMY_HASH = security.hash_password("vendor360-timing-equaliser")

_OTP_FAILED = HTTPException(status_code=401, detail="Incorrect verification code")
_CHALLENGE_INVALID = HTTPException(
    status_code=401, detail="That sign-in attempt expired. Enter your password again."
)


def _issue_otp(vendor: models.Vendor, db: Session) -> str:
    code = security.generate_otp()
    vendor.otp_code_hash = security.hash_otp(code)
    vendor.otp_expires_at = datetime.utcnow() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)
    vendor.otp_attempts = 0
    db.commit()

    # Actually deliver it. Without this the code existed only as a hash in the
    # database, so with DEBUG_OTP correctly off nobody could finish signing in.
    result = notifications.send_otp(vendor.phone or vendor.email, code)
    if not result.delivered and not settings.DEBUG_OTP:
        log.error("Could not deliver a code to vendor %s: %s", vendor.id, result.detail)

    # In DEBUG_OTP the code is also printed, because a one-time code written to
    # production logs is a credential sitting in plaintext for anyone who can
    # read them.
    if settings.DEBUG_OTP:
        log.warning("OTP for %s (%s): %s", vendor.username or vendor.email, vendor.id, code)
    return code


def _challenge(vendor: models.Vendor, message: str, code: str) -> schemas.ChallengeResponse:
    return schemas.ChallengeResponse(
        message=message,
        vendor_id=vendor.id,
        challenge_token=security.create_challenge_token(vendor.id),
        debug_otp=code if settings.DEBUG_OTP else None,
    )


def _vendor_from_challenge(token: str, db: Session, request: Request) -> models.Vendor:
    # Counted before the token is even parsed. A rejected challenge costs an
    # attacker nothing otherwise, and they can hammer this endpoint all day.
    ratelimit.enforce(
        request, "otp", settings.OTP_RATE_LIMIT, settings.OTP_RATE_WINDOW_SECONDS
    )

    try:
        payload = security.decode_challenge_token(token)
    except ValueError:
        raise _CHALLENGE_INVALID

    vendor = db.query(models.Vendor).filter(models.Vendor.id == payload["sub"]).first()
    if vendor is None:
        raise _CHALLENGE_INVALID
    return vendor


@router.post("/signup", response_model=schemas.ChallengeResponse)
def signup(req: schemas.SignupRequest, request: Request, db: Session = Depends(get_db)):
    ratelimit.enforce(
        request, "signup", settings.SIGNUP_RATE_LIMIT, settings.SIGNUP_RATE_WINDOW_SECONDS
    )

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
    return _challenge(
        vendor, "Account created. Enter the verification code to finish signing in.", code
    )


@router.post("/login", response_model=schemas.ChallengeResponse)
def login(req: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    identifier = req.identifier.strip().lower()
    ratelimit.enforce(
        request,
        "login",
        settings.LOGIN_RATE_LIMIT,
        settings.LOGIN_RATE_WINDOW_SECONDS,
        identifier=identifier,
    )

    vendor = (
        db.query(models.Vendor)
        .filter((models.Vendor.username == identifier) | (models.Vendor.email == identifier))
        .first()
    )

    # Always do the hashing work, even for an account that does not exist, so
    # the two cases take the same time.
    is_valid, needs_rehash = security.verify_password(
        req.password, vendor.password_hash if vendor else _DUMMY_HASH
    )

    if not vendor or not is_valid:
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    if needs_rehash:
        # Silently upgrade the old unsalted SHA-256 hash now that we have the
        # plaintext in hand.
        vendor.password_hash = security.hash_password(req.password)
        db.commit()

    code = _issue_otp(vendor, db)
    return _challenge(vendor, "Verification code sent to your registered phone.", code)


@router.post("/verify-otp", response_model=schemas.TokenResponse)
def verify_otp(req: schemas.OTPRequest, request: Request, db: Session = Depends(get_db)):
    vendor = _vendor_from_challenge(req.challenge_token, db, request)
    ratelimit.enforce(
        request,
        "otp",
        settings.OTP_RATE_LIMIT,
        settings.OTP_RATE_WINDOW_SECONDS,
        identifier=vendor.id,
    )

    expired = vendor.otp_expires_at is not None and vendor.otp_expires_at < datetime.utcnow()
    if expired and not settings.DEBUG_OTP:
        raise HTTPException(status_code=401, detail="That code has expired. Request a new one.")

    if not security.verify_otp_code(req.otp.strip(), vendor.otp_code_hash):
        # Burn the code after a few wrong guesses. A million possibilities is
        # only a real search space while the number of tries is bounded.
        vendor.otp_attempts = (vendor.otp_attempts or 0) + 1
        exhausted = vendor.otp_attempts >= settings.OTP_MAX_ATTEMPTS
        if exhausted:
            vendor.otp_code_hash = None
            vendor.otp_expires_at = None
        db.commit()
        if exhausted:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many incorrect codes. Sign in again to get a new one.",
            )
        raise _OTP_FAILED

    # One-time really means one time.
    vendor.otp_code_hash = None
    vendor.otp_expires_at = None
    vendor.otp_attempts = 0
    db.commit()

    return schemas.TokenResponse(
        message="Signed in",
        token=security.create_access_token(vendor.id, epoch=vendor.token_epoch or 0),
        vendor_id=vendor.id,
        name=vendor.name,
        store_name=vendor.store_name,
    )


@router.post("/resend-otp", response_model=schemas.ChallengeResponse)
def resend_otp(req: schemas.ResendOTPRequest, request: Request, db: Session = Depends(get_db)):
    """Needs the challenge token, so only someone who passed the password step
    can cause a code to be issued -- and, with a real SMS provider, billed."""
    vendor = _vendor_from_challenge(req.challenge_token, db, request)
    ratelimit.enforce(
        request,
        "otp",
        settings.OTP_RATE_LIMIT,
        settings.OTP_RATE_WINDOW_SECONDS,
        identifier=vendor.id,
    )
    code = _issue_otp(vendor, db)
    return _challenge(vendor, "A new code is on its way.", code)


@router.post("/forgot-password", status_code=202)
def forgot_password(
    req: schemas.ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)
):
    """Send a single-use reset link.

    Always answers the same way. Saying "no such account" here would turn this
    into a free tool for working out which shopkeepers are registered.
    """
    identifier = req.identifier.strip().lower()
    ratelimit.enforce(
        request,
        "login",
        settings.LOGIN_RATE_LIMIT,
        settings.LOGIN_RATE_WINDOW_SECONDS,
        identifier=identifier,
    )

    vendor = (
        db.query(models.Vendor)
        .filter((models.Vendor.username == identifier) | (models.Vendor.email == identifier))
        .first()
    )

    if vendor is not None:
        nonce = security.generate_reset_nonce()
        vendor.reset_nonce_hash = security.hash_nonce(nonce)
        vendor.reset_expires_at = datetime.utcnow() + timedelta(
            minutes=settings.RESET_TOKEN_EXPIRE_MINUTES
        )
        db.commit()

        token = security.create_reset_token(vendor.id, nonce)
        separator = "&" if "?" in settings.PASSWORD_RESET_URL else "?"
        link = f"{settings.PASSWORD_RESET_URL}{separator}token={token}"
        result = notifications.send_password_reset(vendor.email or vendor.phone, link)
        if not result.delivered:
            log.error("Could not deliver a reset link to vendor %s: %s", vendor.id, result.detail)

    return {"message": "If that account exists, a reset link is on its way."}


@router.post("/reset-password", status_code=204)
def reset_password(
    req: schemas.ResetPasswordRequest, request: Request, db: Session = Depends(get_db)
):
    ratelimit.enforce(
        request, "login", settings.LOGIN_RATE_LIMIT, settings.LOGIN_RATE_WINDOW_SECONDS
    )

    invalid = HTTPException(
        status_code=400, detail="That reset link is invalid or has already been used."
    )
    try:
        payload = security.decode_reset_token(req.reset_token)
    except ValueError:
        raise invalid

    vendor = db.query(models.Vendor).filter(models.Vendor.id == payload["sub"]).first()
    if vendor is None or not vendor.reset_nonce_hash:
        raise invalid

    expired = vendor.reset_expires_at is not None and vendor.reset_expires_at < datetime.utcnow()
    nonce_ok = hmac.compare_digest(
        security.hash_nonce(payload.get("nonce", "")), vendor.reset_nonce_hash
    )
    if expired or not nonce_ok:
        raise invalid

    vendor.password_hash = security.hash_password(req.new_password)
    # Burn the link, and end every session -- whoever forced the reset is out.
    vendor.reset_nonce_hash = None
    vendor.reset_expires_at = None
    vendor.token_epoch = (vendor.token_epoch or 0) + 1
    vendor.otp_code_hash = None
    vendor.otp_expires_at = None
    db.commit()
    return None


@router.post("/change-password", status_code=204)
def change_password(
    req: schemas.PasswordChangeRequest,
    request: Request,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Changing the password ends every other session, including a stolen one."""
    ratelimit.enforce(
        request,
        "login",
        settings.LOGIN_RATE_LIMIT,
        settings.LOGIN_RATE_WINDOW_SECONDS,
        identifier=vendor.id,
    )

    is_valid, _ = security.verify_password(req.current_password, vendor.password_hash)
    if not is_valid:
        raise HTTPException(status_code=401, detail="Your current password is not correct")

    vendor.password_hash = security.hash_password(req.new_password)
    vendor.token_epoch = (vendor.token_epoch or 0) + 1
    db.commit()
    return None


@router.post("/logout-all", status_code=204)
def logout_everywhere(
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """For a lost phone. Clearing the browser only forgets the token locally --
    this stops it being accepted."""
    vendor.token_epoch = (vendor.token_epoch or 0) + 1
    db.commit()
    return None


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
        gstin=vendor.gstin,
        total_items=total_items,
    )
