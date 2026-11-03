"""Owner trust: transparent levels, structured rejection reasons, appeals.

The copy is deliberately precise: Aqar Rent reviews documents; it is NOT a
government registry, and a badge never claims official notarization.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter
from fastapi import status as http_status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep
from app.core.errors import AppError
from app.models.enums import (
    VERIFICATION_REJECT_REASONS,
    AppealStatus,
    DocStatus,
)
from app.models.identity import VerificationDocument
from app.schemas.growth import AppealIn, AppealOut, TrustOut
from app.services.common import utcnow
from app.services.trust_service import trust_snapshot

router = APIRouter(tags=["trust"])


@router.get("/me/trust", response_model=TrustOut, summary="My verification level + badges")
def my_trust(user: CurrentUser, db: DbDep) -> TrustOut:
    return TrustOut(**trust_snapshot(db, user))


@router.get("/trust/reject-reasons", summary="Localizable verification rejection reasons (Public)")
def reject_reasons() -> dict:
    return {"reasons": VERIFICATION_REJECT_REASONS}


@router.post(
    "/me/verification/{doc_id}/appeal",
    response_model=AppealOut,
    status_code=http_status.HTTP_201_CREATED,
    summary="Appeal a rejected document once (re-review by a moderator)",
)
def appeal_document(doc_id: UUID, payload: AppealIn, user: CurrentUser, db: DbDep) -> AppealOut:
    doc = db.get(VerificationDocument, doc_id)
    if doc is None or doc.user_id != user.id:
        raise AppError("DOC_NOT_FOUND", "Document not found", status_code=404)
    if doc.status != DocStatus.rejected.value:
        raise AppError("INVALID_STATE", "Only rejected documents can be appealed", status_code=409)
    if doc.appeal_status != AppealStatus.none.value:
        raise AppError("APPEAL_ALREADY_FILED", "This document was already appealed", status_code=409)
    doc.appeal_status = AppealStatus.pending.value
    doc.appeal_note = payload.note
    doc.appeal_submitted_at = utcnow()
    doc.appeal_reviewed_at = None
    db.flush()
    return AppealOut(
        doc_id=str(doc.id),
        appeal_status=doc.appeal_status,
        appeal_note=doc.appeal_note,
        appeal_submitted_at=doc.appeal_submitted_at,
    )


@router.get("/me/verification/appeals", response_model=list[AppealOut], summary="My appeals")
def my_appeals(user: CurrentUser, db: DbDep) -> list[AppealOut]:
    rows = (
        db.execute(
            select(VerificationDocument)
            .where(
                VerificationDocument.user_id == user.id,
                VerificationDocument.appeal_status != AppealStatus.none.value,
            )
            .order_by(VerificationDocument.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [
        AppealOut(
            doc_id=str(d.id),
            appeal_status=d.appeal_status,
            appeal_note=d.appeal_note,
            appeal_submitted_at=d.appeal_submitted_at,
            appeal_reviewed_at=d.appeal_reviewed_at,
            decision_note=d.reject_reason,
        )
        for d in rows
    ]
