"""Listings: CRUD + media + lifecycle + public search + detail + contact."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, File, Form, Query, Request, UploadFile
from fastapi import status as http_status

from app.api.deps import (
    CurrentUser,
    DbDep,
    OptionalUser,
    SettingsDep,
    StorageDep,
)
from app.core.errors import AppError
from app.core.geo import APPROX_RADIUS_M, approx_point
from app.core.rate_limit import check_rate_limit
from app.models.catalog import Listing
from app.models.enums import ContactChannel, ListingStatus
from app.models.identity import User
from app.models.social import ContactEvent
from app.schemas.listings import (
    ContactOut,
    GeoOut,
    ListingCreate,
    ListingDetailOut,
    ListingPatch,
    MediaOut,
    ReportIn,
    ReportOut,
    SearchResultOut,
)
from app.services import listing_service
from app.services.listing_service import get_owned_listing, listing_is_publicly_visible
from app.services.moderation_service import create_report
from app.services.search_service import SearchParams, search_listings

router = APIRouter(prefix="/listings", tags=["listings"])


def _owner_or_public_guard(db, listing: Listing, viewer: User | None) -> bool:
    is_owner = viewer is not None and viewer.id == listing.owner_id
    if is_owner:
        return True
    if listing_is_publicly_visible(db, listing):
        return True
    raise AppError("LISTING_NOT_FOUND", "Listing not found", status_code=404)


# ── Public search ────────────────────────────────────────────────────────────


@router.get("", response_model=SearchResultOut, summary="Search listings (Public)")
def search(
    db: DbDep,
    storage: StorageDep,
    q: str | None = Query(default=None, max_length=100),
    governorate_id: UUID | None = None,
    city_id: UUID | None = None,
    district_id: UUID | None = None,
    min_price: int | None = Query(default=None, ge=0),
    max_price: int | None = Query(default=None, ge=0),
    property_type: str | None = None,
    rental_type: str | None = None,
    furnished: str | None = None,
    bedrooms: int | None = Query(default=None, ge=0, le=30),
    bathrooms: int | None = Query(default=None, ge=0, le=30),
    min_area: float | None = Query(default=None, gt=0),
    max_area: float | None = Query(default=None, gt=0),
    floor: int | None = Query(default=None, ge=-5, le=100),
    amenities: list[str] | None = Query(default=None),
    available_from: date | None = None,
    bbox: str | None = Query(default=None, description="minLon,minLat,maxLon,maxLat"),
    sort: str = Query(default="newest", pattern="^(newest|price_asc|price_desc|area)$"),
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=50),
) -> SearchResultOut:
    params = SearchParams(
        q=q,
        governorate_id=governorate_id,
        city_id=city_id,
        district_id=district_id,
        min_price=min_price,
        max_price=max_price,
        property_type=property_type,
        rental_type=rental_type,
        furnished=furnished,
        bedrooms=bedrooms,
        bathrooms=bathrooms,
        min_area=min_area,
        max_area=max_area,
        floor=floor,
        amenities=amenities or [],
        available_from=available_from,
        bbox=parse_bbox_helper(bbox),
        sort=sort,  # type: ignore[arg-type]
        cursor=cursor,
        limit=limit,
    )
    result = search_listings(db, params, storage)
    return SearchResultOut(**result)


def parse_bbox_helper(raw: str | None):
    from app.services.search_service import parse_bbox

    return parse_bbox(raw)


# ── Owner CRUD ───────────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=ListingDetailOut,
    status_code=http_status.HTTP_201_CREATED,
    summary="Create a listing draft (owner)",
)
def create_listing(payload: ListingCreate, user: CurrentUser, db: DbDep) -> ListingDetailOut:
    listing = listing_service.create_listing(db, user, payload.model_dump())
    return _detail(db, listing, viewer=user, storage=None)


def _detail(
    db,
    listing: Listing,
    viewer: User | None,
    storage,
    exact: bool = False,
    count_view: bool = False,
) -> ListingDetailOut:
    is_owner = viewer is not None and viewer.id == listing.owner_id
    if count_view and not is_owner:
        listing.view_count = (listing.view_count or 0) + 1
        db.flush()

    if is_owner or exact:
        lat, lon, accuracy = listing.latitude, listing.longitude, 0
    else:
        lat, lon = approx_point(listing.latitude, listing.longitude, str(listing.id))
        accuracy = APPROX_RADIUS_M

    owner = db.get(User, listing.owner_id)
    verified_badge = bool(owner and owner.verification_status == "approved")

    return ListingDetailOut(
        id=str(listing.id),
        owner_id=str(listing.owner_id),
        title=listing.title,
        property_type=listing.property_type,
        rental_type=listing.rental_type,
        furnished=listing.furnished,
        rent_monthly=listing.rent_monthly,
        deposit_months=listing.deposit_months,
        area_m2=listing.area_m2,
        bedrooms=listing.bedrooms,
        bathrooms=listing.bathrooms,
        floor=listing.floor,
        has_elevator=listing.has_elevator,
        finishing=listing.finishing,
        building_age=listing.building_age,
        amenities=listing.amenities or {},
        description=listing.description,
        governorate_id=str(listing.governorate_id),
        city_id=str(listing.city_id),
        district_id=str(listing.district_id) if listing.district_id else None,
        address_text=listing.address_text,
        geo=GeoOut(latitude=lat, longitude=lon, accuracy_m=accuracy),
        available_from=listing.available_from,
        min_term_months=listing.min_term_months,
        status=listing.status if is_owner else None,
        reject_reason=listing.reject_reason if is_owner else None,
        view_count=listing.view_count if is_owner else None,
        verified_badge=verified_badge,
        is_owner=is_owner,
        days_left=listing_service.days_left_for(db, listing.id) if is_owner else None,
        owner_name=owner.full_name if (owner and is_owner) else None,
        media=[
            MediaOut(
                id=str(m.id),
                type=m.type,
                url=storage.public_url(m.file_key) if storage else m.file_key,
                thumb_url=storage.public_url(m.thumb_key) if storage and m.thumb_key else None,
                sort_order=m.sort_order,
            )
            for m in listing.media
        ],
        created_at=listing.created_at,
        published_at=listing.published_at,
    )


@router.get("/{listing_id}", response_model=ListingDetailOut, summary="Listing detail (Public)")
def get_listing(
    listing_id: UUID,
    db: DbDep,
    viewer: OptionalUser,
    storage: StorageDep,
    exact: bool = Query(
        default=False,
        description="Return the exact map pin — requires login (tenants tap 'show exact location')",
    ),
) -> ListingDetailOut:
    listing = db.get(Listing, listing_id)
    if listing is None:
        raise AppError("LISTING_NOT_FOUND", "Listing not found", status_code=404)
    is_owner = viewer is not None and viewer.id == listing.owner_id
    if not is_owner and not listing_is_publicly_visible(db, listing):
        raise AppError("LISTING_NOT_FOUND", "Listing not found", status_code=404)
    if exact and not is_owner:
        if viewer is None:
            raise AppError("AUTH_REQUIRED", "Login to reveal the exact location", status_code=401)
        check_rate_limit(f"exact:{viewer.id}", max_hits=120, window_seconds=3600)
    return _detail(db, listing, viewer=viewer, storage=storage, exact=exact, count_view=True)


@router.patch("/{listing_id}", response_model=ListingDetailOut, summary="Update a listing")
def patch_listing(listing_id: UUID, payload: ListingPatch, user: CurrentUser, db: DbDep) -> ListingDetailOut:
    listing = get_owned_listing(db, listing_id, user)
    data = payload.model_dump(exclude_unset=True)
    listing = listing_service.update_listing(db, user, listing, data)
    return _detail(db, listing, viewer=user, storage=None)


@router.post(
    "/{listing_id}/media",
    response_model=MediaOut,
    status_code=http_status.HTTP_201_CREATED,
    summary="Upload photo/video (max 15)",
)
def upload_media(
    listing_id: UUID,
    user: CurrentUser,
    db: DbDep,
    storage: StorageDep,
    settings: SettingsDep,
    file: UploadFile = File(...),
    media_type: str = Form(default="photo"),
) -> MediaOut:
    listing = get_owned_listing(db, listing_id, user)
    if listing.status not in (
        ListingStatus.draft.value,
        ListingStatus.rejected.value,
    ):
        raise AppError(
            "MEDIA_LOCKED",
            "Media can only be changed while the listing is a draft or rejected",
            status_code=409,
        )
    payload = file.file.read(64 * 1024 * 1024)
    media = listing_service.add_media(
        db,
        settings,
        storage,
        listing,
        filename=file.filename or "upload",
        content_type=file.content_type or "",
        payload=payload,
        media_type=media_type,
    )
    return MediaOut(
        id=str(media.id),
        type=media.type,
        url=storage.public_url(media.file_key),
        thumb_url=storage.public_url(media.thumb_key) if media.thumb_key else None,
        sort_order=media.sort_order,
    )


@router.delete("/{listing_id}/media/{media_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def remove_media(listing_id: UUID, media_id: UUID, user: CurrentUser, db: DbDep, storage: StorageDep) -> None:
    listing = get_owned_listing(db, listing_id, user)
    listing_service.delete_media(db, storage, listing, media_id)


@router.post("/{listing_id}/submit", response_model=ListingDetailOut, summary="Submit for moderation")
def submit(listing_id: UUID, user: CurrentUser, db: DbDep, storage: StorageDep) -> ListingDetailOut:
    listing = get_owned_listing(db, listing_id, user)
    listing = listing_service.submit_listing(db, user, listing)
    return _detail(db, listing, viewer=user, storage=storage)


@router.post("/{listing_id}/mark-rented", response_model=ListingDetailOut, summary="Mark as rented")
def mark_rented(listing_id: UUID, user: CurrentUser, db: DbDep) -> ListingDetailOut:
    listing = get_owned_listing(db, listing_id, user)
    listing = listing_service.mark_rented(db, user, listing)
    return _detail(db, listing, viewer=user, storage=None)


# ── Contact reveal (BR-11) ───────────────────────────────────────────────────


@router.get(
    "/{listing_id}/contact",
    response_model=ContactOut,
    summary="Reveal owner phone (logged-in users only, logged as contact event)",
)
def contact(
    listing_id: UUID,
    request: Request,
    user: CurrentUser,
    db: DbDep,
    channel: ContactChannel = Query(default=ContactChannel.show),
) -> ContactOut:
    listing = db.get(Listing, listing_id)
    if listing is None or not listing_is_publicly_visible(db, listing):
        raise AppError("LISTING_NOT_FOUND", "Listing not found", status_code=404)
    settings = request.app.state.settings
    check_rate_limit(f"contact:{user.id}", settings.contact_rate_limit_per_hour, window_seconds=3600)
    owner = db.get(User, listing.owner_id)
    if owner is None or owner.status != "active":
        raise AppError("OWNER_UNAVAILABLE", "Owner contact is not available", status_code=404)
    db.add(ContactEvent(listing_id=listing.id, user_id=user.id, channel=channel.value))
    db.flush()
    return ContactOut(phone=owner.phone, full_name=owner.full_name, channel=channel.value)


# ── Report ───────────────────────────────────────────────────────────────────


@router.post("/{listing_id}/report", response_model=ReportOut, summary="Report a listing")
def report_listing(listing_id: UUID, payload: ReportIn, user: CurrentUser, db: DbDep) -> ReportOut:
    listing = db.get(Listing, listing_id)
    if listing is None or not listing_is_publicly_visible(db, listing):
        raise AppError("LISTING_NOT_FOUND", "Listing not found", status_code=404)
    if listing.owner_id == user.id:
        raise AppError("CANNOT_REPORT_OWN", "You cannot report your own listing", status_code=400)
    check_rate_limit(f"report:{user.id}", max_hits=20, window_seconds=3600)
    report = create_report(db, listing, user, payload.reason.value, payload.note)
    return ReportOut(
        id=str(report.id),
        listing_id=str(report.listing_id),
        reason=report.reason,
        status=report.status,
        created_at=report.created_at,
    )
