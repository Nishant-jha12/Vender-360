"""Application settings, read from the environment with sane development defaults.

A tiny .env loader is included so the project has no dependency on python-dotenv.
Copy .env.example to .env and edit it; anything not set falls back to the defaults
below, which are safe for local development only.
"""
import os
import secrets
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent / ".env"


def _load_env_file(path: Path) -> None:
    """Populate os.environ from a KEY=VALUE file. Existing vars always win."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file(ENV_PATH)


def _get_bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


class Settings:
    # --- Environment --------------------------------------------------------
    # Development defaults are convenient and unsafe. Setting APP_ENV=production
    # turns the convenience off and refuses to start if anything dangerous is
    # still enabled -- see validate_for_production() below. The failure mode we
    # are avoiding is a deployment that looks fine and quietly accepts "123456"
    # as anyone's second factor.
    APP_ENV: str = os.environ.get("APP_ENV", "development").strip().lower()
    IS_PRODUCTION: bool = APP_ENV == "production"

    # --- Database -----------------------------------------------------------
    DATABASE_URL: str = os.environ.get("DATABASE_URL", "sqlite:///./vendor360.db")

    # --- Security -----------------------------------------------------------
    # A generated fallback keeps development working, but it rotates on every
    # restart (which invalidates old tokens). Always set SECRET_KEY in .env.
    SECRET_KEY: str = os.environ.get("SECRET_KEY") or secrets.token_urlsafe(48)
    SECRET_KEY_IS_EPHEMERAL: bool = "SECRET_KEY" not in os.environ
    # Twelve hours, not a week: a stolen token is a live session, and there is
    # no revocation list -- only the per-vendor token epoch below.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))
    # The window between a correct password and the code that completes it.
    CHALLENGE_TOKEN_EXPIRE_MINUTES: int = int(os.environ.get("CHALLENGE_TOKEN_EXPIRE_MINUTES", "10"))

    # --- OTP ----------------------------------------------------------------
    # There is no SMS provider wired up. DEBUG_OTP returns the generated code in
    # the login response and prints it to the console so the flow is testable,
    # and accepts the fixed code below for any account. It defaults OFF: a
    # convenience that bypasses authentication must be opted into, never
    # inherited by a deployment that forgot to turn it off.
    DEBUG_OTP: bool = _get_bool("DEBUG_OTP", False)
    DEBUG_OTP_CODE: str = os.environ.get("DEBUG_OTP_CODE", "123456")
    OTP_EXPIRE_MINUTES: int = int(os.environ.get("OTP_EXPIRE_MINUTES", "10"))
    # A six-digit code is a million guesses. Without a ceiling that is minutes
    # of scripted traffic, so the code dies well before the space is explored.
    OTP_MAX_ATTEMPTS: int = int(os.environ.get("OTP_MAX_ATTEMPTS", "5"))

    # --- Stock -------------------------------------------------------------
    # Goods arriving within this many days are flagged at the confirm step, so
    # a short-dated carton can be refused rather than written off later.
    SHORT_DATED_DAYS: int = int(os.environ.get("SHORT_DATED_DAYS", "30"))

    # --- Password reset -----------------------------------------------------
    RESET_TOKEN_EXPIRE_MINUTES: int = int(os.environ.get("RESET_TOKEN_EXPIRE_MINUTES", "30"))
    # Where the reset link points. The token is appended as ?token=...
    PASSWORD_RESET_URL: str = os.environ.get(
        "PASSWORD_RESET_URL", "http://localhost:5173/auth/reset"
    )

    # --- Delivery (SMS / email) ---------------------------------------------
    # none | console | http. "none" means codes are generated and never sent,
    # which is why production refuses it.
    NOTIFY_PROVIDER: str = os.environ.get("NOTIFY_PROVIDER", "console").strip().lower()
    NOTIFY_HTTP_URL: str = os.environ.get("NOTIFY_HTTP_URL", "")
    NOTIFY_HTTP_METHOD: str = os.environ.get("NOTIFY_HTTP_METHOD", "POST").strip().upper()
    # Repeatable "Name: value" pairs, separated by |
    NOTIFY_HTTP_HEADERS: list = [
        h.strip() for h in os.environ.get("NOTIFY_HTTP_HEADERS", "").split("|") if h.strip()
    ]
    NOTIFY_HTTP_BODY: str = os.environ.get(
        "NOTIFY_HTTP_BODY", '{"to": "{to}", "message": "{message}"}'
    )
    NOTIFY_TIMEOUT_SECONDS: int = int(os.environ.get("NOTIFY_TIMEOUT_SECONDS", "8"))

    # --- Rate limiting ------------------------------------------------------
    RATE_LIMIT_ENABLED: bool = _get_bool("RATE_LIMIT_ENABLED", True)
    LOGIN_RATE_LIMIT: int = int(os.environ.get("LOGIN_RATE_LIMIT", "10"))
    LOGIN_RATE_WINDOW_SECONDS: int = int(os.environ.get("LOGIN_RATE_WINDOW_SECONDS", "300"))
    SIGNUP_RATE_LIMIT: int = int(os.environ.get("SIGNUP_RATE_LIMIT", "5"))
    SIGNUP_RATE_WINDOW_SECONDS: int = int(os.environ.get("SIGNUP_RATE_WINDOW_SECONDS", "3600"))
    OTP_RATE_LIMIT: int = int(os.environ.get("OTP_RATE_LIMIT", "15"))
    OTP_RATE_WINDOW_SECONDS: int = int(os.environ.get("OTP_RATE_WINDOW_SECONDS", "300"))

    # Largest JSON body accepted, in bytes. Guards the list-taking endpoints
    # from a body big enough to exhaust memory.
    MAX_REQUEST_BYTES: int = int(os.environ.get("MAX_REQUEST_BYTES", str(1024 * 1024)))

    # --- CORS ---------------------------------------------------------------
    # Explicit origins: "*" together with allow_credentials=True is rejected by
    # browsers, so it can never be the default here.
    CORS_ORIGINS: list = [
        o.strip()
        for o in os.environ.get(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
        ).split(",")
        if o.strip()
    ]

    # --- Docs ---------------------------------------------------------------
    # The interactive docs publish the whole API surface. Fine locally, needless
    # reconnaissance in production.
    ENABLE_DOCS: bool = _get_bool("ENABLE_DOCS", not IS_PRODUCTION)

    # --- Demo ---------------------------------------------------------------
    # Gates the sample-data endpoints, which WIPE the caller's own data before
    # seeding. GET endpoints never write, whatever this is.
    DEMO_MODE: bool = _get_bool("DEMO_MODE", not IS_PRODUCTION)


settings = Settings()


def validate_for_production() -> list:
    """Reasons this configuration must not serve real shopkeepers.

    Returned rather than raised so the caller decides: in production the app
    refuses to start, in development it warns and carries on.
    """
    problems = []

    if settings.SECRET_KEY_IS_EPHEMERAL:
        problems.append(
            "SECRET_KEY is unset, so it is regenerated on every restart. Tokens would "
            "not survive a deploy and the signing key is not under your control."
        )
    elif len(settings.SECRET_KEY) < 32:
        problems.append("SECRET_KEY is shorter than 32 characters.")

    if settings.DEBUG_OTP:
        problems.append(
            f"DEBUG_OTP is on, so the fixed code '{settings.DEBUG_OTP_CODE}' would be "
            "accepted as the second factor for every account."
        )

    if settings.DEMO_MODE:
        problems.append(
            "DEMO_MODE is on, which exposes an endpoint that deletes the caller's "
            "products, customers and sales before seeding samples."
        )

    if not settings.RATE_LIMIT_ENABLED:
        problems.append("RATE_LIMIT_ENABLED is off, leaving login and OTP open to brute force.")

    if settings.NOTIFY_PROVIDER not in ("http",):
        problems.append(
            f"NOTIFY_PROVIDER is '{settings.NOTIFY_PROVIDER}', so verification codes would "
            "be generated and never delivered -- nobody could finish signing in. Set "
            "NOTIFY_PROVIDER=http and NOTIFY_HTTP_URL."
        )
    elif not settings.NOTIFY_HTTP_URL:
        problems.append("NOTIFY_PROVIDER=http but NOTIFY_HTTP_URL is empty.")

    if settings.PASSWORD_RESET_URL.startswith("http://"):
        problems.append("PASSWORD_RESET_URL is plain HTTP; a reset link must not travel in clear.")

    insecure_origins = [
        o
        for o in settings.CORS_ORIGINS
        if o == "*" or o.startswith("http://") and "localhost" not in o and "127.0.0.1" not in o
    ]
    if insecure_origins:
        problems.append(
            "CORS_ORIGINS contains an origin that is a wildcard or plain HTTP: "
            + ", ".join(insecure_origins)
        )

    return problems
