"""Geo helpers: approximate (privacy-preserving) map pins for non-tenant viewers.

The exact pin is only revealed to logged-in users who explicitly request it
(BR / spec: tenants see a ~150 m circle until they tap "show exact location").
The offset is deterministic per listing so the public pin doesn't jump around.
"""

from __future__ import annotations

import hashlib
import math

APPROX_RADIUS_M = 150
_OFFSET_M = 80  # guaranteed inside the 150 m circle


def _offset_angle(listing_id: str) -> float:
    digest = hashlib.sha256(f"aqar:{listing_id}".encode("utf-8")).digest()
    n = int.from_bytes(digest[:4], "big")
    return (n / 2**32) * 2 * math.pi


def approx_point(latitude: float, longitude: float, seed: str) -> tuple[float, float]:
    """Shift the true pin by a deterministic ≤80 m offset."""
    angle = _offset_angle(seed)
    dlat = (_OFFSET_M * math.cos(angle)) / 111_320.0
    denom = 111_320.0 * max(0.1, math.cos(math.radians(latitude)))
    dlon = (_OFFSET_M * math.sin(angle)) / denom
    return round(latitude + dlat, 7), round(longitude + dlon, 7)
