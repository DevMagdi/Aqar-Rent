"""Public pricing + personal entitlements (one source of truth for all clients)."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbDep
from app.schemas.growth import EntitlementsOut, PricingOut
from app.services.entitlements import entitlements
from app.services.subscription_service import pricing_catalog

router = APIRouter(tags=["pricing"])


@router.get("/pricing", response_model=PricingOut, summary="All prices, packages & plans (Public)")
def pricing(db: DbDep) -> PricingOut:
    """BR-1: prices live in DB tables, never hard-coded in web/mobile clients.

    Returns the weekly ad entry point, multi-week/featured packages, owner and
    office subscription tiers, and the platform's money principles.
    """
    return PricingOut(**pricing_catalog(db))


@router.get("/me/entitlements", response_model=EntitlementsOut, summary="My live limits & features")
def my_entitlements(user: CurrentUser, db: DbDep) -> EntitlementsOut:
    """What this account can do right now: listing cap, seats, features, trust."""
    return EntitlementsOut(**entitlements(db, user))
