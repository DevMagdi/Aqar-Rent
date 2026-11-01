"""GET/PATCH/DELETE /me, devices, verification, my listings & orders."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile, status as http_status
from sqlalchemy import delete, func, select

from app.api.deps import CurrentUser, DbDep, SettingsDep, StorageDep
from app.core.errors import AppError
from app.models.catalog import Listing, Location
from app.models.commerce import AdPeriod, Order
from app.models.enums import DocType, MediaType
from app.models.identity import Device, OtpCode, User, VerificationDocument
from app.models.social import ContactEvent, Favorite
from app.schemas.auth import UserOut
from app.schemas.common import Msg
from app.schemas.me import (
    DeviceIn,
    DeviceOut,
    MeListingOut,
    MePatch,
    StatsOut,
    VerificationListOut,
    VerificationOut,
)
from app.schemas.orders import OrderOut, OrdersPage
from app.services.common import user_dict
from app.services.listing_service import days_left_for, location_names
from app.services.order_service import order_to_dict

router = APIRouter(prefix="/me", tags=["me"])

ALLOWED_DOC_TYPES = {d.value for d in DocType}
MAX_DOC_BYTES = 8 * 1024 * 1024
ALLOWED_DOC_TYPES_MIME = {"image/jpeg", "image/png", "image/webp", "application/pdf"}


@router.get("", response_model=UserOut, summary="Current user profile")
def get_me(user: CurrentUser) -> UserOut:
    return UserOut(**user_dict(user))


@router.patch("", response_model=UserOut, summary="Update profile")
def patch_me(payload: MePatch, user: CurrentUser, db: DbDep) -> UserOut:
    data = payload.model_dump(exclude_unset=True)
    if "email" in data and data["email"] is not None:
        clash = db.execute(
            select(User).where(User.email == data["email"], User.id != user.id)
        ).scalar_one_or_none()
        if clash is not None:
            raise AppError("EMAIL_TAKEN", "This email is already in use", status_code=409)
    for key, value in data.items():
        setattr(user, key, value)
    db.flush()
    return UserOut(**user_dict(user))


@router.delete("", response_model=Msg, summary="Delete account (anonymize, keep financial records)")
def delete_me(user: CurrentUser, db: DbDep, storage: StorageDep) -> Msg:
    from app.models.enums import UserStatus, UserVerificationStatus

    # Financial records (orders/payments/ad periods) are kept — owner_id stays.
    user.phone = f"deleted_{user.id.hex}@anonymized.invalid"
    user.full_name = None
    user.email = None
    user.city = None
    user.status = UserStatus.deleted.value
    user.verification_status = UserVerificationStatus.unverified.value
    # PII: drop verification files + rows, devices, favorites, pending OTPs.
    docs = db.execute(
        select(VerificationDocument).where(VerificationDocument.user_id == user.id)
    ).scalars().all()
    for doc in docs:
        try:
            storage.delete(doc.file_key)
        except Exception:  # noqa: BLE001
            pass
        db.delete(doc)
    db.execute(delete(Device).where(Device.user_id == user.id))
    db.execute(delete(Favorite).where(Favorite.user_id == user.id))
    db.execute(delete(OtpCode).where(OtpCode.phone == user.phone))
    db.flush()
    return Msg(message="account anonymized")


@router.post("/devices", response_model=DeviceOut, status_code=http_status.HTTP_201_CREATED)
def register_device(payload: DeviceIn, user: CurrentUser, db: DbDep) -> DeviceOut:
    device = Device(user_id=user.id, platform=payload.platform, push_token=payload.push_token)
    db.add(device)
    db.flush()
    return DeviceOut(
        id=str(device.id),
        platform=device.platform,
        push_token=device.push_token,
        last_seen_at=device.last_seen_at,
        created_at=device.created_at,
    )


# ── Verification (BR-6 ownership proof — stored PRIVATE, signed URLs only) ────


@router.post(
    "/verification",
    response_model=VerificationOut,
    status_code=http_status.HTTP_201_CREATED,
    summary="Upload ownership proof (private)",
)
def upload_verification(
    user: CurrentUser,
    db: DbDep,
    storage: StorageDep,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
) -> VerificationOut:
    if doc_type not in ALLOWED_DOC_TYPES:
        raise AppError("INVALID_DOC_TYPE", "Unsupported document type", status_code=422,
                       details={"allowed": sorted(ALLOWED_DOC_TYPES)})
    if file.content_type not in ALLOWED_DOC_TYPES_MIME:
        raise AppError("INVALID_MEDIA_TYPE", "Document must be JPEG/PNG/WebP/PDF", status_code=415)
    payload = file.file.read(MAX_DOC_BYTES + 1)
    if len(payload) > MAX_DOC_BYTES:
        raise AppError("FILE_TOO_LARGE", "Document too large (max 8 MB)", status_code=413)

    from uuid import uuid4

    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
           "application/pdf": "pdf"}.get(file.content_type, "bin")
    key = f"users/{user.id}/verification/{uuid4()}.{ext}"
    storage.put(key, payload, file.content_type or "application/octet-stream")

    doc = VerificationDocument(user_id=user.id, file_key=key, doc_type=doc_type)
    db.add(doc)
    from app.models.enums import UserVerificationStatus

    if user.verification_status == UserVerificationStatus.unverified.value:
        user.verification_status = UserVerificationStatus.pending.value
    db.flush()
    return VerificationOut(
        id=str(doc.id),
        doc_type=doc.doc_type,
        status=doc.status,
        reject_reason=doc.reject_reason,
        file_url=storage.signed_url(doc.file_key),  # short-lived signed URL
        created_at=doc.created_at,
        reviewed_at=doc.reviewed_at,
    )


@router.get("/verification", response_model=VerificationListOut)
def get_verification(user: CurrentUser, db: DbDep, storage: StorageDep) -> VerificationListOut:
    docs = db.execute(
        select(VerificationDocument)
        .where(VerificationDocument.user_id == user.id)
        .order_by(VerificationDocument.created_at.desc())
    ).scalars().all()
    return VerificationListOut(
        items=[
            VerificationOut(
                id=str(d.id),
                doc_type=d.doc_type,
                status=d.status,
                reject_reason=d.reject_reason,
                file_url=storage.signed_url(d.file_key),
                created_at=d.created_at,
                reviewed_at=d.reviewed_at,
            )
            for d in docs
        ],
        user_verification_status=user.verification_status,
    )


# ── My listings (with stats) ─────────────────────────────────────────────────


@router.get("/listings", response_model=list[MeListingOut], summary="My listings + stats")
def my_listings(user: CurrentUser, db: DbDep, storage: StorageDep) -> list[MeListingOut]:
    rows = db.execute(
        select(Listing).where(Listing.owner_id == user.id).order_by(Listing.created_at.desc())
    ).scalars().all()
    names = location_names(
        db, [r.governorate_id for r in rows] + [r.city_id for r in rows]
    )
    # contact clicks per listing
    clicks: dict[UUID, int] = {}
    if rows:
        click_rows = db.execute(
            select(ContactEvent.listing_id, func.count())
            .where(ContactEvent.listing_id.in_([r.id for r in rows]))
            .group_by(ContactEvent.listing_id)
        ).all()
        clicks = {lid: n for lid, n in click_rows}

    out: list[MeListingOut] = []
    for row in rows:
        out.append(
            MeListingOut(
                id=str(row.id),
                title=row.title,
                status=row.status,
                reject_reason=row.reject_reason,
                rent_monthly=row.rent_monthly,
                property_type=row.property_type,
                governorate_id=str(row.governorate_id),
                city_id=str(row.city_id),
                district_id=str(row.district_id) if row.district_id else None,
                governorate_name=names.get(row.governorate_id).name_ar
                if names.get(row.governorate_id)
                else None,
                city_name=names.get(row.city_id).name_ar if names.get(row.city_id) else None,
                thumb_url=storage.public_url(row.media[0].thumb_key or row.media[0].file_key)
                if row.media
                else None,
                stats=StatsOut(
                    view_count=row.view_count,
                    contact_count=clicks.get(row.id, 0),
                    days_left=days_left_for(db, row.id),
                ),
                created_at=row.created_at,
                published_at=row.published_at,
            )
        )
    return out


# ── My orders ────────────────────────────────────────────────────────────────


@router.get("/orders", response_model=OrdersPage, summary="My orders")
def my_orders(user: CurrentUser, db: DbDep, settings: SettingsDep) -> OrdersPage:
    rows = db.execute(
        select(Order)
        .where(Order.owner_id == user.id)
        .order_by(Order.created_at.desc())
        .limit(51)
    ).scalars().all()
    has_more = len(rows) > 50
    rows = rows[:50]
    return OrdersPage(
        items=[OrderOut(**order_to_dict(o, settings)) for o in rows],
        next_cursor=None if not has_more else str(rows[-1].id),
        limit=50,
    )
