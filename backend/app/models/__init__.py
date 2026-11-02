"""Import every model so Base.metadata is complete for Alembic/DDL."""

from app.models.catalog import Listing, ListingMedia, Location, Plan  # noqa: F401
from app.models.commerce import (  # noqa: F401
    AdPeriod,
    BankTransfer,
    Order,
    Payment,
    PromoCode,
    Refund,
)
from app.models.growth import (  # noqa: F401  (Phase 5 tables, imported first for FKs)
    AdPackage,
    Lead,
    LeadEvent,
    OfficeMember,
    OfficeProfile,
    PaymentEvent,
    Subscription,
    SubscriptionPlan,
)
from app.models.identity import (  # noqa: F401
    AuditLog,
    Device,
    OtpCode,
    StaffUser,
    User,
    VerificationDocument,
)
from app.models.social import (  # noqa: F401
    ContactEvent,
    Contract,
    Favorite,
    Handover,
    HandoverMedia,
    Notification,
    Report,
)
