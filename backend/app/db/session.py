"""Engine/session factory + FastAPI dependency + pre-send commit middleware."""

from __future__ import annotations

import logging
from collections.abc import Generator

from fastapi import Request
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings

logger = logging.getLogger(__name__)


def build_engine(database_url: str) -> Engine:
    kwargs: dict = {"pool_pre_ping": True}
    if database_url.startswith("sqlite"):
        # WAL + busy_timeout: concurrent readers during writes (multiple
        # uvicorn workers / the load-test profile) without "database is locked".
        kwargs = {
            "poolclass": None,
            "connect_args": {"check_same_thread": False, "timeout": 10.0},
        }
    engine = create_engine(database_url, **kwargs)
    if database_url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _record):  # pragma: no cover - trivial
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            if database_url != "sqlite:///:memory:":
                cur.execute("PRAGMA journal_mode=WAL")
                cur.execute("PRAGMA synchronous=NORMAL")
                cur.execute("PRAGMA busy_timeout=10000")
            cur.close()

    return engine


def build_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, class_=Session)


def setup_app_db(app, settings: Settings) -> None:
    """Attach engine/session factory to the FastAPI app state."""
    engine = build_engine(settings.database_url)
    app.state.engine = engine
    app.state.session_factory = build_session_factory(engine)
    app.state.settings = settings


class CommitBeforeSendMiddleware:
    """Commit (2xx/3xx) or roll back (≥400) the request session **before**
    the response reaches the wire.

    FastAPI runs `yield`-dependency teardowns (`get_db` → `session.commit()`)
    *after* the response has been sent. A client that immediately issues its
    next request on the same keep-alive connection can then race the commit
    and read pre-write state — observed in e2e as a spurious
    `LISTING_NOT_FOUND` on the first upload right after a create, or as
    "N−1 photos" at submit. Interception at `http.response.start` closes the
    window: once the client can act on the response, the write is durable.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):  # noqa: ANN001, ANN201
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        state = scope.setdefault("state", {})

        async def send_wrapper(message):  # noqa: ANN001
            if message.get("type") == "http.response.start":
                session = state.get("db_session")
                if session is not None:
                    action = "commit" if message.get("status", 500) < 400 else "rollback"
                    try:
                        if action == "commit":
                            session.commit()
                        else:
                            session.rollback()
                    except Exception:  # noqa: BLE001 — never break the response path
                        logger.exception("pre-send %s failed", action)
                        try:
                            session.rollback()
                        except Exception:  # noqa: BLE001
                            logger.exception("post-failure rollback failed")
            await send(message)

        await self.app(scope, receive, send_wrapper)


def get_db(request: Request) -> Generator[Session, None, None]:
    session: Session = request.app.state.session_factory()
    # Exposed to CommitBeforeSendMiddleware through the shared ASGI scope state.
    request.state.db_session = session
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
