"""Phase 5 owner-verification trust ladder (transparent, multi-level).

Level is always derived from evidence on file — never set by the client:
  phone      OTP-verified number (every account starts here)
  id         an approved national_id / id_authorization / commercial_register
  ownership  an approved ownership_contract / electricity_bill / water_bill
  premium    paid, staff-reviewed premium badge with an expiry date

Tenants see the level + badges on listing cards and detail pages. Nothing here
claims a government check: the copy says "documents reviewed by Aqar Rent".
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import (
    VERIFICATION_LEVEL_LABELS,
    VERIFICATION_LEVEL_ORDER,
    DocStatus,
    DocType,
    VerificationLevel,
)
from app.models.identity import User, VerificationDocument
from app.services.common import as_utc, utcnow

ID_DOC_TYPES = (
    DocType.national_id.value,
    DocType.id_authorization.value,
    DocType.commercial_register.value,
)
OWNERSHIP_DOC_TYPES = (
    DocType.ownership_contract.value,
    DocType.electricity_bill.value,
    DocType.water_bill.value,
)


def _approved_types(db: Session, user_id) -> set[str]:
    return set(
        db.execute(
            select(VerificationDocument.doc_type).where(
                VerificationDocument.user_id == user_id,
                VerificationDocument.status == DocStatus.approved.value,
            )
        ).scalars()
    )


def recompute_level(db: Session, user: User) -> str:
    """Recalculate and persist the account level after a review/expiry."""
    approved = _approved_types(db, user.id)
    level = VerificationLevel.phone.value
    if approved & set(ID_DOC_TYPES):
        level = VerificationLevel.id.value
    if approved & set(OWNERSHIP_DOC_TYPES):
        level = VerificationLevel.ownership.value
    premium_until = as_utc(user.premium_verified_until)
    if premium_until and premium_until > utcnow() and level == VerificationLevel.ownership.value:
        level = VerificationLevel.premium.value
    # Never silently downgrade a staff-granted premium badge while still valid.
    if (
        premium_until
        and premium_until > utcnow()
        and VERIFICATION_LEVEL_ORDER.get(user.verification_level, 0)
        == VERIFICATION_LEVEL_ORDER[VerificationLevel.premium.value]
    ):
        level = VerificationLevel.premium.value
    user.verification_level = level
    db.flush()
    return level


def trust_snapshot(db: Session, user: User) -> dict[str, Any]:
    """Public, non-PII trust payload for listing cards / detail / office pages."""
    approved = _approved_types(db, user.id)
    level = user.verification_level or VerificationLevel.phone.value
    labels = VERIFICATION_LEVEL_LABELS.get(level, VERIFICATION_LEVEL_LABELS["phone"])
    badges: list[dict[str, str]] = [
        {"code": "phone", "label_ar": "رقم موثّق برسالة", "label_en": "OTP-verified phone"}
    ]
    if approved & set(ID_DOC_TYPES):
        badges.append(
            {"code": "id", "label_ar": "الهوية مراجَعة", "label_en": "Identity documents reviewed"}
        )
    if approved & set(OWNERSHIP_DOC_TYPES):
        badges.append(
            {
                "code": "ownership",
                "label_ar": "مستندات الملكية مراجَعة",
                "label_en": "Ownership documents reviewed",
            }
        )
    if level == VerificationLevel.premium.value:
        badges.append(
            {"code": "premium", "label_ar": "تحقق مميز", "label_en": "Premium verified"}
        )
    approved_count = db.execute(
        select(func.count())
        .select_from(VerificationDocument)
        .where(
            VerificationDocument.user_id == user.id,
            VerificationDocument.status == DocStatus.approved.value,
        )
    ).scalar_one()
    return {
        "level": level,
        "rank": VERIFICATION_LEVEL_ORDER.get(level, 0),
        "label_ar": labels["ar"],
        "label_en": labels["en"],
        "verified_owner": level in (VerificationLevel.ownership.value, VerificationLevel.premium.value),
        "badges": badges,
        "documents_reviewed": int(approved_count),
        "note_ar": "مراجعة مستندات من فريق عقار رينت، وليست جهة حكومية أو توثيقاً رسمياً.",
        "note_en": "Documents reviewed by Aqar Rent staff — not a government check or notarization.",
    }
