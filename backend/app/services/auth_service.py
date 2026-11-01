"""OTP auth flow: request → verify → tokens; refresh rotation; logout."""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import uuid4

import jwt
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.core.rate_limit import check_rate_limit
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_otp_code,
    hash_otp,
    hash_token,
)
from app.integrations.otp import OTPProvider
from app.models.enums import UserStatus
from app.models.identity import Device, OtpCode, User
from app.services.common import as_uuid, user_dict, utcnow


def request_otp(
    db: Session,
    settings: Settings,
    provider: OTPProvider,
    phone: str,
    ip: str | None = None,
) -> dict[str, Any]:
    if ip:
        check_rate_limit(f"otp:ip:{ip}", settings.otp_max_requests_per_ip_hour, window_seconds=3600)
    hour_ago = utcnow() - timedelta(hours=1)
    recent = db.execute(
        select(func.count())
        .select_from(OtpCode)
        .where(OtpCode.phone == phone, OtpCode.created_at >= hour_ago)
    ).scalar_one()
    if recent >= settings.otp_max_per_hour:
        raise AppError(
            "OTP_RATE_LIMITED",
            "Too many OTP requests for this number, try again later",
            status_code=429,
            details={"retry_after_seconds": 3600},
        )

    code = generate_otp_code()
    # Keep this hour's rows so the "max 5 requests/hour" counter works, but drop
    # stale rows; verification always uses the LATEST code, older ones are dead.
    db.execute(delete(OtpCode).where(OtpCode.phone == phone, OtpCode.created_at < hour_ago))
    db.add(
        OtpCode(
            phone=phone,
            code_hash=hash_otp(settings, phone, code),
            expires_at=utcnow() + timedelta(minutes=settings.otp_ttl_minutes),
            attempts=0,
            purpose="login",
        )
    )
    db.flush()
    provider.send(phone, code)
    return {
        "message": "OTP sent",
        "expires_in": settings.otp_ttl_minutes * 60,
        "dev_code": code if settings.debug else None,
    }


def verify_otp(
    db: Session,
    settings: Settings,
    phone: str,
    code: str,
    platform: str = "web",
    push_token: str | None = None,
) -> dict[str, Any]:
    otp = db.execute(
        select(OtpCode)
        .where(OtpCode.phone == phone, OtpCode.purpose == "login")
        .order_by(OtpCode.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()

    if otp is None:
        raise AppError("OTP_NOT_FOUND", "Request a new code first", status_code=400)
    if as_expired(otp, settings):
        db.delete(otp)
        db.flush()
        db.commit()  # persist the burn even though the response is 4xx
        raise AppError("OTP_EXPIRED", "Code expired, request a new one", status_code=400)

    if otp.attempts >= settings.otp_max_attempts:
        db.execute(delete(OtpCode).where(OtpCode.phone == phone))
        db.flush()
        db.commit()
        raise AppError("OTP_MAX_ATTEMPTS", "Too many wrong attempts, request a new code", status_code=400)

    if otp.code_hash != hash_otp(settings, phone, code):
        otp.attempts += 1
        maxed = otp.attempts >= settings.otp_max_attempts
        if maxed:
            db.execute(delete(OtpCode).where(OtpCode.phone == phone))
        db.flush()
        db.commit()  # attempts must persist across the 4xx response
        raise AppError(
            "OTP_INVALID",
            "Wrong code" + (", too many attempts — request a new one" if maxed else ""),
            status_code=400,
            details={
                "attempts_left": max(
                    0,
                    settings.otp_max_attempts - otp.attempts if not maxed else 0,
                )
            },
        )

    # Success: burn ALL codes for this number and issue tokens.
    db.execute(delete(OtpCode).where(OtpCode.phone == phone))
    user = db.execute(select(User).where(User.phone == phone)).scalar_one_or_none()
    now = utcnow()
    if user is None:
        user = User(phone=phone, language="ar")
        db.add(user)
        db.flush()
    if user.status == UserStatus.banned:
        raise AppError("ACCOUNT_BANNED", "This account is banned", status_code=403)
    if user.status == UserStatus.deleted:
        raise AppError("ACCOUNT_DELETED", "This account no longer exists", status_code=403)
    user.last_login_at = now

    device = Device(
        user_id=user.id,
        platform=platform,
        push_token=push_token,
        last_seen_at=now,
    )
    db.add(device)
    db.flush()
    return _issue_tokens(db, settings, user, device)


def as_expired(otp: OtpCode, settings: Settings) -> bool:
    from app.services.common import as_utc

    exp = as_utc(otp.expires_at)
    return exp is None or exp <= utcnow()


def _issue_tokens(db: Session, settings: Settings, user: User, device: Device) -> dict[str, Any]:
    refresh = create_refresh_token(settings, user.id, device.id)
    device.refresh_token_hash = hash_token(refresh)
    device.last_seen_at = utcnow()
    access = create_access_token(settings, user.id)
    return {
        "tokens": {
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "bearer",
            "expires_in": settings.jwt_access_minutes * 60,
        },
        "user": user_dict(user),
    }


def refresh_tokens(db: Session, settings: Settings, refresh_token: str) -> dict[str, Any]:
    try:
        payload = decode_token(settings, refresh_token, expected_kind="refresh")
    except jwt.PyJWTError as exc:
        raise AppError("INVALID_REFRESH_TOKEN", "Refresh token is invalid", status_code=401) from exc

    device_id = as_uuid(payload.get("sid"))
    device = db.get(Device, device_id) if device_id else None
    presented = hash_token(refresh_token)
    if device is None or device.refresh_token_hash != presented:
        # Token reuse / revoked session: kill it hard (must survive the 401).
        if device is not None:
            device.refresh_token_hash = None
            db.flush()
            db.commit()
        raise AppError("INVALID_REFRESH_TOKEN", "Refresh token is invalid", status_code=401)

    user = db.get(User, as_uuid(payload.get("sub")))
    if user is None or user.status != UserStatus.active:
        raise AppError("ACCOUNT_BANNED", "Account is not active", status_code=403)

    refresh = create_refresh_token(settings, user.id, device.id)
    device.refresh_token_hash = hash_token(refresh)  # rotation
    device.last_seen_at = utcnow()
    access = create_access_token(settings, user.id)
    db.flush()
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "expires_in": settings.jwt_access_minutes * 60,
    }


def logout(db: Session, settings: Settings, refresh_token: str | None) -> None:
    if not refresh_token:
        return
    try:
        payload = decode_token(settings, refresh_token, expected_kind="refresh")
    except jwt.PyJWTError:
        return  # logging out with a bad token is a no-op, never an error
    device_id = as_uuid(payload.get("sid"))
    device = db.get(Device, device_id) if device_id else None
    if device and device.refresh_token_hash == hash_token(refresh_token):
        device.refresh_token_hash = None
        db.flush()


def new_device_id() -> str:
    return str(uuid4())
