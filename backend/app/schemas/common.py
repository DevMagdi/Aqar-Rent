"""Shared schema pieces."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Msg(BaseModel):
    message: str = "ok"


class ActionOut(BaseModel):
    """Generic admin action acknowledgment."""

    id: str
    status: str
    reject_reason: str | None = None


class ErrorModel(BaseModel):
    """Standard error body: {code, message, details}."""

    code: str
    message: str
    details: Any = Field(default={})


class Page(BaseModel):
    next_cursor: str | None = None
    limit: int = 20
