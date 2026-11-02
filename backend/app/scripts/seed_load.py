"""Bulk-load the database for performance testing (Phase 4C #4).

Creates:
* `--owners` demo owners + `--listings` ACTIVE listings (each with a running
  ad period → visible in search, exactly like paid traffic), spread over the
  seeded governorates/cities;
* `--approved` extra APPROVED listings for fresh owners (checkout bench —
  BR-5 allows ordering right after approval; no ad period yet).

Run: python -m app.scripts.seed_load --listings 100000 --approved 600
"""

from __future__ import annotations

import argparse
import random
import uuid
from datetime import timedelta

import sqlalchemy as sa
from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import build_engine, build_session_factory
from app.models.catalog import Listing, Location, Plan
from app.models.commerce import AdPeriod
from app.models.enums import ListingStatus, UserStatus, UserVerificationStatus
from app.models.identity import User
from app.services.common import utcnow
from app.services.seed_service import run_seed

TITLES = [
    "شقة مفروشة تطل على النيل",
    "استوديو حديث بالمقطم",
    "شقة3 غرف مدينة نصر",
    "محل تجاري أمام الجامعة",
    "فيلا دورين في حديقة الأهرام",
    "شقة نصف تشطيب دقي",
    "مكتب70م في المعادي",
    "شقة عائلية الهرم",
    "استوديو رخيص للطلاب",
    "شقة بإطلالة بحرية سموحة",
]
PROPERTY_TYPES = ["apartment", "studio", "villa", "room", "shop", "office", "clinic"]
FURNISHED = ["furnished", "unfurnished", "semi"]

BATCH = 5_000


def insert_batch(db, model, rows: list[dict]) -> None:
    if not rows:
        return
    db.execute(model.__table__.insert(), rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--listings", type=int, default=100_000)
    parser.add_argument("--owners", type=int, default=2_000)
    parser.add_argument("--approved", type=int, default=600)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    settings = get_settings()
    engine = build_engine(settings.database_url)
    factory = build_session_factory(engine)
    db = factory()
    try:
        run_seed(db, settings, demo=False)

        gov_rows = db.execute(select(Location).where(Location.level == "governorate")).scalars().all()
        city_by_gov: dict[str, list[Location]] = {}
        for city in db.execute(select(Location).where(Location.level == "city")).scalars().all():
            city_by_gov.setdefault(str(city.parent_id), []).append(city)
        pairs = [(g, c) for g in gov_rows for c in city_by_gov.get(str(g.id), [])]
        if not pairs:
            raise SystemExit("seed locations first (make seed)")
        plan = db.execute(select(Plan).where(Plan.active.is_(True))).scalars().first()
        if plan is None:
            raise SystemExit("no active plan")

        now = utcnow()

        # owners (active, already verified — mirrors real paid owners)
        owner_rows = []
        owners: list[uuid.UUID] = []
        for i in range(args.owners):
            oid = uuid.uuid4()
            owners.append(oid)
            owner_rows.append(
                {
                    "id": oid,
                    "phone": f"+2011{i:08d}",
                    "full_name": f"مالك تجريبي {i}",
                    "language": "ar",
                    "status": UserStatus.active.value,
                    "verification_status": UserVerificationStatus.approved.value,
                    "created_at": now - timedelta(days=rng.randint(1, 400)),
                    "updated_at": now,
                }
            )
        for start in range(0, len(owner_rows), BATCH):
            insert_batch(db, User, owner_rows[start : start + BATCH])
        db.flush()

        # bench owners (fresh — zero running ads so checkout never hits BR-7)
        bench_owner = uuid.uuid4()
        db.execute(
            sa.insert(User),
            [
                {
                    "id": bench_owner,
                    "phone": "+201200000001",
                    "full_name": "مالك اختبار الأداء",
                    "language": "ar",
                    "status": UserStatus.active.value,
                    "verification_status": UserVerificationStatus.approved.value,
                    "created_at": now,
                    "updated_at": now,
                }
            ],
        )
        db.flush()

        # active listings + running ad periods (visible in search)
        listing_batch: list[dict] = []
        period_batch: list[dict] = []
        active_ids: list[str] = []
        for i in range(args.listings):
            gov, city = pairs[rng.randrange(len(pairs))]
            lid = uuid.uuid4()
            active_ids.append(str(lid))
            rent = rng.randrange(2, 60) * 250
            listing_batch.append(
                {
                    "id": lid,
                    "owner_id": owners[i % len(owners)],
                    "title": f"{TITLES[i % len(TITLES)]} #{i}",
                    "property_type": PROPERTY_TYPES[i % len(PROPERTY_TYPES)],
                    "rental_type": "commercial" if i % 7 == 0 else "residential",
                    "furnished": FURNISHED[i % 3],
                    "rent_monthly": rent,
                    "deposit_months": rng.randint(1, 2),
                    "area_m2": rng.randint(35, 300),
                    "bedrooms": rng.randint(0, 5),
                    "bathrooms": rng.randint(1, 3),
                    "floor": rng.randint(0, 20),
                    "has_elevator": bool(i % 2),
                    "amenities": {},
                    "description": "وصف تجريبي لاختبار الأداء — تفاصيل الوحدة والمرافق.",
                    "governorate_id": gov.id,
                    "city_id": city.id,
                    "district_id": None,
                    "address_text": f"شارع {i % 500}، {city.name_ar}",
                    "latitude": round(26.0 + rng.random() * 5.5, 6),  # Egypt bbox
                    "longitude": round(24.5 + rng.random() * 12.0, 6),
                    "available_from": None,
                    "min_term_months": 1,
                    "status": ListingStatus.active.value,
                    "published_at": now - timedelta(days=rng.randint(0, 30)),
                    "view_count": rng.randint(0, 500),
                    "created_at": now - timedelta(days=rng.randint(0, 60)),
                    "updated_at": now,
                }
            )
            period_batch.append(
                {
                    "id": uuid.uuid4(),
                    "listing_id": lid,
                    "plan_id": plan.id,
                    "order_id": None,
                    "starts_at": now - timedelta(hours=6),
                    "ends_at": now + timedelta(days=6, hours=18),
                    "status": "active",
                    "created_at": now,
                    "updated_at": now,
                }
            )
            if len(listing_batch) >= BATCH:
                insert_batch(db, Listing, listing_batch)
                insert_batch(db, AdPeriod, period_batch)
                listing_batch, period_batch = [], []
                db.flush()
                print(f"  {i + 1} active listings…", flush=True)
        insert_batch(db, Listing, listing_batch)
        insert_batch(db, AdPeriod, period_batch)
        db.flush()

        # approved listings for the checkout bench (fresh owner, no periods)
        approved_batch: list[dict] = []
        approved_ids: list[str] = []
        for i in range(args.approved):
            gov, city = pairs[rng.randrange(len(pairs))]
            lid = uuid.uuid4()
            approved_ids.append(str(lid))
            approved_batch.append(
                {
                    "id": lid,
                    "owner_id": bench_owner,
                    "title": f"بانتظار الشراء #{i}",
                    "property_type": "apartment",
                    "rental_type": "residential",
                    "furnished": "unfurnished",
                    "rent_monthly": 6_000 + (i % 40) * 100,
                    "deposit_months": 1,
                    "area_m2": 90,
                    "bedrooms": 2,
                    "bathrooms": 1,
                    "floor": i % 10,
                    "has_elevator": True,
                    "amenities": {},
                    "description": "معتمد وينتظر أول شراء للإعلان (bench).",
                    "governorate_id": gov.id,
                    "city_id": city.id,
                    "district_id": None,
                    "address_text": "شارع الاختبار، القاهرة",
                    "latitude": 30.0444,
                    "longitude": 31.2357,
                    "available_from": None,
                    "min_term_months": 1,
                    "status": ListingStatus.approved.value,
                    "published_at": None,
                    "view_count": 0,
                    "created_at": now,
                    "updated_at": now,
                }
            )
        insert_batch(db, Listing, approved_batch)
        db.commit()

        ids_path = "data/loadtest_listing_ids.txt"
        import pathlib

        pathlib.Path(ids_path).parent.mkdir(parents=True, exist_ok=True)
        pathlib.Path(ids_path).write_text("\n".join(active_ids[:2_000]) + "\n")
        pathlib.Path("data/loadtest_bench_owner.txt").write_text(str(bench_owner) + "\n")
        print(
            f"loadtest seed done: {args.listings} active+periods, {args.approved} approved, "
            f"{args.owners} owners → ids in {ids_path}"
        )
    finally:
        db.close()
        engine.dispose()


if __name__ == "__main__":
    main()
