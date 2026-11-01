"""Admin verification queue + decisions (BR-6 pipeline)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.api.deps import DbDep, StorageDep, client_ip, require_roles
from app.core.errors import AppError
from app.models.enums import DocStatus, StaffRole
from app.models.identity import StaffUser, User, VerificationDocument
from app.schemas.admin import VerificationDecisionIn, VerificationQueueItemOut
from app.schemas.common import ActionOut
from app.services.moderation_service import decide_verification

router = APIRouter(prefix="/verifications", tags=["admin-verifications"])


@router.get("", response_model=list[VerificationQueueItemOut], summary="Verification queue")
def verification_queue(
    db: DbDep,
    storage: StorageDep,
    staff: StaffUser = Depends(require_roles(StaffRole.moderator)),
    status: str = Query(default=DocStatus.pending.value),
) -> list[VerificationQueueItemOut]:
    rows = (
        db.execute(
            select(VerificationDocument)
            .where(VerificationDocument.status == status)
            .order_by(VerificationDocument.created_at.asc())
            .limit(200)
        )
        .scalars()
        .all()
    )
    users = (
        {u.id: u for u in db.execute(select(User).where(User.id.in_([r.user_id for r in rows]))).scalars()}
        if rows
        else {}
    )
    out = []
    for r in rows:
        u = users.get(r.user_id)
        out.append(
            VerificationQueueItemOut(
                id=str(r.id),
                user_id=str(r.user_id),
                phone=u.phone if u else "",
                full_name=u.full_name if u else None,
                doc_type=r.doc_type,
                status=r.status,
                file_url=storage.signed_url(r.file_key),  # short-lived, private
                reject_reason=r.reject_reason,
                created_at=r.created_at,
            )
        )
    return out


@router.post(
    "/{doc_id}/decision",
    response_model=ActionOut,
    summary="Approve/reject an ownership proof",
)
def decision(
    doc_id: UUID,
    payload: VerificationDecisionIn,
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.moderator)),
    ip: str = Depends(client_ip),
) -> ActionOut:
    doc = db.get(VerificationDocument, doc_id)
    if doc is None:
        raise AppError("DOC_NOT_FOUND", "Document not found", status_code=404)
    doc = decide_verification(db, staff.id, doc, payload.decision, payload.reason, ip=ip)
    return ActionOut(id=str(doc.id), status=doc.status, reject_reason=doc.reject_reason)
