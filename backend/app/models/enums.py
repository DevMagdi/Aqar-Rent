"""Shared enumerations (stored as portable strings in the DB)."""

from __future__ import annotations

from enum import StrEnum


class UserStatus(StrEnum):
    active = "active"
    banned = "banned"
    deleted = "deleted"


class UserVerificationStatus(StrEnum):
    unverified = "unverified"
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class DocType(StrEnum):
    electricity_bill = "electricity_bill"
    water_bill = "water_bill"
    ownership_contract = "ownership_contract"
    id_authorization = "id_authorization"
    # Phase 5 (trust ladder): separate identity from ownership evidence.
    national_id = "national_id"
    commercial_register = "commercial_register"  # offices
    premium_review = "premium_review"  # optional paid, human-assisted review


class DocStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class LocationLevel(StrEnum):
    governorate = "governorate"
    city = "city"
    district = "district"


class PropertyType(StrEnum):
    apartment = "apartment"
    studio = "studio"
    villa = "villa"
    room = "room"
    shop = "shop"
    office = "office"
    clinic = "clinic"


class RentalType(StrEnum):
    residential = "residential"
    commercial = "commercial"


class Furnished(StrEnum):
    furnished = "furnished"
    unfurnished = "unfurnished"
    semi = "semi"


class Finishing(StrEnum):
    not_finished = "not_finished"
    semi_finished = "semi_finished"
    finished = "finished"
    fully_finished = "fully_finished"
    deluxe = "deluxe"


class ListingStatus(StrEnum):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"
    active = "active"
    expired = "expired"
    rejected = "rejected"
    rented = "rented"
    removed = "removed"


# Statuses that count against the max-5-active-listings cap (BR-7).
LISTING_CAP_STATUSES = (
    ListingStatus.draft,
    ListingStatus.submitted,
    ListingStatus.approved,
    ListingStatus.active,
)


class MediaType(StrEnum):
    photo = "photo"
    video = "video"


class OrderStatus(StrEnum):
    pending = "pending"
    paid = "paid"
    failed = "failed"
    expired = "expired"
    refunded = "refunded"


class PaymentMethod(StrEnum):
    card = "card"
    fawry = "fawry"
    vodafone_cash = "vodafone_cash"
    bank_transfer = "bank_transfer"


class PaymentStatus(StrEnum):
    pending = "pending"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"


class BankTransferStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class RefundStatus(StrEnum):
    pending = "pending"
    completed = "completed"
    rejected = "rejected"


class AdPeriodStatus(StrEnum):
    active = "active"
    ended = "ended"
    cancelled = "cancelled"


class PromoType(StrEnum):
    percent = "percent"
    free_weeks = "free_weeks"


class ReportReason(StrEnum):
    fraud = "fraud"
    broker = "broker"
    duplicate = "duplicate"
    wrong_info = "wrong_info"
    scam = "scam"
    inappropriate = "inappropriate"
    other = "other"


class ReportStatus(StrEnum):
    open = "open"
    reviewing = "reviewing"
    resolved = "resolved"
    dismissed = "dismissed"


class ContactChannel(StrEnum):
    call = "call"
    whatsapp = "whatsapp"
    show = "show"


class ContractStatus(StrEnum):
    draft = "draft"
    pending_confirmation = "pending_confirmation"
    confirmed = "confirmed"
    active = "active"
    terminated = "terminated"
    completed = "completed"


class HandoverKind(StrEnum):
    check_in = "check_in"
    check_out = "check_out"


class HandoverStatus(StrEnum):
    draft = "draft"
    confirmed = "confirmed"


class NotificationChannel(StrEnum):
    push = "push"
    email = "email"
    sms = "sms"
    in_app = "in_app"


class StaffRole(StrEnum):
    super_admin = "super_admin"
    finance = "finance"
    moderator = "moderator"


class StaffStatus(StrEnum):
    active = "active"
    disabled = "disabled"


# Preset moderation rejection reasons (admin picks one; optional free note).
REJECT_REASONS: dict[str, str] = {
    "fake_photos": "Photos do not match the property or are not real",
    "phone_in_photos": "Phone numbers or watermarks visible in photos",
    "phone_in_description": "Phone numbers or contact details in the description",
    "wrong_location": "Wrong or misleading location",
    "price_misleading": "Price not monthly in EGP or misleading",
    "not_for_rent": "Listing is for sale or not actually for rent",
    "duplicate_listing": "Duplicate listing",
    "broker_suspected": "Suspected broker / agency activity",
    "not_owner": "Uploader does not appear to be the owner",
    "other": "Other (see note)",
}


# ── Phase 5 — trust ladder, offices, subscriptions, CRM-lite ──────────────────


class AccountType(StrEnum):
    """Every login is still a person; `office` accounts own an OfficeProfile."""

    individual = "individual"
    office = "office"


class VerificationLevel(StrEnum):
    """Ordered, transparent trust ladder shown to tenants on every listing.

    phone      — OTP-verified mobile (automatic at signup)
    id         — national ID / commercial register reviewed
    ownership  — at least one ownership/utility proof reviewed per unit
    premium    — optional paid, human-assisted verification with expiry
    """

    phone = "phone"
    id = "id"
    ownership = "ownership"
    premium = "premium"


VERIFICATION_LEVEL_ORDER = {
    VerificationLevel.phone.value: 0,
    VerificationLevel.id.value: 1,
    VerificationLevel.ownership.value: 2,
    VerificationLevel.premium.value: 3,
}

VERIFICATION_LEVEL_LABELS: dict[str, dict[str, str]] = {
    "phone": {"ar": "رقم هاتف موثّق", "en": "Phone verified"},
    "id": {"ar": "تمت مراجعة الهوية", "en": "Identity reviewed"},
    "ownership": {
        "ar": "مالك موثّق · مستندات الملكية مراجَعة",
        "en": "Verified owner · ownership documents reviewed",
    },
    "premium": {"ar": "مالك موثّق بلس (تحقق مميز)", "en": "Premium verified owner"},
}

# Structured, localizable rejection reasons (moderator picks a code, may add a note).
VERIFICATION_REJECT_REASONS: dict[str, dict[str, str]] = {
    "unreadable": {"ar": "المستند غير واضح أو غير مقروء", "en": "Document is blurry or unreadable"},
    "name_mismatch": {"ar": "الاسم لا يطابق بيانات الحساب", "en": "Name does not match the account"},
    "not_ownership": {
        "ar": "المستند لا يثبت الملكية أو العلاقة بالوحدة",
        "en": "Document does not prove ownership",
    },
    "expired": {"ar": "المستند منتهي الصلاحية", "en": "Document has expired"},
    "wrong_type": {"ar": "نوع المستند غير مناسب", "en": "Wrong document type for this check"},
    "suspected_fraud": {"ar": "اشتباه في تلاعب بالمستند", "en": "Suspected document tampering"},
    "incomplete": {"ar": "المستند ناقص (صفحات أو أطراف مفقودة)", "en": "Incomplete document"},
    "other": {"ar": "سبب آخر (انظر الملاحظة)", "en": "Other (see note)"},
}


class AppealStatus(StrEnum):
    none = "none"
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class OfficeVerificationStatus(StrEnum):
    unverified = "unverified"
    pending = "pending"
    verified = "verified"
    rejected = "rejected"


class OfficeMemberRole(StrEnum):
    owner = "owner"
    manager = "manager"
    agent = "agent"


class OfficeMemberStatus(StrEnum):
    invited = "invited"
    active = "active"
    suspended = "suspended"


class SubscriptionAudience(StrEnum):
    individual = "individual"
    office = "office"


class SubscriptionStatus(StrEnum):
    pending = "pending"
    active = "active"
    cancelled = "cancelled"
    expired = "expired"


class LeadStage(StrEnum):
    new = "new"
    contacted = "contacted"
    viewing = "viewing"
    offer = "offer"
    won = "won"
    lost = "lost"


LEAD_STAGES = tuple(s.value for s in LeadStage)


class OrderKind(StrEnum):
    ad_period = "ad_period"
    contract_fee = "contract_fee"
    subscription = "subscription"
    featured_boost = "featured_boost"


class RegistryStatus(StrEnum):
    """Honest status of official registration. Egypt has NO Ejar-equivalent
    digital rental registry today (2026-11-02); see docs/legal/LEGAL_NOTES.md.
    """

    unavailable = "unavailable"  # no official integration exists
    not_submitted = "not_submitted"
    submitted = "submitted"
    registered = "registered"
    rejected = "rejected"
