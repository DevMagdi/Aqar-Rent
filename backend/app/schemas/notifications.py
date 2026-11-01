"""Notification schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    body: str
    data: dict = Field(default_factory=dict)
    channel: str
    read_at: datetime | None = None
    created_at: datetime | None = None


class NotificationsPage(BaseModel):
    items: list[NotificationOut]
    next_cursor: str | None = None
    limit: int = 20
    unread_count: int = 0


class NotificationsReadIn(BaseModel):
    ids: list[str] = Field(default_factory=list)  # empty = mark all read
