"""ARQ worker: hourly job bundle + receipt sweep (docker-compose `worker`)."""

from __future__ import annotations

from arq import cron
from arq.connections import RedisSettings

from app.core.config import get_settings
from app.db.session import build_engine, build_session_factory
from app.services.jobs import run_hourly_jobs
from app.services.receipt_service import generate_receipts_for_pending
from app.services.storage import build_storage


async def hourly(ctx: dict) -> dict[str, int]:
    factory = ctx["session_factory"]
    db = factory()
    try:
        result = run_hourly_jobs(db)
        db.commit()
        return result
    finally:
        db.close()


async def receipt_sweep(ctx: dict) -> dict[str, int]:
    """Heavy work stays off the webhook: pre-generate paid-order receipts."""
    db = ctx["session_factory"]()
    try:
        count = generate_receipts_for_pending(ctx["settings"], ctx["storage"], db)
        db.commit()
        return {"receipts_generated": count}
    finally:
        db.close()


async def on_startup(ctx: dict) -> None:
    settings = get_settings()
    engine = build_engine(settings.database_url)
    ctx["settings"] = settings
    ctx["session_factory"] = build_session_factory(engine)
    ctx["storage"] = build_storage(settings)


async def on_shutdown(ctx: dict) -> None:
    ctx.get("session_factory") and ctx["session_factory"].bind and ctx["session_factory"].bind.dispose()


class WorkerSettings:
    functions = [hourly, receipt_sweep]
    cron_jobs = [
        cron(hourly, minute={0}, run_at_startup=True),  # every hour, on the hour
        cron(receipt_sweep, minute=set(range(0, 60, 10))),  # receipts every 10 min
    ]
    on_startup = on_startup
    on_shutdown = on_shutdown
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
