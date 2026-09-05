"""Getting one-time codes and reset links to the shopkeeper.

This is the piece that was missing: codes were generated, hashed and stored, and
then delivered to nobody. With DEBUG_OTP correctly refused in production, that
left a deployment where no one could finish signing in.

No vendor SDK is used. `http` posts JSON to a URL you configure, which covers
MSG91, Twilio, Gupshup, an SMTP-to-HTTP bridge or an internal gateway without
this project taking on a dependency it cannot test. Placeholders in the URL,
headers and body template are filled from the message:

    {to}       recipient phone or email
    {code}     the one-time code
    {message}  the full human-readable text
    {link}     reset link, password-reset messages only

Providers must not raise: a delivery failure is logged and reported, never a
500 that tells an attacker whether an account exists.
"""
import json
import logging
import urllib.error
import urllib.request
from typing import Optional

from config import settings

log = logging.getLogger("vendor360.notify")

OTP_TEMPLATE = "{code} is your Vendor360 verification code. It expires in {minutes} minutes."
RESET_TEMPLATE = "Reset your Vendor360 password: {link} — the link expires in {minutes} minutes."


class DeliveryResult:
    __slots__ = ("delivered", "detail")

    def __init__(self, delivered: bool, detail: str = ""):
        self.delivered = delivered
        self.detail = detail

    def __bool__(self) -> bool:
        return self.delivered


def _fill(template: str, **values) -> str:
    out = template
    for key, value in values.items():
        out = out.replace("{" + key + "}", str(value if value is not None else ""))
    return out


def _send_http(to: str, message: str, code: str = "", link: str = "") -> DeliveryResult:
    """POST the message to a configured endpoint."""
    if not settings.NOTIFY_HTTP_URL:
        return DeliveryResult(False, "NOTIFY_HTTP_URL is not set")

    fields = {"to": to, "message": message, "code": code, "link": link}
    url = _fill(settings.NOTIFY_HTTP_URL, **fields)
    body = _fill(settings.NOTIFY_HTTP_BODY, **fields).encode("utf-8")

    request = urllib.request.Request(url, data=body, method=settings.NOTIFY_HTTP_METHOD)
    request.add_header("Content-Type", "application/json")
    for raw in settings.NOTIFY_HTTP_HEADERS:
        name, _, value = raw.partition(":")
        if name.strip():
            request.add_header(name.strip(), value.strip())

    try:
        with urllib.request.urlopen(request, timeout=settings.NOTIFY_TIMEOUT_SECONDS) as response:
            if 200 <= response.status < 300:
                return DeliveryResult(True, f"HTTP {response.status}")
            return DeliveryResult(False, f"HTTP {response.status}")
    except urllib.error.HTTPError as exc:
        # The provider's body can carry an account id or key; keep it out of logs.
        return DeliveryResult(False, f"HTTP {exc.code} from the delivery provider")
    except Exception as exc:  # noqa: BLE001 - a provider must never take a request down
        return DeliveryResult(False, f"{type(exc).__name__} contacting the delivery provider")


def _send_console(to: str, message: str, **_) -> DeliveryResult:
    """Development only: print it where the developer can see it."""
    log.warning("NOTIFY -> %s: %s", to, message)
    return DeliveryResult(True, "written to the server log")


def send(to: Optional[str], message: str, *, code: str = "", link: str = "") -> DeliveryResult:
    if not to:
        return DeliveryResult(False, "no phone number or email on the account")

    provider = settings.NOTIFY_PROVIDER
    if provider == "console":
        return _send_console(to, message)
    if provider == "http":
        result = _send_http(to, message, code=code, link=link)
        if not result.delivered:
            log.error("Delivery to %s failed: %s", _mask(to), result.detail)
        return result

    return DeliveryResult(False, "no delivery provider is configured (NOTIFY_PROVIDER=none)")


def send_otp(to: Optional[str], code: str) -> DeliveryResult:
    message = _fill(OTP_TEMPLATE, code=code, minutes=settings.OTP_EXPIRE_MINUTES)
    return send(to, message, code=code)


def send_password_reset(to: Optional[str], link: str) -> DeliveryResult:
    message = _fill(RESET_TEMPLATE, link=link, minutes=settings.RESET_TOKEN_EXPIRE_MINUTES)
    return send(to, message, link=link)


def _mask(value: str) -> str:
    """Enough to identify a delivery in the logs, not enough to be a contact list."""
    cleaned = value.strip()
    if "@" in cleaned:
        name, _, domain = cleaned.partition("@")
        return f"{name[:2]}***@{domain}"
    return f"***{cleaned[-4:]}" if len(cleaned) > 4 else "***"
