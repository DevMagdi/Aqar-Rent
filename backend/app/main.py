"""FastAPI application factory for Aqar Rent (إيجار مباشر)."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.db.session import CommitBeforeSendMiddleware, setup_app_db
from app.integrations.otp import build_otp_provider
from app.services.storage import build_storage

DESCRIPTION = """
Aqar Rent (إيجار مباشر) — a broker-free rental marketplace for Egypt.
Owners pay a flat 500 EGP / 7 days per listing; the platform never takes
commission and never handles rent or deposits.

* Arabic-first (RTL), English secondary.
* Standard error body: `{code, message, details}`; cursor pagination.
"""


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        engine = getattr(app.state, "engine", None)
        if engine is not None:
            engine.dispose()

    # Commit each request's DB session before the response is sent (see
    # CommitBeforeSendMiddleware docstring — closes the create→next-request
    # read-your-writes race on keep-alive connections).
    app = FastAPI(
        title=settings.app_name,
        description=DESCRIPTION,
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list or ["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_exception_handlers(app)
    app.add_middleware(CommitBeforeSendMiddleware)
    setup_app_db(app, settings)
    app.state.settings = settings
    app.state.storage = build_storage(settings)
    app.state.otp_provider = build_otp_provider(settings)

    app.include_router(api_router)

    @app.get("/health", tags=["system"], summary="Liveness probe")
    def health() -> dict:
        return {"status": "ok", "service": settings.app_name}

    return app


app = create_app()
