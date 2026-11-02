"""Moderation, verification, reports and admin audit trail.

BR-6: an owner must have an APPROVED ownership proof before their first
listing approval. Every staff action is written to audit_logs.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models.catalog import Listing, Location
from app.models.enums import (
    REJECT_REASONS,
    DocStatus,
    ListingStatus,
    LocationLevel,
    ReportStatus,
    UserVerificationStatus,
)
from app.models.identity import AuditLog, User, VerificationDocument
from app.models.social import Report
from app.services.common import utcnow
from app.services.listing_service import activate_listing  # re-export convenience  # noqa: F401


def _snapshot(obj: Any, fields: list[str]) -> dict[str, Any]:
    return {f: str(getattr(obj, f)) for f in fields}


def log_audit(
    db: Session,
    staff_id: uuid.UUID | None,
    action: str,
    entity: str,
    entity_id: uuid.UUID | str | None,
    before: dict | None,
    after: dict | None,
    ip: str | None,
) -> None:
    db.add(
        AuditLog(
            staff_id=staff_id,
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id is not None else None,
            before=before,
            after=after,
            ip=ip,
        )
    )
    db.flush()


def owner_has_approved_verification(db: Session, owner_id: uuid.UUID) -> bool:
    row = db.execute(
        select(func.count())
        .select_from(VerificationDocument)
        .where(
            VerificationDocument.user_id == owner_id,
            VerificationDocument.status == DocStatus.approved.value,
        )
    ).scalar_one()
    return row > 0


def approve_listing(db: Session, staff_id: uuid.UUID, listing: Listing, ip: str | None = None) -> Listing:
    if listing.status != ListingStatus.submitted.value:
        raise AppError(
            "INVALID_STATE",
            "Only submitted listings can be approved",
            status_code=409,
            details={"status": listing.status},
        )
    # BR-6: ownership proof approved before the FIRST listing approval.
    owner = db.get(User, listing.owner_id)
    if owner is None or not owner_has_approved_verification(db, listing.owner_id):
        raise AppError(
            "VERIFICATION_REQUIRED",
            "The owner must have an approved ownership proof before the first approval",
            status_code=409,
            details={"owner_id": str(listing.owner_id)},
        )
    before = _snapshot(listing, ["status", "reject_reason"])
    listing.status = ListingStatus.approved.value
    listing.reject_reason = None
    db.flush()
    log_audit(
        db,
        staff_id,
        "listing.approve",
        "listing",
        listing.id,
        before,
        _snapshot(listing, ["status"]),
        ip,
    )
    return listing


def reject_listing(
    db: Session,
    staff_id: uuid.UUID,
    listing: Listing,
    reason_code: str,
    note: str | None = None,
    ip: str | None = None,
) -> Listing:
    if listing.status != ListingStatus.submitted.value:
        raise AppError(
            "INVALID_STATE",
            "Only submitted listings can be rejected",
            status_code=409,
            details={"status": listing.status},
        )
    if reason_code not in REJECT_REASONS:
        raise AppError(
            "INVALID_REASON",
            "reason_code must be one of the preset reasons",
            status_code=422,
            details={"allowed": sorted(REJECT_REASONS)},
        )
    reason = REJECT_REASONS[reason_code]
    if note:
        reason = f"{reason} — {note}"
    before = _snapshot(listing, ["status", "reject_reason"])
    listing.status = ListingStatus.rejected.value
    listing.reject_reason = reason
    db.flush()
    log_audit(
        db,
        staff_id,
        "listing.reject",
        "listing",
        listing.id,
        before,
        _snapshot(listing, ["status", "reject_reason"]),
        ip,
    )
    return listing


def decide_verification(
    db: Session,
    staff_id: uuid.UUID,
    doc: VerificationDocument,
    decision: str,
    reason: str | None = None,
    ip: str | None = None,
    reason_code: str | None = None,
) -> VerificationDocument:
    if decision == "reopen":
        # Phase 5 appeal re-review: put the document back in the queue.
        if doc.appeal_status != "pending":
            raise AppError("INVALID_STATE", "No pending appeal to reopen", status_code=409)
        before = _snapshot(doc, ["status", "appeal_status"])
        doc.status = DocStatus.pending.value
        doc.appeal_status = "approved"
        doc.appeal_reviewed_at = utcnow()
        doc.reviewed_at = None
        log_audit(
            db, staff_id, "verification.appeal_reopen", "verification_document",
            doc.id, before, _snapshot(doc, ["status", "appeal_status"]), ip,
        )
        db.flush()
        return doc
    if doc.status != DocStatus.pending.value:
        raise AppError(
            "INVALID_STATE",
            "This document was already reviewed",
            status_code=409,
            details={"status": doc.status},
        )
    before = _snapshot(doc, ["status", "reject_reason"])
    doc.reviewed_by = staff_id
    doc.reviewed_at = utcnow()
    if decision == "approve":
        doc.status = DocStatus.approved.value
        doc.reject_reason = None
    elif decision == "reject":
        from app.models.enums import VERIFICATION_REJECT_REASONS

        if reason_code and reason_code not in VERIFICATION_REJECT_REASONS:
            raise AppError("INVALID_REASON_CODE", "Unknown rejection reason code", status_code=422)
        preset = VERIFICATION_REJECT_REASONS.get(reason_code or "", {})
        text = " / ".join(x for x in (preset.get("en"), preset.get("ar")) if x)
        detail = " | ".join(x for x in (text, reason) if x)
        if not detail:
            raise AppError("REASON_REQUIRED", "A reason is required to reject", status_code=422)
        doc.status = DocStatus.rejected.value
        doc.reject_reason = detail
        doc.reject_reason_code = reason_code
        doc.appeal_status = "none"
    else:
        raise AppError("INVALID_DECISION", "decision must be approve or reject", status_code=422)

    # Recompute the account-level verification badge.
    user = db.get(User, doc.user_id)
    if user is not None:
        approved = db.execute(
            select(func.count())
            .select_from(VerificationDocument)
            .where(
                VerificationDocument.user_id == user.id,
                VerificationDocument.status == DocStatus.approved.value,
            )
        ).scalar_one()
        user.verification_status = (
            UserVerificationStatus.approved.value
            if approved > 0
            else (
                UserVerificationStatus.rejected.value
                if doc.status == DocStatus.rejected.value
                else UserVerificationStatus.pending.value
            )
        )
        # Phase 5: derive the transparent trust level from evidence on file.
        from app.services.trust_service import recompute_level

        recompute_level(db, user)
    db.flush()
    log_audit(
        db,
        staff_id,
        f"verification.{decision}",
        "verification_document",
        doc.id,
        before,
        _snapshot(doc, ["status", "reject_reason"]),
        ip,
    )
    return doc


REPORT_THRESHOLD = 3


def auto_submit_reported_listing(db: Session, listing_id: uuid.UUID) -> bool:
    """3 distinct users' reports → the listing goes back to moderation (spec)."""
    distinct_reporters = db.execute(
        select(func.count(func.distinct(Report.reporter_id))).where(
            Report.listing_id == listing_id,
            Report.status.in_([ReportStatus.open.value, ReportStatus.reviewing.value]),
        )
    ).scalar_one()
    if distinct_reporters < REPORT_THRESHOLD:
        return False
    listing = db.get(Listing, listing_id)
    if listing is None or listing.status not in (
        ListingStatus.approved.value,
        ListingStatus.active.value,
    ):
        return False
    listing.status = ListingStatus.submitted.value
    db.execute(
        update(Report)
        .where(Report.listing_id == listing_id, Report.status == ReportStatus.open.value)
        .values(status=ReportStatus.reviewing.value, updated_at=utcnow())
    )
    db.flush()
    return True


def create_report(db: Session, listing: Listing, reporter: User, reason: str, note: str | None) -> Report:
    report = Report(
        listing_id=listing.id,
        reporter_id=reporter.id,
        reason=reason,
        note=note,
        status=ReportStatus.open.value,
    )
    db.add(report)
    db.flush()
    auto_submit_reported_listing(db, listing.id)
    return report


def act_on_report(
    db: Session,
    staff_id: uuid.UUID,
    report: Report,
    action: str,
    note: str | None = None,
    ip: str | None = None,
) -> Report:
    listing = db.get(Listing, report.listing_id)
    if listing is None:
        raise AppError("LISTING_NOT_FOUND", "Listing not found", status_code=404)
    before = _snapshot(report, ["status"])
    report.handled_by = staff_id
    if action == "dismiss":
        report.status = ReportStatus.dismissed.value
    elif action == "resolve":
        report.status = ReportStatus.resolved.value
    elif action == "remove_listing":
        report.status = ReportStatus.resolved.value
        lb = _snapshot(listing, ["status"])
        listing.status = ListingStatus.removed.value
        log_audit(
            db, staff_id, "listing.remove", "listing", listing.id, lb, _snapshot(listing, ["status"]), ip
        )
    elif action == "to_moderation":
        report.status = ReportStatus.reviewing.value
        if listing.status in (ListingStatus.approved.value, ListingStatus.active.value):
            lb = _snapshot(listing, ["status"])
            listing.status = ListingStatus.submitted.value
            log_audit(
                db,
                staff_id,
                "listing.to_moderation",
                "listing",
                listing.id,
                lb,
                _snapshot(listing, ["status"]),
                ip,
            )
    else:
        raise AppError("INVALID_ACTION", "Unknown report action", status_code=422)
    db.flush()
    log_audit(
        db,
        staff_id,
        f"report.{action}",
        "report",
        report.id,
        before,
        {"status": report.status, "note": note},
        ip,
    )
    return report


def location_label(db: Session, location_id: uuid.UUID | None) -> str | None:
    if location_id is None:
        return None
    loc = db.get(Location, location_id)
    return loc.name_ar if loc else None


def is_root_governorate(db: Session, location_id: uuid.UUID) -> bool:
    loc = db.get(Location, location_id)
    return loc is not None and loc.level == LocationLevel.governorate.value
