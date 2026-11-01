"""Favorites: PUT/DELETE /favorites/{listing_id}, GET /favorites."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, status as http_status
from sqlalchemy import delete, select

from app.api.deps import CurrentUser, DbDep, StorageDep
from app.core.errors import AppError
from app.models.catalog import Listing
from app.models.social import Favorite
from app.schemas.listings import FavoriteItemOut, FavoritesOut, GeoOut
from app.core.geo import APPROX_RADIUS_M, approx_point

router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.put("/{listing_id}", status_code=http_status.HTTP_200_OK, summary="Add to favorites")
def add_favorite(listing_id: UUID, user: CurrentUser, db: DbDep) -> dict:
    listing = db.get(Listing, listing_id)
    if listing is None:
        raise AppError("LISTING_NOT_FOUND", "Listing not found", status_code=404)
    existing = db.execute(
        select(Favorite).where(Favorite.user_id == user.id, Favorite.listing_id == listing_id)
    ).scalar_one_or_none()
    if existing is None:
        db.add(Favorite(user_id=user.id, listing_id=listing_id))
        db.flush()
    return {"status": "added", "listing_id": str(listing_id)}


@router.delete("/{listing_id}", summary="Remove from favorites")
def remove_favorite(listing_id: UUID, user: CurrentUser, db: DbDep) -> dict:
    db.execute(
        delete(Favorite).where(Favorite.user_id == user.id, Favorite.listing_id == listing_id)
    )
    db.flush()
    return {"status": "removed", "listing_id": str(listing_id)}


@router.get("", response_model=FavoritesOut, summary="List favorites")
def list_favorites(
    user: CurrentUser,
    db: DbDep,
    storage: StorageDep,
    limit: int = Query(default=20, ge=1, le=50),
) -> FavoritesOut:
    rows = db.execute(
        select(Listing, Favorite.id)
        .join(Favorite, Favorite.listing_id == Listing.id)
        .where(Favorite.user_id == user.id)
        .order_by(Favorite.created_at.desc())
        .limit(limit + 1)
    ).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    items: list[FavoriteItemOut] = []
    for listing, _fav_id in rows:
        lat, lon = approx_point(listing.latitude, listing.longitude, str(listing.id))
        thumb = listing.media[0].thumb_key or listing.media[0].file_key if listing.media else None
        items.append(
            FavoriteItemOut(
                id=str(listing.id),
                title=listing.title,
                property_type=listing.property_type,
                rental_type=listing.rental_type,
                furnished=listing.furnished,
                rent_monthly=listing.rent_monthly,
                area_m2=listing.area_m2,
                bedrooms=listing.bedrooms,
                bathrooms=listing.bathrooms,
                floor=listing.floor,
                governorate_id=str(listing.governorate_id),
                city_id=str(listing.city_id),
                district_id=str(listing.district_id) if listing.district_id else None,
                address_text=listing.address_text,
                geo=GeoOut(latitude=lat, longitude=lon, accuracy_m=APPROX_RADIUS_M),
                available_from=listing.available_from,
                thumb_url=storage.public_url(thumb) if thumb else None,
                created_at=listing.created_at,
                status=listing.status,
            )
        )
    return FavoritesOut(
        items=items,
        next_cursor=str(rows[-1][0].id) if has_more and rows else None,
        limit=limit,
    )
