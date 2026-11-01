"""JWT tokens, password/TOTP helpers and token hashing."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import bcrypt
import jwt

from app.core.config import Settings

ALGORITHM = "HS256"
KIND_ACCESS = "access"
KIND_REFRESH = "refresh"
KIND_STAFF = "staff"


def _now() -> datetime:
    return datetime.now(UTC)


def create_token(
    settings: Settings,
    *,
    subject: str,
    kind: str,
    minutes: int | None = None,
    days: int | None = None,
    extra: dict[str, Any] | None = None,
) -> str:
    payload: dict[str, Any] = {
        "sub": subject,
        "kind": kind,
        "iat": int(_now().timestamp()),
        "jti": secrets.token_hex(8),  # guarantees unique tokens even within the same second
    }
    if minutes is not None:
        payload["exp"] = int((_now() + timedelta(minutes=minutes)).timestamp())
    if days is not None:
        payload["exp"] = int((_now() + timedelta(days=days)).timestamp())
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(settings: Settings, token: str, expected_kind: str | None = None) -> dict[str, Any]:
    """Decode & validate a JWT. Raises jwt.PyJWTError on any problem."""
    payload: dict[str, Any] = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    if expected_kind is not None and payload.get("kind") != expected_kind:
        raise jwt.InvalidTokenError(f"expected kind {expected_kind}")
    return payload


def create_access_token(settings: Settings, user_id: str | UUID) -> str:
    return create_token(settings, subject=str(user_id), kind=KIND_ACCESS, minutes=settings.jwt_access_minutes)


def create_refresh_token(settings: Settings, user_id: str | UUID, device_id: str | UUID) -> str:
    return create_token(
        settings,
        subject=str(user_id),
        kind=KIND_REFRESH,
        days=settings.jwt_refresh_days,
        extra={"sid": str(device_id)},
    )


def create_staff_token(settings: Settings, staff_id: str | UUID, role: str) -> str:
    return create_token(
        settings,
        subject=str(staff_id),
        kind=KIND_STAFF,
        minutes=8 * 60,  # staff sessions last a shift
        extra={"role": role},
    )


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_otp(settings: Settings, phone: str, code: str) -> str:
    return hashlib.sha256(f"{settings.secret_key}:{phone}:{code}".encode()).hexdigest()


def generate_otp_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_password(password: str, rounds: int) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=rounds)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False
