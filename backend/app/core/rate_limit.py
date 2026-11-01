"""In-process sliding-window rate limiter (dev/test safe; no Redis required).

The OTP per-phone limit is enforced from the database (shared across workers);
this module covers cheap per-IP/per-user guards on hot endpoints.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from app.core.errors import AppError

_lock = threading.Lock()
_buckets: dict[str, deque[float]] = defaultdict(deque)


def check_rate_limit(key: str, max_hits: int, window_seconds: int) -> None:
    now = time.monotonic()
    with _lock:
        bucket = _buckets[key]
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()
        if len(bucket) >= max_hits:
            raise AppError(
                "RATE_LIMITED",
                "Too many requests, please try again later",
                status_code=429,
                details={"retry_after_seconds": int(window_seconds - (now - bucket[0]))},
            )
        bucket.append(now)


def reset_rate_limits() -> None:
    """Test helper — clear all in-memory buckets."""
    with _lock:
        _buckets.clear()
