"""GET /locations — tree browsing (Public)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import DbDep
from app.models.catalog import Location
from app.models.enums import LocationLevel

router = APIRouter(prefix="/locations", tags=["locations"])


class LocationOut(BaseModel):
    id: str
    parent_id: str | None = None
    level: str
    name_ar: str
    name_en: str


@router.get("", response_model=list[LocationOut], summary="List locations (Public)")
def list_locations(
    db: DbDep,
    parent_id: UUID | None = Query(default=None),
    level: LocationLevel | None = Query(default=None),
) -> list[LocationOut]:
    """No parent_id → governorates; parent_id → children of that node."""
    stmt = select(Location).order_by(Location.name_en)
    if parent_id is not None:
        stmt = stmt.where(Location.parent_id == parent_id)
    elif level is not None:
        stmt = stmt.where(Location.level == level.value)
    else:
        stmt = stmt.where(Location.level == LocationLevel.governorate.value)
    rows = db.execute(stmt.limit(500)).scalars().all()
    return [
        LocationOut(
            id=str(r.id),
            parent_id=str(r.parent_id) if r.parent_id else None,
            level=r.level,
            name_ar=r.name_ar,
            name_en=r.name_en,
        )
        for r in rows
    ]
