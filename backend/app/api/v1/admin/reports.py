"""Admin reports queue + actions."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.api.deps import DbDep, client_ip, require_roles
from app.core.errors import AppError
from app.models.catalog import Listing
from app.models.enums import StaffRole
from app.models.identity import StaffUser, User
from app.models.social import Report
from app.schemas.admin import ReportActionIn, ReportQueueItemOut
from app.schemas.common import ActionOut
from app.services.moderation_service import act_on_report

router = APIRouter(prefix="/reports", tags=["admin-reports"])


@router.get("", response_model=list[ReportQueueItemOut], summary="Reports queue")
def reports_queue(
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.moderator)),
    status: str = Query(default="open"),
) -> list[ReportQueueItemOut]:
    rows = db.execute(
        select(Report).where(Report.status == status).order_by(Report.created_at.asc()).limit(200)
    ).scalars().all()
    if not rows:
        return []
    listings = {
        l.id: l
        for l in db.execute(
            select(Listing).where(Listing.id.in_([r.listing_id for r in rows]))
        ).scalars()
    }
    reporters = {
        u.id: u
        for u in db.execute(
            select(User).where(User.id.in_([r.reporter_id for r in rows]))
        ).scalars()
    }
    return [
        ReportQueueItemOut(
            id=str(r.id),
            listing_id=str(r.listing_id),
            listing_title=listings.get(r.listing_id).title if listings.get(r.listing_id) else "",
            reporter_phone=reporters.get(r.reporter_id).phone if reporters.get(r.reporter_id) else "",
            reason=r.reason,
            note=r.note,
            status=r.status,
            listing_status=listings.get(r.listing_id).status if listings.get(r.listing_id) else "removed",
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/{report_id}/action", response_model=ActionOut, summary="Act on a report")
def action(
    report_id: UUID,
    payload: ReportActionIn,
    db: DbDep,
    staff: StaffUser = Depends(require_roles(StaffRole.moderator)),
    ip: str = Depends(client_ip),
) -> ActionOut:
    report = db.get(Report, report_id)
    if report is None:
        raise AppError("REPORT_NOT_FOUND", "Report not found", status_code=404)
    report = act_on_report(db, staff.id, report, payload.action, payload.note, ip=ip)
    return ActionOut(id=str(report.id), status=report.status)
