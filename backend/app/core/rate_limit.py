"""Rate limiting: Redis sliding window when reachable, in-process fallback.

- staging/prod run several uvicorn workers (and later several hosts), so the
  shared limiter lives in Redis (ZSET sliding window, one round-trip pipeline).
- dev/test (or a missing Redis) fall back to the previous in-process window —
  tests stay deterministic (`app_env=test` never touches Redis).
- The per-phone OTP limit is enforced separately in the database (shared).
"""

from __future__ import annotations

import threading
import time
import uuid
from collections import defaultdict, deque

from app.core.errors import AppError

_lock = threading.Lock()
_buckets: dict[str, deque[float]] = defaultdict(deque)


def _reject(retry_after: int) -> None:
    raise AppError(
        "RATE_LIMITED",
        "Too many requests, please try again later",
        status_code=429,
        details={"retry_after_seconds": retry_after},
    )


def _check_redis(key: str, max_hits: int, window_seconds: int, client) -> None:
    now = time.time()
    rk = f"rl:{key}"
    member = f"{now}:{uuid.uuid4().hex[:8]}"
    pipe = client.pipeline()
    pipe.zremrangebyscore(rk, 0, now - window_seconds)
    pipe.zadd(rk, {member: now})
    pipe.zcard(rk)
    pipe.expire(rk, window_seconds + 5)
    results = pipe.execute()
    count = int(results[2] or 0)
    if count > max_hits:
        # do not count the rejected attempt
        client.zrem(rk, member)
        oldest = client.zrange(rk, 0, 0, withscores=True)
        retry = window_seconds
        if oldest:
            retry = max(1, int(window_seconds - (now - oldest[0][1])))
        _reject(retry)


def check_rate_limit(key: str, max_hits: int, window_seconds: int) -> None:
    client = None
    try:
        from app.core.cache import get_redis_client

        client = get_redis_client()
    except Exception:  # noqa: BLE001 — limiter must never break a request
        client = None
    if client is not None:
        try:
            _check_redis(key, max_hits, window_seconds, client)
            return
        except AppError:
            raise
        except Exception:  # noqa: BLE001 — fall back to in-process
            pass

    now = time.monotonic()
    with _lock:
        bucket = _buckets[key]
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()
        if len(bucket) >= max_hits:
            _reject(int(window_seconds - (now - bucket[0])))
        bucket.append(now)


def reset_rate_limits() -> None:
    """Test helper — clear all in-process buckets (and Redis rl:* keys)."""
    with _lock:
        _buckets.clear()
    try:
        from app.core.cache import get_redis_client

        client = get_redis_client()
        if client is not None:
            for rk in client.scan_iter(match="rl:*"):
                client.delete(rk)
    except Exception:  # noqa: BLE001
        pass
