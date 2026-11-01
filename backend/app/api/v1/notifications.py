"""Notifications: GET /notifications, POST /notifications/read."""

from __future__ import annotations

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep
from app.models.social import Notification
from app.schemas.notifications import NotificationOut, NotificationsPage, NotificationsReadIn
from app.services.notifications import mark_read, unread_count

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationsPage, summary="My notifications")
def list_notifications(
    user: CurrentUser,
    db: DbDep,
    unread_only: bool = Query(default=False),
    limit: int = Query(default=20, ge=1, le=50),
) -> NotificationsPage:
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    rows = db.execute(stmt.order_by(Notification.created_at.desc()).limit(limit + 1)).scalars().all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    return NotificationsPage(
        items=[
            NotificationOut(
                id=str(n.id),
                type=n.type,
                title=n.title,
                body=n.body,
                data=n.data or {},
                channel=n.channel,
                read_at=n.read_at,
                created_at=n.created_at,
            )
            for n in rows
        ],
        next_cursor=str(rows[-1].id) if has_more and rows else None,
        limit=limit,
        unread_count=unread_count(db, user.id),
    )


@router.post("/read", summary="Mark notifications read (ids or all)")
def read_notifications(payload: NotificationsReadIn, user: CurrentUser, db: DbDep) -> dict:
    count = mark_read(db, user.id, payload.ids or None)
    return {"updated": count}
