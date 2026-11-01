"""Shared FastAPI dependencies: auth (users + staff), storage, settings, IP."""

from __future__ import annotations

from collections.abc import Callable
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.db.session import get_db
from app.models.enums import StaffRole, UserStatus
from app.models.identity import StaffUser, User
from app.services.storage import Storage

bearer_scheme = HTTPBearer(auto_error=False)

DbDep = Annotated[Session, Depends(get_db)]


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_storage(request: Request) -> Storage:
    return request.app.state.storage


def get_otp_provider(request: Request):
    return request.app.state.otp_provider


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _current_user(request: Request, db: Session, credentials: HTTPAuthorizationCredentials | None) -> User:
    from app.core.security import decode_token

    settings: Settings = request.app.state.settings
    if credentials is None or not credentials.credentials:
        raise AppError("AUTH_REQUIRED", "Authentication required", status_code=401)
    try:
        payload = decode_token(settings, credentials.credentials, expected_kind="access")
    except jwt.PyJWTError as exc:
        raise AppError("INVALID_TOKEN", "Access token is invalid or expired", status_code=401) from exc
    from app.services.common import as_uuid

    user = db.get(User, as_uuid(payload.get("sub")))
    if user is None or user.status == UserStatus.deleted:
        raise AppError("INVALID_TOKEN", "Account no longer exists", status_code=401)
    if user.status == UserStatus.banned:
        raise AppError("ACCOUNT_BANNED", "This account is banned", status_code=403)
    return user


def get_current_user(
    request: Request,
    db: DbDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    return _current_user(request, db, credentials)


def get_optional_user(
    request: Request,
    db: DbDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User | None:
    if credentials is None:
        return None
    return _current_user(request, db, credentials)


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


def _staff_from_token(request: Request, db: Session, credentials) -> StaffUser:
    from app.core.security import decode_token

    settings: Settings = request.app.state.settings
    if credentials is None or not credentials.credentials:
        raise AppError("AUTH_REQUIRED", "Staff authentication required", status_code=401)
    try:
        payload = decode_token(settings, credentials.credentials, expected_kind="staff")
    except jwt.PyJWTError as exc:
        raise AppError("INVALID_TOKEN", "Staff token is invalid or expired", status_code=401) from exc
    from app.services.common import as_uuid

    staff = db.get(StaffUser, as_uuid(payload.get("sub")))
    if staff is None or staff.status != "active":
        raise AppError("INVALID_TOKEN", "Staff account is not active", status_code=401)
    return staff


def get_any_staff(
    request: Request,
    db: DbDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> StaffUser:
    return _staff_from_token(request, db, credentials)


def require_roles(*roles: StaffRole | str) -> Callable:
    allowed = {r.value if isinstance(r, StaffRole) else r for r in roles}
    allowed.add(StaffRole.super_admin.value)  # super admin can do everything

    def dependency(
        request: Request,
        db: DbDep,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    ) -> StaffUser:
        staff = _staff_from_token(request, db, credentials)
        if staff.role not in allowed:
            raise AppError(
                "INSUFFICIENT_ROLE",
                f"Role '{staff.role}' cannot perform this action",
                status_code=403,
                details={"required_roles": sorted(allowed)},
            )
        return staff

    return dependency


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
StorageDep = Annotated[Storage, Depends(get_storage)]


AnyStaff = Annotated[StaffUser, Depends(get_any_staff)]


def uuid_path(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise AppError("NOT_FOUND", "Resource not found", status_code=404) from exc
