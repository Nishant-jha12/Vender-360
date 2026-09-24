import logging
import math
import uuid

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import models
from config import settings, validate_for_production
from database import engine
from routers import analytics, auth, checkout, demo, intake, inventory, khata, sales, vendor

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
log = logging.getLogger("vendor360")

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Vendor360 API",
    version="2.0.0",
    description="Inventory, billing and digital khata for neighbourhood retail.",
    # The interactive docs enumerate every endpoint and schema. Useful locally,
    # free reconnaissance in production.
    docs_url="/docs" if settings.ENABLE_DOCS else None,
    redoc_url="/redoc" if settings.ENABLE_DOCS else None,
    openapi_url="/openapi.json" if settings.ENABLE_DOCS else None,
)

# Explicit origins only. "*" with allow_credentials=True is rejected by browsers,
# so it can never be the default here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    """Body ceiling, then headers that hold whether this is served as a website
    or wrapped in an app shell."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > settings.MAX_REQUEST_BYTES:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={"detail": "That request is too large."},
        )

    response = await call_next(request)

    # This API serves JSON to a separate frontend; it never renders HTML and is
    # never framed, so the policy can be as tight as it gets.
    response.headers["Content-Security-Policy"] = (
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Cross-Origin-Resource-Policy"] = "same-site"
    # Tokens and shop data must never sit in a shared cache.
    response.headers["Cache-Control"] = "no-store"

    if settings.IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )

    return response


def _sanitize_for_json(obj):
    """Recursively replace non-finite float values with JSON-compliant strings.

    Standard JSON (RFC 8259) does not permit NaN or Infinity. When Pydantic echoes
    invalid non-finite numbers in RequestValidationError, standard serializers crash with
    ValueError: Out of range float values are not JSON compliant.
    """
    if isinstance(obj, float):
        if math.isinf(obj):
            return "Infinity" if obj > 0 else "-Infinity"
        if math.isnan(obj):
            return "NaN"
        return obj
    elif isinstance(obj, dict):
        return {str(k): _sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple, set)):
        return [_sanitize_for_json(item) for item in obj]
    return obj


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    """Sanitize validation errors to guarantee valid JSON serialization.

    Pydantic echoes raw input values into the validation error detail. When non-finite
    floats (inf, -inf, nan) are supplied, standard JSON serialization (allow_nan=False)
    in Starlette/FastAPI raises a ValueError, erroneously converting a 422 client error
    into a 500 server error. Sanitizing non-finite values preserves the 422 response.
    """
    raw_errors = exc.errors()
    sanitized = _sanitize_for_json(raw_errors)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": jsonable_encoder(sanitized)},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Never let an internal error reach the client.

    A raw traceback names file paths, library versions and sometimes data. The
    reference is logged with the stack so it can be found; the caller gets the
    reference and nothing else.
    """
    reference = uuid.uuid4().hex[:12]
    log.exception("Unhandled error [%s] on %s %s", reference, request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Something went wrong on our side. Quote this reference if you report it.",
            "reference": reference,
        },
    )

# One registration per router, one decorator per route. The previous build
# mounted khata and checkout twice while their routes also hardcoded "/api/...",
# which produced paths like /api/checkout/checkout/generate-upi-qr.
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(vendor.router, prefix="/api/vendor", tags=["Vendor Profile"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["Inventory"])
app.include_router(sales.router, prefix="/api/sales", tags=["Billing"])
app.include_router(intake.router, prefix="/api/intake", tags=["Stock Intake"])
app.include_router(khata.router, prefix="/api", tags=["Digital Khata"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(checkout.router, prefix="/api/checkout", tags=["UPI Checkout"])
app.include_router(demo.router, prefix="/api/demo", tags=["Demo Data"])


@app.on_event("startup")
def startup_checks():
    problems = validate_for_production()

    if settings.IS_PRODUCTION and problems:
        # Refuse to serve rather than run a shop's takings on a configuration
        # that accepts a fixed code as anyone's second factor.
        for problem in problems:
            log.critical("REFUSING TO START: %s", problem)
        raise RuntimeError(
            "Unsafe configuration for APP_ENV=production: " + " | ".join(problems)
        )

    for problem in problems:
        log.warning("Development-only setting: %s", problem)

    if not settings.IS_PRODUCTION:
        log.warning(
            "APP_ENV=%s. Set APP_ENV=production before deploying; startup then refuses "
            "any of the above.",
            settings.APP_ENV,
        )

    if not checkout.QR_AVAILABLE:
        log.warning(
            "The 'qrcode' package is missing, so UPI QR generation will return 503. "
            "Run: pip install -r requirements.txt"
        )


@app.get("/", tags=["Health"])
def read_root():
    return {
        "service": "Vendor360 API",
        "version": "2.0.0",
        "docs": "/docs",
        "status": "ok",
    }


@app.get("/api/health", tags=["Health"])
def health():
    """Deliberately says nothing but "up".

    It used to report demo_mode and debug_otp, which told an unauthenticated
    caller whether the fixed OTP would work before they tried it.
    """
    return {"status": "ok"}
