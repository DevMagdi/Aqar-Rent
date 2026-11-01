"""POST /auth/otp/request | /auth/otp/verify | /auth/refresh | /auth/logout."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import DbDep, SettingsDep, client_ip, get_otp_provider
from app.schemas.auth import (
    AuthVerifyOut,
    LogoutIn,
    OtpRequestIn,
    OtpRequestOut,
    OtpVerifyIn,
    RefreshIn,
    TokenPairOut,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/otp/request",
    response_model=OtpRequestOut,
    summary="Request an OTP code (Public)",
    responses={429: {"description": "Rate limited"}},
)
def otp_request(
    payload: OtpRequestIn,
    db: DbDep,
    settings: SettingsDep,
    provider=Depends(get_otp_provider),
    ip: str = Depends(client_ip),
) -> OtpRequestOut:
    result = auth_service.request_otp(db, settings, provider, payload.phone, ip=ip)
    return OtpRequestOut(**result)


@router.post(
    "/otp/verify",
    response_model=AuthVerifyOut,
    summary="Verify OTP → access token (15 min) + refresh token (30 days)",
)
def otp_verify(
    payload: OtpVerifyIn,
    db: DbDep,
    settings: SettingsDep,
    provider=Depends(get_otp_provider),
) -> AuthVerifyOut:
    result = auth_service.verify_otp(
        db,
        settings,
        payload.phone,
        payload.code,
        platform=payload.platform,
        push_token=payload.push_token,
    )
    return AuthVerifyOut(**result)


@router.post("/refresh", response_model=TokenPairOut, summary="Rotate refresh token")
def refresh(payload: RefreshIn, db: DbDep, settings: SettingsDep) -> TokenPairOut:
    return TokenPairOut(**auth_service.refresh_tokens(db, settings, payload.refresh_token))


@router.post("/logout", summary="Revoke a refresh token (idempotent)")
def logout(payload: LogoutIn, db: DbDep, settings: SettingsDep) -> dict:
    auth_service.logout(db, settings, payload.refresh_token)
    return {"message": "logged out"}
