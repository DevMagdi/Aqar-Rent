"""In-app notifications helper."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.social import Notification
from app.services.common import utcnow


def create_notification(
    db: Session,
    user_id: uuid.UUID,
    type_: str,
    title: str,
    body: str = "",
    data: dict[str, Any] | None = None,
    channel: str = "in_app",
) -> Notification:
    n = Notification(
        user_id=user_id,
        type=type_,
        title=title,
        body=body,
        data=data or {},
        channel=channel,
    )
    db.add(n)
    db.flush()
    return n


def unread_count(db: Session, user_id: uuid.UUID) -> int:
    return db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
    ).scalar_one()


def mark_read(db: Session, user_id: uuid.UUID, ids: list[str] | None) -> int:
    from uuid import UUID

    from sqlalchemy import update

    now = utcnow()
    if ids:
        parsed = [UUID(str(i)) for i in ids]
        result = db.execute(
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.id.in_(parsed),
                Notification.read_at.is_(None),
            )
            .values(read_at=now)
        )
    else:
        result = db.execute(
            update(Notification)
            .where(Notification.user_id == user_id, Notification.read_at.is_(None))
            .values(read_at=now)
        )
    db.flush()
    return int(getattr(result, "rowcount", 0) or 0)


def notification_has(db: Session, user_id: uuid.UUID, type_: str, data_key: str, data_value: str) -> bool:
    """Dedup helper for scheduled jobs (e.g. one 'ad ends in 2 days' per period)."""
    rows = (
        db.execute(
            select(Notification.data).where(Notification.user_id == user_id, Notification.type == type_)
        )
        .scalars()
        .all()
    )
    for data in rows:
        if isinstance(data, dict) and data.get(data_key) == data_value:
            return True
    return False
