"""Cursor (keyset) pagination helpers — opaque base64 cursors."""

from __future__ import annotations

import base64
import json
from typing import Any

from app.core.errors import AppError


def encode_cursor(values: list[Any]) -> str:
    raw = json.dumps(values, default=str, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(cursor: str | None) -> list[Any] | None:
    if not cursor:
        return None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        values = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
        if not isinstance(values, list):
            raise ValueError("cursor must be a list")
        return values
    except Exception as exc:  # noqa: BLE001 - any malformed cursor is a client error
        raise AppError("INVALID_CURSOR", "Malformed pagination cursor", status_code=400) from exc
