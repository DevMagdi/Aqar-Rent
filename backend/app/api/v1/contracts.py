"""Phase 4A/4B — contracts & handovers API.

Contracts: create/draft → request confirmation → both parties confirm with a
fresh OTP → immutable terms (SHA-256) → Arabic PDF (QR → public /verify page).
Handovers: check-in/check-out records attached to a confirmed contract with
media, comments, OTP confirmation and PDF export.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep, SettingsDep, StorageDep, client_ip
from app.core.errors import AppError
from app.core.rate_limit import check_rate_limit
from app.models.identity import User
from app.models.social import Contract, Handover, HandoverMedia
from app.schemas.contracts import (
    ConfirmIn,
    ContractCreateIn,
    ContractOut,
    ContractPartyOut,
    ContractPatchIn,
    FeeOrderIn,
    HandoverCreateIn,
    HandoverMediaOut,
    HandoverOut,
    HandoverPatchIn,
    PublicVerifyOut,
)
from app.services import contract_service, handover_service
from app.services.auth_service import consume_otp
from app.services.common import as_utc

router = APIRouter(tags=["contracts & handovers"])


# ── helpers ──────────────────────────────────────────────────────────────────


def _contract_out(request: Request, db, settings, contract: Contract, user: User) -> ContractOut:
    from app.core.crypto_service import decrypt_nids, mask_nid

    terms = contract.terms or {}
    parties = terms.get("party_names") or {}
    nids: dict[str, str] = {}
    if contract.ids_encrypted:
        try:
            nids = decrypt_nids(settings.secret_key, settings.contract_nid_key, contract.ids_encrypted)
        except Exception:  # noqa: BLE001 — never leak crypto errors to clients
            nids = {}

    fee_required, fee_amount, fee_status = contract_service.fee_status(db, settings, contract)

    role = "owner" if user.id == contract.owner_id else ("tenant" if user.id == contract.tenant_id else None)
    confirmed_by_me = any(e.get("user_id") == str(user.id) for e in (contract.confirmations_log or []))
    return ContractOut(
        id=str(contract.id),
        reference_no=contract.reference_no,
        listing_id=str(contract.listing_id),
        listing_title=terms.get("listing_title"),
        template=contract.template,
        status=contract.status,
        terms={k: v for k, v in terms.items() if k != "listing_title"},
        parties=[
            ContractPartyOut(
                id=str(contract.owner_id),
                role="owner",
                full_name=parties.get("owner") or "",
                phone=(db.get(User, contract.owner_id).phone if db.get(User, contract.owner_id) else ""),
                national_id_masked=mask_nid(nids.get("owner", "")) if nids.get("owner") else "***",
            ),
            ContractPartyOut(
                id=str(contract.tenant_id),
                role="tenant",
                full_name=parties.get("tenant") or "",
                phone=(db.get(User, contract.tenant_id).phone if db.get(User, contract.tenant_id) else ""),
                national_id_masked=mask_nid(nids.get("tenant", "")) if nids.get("tenant") else "***",
            ),
        ],
        terms_hash=contract.terms_hash,
        owner_confirmed_at=contract.owner_confirmed_at,
        tenant_confirmed_at=contract.tenant_confirmed_at,
        confirmations_log=list(contract.confirmations_log or []),
        fee_required=fee_required,
        fee_amount=fee_amount,
        fee_order_id=str(contract.fee_order_id) if contract.fee_order_id else None,
        fee_order_status=fee_status,
        pdf_ready=bool(contract.pdf_key),
        can_edit=contract.status == "draft" and role == "owner",
        can_confirm=contract.status == "pending_confirmation" and role is not None and not confirmed_by_me,
        created_at=as_utc(contract.created_at),
        updated_at=as_utc(contract.updated_at),
    )


def _handover_out(db, settings, handover: Handover, user: User) -> HandoverOut:
    contract = db.get(Contract, handover.contract_id)
    media_rows = list(
        db.execute(select(HandoverMedia).where(HandoverMedia.handover_id == handover.id)).scalars()
    )
    from app.services.storage import build_storage

    storage = build_storage(settings)
    role = None
    if contract is not None:
        if user.id == contract.owner_id:
            role = "owner"
        elif user.id == contract.tenant_id:
            role = "tenant"
    confirmed_by_me = str(user.id) in (handover.confirmations or {})
    return HandoverOut(
        id=str(handover.id),
        contract_id=str(handover.contract_id),
        contract_reference=contract.reference_no if contract else None,
        kind=handover.kind,
        status=handover.status,
        data=handover.data or {},
        source_handover_id=str(handover.source_handover_id) if handover.source_handover_id else None,
        hash=handover.hash,
        media=[
            HandoverMediaOut(
                id=str(m.id),
                room=m.room,
                media_type=m.media_type,
                url=storage.signed_url(m.file_key),
                note=m.note,
                added_by=str(m.added_by) if m.added_by else None,
            )
            for m in sorted(media_rows, key=lambda m: m.created_at)
        ],
        confirmations=handover.confirmations or {},
        can_edit=handover.status == "draft" and role is not None,
        can_confirm=handover.status == "draft" and role is not None and not confirmed_by_me,
        created_by=(handover.data or {}).get("created_by"),
        created_at=as_utc(handover.created_at),
        updated_at=as_utc(handover.updated_at),
    )


def _ua(request: Request) -> str | None:
    return request.headers.get("user-agent")


# ── contracts ────────────────────────────────────────────────────────────────


@router.post(
    "/contracts", response_model=ContractOut, status_code=201, summary="Create a contract draft (owner)"
)
def create_contract(
    payload: ContractCreateIn,
    request: Request,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
) -> ContractOut:
    contract = contract_service.create_contract(
        db,
        settings,
        owner=user,
        listing_id=payload.listing_id,
        template=payload.template,
        tenant_phone=payload.tenant_phone,
        national_ids=payload.national_ids,
        terms=payload.terms.model_dump(mode="json"),
    )
    db.commit()
    return _contract_out(request, db, settings, contract, user)


@router.get("/contracts", response_model=list[ContractOut], summary="My contracts (owner or tenant)")
def list_contracts(
    request: Request, user: CurrentUser, db: DbDep, settings: SettingsDep
) -> list[ContractOut]:
    rows = (
        db.execute(
            select(Contract)
            .where((Contract.owner_id == user.id) | (Contract.tenant_id == user.id))
            .order_by(Contract.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [_contract_out(request, db, settings, c, user) for c in rows]


@router.get("/contracts/{contract_id}", response_model=ContractOut, summary="Contract detail (party only)")
def get_contract(
    contract_id: UUID,
    request: Request,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
) -> ContractOut:
    contract = contract_service.get_contract_for_user(db, contract_id, user)
    return _contract_out(request, db, settings, contract, user)


@router.patch("/contracts/{contract_id}", response_model=ContractOut, summary="Edit draft terms (owner)")
def patch_contract(
    contract_id: UUID,
    payload: ContractPatchIn,
    request: Request,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
) -> ContractOut:
    contract = contract_service.get_contract_for_user(db, contract_id, user)
    contract = contract_service.patch_contract(
        db,
        contract,
        user,
        national_ids=payload.national_ids,
        terms=payload.terms.model_dump(mode="json") if payload.terms else None,
        settings=settings,
    )
    db.commit()
    return _contract_out(request, db, settings, contract, user)


@router.post(
    "/contracts/{contract_id}/request-confirmation",
    response_model=ContractOut,
    summary="Send the final text to the other party",
)
def request_confirmation(
    contract_id: UUID,
    request: Request,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
) -> ContractOut:
    contract = contract_service.get_contract_for_user(db, contract_id, user)
    contract = contract_service.request_confirmation(db, contract, user)
    db.commit()
    return _contract_out(request, db, settings, contract, user)


@router.post(
    "/contracts/{contract_id}/confirm", response_model=ContractOut, summary="Confirm with a fresh OTP"
)
def confirm(
    contract_id: UUID,
    payload: ConfirmIn,
    request: Request,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
) -> ContractOut:
    check_rate_limit(f"contract-confirm:{user.id}", max_hits=20, window_seconds=3600)
    contract = contract_service.get_contract_for_user(db, contract_id, user)
    # fresh OTP for THIS user's phone (spec: each party confirms with an OTP)
    consume_otp(db, settings, user.phone, payload.otp_code)
    contract = contract_service.confirm_contract(
        db,
        settings,
        contract,
        user,
        ip=client_ip(request),
        user_agent=_ua(request),
    )
    db.commit()
    return _contract_out(request, db, settings, contract, user)


@router.get("/contracts/{contract_id}/pdf", summary="Arabic PDF (party only, after both confirm)")
def contract_pdf(
    contract_id: UUID,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
    storage: StorageDep,
) -> Response:
    contract = contract_service.get_contract_for_user(db, contract_id, user)
    if contract.status != "confirmed":
        raise AppError("NOT_CONFIRMED", "PDF is available after both confirmations", status_code=409)
    from app.services.contract_pdf import build_contract_pdf, store_contract_pdf

    payload: bytes | None = None
    if contract.pdf_key:
        payload = storage.read(contract.pdf_key)
    if payload is None:
        owner = db.get(User, contract.owner_id)
        tenant = db.get(User, contract.tenant_id)
        if owner is None or tenant is None:  # pragma: no cover - FK guarantees
            raise AppError("PARTY_MISSING", "Contract party missing", status_code=404)
        terms = contract.terms or {}
        payload = build_contract_pdf(settings, contract, owner, tenant, terms.get("listing_title"))
        contract.pdf_key = store_contract_pdf(settings, storage, contract, payload)
        db.commit()
    return Response(
        content=payload,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="contract-{contract.reference_no}.pdf"'},
    )


class FeeOrderOut(BaseModel):
    order_id: str
    status: str
    amount: float


@router.post(
    "/contracts/{contract_id}/fee-order",
    response_model=FeeOrderOut,
    status_code=201,
    summary="Optional contract fee order (kind=contract_fee)",
)
def create_fee_order(
    contract_id: UUID,
    payload: FeeOrderIn,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
) -> FeeOrderOut:
    contract = contract_service.get_contract_for_user(db, contract_id, user)
    order = contract_service.create_fee_order(db, settings, contract, user, payload.method)
    db.commit()
    return FeeOrderOut(order_id=str(order.id), status=order.status, amount=float(order.total))


@router.get(
    "/verify/{reference_no}", response_model=PublicVerifyOut, summary="Public contract verification (no auth)"
)
def verify(reference_no: str, db: DbDep) -> PublicVerifyOut:
    result = contract_service.public_verify(db, reference_no)
    return PublicVerifyOut(**result)


# ── handovers ────────────────────────────────────────────────────────────────


@router.post(
    "/contracts/{contract_id}/handovers",
    response_model=HandoverOut,
    status_code=201,
    summary="Create check-in / check-out (from check-in)",
)
def create_handover(
    contract_id: UUID,
    payload: HandoverCreateIn,
    request: Request,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
) -> HandoverOut:
    handover = handover_service.create_handover(
        db,
        settings,
        contract_id=contract_id,
        user=user,
        kind=payload.kind,
        source_handover_id=payload.source_handover_id,
        data=payload.data.model_dump(mode="json"),
    )
    db.commit()
    return _handover_out(db, settings, handover, user)


@router.get(
    "/contracts/{contract_id}/handovers",
    response_model=list[HandoverOut],
    summary="Handovers of a contract (+ check-out pairing)",
)
def list_handovers(
    contract_id: UUID,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
) -> list[HandoverOut]:
    contract = contract_service.get_contract_for_user(db, contract_id, user)
    rows = (
        db.execute(
            select(Handover).where(Handover.contract_id == contract.id).order_by(Handover.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [_handover_out(db, settings, h, user) for h in rows]


@router.get("/handovers/{handover_id}", response_model=HandoverOut, summary="Handover detail")
def get_handover(
    handover_id: UUID,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
) -> HandoverOut:
    handover = handover_service.get_handover_for_user(db, handover_id, user)
    return _handover_out(db, settings, handover, user)


@router.patch("/handovers/{handover_id}", response_model=HandoverOut, summary="Edit a draft handover")
def patch_handover(
    handover_id: UUID,
    payload: HandoverPatchIn,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
) -> HandoverOut:
    handover = handover_service.get_handover_for_user(db, handover_id, user)
    handover = handover_service.patch_handover(db, handover, user, payload.data.model_dump(mode="json"))
    db.commit()
    return _handover_out(db, settings, handover, user)


@router.post(
    "/handovers/{handover_id}/media",
    response_model=HandoverMediaOut,
    status_code=201,
    summary="Upload photo/video for a handover room",
)
async def upload_media(
    handover_id: UUID,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
    file: UploadFile = File(...),
    room: str = Form(...),
    note: str | None = Form(default=None),
) -> HandoverMediaOut:
    check_rate_limit(f"handover-media:{user.id}", max_hits=60, window_seconds=3600)
    handover = handover_service.get_handover_for_user(db, handover_id, user)
    payload = await file.read()
    media = handover_service.add_media(
        db,
        settings,
        handover,
        user,
        room=room,
        filename=file.filename or "upload",
        content_type=file.content_type or "",
        payload=payload,
        note=note,
    )
    db.commit()
    from app.services.storage import build_storage

    storage = build_storage(settings)
    return HandoverMediaOut(
        id=str(media.id),
        room=media.room,
        media_type=media.media_type,
        url=storage.signed_url(media.file_key),
        note=media.note,
        added_by=str(media.added_by) if media.added_by else None,
    )


@router.post(
    "/handovers/{handover_id}/confirm",
    response_model=HandoverOut,
    summary="Confirm a handover with a fresh OTP",
)
def confirm_handover(
    handover_id: UUID,
    payload: ConfirmIn,
    request: Request,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
) -> HandoverOut:
    check_rate_limit(f"handover-confirm:{user.id}", max_hits=20, window_seconds=3600)
    handover = handover_service.get_handover_for_user(db, handover_id, user)
    consume_otp(db, settings, user.phone, payload.otp_code)
    handover = handover_service.confirm_handover(
        db, settings, handover, user, ip=client_ip(request), user_agent=_ua(request)
    )
    db.commit()
    return _handover_out(db, settings, handover, user)


@router.get("/handovers/{handover_id}/pdf", summary="Arabic handover PDF (party only)")
def handover_pdf(
    handover_id: UUID,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
    storage: StorageDep,
) -> Response:
    handover = handover_service.get_handover_for_user(db, handover_id, user)
    if handover.status != "confirmed":
        raise AppError("NOT_CONFIRMED", "PDF is available after both confirmations", status_code=409)
    from app.services.handover_pdf import build_handover_pdf, store_handover_pdf

    payload: bytes | None = None
    if handover.pdf_key:
        payload = storage.read(handover.pdf_key)
    contract = db.get(Contract, handover.contract_id)
    if contract is None:  # pragma: no cover - FK guarantees
        raise AppError("CONTRACT_NOT_FOUND", "Contract not found", status_code=404)
    if payload is None:
        source = db.get(Handover, handover.source_handover_id) if handover.source_handover_id else None
        parties = [db.get(User, contract.owner_id), db.get(User, contract.tenant_id)]
        payload = build_handover_pdf(settings, handover, contract, parties, source)  # type: ignore[arg-type]
        handover.pdf_key = store_handover_pdf(storage, handover, payload)
        db.commit()
    ref = contract.reference_no if contract else str(handover.id)
    return Response(
        content=payload,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="handover-{handover.kind}-{ref}.pdf"'},
    )
