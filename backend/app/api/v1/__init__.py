"""v1 API router aggregation: /api/v1/*."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import auth, favorites, files, listings, locations, me, notifications, payments, plans
from app.api.v1.admin import router as admin_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(me.router)
api_router.include_router(locations.router)
api_router.include_router(listings.router)
api_router.include_router(favorites.router)
api_router.include_router(plans.router)
api_router.include_router(payments.router)
api_router.include_router(notifications.router)
api_router.include_router(files.router)
api_router.include_router(admin_router)
