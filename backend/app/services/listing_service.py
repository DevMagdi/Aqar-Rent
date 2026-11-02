"""Listing lifecycle: create/update, media, submit, moderation-facing state helpers.

Business rules enforced here:
  BR-6  owner must have an approved ownership proof before listing approval
        (checked in moderation_service.approve_listing; upload required at submit)
  BR-7  max active listings per account (Super Admin can raise per user)
  BR-12 content rules: real photos (3–15), monthly EGP price, no phone numbers
        in description/title/photos (perceptual-hash duplicate detection)
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.core.phone import looks_like_phone
from app.models.catalog import Listing, ListingMedia, Location, Plan
from app.models.commerce import AdPeriod
from app.models.enums import (
    LISTING_CAP_STATUSES,
    ListingStatus,
    LocationLevel,
    MediaType,
)
from app.models.identity import User, VerificationDocument
from app.services.common import as_utc, utcnow
from app.services.media import (
    ALLOWED_IMAGE_TYPES,
    hamming_distance,
    process_photo,
    validate_video,
)
from app.services.storage import Storage

DEFAULT_LISTING_CAP = 5
MAX_MEDIA_PER_LISTING = 15
MIN_PHOTOS_TO_SUBMIT = 3
DUP_PHASH_DISTANCE = 6  # hamming distance considered the same photo


def check_listing_cap(db: Session, owner: User) -> None:
    cap = owner.listing_cap if owner.listing_cap is not None else DEFAULT_LISTING_CAP
    current = db.execute(
        select(func.count())
        .select_from(Listing)
        .where(Listing.owner_id == owner.id, Listing.status.in_(LISTING_CAP_STATUSES))
    ).scalar_one()
    if current >= cap:
        raise AppError(
            "LISTING_CAP_REACHED",
            f"You reached the maximum of {cap} active listings",
            status_code=409,
            details={"cap": cap, "current": current},
        )


def validate_content_rules(title: str, description: str) -> None:
    """BR-12: no phone numbers/watermark-style contacts in text fields."""
    for field, value in (("title", title), ("description", description)):
        if looks_like_phone(value):
            raise AppError(
                "CONTENT_RULE_VIOLATION",
                "Phone numbers are not allowed in the title or description",
                status_code=422,
                details={"field": field, "rule": "no_phone_numbers"},
            )


def validate_location_hierarchy(
    db: Session, governorate_id: uuid.UUID, city_id: uuid.UUID, district_id: uuid.UUID | None
) -> None:
    gov = db.get(Location, governorate_id)
    if gov is None or gov.level != LocationLevel.governorate:
        raise AppError("INVALID_LOCATION", "governorate_id is not a governorate", status_code=422)
    city = db.get(Location, city_id)
    if city is None or city.level != LocationLevel.city or city.parent_id != gov.id:
        raise AppError("INVALID_LOCATION", "city_id must belong to the given governorate", status_code=422)
    if district_id is not None:
        dist = db.get(Location, district_id)
        if dist is None or dist.level != LocationLevel.district or dist.parent_id != city.id:
            raise AppError(
                "INVALID_LOCATION",
                "district_id must belong to the given city",
                status_code=422,
            )


def create_listing(db: Session, owner: User, data: dict[str, Any]) -> Listing:
    check_listing_cap(db, owner)  # BR-7
    validate_content_rules(data.get("title", ""), data.get("description", ""))
    validate_location_hierarchy(db, data["governorate_id"], data["city_id"], data.get("district_id"))
    listing = Listing(owner_id=owner.id, status=ListingStatus.draft.value, **data)
    db.add(listing)
    db.flush()
    return listing


def get_owned_listing(db: Session, listing_id: uuid.UUID, owner: User) -> Listing:
    listing = db.get(Listing, listing_id)
    if listing is None or listing.owner_id != owner.id:
        raise AppError("LISTING_NOT_FOUND", "Listing not found", status_code=404)
    return listing


EDITABLE_STATUSES = (
    ListingStatus.draft,
    ListingStatus.rejected,
    ListingStatus.expired,
    ListingStatus.rented,
)


def update_listing(db: Session, owner: User, listing: Listing, data: dict[str, Any]) -> Listing:
    if listing.status not in EDITABLE_STATUSES:
        raise AppError(
            "LISTING_NOT_EDITABLE",
            "This listing cannot be edited in its current status",
            status_code=409,
            details={"status": listing.status},
        )
    merged_title = data.get("title", listing.title)
    merged_desc = data.get("description", listing.description)
    validate_content_rules(merged_title, merged_desc)
    if any(k in data for k in ("governorate_id", "city_id", "district_id")):
        validate_location_hierarchy(
            db,
            data.get("governorate_id", listing.governorate_id),
            data.get("city_id", listing.city_id),
            data.get("district_id", listing.district_id),
        )
    for key, value in data.items():
        setattr(listing, key, value)
    db.flush()
    return listing


def add_media(
    db: Session,
    settings: Settings,
    storage: Storage,
    listing: Listing,
    *,
    filename: str,
    content_type: str,
    payload: bytes,
    media_type: str = MediaType.photo.value,
    sort_order: int | None = None,
) -> ListingMedia:
    count = db.execute(
        select(func.count()).select_from(ListingMedia).where(ListingMedia.listing_id == listing.id)
    ).scalar_one()
    if count >= MAX_MEDIA_PER_LISTING:
        raise AppError(
            "MEDIA_LIMIT_REACHED",
            f"A listing can have at most {MAX_MEDIA_PER_LISTING} media items",
            status_code=409,
        )

    media_id = uuid.uuid4()
    if media_type == MediaType.photo.value:
        if content_type not in ALLOWED_IMAGE_TYPES:
            raise AppError("INVALID_MEDIA_TYPE", "Photos must be JPEG, PNG or WebP", status_code=415)
        photo, thumb, phash = process_photo(payload)
        file_key = f"listings/{listing.id}/media/{media_id}.jpg"
        thumb_key = f"listings/{listing.id}/media/{media_id}_thumb.jpg"
        storage.put(file_key, photo, "image/jpeg")
        storage.put(thumb_key, thumb, "image/jpeg")
    elif media_type == MediaType.video.value:
        validate_video(payload, content_type)
        file_key = f"listings/{listing.id}/media/{media_id}.mp4"
        thumb_key = None
        phash = None
        storage.put(file_key, payload, content_type)
    else:
        raise AppError("INVALID_MEDIA_TYPE", "type must be photo or video", status_code=422)

    media = ListingMedia(
        id=media_id,
        listing_id=listing.id,
        type=media_type,
        file_key=file_key,
        thumb_key=thumb_key,
        sort_order=sort_order if sort_order is not None else count,
        phash=phash,
    )
    db.add(media)
    db.flush()
    return media


def delete_media(db: Session, storage: Storage, listing: Listing, media_id: uuid.UUID) -> None:
    media = db.get(ListingMedia, media_id)
    if media is None or media.listing_id != listing.id:
        raise AppError("MEDIA_NOT_FOUND", "Media not found", status_code=404)
    storage.delete(media.file_key)
    if media.thumb_key:
        storage.delete(media.thumb_key)
    db.delete(media)
    db.flush()


def _find_duplicate_photo(db: Session, listing: Listing) -> Listing | None:
    """Same owner re-using a photo across listings → anti-broker signal."""
    media_rows = (
        db.execute(
            select(ListingMedia)
            .join(Listing, ListingMedia.listing_id == Listing.id)
            .where(
                Listing.owner_id == listing.owner_id,
                Listing.id != listing.id,
                ListingMedia.phash.is_not(None),
            )
        )
        .scalars()
        .all()
    )
    mine = (
        db.execute(
            select(ListingMedia).where(ListingMedia.listing_id == listing.id, ListingMedia.phash.is_not(None))
        )
        .scalars()
        .all()
    )
    for a in mine:
        if not a.phash:
            continue
        for b in media_rows:
            if b.phash and hamming_distance(a.phash, b.phash) <= DUP_PHASH_DISTANCE:
                return db.get(Listing, b.listing_id)
    return None


def require_verification_uploaded(db: Session, owner: User) -> None:
    """BR-6: proof must be uploaded before the first listing can be submitted."""
    has_doc = db.execute(
        select(func.count()).select_from(VerificationDocument).where(VerificationDocument.user_id == owner.id)
    ).scalar_one()
    if has_doc == 0:
        raise AppError(
            "VERIFICATION_REQUIRED",
            "Upload an ownership proof (bill/contract/ID) before submitting a listing",
            status_code=409,
            details={"endpoint": "POST /api/v1/me/verification"},
        )


def submit_listing(db: Session, owner: User, listing: Listing) -> Listing:
    if listing.status not in (ListingStatus.draft, ListingStatus.rejected):
        raise AppError(
            "INVALID_STATE",
            "Only draft or rejected listings can be submitted",
            status_code=409,
            details={"status": listing.status},
        )
    validate_content_rules(listing.title, listing.description)  # BR-12 re-check

    photos = [m for m in listing.media if m.type == MediaType.photo.value]
    if len(photos) < MIN_PHOTOS_TO_SUBMIT or len(listing.media) > MAX_MEDIA_PER_LISTING:
        raise AppError(
            "MEDIA_COUNT_INVALID",
            f"A listing needs {MIN_PHOTOS_TO_SUBMIT}–{MAX_MEDIA_PER_LISTING} photos",
            status_code=422,
            details={"photos": len(photos)},
        )

    require_verification_uploaded(db, owner)  # BR-6 (upload gate)

    dup = _find_duplicate_photo(db, listing)
    if dup is not None:
        raise AppError(
            "DUPLICATE_PHOTO",
            "One of the photos was already used in another listing",
            status_code=409,
            details={"duplicate_of_listing_id": str(dup.id)},
        )

    listing.status = ListingStatus.submitted.value
    listing.reject_reason = None
    db.flush()
    return listing


def mark_rented(db: Session, owner: User, listing: Listing) -> Listing:
    if listing.status not in (
        ListingStatus.approved,
        ListingStatus.active,
        ListingStatus.expired,
    ):
        raise AppError(
            "INVALID_STATE",
            "This listing cannot be marked as rented",
            status_code=409,
            details={"status": listing.status},
        )
    listing.status = ListingStatus.rented.value
    # Stop any running ad period early — the ad is no longer shown.
    db.execute(
        update(AdPeriod)
        .where(AdPeriod.listing_id == listing.id, AdPeriod.status == "active")
        .values(status="ended", updated_at=utcnow())
    )
    db.flush()
    return listing


def has_valid_ad(db: Session, listing_id: uuid.UUID, now=None) -> bool:
    now = now or utcnow()
    row = db.execute(
        select(AdPeriod.id)
        .where(
            AdPeriod.listing_id == listing_id,
            AdPeriod.status == "active",
            AdPeriod.starts_at <= now,
            AdPeriod.ends_at > now,
        )
        .limit(1)
    ).scalar_one_or_none()
    return row is not None


def refresh_ad_rank(db: Session, listing_id: uuid.UUID, now=None) -> None:
    """Recompute the denormalized newest-sort rank (priority, ad start).

    Called whenever ad periods start, are cancelled, refunded or expire so
    `ORDER BY ad_priority, ad_starts_at` always matches BR-4 semantics.
    """
    from app.models.catalog import Plan
    from app.models.commerce import AdPeriod

    row = db.execute(
        select(
            func.max(AdPeriod.starts_at),
            func.max(Plan.priority_weight),
        )
        .join(Plan, Plan.id == AdPeriod.plan_id)
        .where(
            AdPeriod.listing_id == listing_id,
            AdPeriod.status == "active",
        )
    ).one()
    listing = db.get(Listing, listing_id)
    if listing is None:  # pragma: no cover - FK guarantees
        return
    listing.ad_starts_at = row[0]
    listing.ad_priority = float(row[1] or 0.0)
    db.flush()


def activate_listing(
    db: Session,
    listing: Listing,
    plan: Plan,
    weeks: int,
    order_id: uuid.UUID | None = None,
    now=None,
) -> AdPeriod:
    """Open a paid ad period and make the listing publicly visible (BR-3).

    Consecutive renewal: when the listing already has a running ad period the
    new one stacks after its end (no gap, no overlap) — otherwise it starts now.
    """
    now = now or utcnow()
    latest_end = db.execute(
        select(func.max(AdPeriod.ends_at)).where(
            AdPeriod.listing_id == listing.id,
            AdPeriod.status == "active",
            AdPeriod.ends_at > now,
        )
    ).scalar_one_or_none()
    starts = as_utc(latest_end) or now
    ends = starts + timedelta(days=plan.duration_days * weeks)
    period = AdPeriod(
        listing_id=listing.id,
        plan_id=plan.id,
        order_id=order_id,
        starts_at=starts,
        ends_at=ends,
        status="active",
    )
    db.add(period)
    listing.status = ListingStatus.active.value
    if listing.published_at is None:
        listing.published_at = starts
    db.flush()
    refresh_ad_rank(db, listing.id)
    return period


def days_left_for(db: Session, listing_id: uuid.UUID, now=None) -> int | None:
    now = now or utcnow()
    ends = db.execute(
        select(func.max(AdPeriod.ends_at)).where(
            AdPeriod.listing_id == listing_id,
            AdPeriod.status == "active",
            AdPeriod.ends_at > now,
        )
    ).scalar_one_or_none()
    ends = as_utc(ends)
    if ends is None:
        return None
    return max(0, (ends - now).days)


def listing_is_publicly_visible(db: Session, listing: Listing) -> bool:
    return listing.status == ListingStatus.active.value and has_valid_ad(db, listing.id)


def location_names(db: Session, ids: list[uuid.UUID | None]) -> dict[uuid.UUID, Location]:
    clean = [i for i in ids if i is not None]
    if not clean:
        return {}
    rows = db.execute(select(Location).where(Location.id.in_(clean))).scalars().all()
    return {row.id: row for row in rows}


def today() -> date:
    return utcnow().date()
