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
    # --- Database -----------------------------------------------------------
    DATABASE_URL: str = os.environ.get("DATABASE_URL", "sqlite:///./vendor360.db")

    # --- Security -----------------------------------------------------------
    # A generated fallback keeps development working, but it rotates on every
    # restart (which invalidates old tokens). Always set SECRET_KEY in .env.
    SECRET_KEY: str = os.environ.get("SECRET_KEY") or secrets.token_urlsafe(48)
    SECRET_KEY_IS_EPHEMERAL: bool = "SECRET_KEY" not in os.environ
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))  # 7 days

    # --- OTP ----------------------------------------------------------------
    # There is no SMS provider wired up. In DEBUG_OTP mode the generated code is
    # returned by the login response and printed to the server console so the
    # flow is testable; the fixed code below is also accepted.
    DEBUG_OTP: bool = _get_bool("DEBUG_OTP", True)
    DEBUG_OTP_CODE: str = os.environ.get("DEBUG_OTP_CODE", "123456")
    OTP_EXPIRE_MINUTES: int = int(os.environ.get("OTP_EXPIRE_MINUTES", "10"))

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

    # --- Demo ---------------------------------------------------------------
    # Gates the sample-data endpoints. GET endpoints never write, whatever this is.
    DEMO_MODE: bool = _get_bool("DEMO_MODE", True)


settings = Settings()
