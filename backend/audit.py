"""The security log: attempts on an account, recorded whether or not they worked.

Two things this exists for.

The shopkeeper's: "was that me?" A sign-in from a phone in another city at 3am
is the only warning most people ever get that a password has leaked, and it is
useless unless somebody can see it. /api/auth/security-log puts it on the
account screen.

The operator's: after an incident, what actually happened. Logs that only record
successes cannot answer that.

Writing a row must never cost a shopkeeper their sign-in, so record() swallows
everything. A missing audit row is bad; a till that will not open because the
audit table is locked is worse.
"""
import logging
import time
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

import models
from config import settings

log = logging.getLogger("vendor360.audit")

# --- Event names -----------------------------------------------------------
# Past tense, dotted, and stable: these are written to the database and read
# back by the UI, so renaming one silently orphans the history.
SIGNUP = "signup"
LOGIN_SUCCESS = "login.success"          # password accepted; the code is still to come
LOGIN_FAILED = "login.failed"
LOGIN_LOCKED = "login.locked"            # refused because the account is locked
ACCOUNT_LOCKED = "account.locked"        # the failure that caused the lock
OTP_SENT = "otp.sent"
OTP_FAILED = "otp.failed"
OTP_EXHAUSTED = "otp.exhausted"          # code burned after too many wrong guesses
SIGNED_IN = "signed_in"                  # both factors passed; a session now exists
PASSWORD_CHANGED = "password.changed"
PASSWORD_RESET_REQUESTED = "password.reset_requested"
PASSWORD_RESET_COMPLETED = "password.reset_completed"
LOGOUT_ALL = "logout.all"

# What each event should read as on the account screen. Anything missing falls
# back to the raw name rather than being hidden.
DESCRIPTIONS = {
    SIGNUP: "Account created",
    LOGIN_SUCCESS: "Password accepted",
    LOGIN_FAILED: "Wrong password",
    LOGIN_LOCKED: "Blocked: account temporarily locked",
    ACCOUNT_LOCKED: "Account locked after repeated wrong passwords",
    OTP_SENT: "Verification code sent",
    OTP_FAILED: "Wrong verification code",
    OTP_EXHAUSTED: "Too many wrong codes; code cancelled",
    SIGNED_IN: "Signed in",
    PASSWORD_CHANGED: "Password changed",
    PASSWORD_RESET_REQUESTED: "Password reset link requested",
    PASSWORD_RESET_COMPLETED: "Password reset using a link",
    LOGOUT_ALL: "Signed out of all devices",
}

# Events that mean something went wrong, for the UI to colour.
DENIED = {LOGIN_FAILED, LOGIN_LOCKED, ACCOUNT_LOCKED, OTP_FAILED, OTP_EXHAUSTED}

_last_prune = 0.0
_PRUNE_INTERVAL_SECONDS = 3600


def client_ip(request: Optional[Request]) -> Optional[str]:
    """The caller's address, as well as we can know it.

    X-Forwarded-For is forgeable by anyone talking to the app directly, so this
    is evidence to a human reader, never an identity to make a decision on.
    """
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64] or None
    return (request.client.host[:64] if request.client else None)


def describe_device(user_agent: Optional[str]) -> str:
    """"Chrome on Android", from a string no shopkeeper should have to read."""
    if not user_agent:
        return "Unknown device"
    ua = user_agent.lower()

    if "iphone" in ua:
        platform = "iPhone"
    elif "ipad" in ua:
        platform = "iPad"
    elif "android" in ua:
        platform = "Android"
    elif "windows" in ua:
        platform = "Windows"
    elif "mac os" in ua or "macintosh" in ua:
        platform = "Mac"
    elif "linux" in ua:
        platform = "Linux"
    else:
        platform = "Unknown device"

    # Order matters: Edge and Chrome both claim to be Safari, and Edge also
    # claims to be Chrome.
    if "edg/" in ua:
        browser = "Edge"
    elif "opr/" in ua or "opera" in ua:
        browser = "Opera"
    elif "firefox" in ua:
        browser = "Firefox"
    elif "chrome" in ua or "crios" in ua:
        browser = "Chrome"
    elif "safari" in ua:
        browser = "Safari"
    else:
        browser = None

    return f"{browser} on {platform}" if browser else platform


def _prune(db: Session) -> None:
    """Drop rows past the retention window, at most once an hour.

    A security log is personal data -- addresses and devices -- so it should not
    be kept forever by default. Long enough to investigate, not long enough to
    become a record of somebody's movements.
    """
    global _last_prune
    now = time.monotonic()
    if now - _last_prune < _PRUNE_INTERVAL_SECONDS:
        return
    _last_prune = now

    cutoff = datetime.utcnow() - timedelta(days=settings.SECURITY_LOG_RETENTION_DAYS)
    db.query(models.SecurityEvent).filter(models.SecurityEvent.created_at < cutoff).delete(
        synchronize_session=False
    )


def record(
    db: Session,
    event: str,
    *,
    vendor: Optional[models.Vendor] = None,
    vendor_id: Optional[str] = None,
    request: Optional[Request] = None,
    identifier: Optional[str] = None,
    detail: Optional[str] = None,
) -> None:
    """Write one security event. Commits, and never raises.

    Committing here is deliberate: the interesting events are the ones on a
    request that is about to fail with a 401, and a row that rolls back with the
    rejection would record only the attempts that succeeded.
    """
    owner = vendor_id or (vendor.id if vendor is not None else None)
    agent = request.headers.get("user-agent") if request is not None else None
    try:
        db.add(
            models.SecurityEvent(
                vendor_id=owner,
                event=event,
                outcome="denied" if event in DENIED else "ok",
                # Only when unattributable: see the note on the column.
                identifier=None if owner else (identifier or "")[:200] or None,
                ip=client_ip(request),
                user_agent=(agent or "")[:300] or None,
                detail=(detail or "")[:300] or None,
            )
        )
        _prune(db)
        db.commit()
    except Exception:  # noqa: BLE001
        log.exception("Could not record security event %s", event)
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass


def recent(db: Session, vendor_id: str, limit: int = 50):
    return (
        db.query(models.SecurityEvent)
        .filter(models.SecurityEvent.vendor_id == vendor_id)
        .order_by(models.SecurityEvent.created_at.desc())
        .limit(limit)
        .all()
    )
