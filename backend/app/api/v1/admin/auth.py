"""Staff login (email + password + TOTP 2FA) and identity."""

from __future__ import annotations

import pyotp
from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import AnyStaff, DbDep, SettingsDep, client_ip
from app.core.errors import AppError
from app.core.security import create_staff_token, verify_password
from app.models.enums import StaffStatus
from app.models.identity import StaffUser
from app.schemas.admin import AdminLoginIn, AdminMeOut, AdminTokenOut

router = APIRouter(prefix="/auth", tags=["admin-auth"])


@router.post("/login", response_model=AdminTokenOut, summary="Staff login (password + TOTP 2FA)")
def login(
    payload: AdminLoginIn,
    db: DbDep,
    settings: SettingsDep,
    ip: str = Depends(client_ip),
) -> AdminTokenOut:
    from app.core.rate_limit import check_rate_limit
    from app.services.common import utcnow

    check_rate_limit(f"admin-login:{ip}", max_hits=20, window_seconds=300)

    staff = db.execute(select(StaffUser).where(StaffUser.email == payload.email.lower())).scalar_one_or_none()
    if staff is None or staff.status != StaffStatus.active.value:
        # Same error for unknown/disabled to avoid account enumeration.
        raise AppError("INVALID_CREDENTIALS", "Invalid email, password or 2FA code", status_code=401)
    if not verify_password(payload.password, staff.password_hash):
        raise AppError("INVALID_CREDENTIALS", "Invalid email, password or 2FA code", status_code=401)
    if not staff.two_factor_secret:
        raise AppError("TWO_FACTOR_REQUIRED", "2FA is not configured for this account", status_code=403)
    if not pyotp.TOTP(staff.two_factor_secret).verify(payload.totp_code, valid_window=1):
        raise AppError("INVALID_CREDENTIALS", "Invalid email, password or 2FA code", status_code=401)

    staff.last_login_at = utcnow()
    db.flush()
    token = create_staff_token(settings, staff.id, staff.role)
    return AdminTokenOut(access_token=token, expires_in=8 * 3600, role=staff.role)


@router.get("/me", response_model=AdminMeOut, summary="Current staff identity")
def me(staff: AnyStaff) -> AdminMeOut:
    return AdminMeOut(id=str(staff.id), email=staff.email, role=staff.role, status=staff.status)
