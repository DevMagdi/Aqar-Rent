"""GET /locations — tree browsing (Public)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import DbDep, SettingsDep
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
    settings: SettingsDep,
    parent_id: UUID | None = Query(default=None),
    level: LocationLevel | None = Query(default=None),
) -> list[LocationOut]:
    """No parent_id → governorates; parent_id → children of that node.

    Read-mostly reference data → cached (Redis when reachable, in-process
    TTL otherwise; disabled in tests).
    """
    from app.core.cache import cache_get, cache_set

    cache_key = f"locations:{parent_id or 'root'}:{level.value if level else ''}"
    cached = cache_get(cache_key, ttl_seconds=600, settings=settings)
    if cached is not None:
        return [
            LocationOut(
                id=row["id"],
                parent_id=row["parent_id"],
                level=row["level"],
                name_ar=row["name_ar"],
                name_en=row["name_en"],
            )
            for row in cached
        ]
    stmt = select(Location).order_by(Location.name_en)
    if parent_id is not None:
        stmt = stmt.where(Location.parent_id == parent_id)
    elif level is not None:
        stmt = stmt.where(Location.level == level.value)
    else:
        stmt = stmt.where(Location.level == LocationLevel.governorate.value)
    rows = db.execute(stmt.limit(500)).scalars().all()
    payload: list[dict[str, Any]] = [
        {
            "id": str(r.id),
            "parent_id": str(r.parent_id) if r.parent_id else None,
            "level": r.level,
            "name_ar": r.name_ar,
            "name_en": r.name_en,
        }
        for r in rows
    ]
    cache_set(cache_key, payload, ttl_seconds=600, settings=settings)
    return [
        LocationOut(
            id=row["id"],
            parent_id=row["parent_id"],
            level=row["level"],
            name_ar=row["name_ar"],
            name_en=row["name_en"],
        )
        for row in payload
    ]
