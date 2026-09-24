"""A small fixed-window rate limiter for the endpoints worth protecting.

Deliberately in-process and dependency-free, matching the rest of this backend.
That is honest about its limits: counters live in memory, so they reset on
restart and are per-process rather than shared across workers. It stops scripted
brute force against one server, which is the threat here; running more than one
instance means moving this to Redis, and the interface below is the seam for it.

Two dimensions are counted, because either alone is easy to walk around:
  - by client address, so one host cannot grind through an account
  - by account identifier, so a botnet cannot grind through one account either
"""
import threading
import time
from typing import Dict, Optional, Tuple

from fastapi import HTTPException, Request, status

from config import settings

_lock = threading.Lock()
# key -> (window_started_at, hits)
_buckets: Dict[str, Tuple[float, int]] = {}

# Keeps the dictionary from growing without bound on a long-running process.
_last_sweep = 0.0
_SWEEP_INTERVAL_SECONDS = 600


def _sweep(now: float) -> None:
    global _last_sweep
    if now - _last_sweep < _SWEEP_INTERVAL_SECONDS:
        return
    _last_sweep = now
    stale = [k for k, (started, _) in _buckets.items() if now - started > 3600]
    for key in stale:
        _buckets.pop(key, None)


def hit(key: str, limit: int, window_seconds: int) -> Tuple[bool, int]:
    """Count one attempt. Returns (allowed, seconds_until_reset)."""
    if not settings.RATE_LIMIT_ENABLED:
        return True, 0

    now = time.time()
    with _lock:
        _sweep(now)
        started, count = _buckets.get(key, (now, 0))
        if now - started >= window_seconds:
            started, count = now, 0
        count += 1
        _buckets[key] = (started, count)
        if count > limit:
            return False, max(1, int(window_seconds - (now - started)))
    return True, 0


def client_key(request: Optional[Request]) -> str:
    """Best available identifier for the caller.

    X-Forwarded-For is only trusted if the immediate peer (request.client.host)
    is configured in settings.TRUSTED_PROXY_IPS.
    """
    if request is None:
        return "unknown"
    client_host = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and client_host in settings.TRUSTED_PROXY_IPS:
        return forwarded.split(",")[0].strip()[:64]
    return client_host[:64]


def enforce(
    request: Optional[Request],
    scope: str,
    limit: int,
    window_seconds: int,
    identifier: Optional[str] = None,
) -> None:
    """Raise 429 when either the caller or the account has had too many tries."""
    checks = [f"{scope}:ip:{client_key(request)}"]
    if identifier:
        checks.append(f"{scope}:id:{identifier.lower()[:120]}")

    for key in checks:
        allowed, retry_after = hit(key, limit, window_seconds)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Wait a few minutes and try again.",
                headers={"Retry-After": str(retry_after)},
            )


def reset() -> None:
    """Clear all counters. For tests, and for nothing else."""
    with _lock:
        _buckets.clear()
