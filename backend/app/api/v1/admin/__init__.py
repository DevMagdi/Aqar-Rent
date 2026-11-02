"""Admin router aggregation: /api/v1/admin/*."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.admin import (
    auth,
    dashboard,
    growth,
    moderation,
    payments,
    plans,
    promos,
    reports,
    users,
    verifications,
)
from app.api.v1.admin.payments import bank_router

router = APIRouter(prefix="/admin")
router.include_router(auth.router)
router.include_router(dashboard.router)
router.include_router(moderation.router)
router.include_router(verifications.router)
router.include_router(reports.router)
router.include_router(users.router)
router.include_router(payments.router)
router.include_router(bank_router)
router.include_router(plans.router)
router.include_router(promos.router)
router.include_router(growth.router)
