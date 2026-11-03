"""Contract lifecycle: templates → draft → both-party OTP confirmation →
immutable final terms (SHA-256) → Arabic PDF with QR verification.

Rules (spec):
* clause text lives in editable template files under `app/contract_templates/`
  (override with CONTRACT_TEMPLATE_DIR) — never hard-coded in Python;
* templates are production-grade Arabic PRIVATE-AGREEMENT clauses with an
  explicit legal notice (no claim of notarization / executive force);
* the second party is invited by phone and must OTP-login to view/confirm;
* each party confirms the final text with a fresh OTP; both confirmations make
  the contract immutable and stamp hash / timestamps / IPs / device info;
* national IDs are encrypted at rest (Fernet) and never logged or returned
  in full over the API (masked for the parties, full only inside the PDF).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.crypto_service import decrypt_nids, encrypt_nids, terms_hash
from app.core.errors import AppError
from app.core.rate_limit import check_rate_limit
from app.models.identity import User
from app.models.social import Contract
from app.services.common import utcnow
from app.services.notifications import create_notification

logger = logging.getLogger(__name__)

DEFAULT_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "contract_templates"
DISCLAIMER = (
    "إشعار قانوني: هذا اتفاق خاص بين الطرفين؛ ليس عقداً موثّقاً ولا مسجّلاً رسمياً وليس سنداً تنفيذياً، "
    "ولا يُغني عن التسجيل أو التوثيق لدى الجهات المختصة. / LEGAL NOTICE: this is a private agreement; "
    "it is not notarized, not officially registered, is not an executive instrument, and does not "
    "replace official registration or notarization."
)
LEGAL_NOTICE = (
    "اتفاق خاص بين الطرفين — لا يُغني عن التوثيق أو التسجيل الرسمي، ولا يُعد سنداً تنفيذياً. "
    "يرجى استشارة محامٍ مصري عند الحاجة."
)
# Kept as an alias for older PDF code / external imports; the wording is now
# a legal notice, never "draft / requires lawyer review".
DRAFT_BANNER = LEGAL_NOTICE

TEMPLATE_IDS = ("residential_unfurnished", "residential_furnished", "commercial")


def template_dir(settings: Settings) -> Path:
    if settings.contract_template_dir:
        return Path(settings.contract_template_dir)
    return DEFAULT_TEMPLATE_DIR


def load_template(settings: Settings, template_id: str) -> str:
    if template_id not in TEMPLATE_IDS:
        raise AppError("INVALID_TEMPLATE", "Unknown contract template", status_code=422)
    path = template_dir(settings) / f"{template_id}.txt"
    if not path.is_file():
        raise AppError("TEMPLATE_MISSING", f"Template file missing: {path.name}", status_code=500)
    return path.read_text(encoding="utf-8")


def render_template(text: str, values: dict[str, str]) -> str:
    out = text
    for key, value in values.items():
        out = out.replace("{{" + key + "}}", value)
    return out


def contract_values(settings: Settings, contract: Contract, owner: User, tenant: User) -> dict[str, str]:
    """Placeholders for the rendered Arabic clause text."""
    nids = decrypt_nids(settings.secret_key, settings.contract_nid_key, contract.ids_encrypted or "")
    t = contract.terms or {}
    parties = t.get("party_names") or {}
    site = settings.site_url.rstrip("/")
    return {
        "reference_no": contract.reference_no,
        "verify_url": f"{site}/verify/{contract.reference_no}",
        "owner_name": parties.get("owner") or owner.full_name or "",
        "tenant_name": parties.get("tenant") or tenant.full_name or "",
        "owner_nid": nids.get("owner", ""),
        "tenant_nid": nids.get("tenant", ""),
        "unit_address": str(t.get("unit_address", "")),
        "start_date": str(t.get("start_date", "")),
        "duration_months": str(t.get("duration_months", "")),
        "monthly_rent": str(t.get("monthly_rent", "")),
        "yearly_increase_pct": str(t.get("yearly_increase_pct", "")),
        "deposit_amount": str(t.get("deposit_amount", "")),
        "deposit_refund_days": str(t.get("deposit_refund_days", 30)),
        "payment_day": str(t.get("payment_day", 1)),
        "utilities_responsibility": str(t.get("utilities_responsibility", "")),
        "termination_terms": str(t.get("termination_terms", "")),
        "extra_notes": str(t.get("extra_notes", "")),
    }


def ensure_party_by_phone(db: Session, phone: str) -> User:
    """The invitee may not be registered yet — create the account shell so the
    contract has a tenant; they OTP-login with the same phone to reach it."""
    from app.core.phone import normalize_phone

    phone = normalize_phone(phone)
    user = db.execute(select(User).where(User.phone == phone)).scalar_one_or_none()
    if user is None:
        user = User(phone=phone, language="ar")
        db.add(user)
        db.flush()
    return user


def _party_role(contract: Contract, user: User) -> str | None:
    if user.id == contract.owner_id:
        return "owner"
    if user.id == contract.tenant_id:
        return "tenant"
    return None


def _final_payload(settings: Settings, contract: Contract, owner: User, tenant: User) -> dict[str, Any]:
    """Everything that must be frozen: template + terms + parties + encrypted NIDs."""
    return {
        "reference_no": contract.reference_no,
        "template": contract.template,
        "listing_id": str(contract.listing_id),
        "owner_id": str(contract.owner_id),
        "tenant_id": str(contract.tenant_id),
        "terms": contract.terms or {},
        "ids_encrypted": contract.ids_encrypted or "",
        "owner_name": owner.full_name or "",
        "tenant_name": tenant.full_name or "",
    }


def new_reference(db: Session) -> str:
    """AR-YYYYMM-XXXXXX, unique."""
    import random
    import string

    prefix = f"AR-{utcnow().strftime('%Y%m%d')}-"
    for _ in range(50):
        ref = prefix + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        exists = db.execute(select(Contract.id).where(Contract.reference_no == ref)).first()
        if exists is None:
            return ref
    raise AppError("REFERENCE_GEN_FAILED", "Could not allocate a contract reference", status_code=500)


def create_contract(
    db: Session,
    settings: Settings,
    *,
    owner: User,
    listing_id: UUID,
    template: str,
    tenant_phone: str,
    national_ids: dict[str, str],
    terms: dict[str, Any],
) -> Contract:
    from app.models.catalog import Listing

    listing = db.get(Listing, listing_id)
    if listing is None or listing.owner_id != owner.id:
        raise AppError("LISTING_NOT_FOUND", "Listing not found", status_code=404)
    check_rate_limit(f"contract:{owner.id}", max_hits=30, window_seconds=3600)

    tenant = ensure_party_by_phone(db, tenant_phone)
    if tenant.id == owner.id:
        raise AppError("SAME_PARTY", "Owner and tenant must be different people", status_code=422)

    contract = Contract(
        listing_id=listing.id,
        template=template,
        owner_id=owner.id,
        tenant_id=tenant.id,
        terms={**terms, "listing_title": listing.title},
        ids_encrypted=encrypt_nids(settings.secret_key, settings.contract_nid_key, national_ids),
        status="draft",
        reference_no=new_reference(db),
        confirmations_log=[],
    )
    db.add(contract)
    db.flush()
    logger.info("contract created id=%s ref=%s", contract.id, contract.reference_no)
    return contract


def patch_contract(
    db: Session,
    contract: Contract,
    user: User,
    *,
    national_ids: dict[str, str] | None,
    terms: dict[str, Any] | None,
    settings: Settings,
) -> Contract:
    if contract.status != "draft":
        raise AppError("CONTRACT_IMMUTABLE", "Only draft contracts can be edited", status_code=409)
    if _party_role(contract, user) != "owner":
        raise AppError("NOT_PARTY", "Only the owner can edit the draft", status_code=403)
    if terms is not None:
        contract.terms = {**terms, "listing_title": (contract.terms or {}).get("listing_title")}
    if national_ids is not None:
        contract.ids_encrypted = encrypt_nids(settings.secret_key, settings.contract_nid_key, national_ids)
    db.flush()
    return contract


def request_confirmation(db: Session, contract: Contract, user: User) -> Contract:
    """Owner sends the final text to the tenant for confirmation."""
    if contract.status != "draft":
        raise AppError("INVALID_STATE", "Contract is not editable anymore", status_code=409)
    if _party_role(contract, user) != "owner":
        raise AppError("NOT_PARTY", "Only the owner can request confirmation", status_code=403)
    for field, msg in (
        ("terms", "terms"),
        ("ids_encrypted", "national ids"),
    ):
        if not getattr(contract, field):
            raise AppError("CONTRACT_INCOMPLETE", f"Missing {msg}", status_code=422)
    contract.status = "pending_confirmation"
    db.flush()
    tenant = db.get(User, contract.tenant_id)
    if tenant is not None:
        create_notification(
            db,
            tenant.id,
            "contract_confirmation_requested",
            "عقد بانتظار تأكيدك 📄",
            f"راجع نص العقد {contract.reference_no} وأكّده برمز التحقق.",
            {"contract_id": str(contract.id), "reference_no": contract.reference_no},
        )
    db.flush()
    return contract


def _log_entry(
    contract: Contract, user: User, role: str, ip: str | None, user_agent: str | None
) -> dict[str, Any]:
    return {
        "party": role,
        "user_id": str(user.id),
        "at": utcnow().isoformat(),
        "ip": ip or "",
        "device": (user_agent or "")[:200],
        "otp_verified": True,
    }


def confirm_contract(
    db: Session,
    settings: Settings,
    contract: Contract,
    user: User,
    *,
    ip: str | None,
    user_agent: str | None,
) -> Contract:
    """One party confirms the final text with a fresh OTP (consumed here by the
    endpoint before calling this). Both confirmations freeze the contract."""
    role = _party_role(contract, user)
    if role is None:
        raise AppError("NOT_PARTY", "Not a party to this contract", status_code=403)
    if contract.status == "confirmed":
        raise AppError("CONTRACT_IMMUTABLE", "Contract is already confirmed", status_code=409)
    if contract.status != "pending_confirmation":
        raise AppError("INVALID_STATE", "Contract is not awaiting confirmation", status_code=409)

    now = utcnow()
    log = list(contract.confirmations_log or [])
    if any(e.get("user_id") == str(user.id) for e in log):
        raise AppError("ALREADY_CONFIRMED", "You already confirmed this contract", status_code=409)
    log.append(_log_entry(contract, user, role, ip, user_agent))
    contract.confirmations_log = log
    if role == "owner":
        contract.owner_confirmed_at = now
    else:
        contract.tenant_confirmed_at = now

    owner = db.get(User, contract.owner_id)
    tenant = db.get(User, contract.tenant_id)
    if owner is None or tenant is None:  # pragma: no cover - FK guarantees
        raise AppError("PARTY_MISSING", "Contract party missing", status_code=500)

    if contract.owner_confirmed_at and contract.tenant_confirmed_at:
        contract.status = "confirmed"
        contract.terms_hash = terms_hash(_final_payload(settings, contract, owner, tenant))
        # Arabic PDF with reference + QR is generated lazily on first download.
        for uid in (contract.owner_id, contract.tenant_id):
            create_notification(
                db,
                uid,
                "contract_confirmed",
                "تم تأكيد العقد نهائياً ✅",
                f"العقد {contract.reference_no} أصبح نهائياً وغير قابل للتعديل.",
                {"contract_id": str(contract.id), "reference_no": contract.reference_no},
            )
    else:
        other = tenant if role == "owner" else owner
        create_notification(
            db,
            other.id,
            "contract_confirmation_requested",
            "عقد بانتظار تأكيدك 📄",
            f"الطرف الآخر أكّد نص العقد {contract.reference_no} — بانتظار تأكيدك.",
            {"contract_id": str(contract.id), "reference_no": contract.reference_no},
        )
    db.flush()
    return contract


def get_contract_for_user(db: Session, contract_id: UUID, user: User) -> Contract:
    contract = db.get(Contract, contract_id)
    if contract is None or _party_role(contract, user) is None:
        raise AppError("CONTRACT_NOT_FOUND", "Contract not found", status_code=404)
    return contract


def public_verify(db: Session, reference_no: str) -> dict[str, Any]:
    """Verification page payload: only validity, date, masked party names."""
    contract = db.execute(
        select(Contract).where(Contract.reference_no == reference_no.upper().strip())
    ).scalar_one_or_none()
    if contract is None or contract.status != "confirmed":
        return {
            "valid": False,
            "reference_no": None,
            "created_at": None,
            "parties_masked": [],
            "status": None,
        }
    owner = db.get(User, contract.owner_id)
    tenant = db.get(User, contract.tenant_id)
    parties = (contract.terms or {}).get("party_names") or {}
    from app.core.crypto_service import mask_name

    return {
        "valid": True,
        "reference_no": contract.reference_no,
        "created_at": contract.created_at,
        "parties_masked": [
            mask_name(str(parties.get("owner") or (owner.full_name if owner else ""))),
            mask_name(str(parties.get("tenant") or (tenant.full_name if tenant else ""))),
        ],
        "status": contract.status,
    }


def contract_fee(settings: Settings) -> int:
    return max(0, int(settings.contract_fee_egp))


def create_fee_order(db: Session, settings: Settings, contract: Contract, user: User, method: str):
    """Optional contract fee as a normal payable order with kind=contract_fee."""
    from app.models.commerce import Order

    fee = contract_fee(settings)
    if fee <= 0:
        raise AppError("FEE_NOT_REQUIRED", "This deployment charges no contract fee", status_code=409)
    if _party_role(contract, user) is None:
        raise AppError("NOT_PARTY", "Not a party to this contract", status_code=403)
    if contract.fee_order_id is not None:
        existing = db.get(Order, contract.fee_order_id)
        if existing is not None and existing.status == "pending":
            raise AppError(
                "FEE_ORDER_EXISTS",
                "A fee order is already pending",
                status_code=409,
                details={"order_id": str(existing.id)},
            )
    order = Order(
        owner_id=user.id,
        listing_id=contract.listing_id,
        weeks=0,  # not an ad purchase
        subtotal=fee,
        discount=0,
        total=fee,
        status="pending",
        method=method,
        kind="contract_fee",
    )
    db.add(order)
    db.flush()
    contract.fee_order_id = order.id
    db.flush()
    return order


def fee_status(db: Session, settings: Settings, contract: Contract) -> tuple[bool, float, str | None]:
    """(required, amount, order_status)."""
    from app.models.commerce import Order

    fee = contract_fee(settings)
    if fee <= 0:
        return False, 0.0, None
    if contract.fee_order_id is None:
        return True, float(fee), None
    order = db.get(Order, contract.fee_order_id)
    return True, float(fee), order.status if order else None
