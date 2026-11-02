"""Cache-aside helper: Redis when reachable, in-process TTL otherwise.

Used for read-mostly reference data (locations, plans). Tests run with
`app_env=test` so caching is disabled and behavior stays deterministic.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any

logger = logging.getLogger(__name__)

_local: dict[str, tuple[float, str]] = {}
_local_lock = threading.Lock()
_redis_client = None  # lazy, built once
_redis_dead_until = 0.0


def _get_redis():
    """Return a Redis client or None (unreachable / not configured)."""
    global _redis_client, _redis_dead_until
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.redis_url:
        return None
    if time.time() < _redis_dead_until:
        return None
    if _redis_client is not None:
        return _redis_client
    try:
        import redis

        client = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=0.3, socket_timeout=0.3)
        client.ping()
        _redis_client = client
        return client
    except Exception:  # noqa: BLE001 — Redis is optional (dev falls back to memory)
        logger.debug("redis unavailable, using in-process cache", exc_info=True)
        _redis_dead_until = time.time() + 30.0
        return None


def cache_get(key: str, ttl_seconds: int, settings=None) -> Any | None:
    from app.core.config import get_settings

    settings = settings or get_settings()
    if settings.app_env == "test":
        return None
    client = _get_redis()
    if client is not None:
        try:
            raw = client.get(key)
            return json.loads(raw) if raw else None
        except Exception:  # noqa: BLE001
            logger.warning("redis get failed for %s", key, exc_info=True)
    with _local_lock:
        item = _local.get(key)
        if item is None:
            return None
        expires, raw = item
        if expires < time.time():
            _local.pop(key, None)
            return None
        return json.loads(raw)


def cache_set(key: str, value: Any, ttl_seconds: int, settings=None) -> None:
    from app.core.config import get_settings

    settings = settings or get_settings()
    if settings.app_env == "test":
        return
    raw = json.dumps(value, ensure_ascii=False)
    client = _get_redis()
    if client is not None:
        try:
            client.setex(key, ttl_seconds, raw)
            return
        except Exception:  # noqa: BLE001
            logger.warning("redis set failed for %s", key, exc_info=True)
    with _local_lock:
        _local[key] = (time.time() + ttl_seconds, raw)


def cache_invalidate(prefix: str) -> None:
    with _local_lock:
        for key in [k for k in _local if k.startswith(prefix)]:
            _local.pop(key, None)
    client = _get_redis()
    if client is not None:
        try:
            for key in client.scan_iter(match=f"{prefix}*"):
                client.delete(key)
        except Exception:  # noqa: BLE001
            logger.warning("redis invalidate failed for %s", prefix, exc_info=True)
