"""Regression: the request session must commit BEFORE the response is sent.

FastAPI runs `yield`-dependency teardowns after the response has gone out, so
without CommitBeforeSendMiddleware a keep-alive client can race the commit and
read pre-write state (e2e saw LISTING_NOT_FOUND on the upload immediately
after a create, and "N-1 photos" at submit).
"""

from __future__ import annotations

import asyncio

from app.db.session import CommitBeforeSendMiddleware


class FakeSession:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def commit(self) -> None:
        self.calls.append("commit")

    def rollback(self) -> None:
        self.calls.append("rollback")


def _drive(status: int) -> tuple[FakeSession, list[tuple[str, list[str]]]]:
    """Run the middleware with a fake inner app; return the session and the
    (event, session.calls) log captured when each message is sent."""
    session = FakeSession()
    events: list[tuple[str, list[str]]] = []

    async def inner(scope, receive, send):  # noqa: ANN001, ANN201
        scope["state"]["db_session"] = session  # what get_db stores per request
        await send({"type": "http.response.start", "status": status, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def send(message):  # noqa: ANN001
        if message["type"] == "http.response.start":
            events.append(("start", list(session.calls)))

    mw = CommitBeforeSendMiddleware(inner)

    async def run() -> None:
        await mw({"type": "http", "state": {}}, None, send)

    asyncio.run(run())
    return session, events


def test_commit_runs_before_response_start_for_success() -> None:
    session, events = _drive(200)
    assert session.calls == ["commit"]
    # by the time the response starts, the commit already happened
    assert events == [("start", ["commit"])]


def test_error_responses_roll_back_before_response_start() -> None:
    session, events = _drive(404)
    assert session.calls == ["rollback"]
    assert events == [("start", ["rollback"])]


def test_no_session_is_a_noop() -> None:
    """Requests that never opened a DB session (404 route, CORS…) pass through."""
    sent: list[str] = []

    async def inner(scope, receive, send):  # noqa: ANN001, ANN201
        await send({"type": "http.response.start", "status": 404, "headers": []})

    mw = CommitBeforeSendMiddleware(inner)

    async def run() -> None:
        await mw({"type": "http"}, None, send)  # no "state" key either

    async def send(message):  # noqa: ANN001
        sent.append(message["type"])

    asyncio.run(run())
    assert sent == ["http.response.start"]


def test_non_http_scopes_pass_through() -> None:
    called: list[str] = []

    async def inner(scope, receive, send):  # noqa: ANN001, ANN201
        called.append(scope["type"])

    mw = CommitBeforeSendMiddleware(inner)

    async def run() -> None:
        await mw({"type": "lifespan"}, None, None)  # send unused for lifespan

    asyncio.run(run())  # must not raise
    assert called == ["lifespan"]
