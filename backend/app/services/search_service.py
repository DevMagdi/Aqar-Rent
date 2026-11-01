"""Public search: filters (incl. bbox), ranking (BR-4), cursor pagination."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Literal

from sqlalchemy import and_, cast, exists, func, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.types import Text

from app.core.errors import AppError
from app.core.geo import APPROX_RADIUS_M, approx_point
from app.core.pagination import decode_cursor, encode_cursor
from app.models.catalog import Listing, ListingMedia, Location, Plan
from app.models.commerce import AdPeriod
from app.models.enums import ListingStatus, MediaType
from app.services.common import utcnow

SortKey = Literal["newest", "price_asc", "price_desc", "area"]
MAX_LIMIT = 50


@dataclass
class SearchParams:
    q: str | None = None
    governorate_id: uuid.UUID | None = None
    city_id: uuid.UUID | None = None
    district_id: uuid.UUID | None = None
    min_price: int | None = None
    max_price: int | None = None
    property_type: str | None = None
    rental_type: str | None = None
    furnished: str | None = None
    bedrooms: int | None = None
    bathrooms: int | None = None
    min_area: float | None = None
    max_area: float | None = None
    floor: int | None = None
    amenities: list[str] = field(default_factory=list)
    available_from: date | None = None
    bbox: tuple[float, float, float, float] | None = None  # minLon, minLat, maxLon, maxLat
    sort: SortKey = "newest"
    cursor: str | None = None
    limit: int = 20


def parse_bbox(raw: str | None) -> tuple[float, float, float, float] | None:
    if not raw:
        return None
    parts = [p.strip() for p in raw.split(",")]
    if len(parts) != 4:
        raise AppError("INVALID_BBOX", "bbox must be minLon,minLat,maxLon,maxLat", status_code=422)
    try:
        min_lon, min_lat, max_lon, max_lat = (float(p) for p in parts)
    except ValueError as exc:
        raise AppError("INVALID_BBOX", "bbox values must be numbers", status_code=422) from exc
    if not (-180 <= min_lon <= 180 and -90 <= min_lat <= 90 and -180 <= max_lon <= 180 and -90 <= max_lat <= 90):
        raise AppError("INVALID_BBOX", "bbox out of range", status_code=422)
    if min_lon > max_lon or min_lat > max_lat:
        raise AppError("INVALID_BBOX", "bbox corners are swapped", status_code=422)
    return (min_lon, min_lat, max_lon, max_lat)


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _ad_window(now: datetime):
    return (
        AdPeriod.listing_id == Listing.id,
        AdPeriod.status == "active",
        AdPeriod.starts_at <= now,
        AdPeriod.ends_at > now,
    )


def _filters(params: SearchParams, now: datetime) -> list[Any]:
    where: list[Any] = [
        Listing.status == ListingStatus.active.value,
        exists().where(*_ad_window(now)),  # BR-3: only paid, running ads are visible
    ]
    if params.q:
        like = f"%{_escape_like(params.q)}%"
        where.append(
            or_(
                Listing.title.like(like, escape="\\"),
                Listing.description.like(like, escape="\\"),
                Listing.address_text.like(like, escape="\\"),
            )
        )
    if params.governorate_id:
        where.append(Listing.governorate_id == params.governorate_id)
    if params.city_id:
        where.append(Listing.city_id == params.city_id)
    if params.district_id:
        where.append(Listing.district_id == params.district_id)
    if params.min_price is not None:
        where.append(Listing.rent_monthly >= params.min_price)
    if params.max_price is not None:
        where.append(Listing.rent_monthly <= params.max_price)
    if params.property_type:
        where.append(Listing.property_type == params.property_type)
    if params.rental_type:
        where.append(Listing.rental_type == params.rental_type)
    if params.furnished:
        where.append(Listing.furnished == params.furnished)
    if params.bedrooms is not None:
        where.append(Listing.bedrooms == params.bedrooms)
    if params.bathrooms is not None:
        where.append(Listing.bathrooms == params.bathrooms)
    if params.min_area is not None:
        where.append(Listing.area_m2 >= params.min_area)
    if params.max_area is not None:
        where.append(Listing.area_m2 <= params.max_area)
    if params.floor is not None:
        where.append(Listing.floor == params.floor)
    if params.available_from is not None:
        # Unit must be available on/before the tenant's wanted move-in date.
        where.append(Listing.available_from.is_(None) | (Listing.available_from <= params.available_from))
    if params.bbox:
        min_lon, min_lat, max_lon, max_lat = params.bbox
        where.append(Listing.longitude >= min_lon)
        where.append(Listing.longitude <= max_lon)
        where.append(Listing.latitude >= min_lat)
        where.append(Listing.latitude <= max_lat)
    for key in params.amenities:
        # JSON stored as {"key": true} — portable containment check (PG JSONB + SQLite).
        needle = f'"{key}": true'
        where.append(cast(Listing.amenities, Text).like(f"%{needle}%"))
    return where


def _sort_columns(sort: SortKey) -> tuple[list[tuple[Any, str]], list[Any]]:
    """Return ([(expr, direction)], cursor_types) for keyset pagination."""
    id_col = Listing.id
    if sort == "newest":
        # BR-4: newest ad start first; priority_weight reserved for future tiers.
        priority = (
            select(func.max(Plan.priority_weight))
            .join(AdPeriod, AdPeriod.plan_id == Plan.id)
            .where(*_ad_window(utcnow()))
            .correlate(Listing)
            .scalar_subquery()
        )
        ad_start = (
            select(func.max(AdPeriod.starts_at))
            .where(*_ad_window(utcnow()))
            .correlate(Listing)
            .scalar_subquery()
        )
        return (
            [(priority, "desc"), (ad_start, "desc"), (id_col, "desc")],
            ["float", "datetime", "uuid"],
        )
    if sort == "price_asc":
        return [(Listing.rent_monthly, "asc"), (id_col, "asc")], ["float", "uuid"]
    if sort == "price_desc":
        return [(Listing.rent_monthly, "desc"), (id_col, "desc")], ["float", "uuid"]
    # "area" → largest first (documented in ASSUMPTIONS.md)
    return [(Listing.area_m2, "desc"), (id_col, "desc")], ["float", "uuid"]


def _coerce(value: Any, kind: str) -> Any:
    if value is None:
        return None
    if kind == "uuid":
        return uuid.UUID(str(value))
    if kind == "datetime":
        from app.services.common import as_utc

        dt = value if isinstance(value, datetime) else datetime.fromisoformat(str(value))
        return as_utc(dt)
    if kind == "float":
        return float(value)
    return value


def _keyset_clause(
    columns: list[tuple[Any, str]], types: list[str], cursor_values: list[Any]
) -> Any:
    """(a,b,c) < (ca,cb,cc) expanded to SQL for the active direction."""
    if len(cursor_values) != len(columns):
        raise AppError("INVALID_CURSOR", "Cursor does not match sort order", status_code=400)
    clauses: list[Any] = []
    for i, ((expr, direction), kind) in enumerate(zip(columns, types)):
        value = _coerce(cursor_values[i], kind)
        strict = (expr < value) if direction == "desc" else (expr > value)
        prefix = [columns[j][0] == _coerce(cursor_values[j], types[j]) for j in range(i)]
        clauses.append(and_(*prefix, strict) if prefix else strict)
    return or_(*clauses)


def search_listings(db: Session, params: SearchParams, storage=None) -> dict[str, Any]:
    if params.limit < 1 or params.limit > MAX_LIMIT:
        raise AppError("INVALID_LIMIT", f"limit must be 1..{MAX_LIMIT}", status_code=422)
    now = utcnow()
    where = _filters(params, now)
    columns, types = _sort_columns(params.sort)

    cursor_values = decode_cursor(params.cursor)
    if cursor_values is not None:
        where.append(_keyset_clause(columns, types, cursor_values))

    stmt = (
        select(Listing)
        .where(*where)
        .order_by(*[(expr, direction) for expr, direction in columns])
        .limit(params.limit + 1)
    )
    rows = list(db.execute(stmt).scalars().all())
    has_more = len(rows) > params.limit
    rows = rows[: params.limit]

    thumb_keys = _thumb_keys(db, [r.id for r in rows])
    next_cursor = None
    if has_more and rows:
        last = rows[-1]
        if params.sort == "newest":
            priority_val, start_val = _newest_cursor_values(db, last.id, now)
            cursor_vals: list[Any] = [
                priority_val,
                start_val.isoformat(),
                str(last.id),
            ]
        elif params.sort.startswith("price"):
            cursor_vals = [float(last.rent_monthly), str(last.id)]
        else:
            cursor_vals = [float(last.area_m2), str(last.id)]
        next_cursor = encode_cursor(cursor_vals)

    items = [_item(row, thumb_keys.get(row.id), storage) for row in rows]
    return {"items": items, "next_cursor": next_cursor, "limit": params.limit}


def _newest_cursor_values(db: Session, listing_id: uuid.UUID, now: datetime):
    priority = db.execute(
        select(func.max(Plan.priority_weight))
        .join(AdPeriod, AdPeriod.plan_id == Plan.id)
        .where(AdPeriod.listing_id == listing_id, *_ad_window_expr(now))
    ).scalar_one() or 0.0
    start = db.execute(
        select(func.max(AdPeriod.starts_at)).where(
            AdPeriod.listing_id == listing_id, *_ad_window_expr(now)
        )
    ).scalar_one()
    from app.services.common import as_utc

    return float(priority), as_utc(start)


def _ad_window_expr(now: datetime):
    return (
        AdPeriod.status == "active",
        AdPeriod.starts_at <= now,
        AdPeriod.ends_at > now,
    )


def _thumb_keys(db: Session, listing_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not listing_ids:
        return {}
    rows = db.execute(
        select(ListingMedia.listing_id, ListingMedia.thumb_key, ListingMedia.file_key)
        .where(ListingMedia.listing_id.in_(listing_ids))
        .order_by(ListingMedia.sort_order)
    ).all()
    out: dict[uuid.UUID, str] = {}
    for listing_id, thumb, file_key in rows:
        out.setdefault(listing_id, thumb or file_key)
    return out


def _item(row: Listing, thumb_key: str | None, storage=None) -> dict[str, Any]:
    lat, lon = approx_point(row.latitude, row.longitude, str(row.id))
    thumb_url = None
    if thumb_key:
        thumb_url = storage.public_url(thumb_key) if storage else None
    return {
        "id": str(row.id),
        "title": row.title,
        "property_type": row.property_type,
        "rental_type": row.rental_type,
        "furnished": row.furnished,
        "rent_monthly": row.rent_monthly,
        "area_m2": row.area_m2,
        "bedrooms": row.bedrooms,
        "bathrooms": row.bathrooms,
        "floor": row.floor,
        "governorate_id": str(row.governorate_id),
        "city_id": str(row.city_id),
        "district_id": str(row.district_id) if row.district_id else None,
        "address_text": row.address_text,
        "geo": {"latitude": lat, "longitude": lon, "accuracy_m": APPROX_RADIUS_M},
        "available_from": row.available_from,
        "thumb_url": thumb_url,
        "created_at": row.created_at,
    }
