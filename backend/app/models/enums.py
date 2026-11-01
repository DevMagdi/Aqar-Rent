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
