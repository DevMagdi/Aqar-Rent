"""`python -m app.scripts.seed [--demo]` — idempotent DB seeding."""

from __future__ import annotations

import argparse
import logging

from app.core.config import get_settings
from app.db.session import build_engine, build_session_factory
from app.services.seed_service import run_seed


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Aqar Rent database")
    parser.add_argument("--demo", action="store_true", help="also create demo users/listings")
    args = parser.parse_args()

    settings = get_settings()
    logging.basicConfig(level=settings.log_level)
    engine = build_engine(settings.database_url)
    factory = build_session_factory(engine)
    db = factory()
    try:
        stats = run_seed(db, settings, demo=args.demo)
        print("Seed complete:", stats)
    finally:
        db.close()
        engine.dispose()


if __name__ == "__main__":
    main()
