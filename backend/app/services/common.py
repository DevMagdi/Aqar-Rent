"""Small shared service helpers."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.identity import User


def utcnow() -> datetime:
    return datetime.now(UTC)


def as_uuid(value: Any) -> Any:
    """JWT claims carry string ids; Uuid columns need real UUIDs on db.get()."""
    from uuid import UUID

    if value is None or isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except ValueError:
        return None


def as_utc(dt: datetime | None) -> datetime | None:
    """SQLite drops tzinfo; normalize before comparing with aware datetimes."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def get_user_or_none(db: Session, user_id: Any) -> User | None:
    return db.get(User, user_id)


def user_dict(user: User) -> dict[str, Any]:
    return {
        "id": str(user.id),
        "phone": user.phone,
        "full_name": user.full_name,
        "email": user.email,
        "city": user.city,
        "language": user.language,
        "status": user.status,
        "verification_status": user.verification_status,
        "account_type": user.account_type,
        "verification_level": user.verification_level,
        "premium_verified_until": user.premium_verified_until,
        "created_at": user.created_at,
    }


def one(db: Session, stmt):  # thin select().scalar_one_or_none shortcut
    return db.execute(stmt).scalar_one_or_none()


def scalars(db: Session, stmt) -> list[Any]:
    return list(db.execute(stmt).scalars().all())
