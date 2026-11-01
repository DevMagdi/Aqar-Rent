"""Seed data: Egyptian locations (27 governorates, main cities, districts for
Cairo/Giza/Alexandria), the default 500 EGP / 7 days plan (BR-1) and one
Super Admin from env vars. Idempotent — safe to re-run.

`--demo` additionally creates an owner with approved verification, a tenant and
a few Active listings so search returns results in dev.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import hash_password
from app.models.catalog import Listing, ListingMedia, Location, Plan
from app.models.enums import (
    Furnished,
    ListingStatus,
    LocationLevel,
    PropertyType,
    RentalType,
    StaffRole,
    StaffStatus,
    UserStatus,
    UserVerificationStatus,
)
from app.models.commerce import PromoCode
from app.models.identity import StaffUser, User, VerificationDocument
from app.services.listing_service import activate_listing
from app.services.media import process_photo
from app.services.storage import build_storage

logger = logging.getLogger("aqar.seed")

NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")  # uuid.NAMESPACE_URL

# (name_en, name_ar)
GOVERNORATES: list[tuple[str, str]] = [
    ("Cairo", "القاهرة"), ("Giza", "الجيزة"), ("Alexandria", "الإسكندرية"),
    ("Qalyubia", "القليوبية"), ("Sharqia", "الشرقية"), ("Dakahlia", "الدقهلية"),
    ("Beheira", "البحيرة"), ("Gharbia", "الغربية"), ("Monufia", "المنوفية"),
    ("Kafr El Sheikh", "كفر الشيخ"), ("Damietta", "دمياط"), ("Port Said", "بورسعيد"),
    ("Ismailia", "الإسماعيلية"), ("Suez", "السويس"), ("Faiyum", "الفيوم"),
    ("Beni Suef", "بني سويف"), ("Minya", "المنيا"), ("Assiut", "أسيوط"),
    ("Sohag", "سوهاج"), ("Qena", "قنا"), ("Luxor", "الأقصر"), ("Aswan", "أسوان"),
    ("Red Sea", "البحر الأحمر"), ("New Valley", "الوادي الجديد"),
    ("Matrouh", "مطروح"), ("North Sinai", "شمال سيناء"), ("South Sinai", "جنوب سيناء"),
]

# Main city per non-metro governorate (English, Arabic, governorate)
MAIN_CITIES: list[tuple[str, str, str]] = [
    ("Mansoura", "المنصورة", "Dakahlia"),
    ("Tanta", "طنطا", "Gharbia"),
    ("Zagazig", "الزقازيق", "Sharqia"),
    ("Damanhur", "دمنهور", "Beheira"),
    ("Shebin El Kom", "شبين الكوم", "Monufia"),
    ("Kafr El Sheikh City", "كفر الشيخ", "Kafr El Sheikh"),
    ("Damietta City", "دمياط", "Damietta"),
    ("Banha", "بنها", "Qalyubia"),
    ("Port Said City", "بورسعيد", "Port Said"),
    ("Ismailia City", "الإسماعيلية", "Ismailia"),
    ("Suez City", "السويس", "Suez"),
    ("Faiyum City", "الفيوم", "Faiyum"),
    ("Beni Suef City", "بني سويف", "Beni Suef"),
    ("Minya City", "المنيا", "Minya"),
    ("Assiut City", "أسيوط", "Assiut"),
    ("Sohag City", "سوهاج", "Sohag"),
    ("Qena City", "قنا", "Qena"),
    ("Luxor City", "الأقصر", "Luxor"),
    ("Aswan City", "أسوان", "Aswan"),
    ("Hurghada", "الغردقة", "Red Sea"),
    ("Kharga", "الخارجة", "New Valley"),
    ("Marsa Matruh", "مرسى مطروح", "Matrouh"),
    ("El Arish", "العريش", "North Sinai"),
    ("Sharm El Sheikh", "شرم الشيخ", "South Sinai"),
]

# Metro cities: (name_en, name_ar, governorate)
METRO_CITIES: list[tuple[str, str, str]] = [
    ("Cairo", "القاهرة", "Cairo"),
    ("New Cairo", "القاهرة الجديدة", "Cairo"),
    ("15 May City", "مدينة 15 مايو", "Cairo"),
    ("Giza", "الجيزة", "Giza"),
    ("6th of October", "مدينة6 أكتوبر", "Giza"),
    ("Sheikh Zayed", "الشيخ زايد", "Giza"),
    ("Hadayek El Ahram", "حدائق الأهرام", "Giza"),
    ("Alexandria", "الإسكندرية", "Alexandria"),
    ("Borg El Arab", "برج العرب", "Alexandria"),
]

# Districts: (name_en, name_ar, city_name_en, governorate_en)
DISTRICTS: list[tuple[str, str, str, str]] = [
    # Cairo city
    ("Downtown", "الوسط البلد", "Cairo", "Cairo"),
    ("Zamalek", "الزمالك", "Cairo", "Cairo"),
    ("Maadi", "المعادي", "Cairo", "Cairo"),
    ("Heliopolis", "مصر الجديدة", "Cairo", "Cairo"),
    ("Nasr City", "مدينة نصر", "Cairo", "Cairo"),
    ("Sheraton", "شيراتون", "Cairo", "Cairo"),
    ("Shubra", "شبرا", "Cairo", "Cairo"),
    ("Ain Shams", "عين شمس", "Cairo", "Cairo"),
    ("Dar El Salaam", "دار السلام", "Cairo", "Cairo"),
    ("Hadayek El Kobba", "حدائق القبة", "Cairo", "Cairo"),
    # New Cairo
    ("Fifth Settlement", "ال.phase الخامس", "New Cairo", "Cairo"),
    ("Third Settlement", "ال.phase الثالث", "New Cairo", "Cairo"),
    ("Mostakbal City", "مدينة المستقبل", "New Cairo", "Cairo"),
    # Giza city
    ("Dokki", "الدقي", "Giza", "Giza"),
    ("Mohandessin", "المهندسين", "Giza", "Giza"),
    ("Agouza", "العجوزة", "Giza", "Giza"),
    ("Imbaba", "إمبابة", "Giza", "Giza"),
    ("Faisal", "فيصل", "Giza", "Giza"),
    ("Haram", "الهرم", "Giza", "Giza"),
    ("Bulaq El Dakrour", "بولاق الدكرور", "Giza", "Giza"),
    # 6th of October
    ("Al Motamayez", "المتميزين", "6th of October", "Giza"),
    ("Dream Land", "دريم لاند", "6th of October", "Giza"),
    # Sheikh Zayed
    ("Zayed Central", "وسط مدينة الشيخ زايد", "Sheikh Zayed", "Giza"),
    ("Hadaba El Sheikh Zayed", "هضبة الشيخ زايد", "Sheikh Zayed", "Giza"),
    # Alexandria
    ("Smouha", "سموحة", "Alexandria", "Alexandria"),
    ("El Raml", "العامرية", "Alexandria", "Alexandria"),
    ("Sidi Gaber", "سيدي جابر", "Alexandria", "Alexandria"),
    ("Montaza", "منطقة المنتزه", "Alexandria", "Alexandria"),
    ("El Max", "الماكس", "Alexandria", "Alexandria"),
    ("Asafra", "العصافرة", "Alexandria", "Alexandria"),
    ("Gianaclis", "جنكليس", "Alexandria", "Alexandria"),
]


def _uid(key: str) -> uuid.UUID:
    return uuid.uuid5(NS, f"aqar:{key}")


def _upsert_location(
    db: Session, key: str, level: str, name_en: str, name_ar: str, parent_id: uuid.UUID | None
) -> Location:
    loc_id = _uid(key)
    loc = db.get(Location, loc_id)
    if loc is None:
        loc = Location(id=loc_id, level=level, name_en=name_en, name_ar=name_ar, parent_id=parent_id)
        db.add(loc)
    else:
        loc.name_en, loc.name_ar = name_en, name_ar
    db.flush()
    return loc


def seed_locations(db: Session) -> dict[str, uuid.UUID]:
    gov_ids: dict[str, uuid.UUID] = {}
    for en, ar in GOVERNORATES:
        loc = _upsert_location(db, f"gov:{en}", LocationLevel.governorate.value, en, ar, None)
        gov_ids[en] = loc.id

    city_ids: dict[str, uuid.UUID] = {}
    for en, ar, gov in METRO_CITIES + [(m[0], m[1], m[2]) for m in MAIN_CITIES]:
        loc = _upsert_location(db, f"city:{en}", LocationLevel.city.value, en, ar, gov_ids[gov])
        city_ids[en] = loc.id

    for en, ar, city, gov in DISTRICTS:
        _upsert_location(db, f"dist:{city}:{en}", LocationLevel.district.value, en, ar, city_ids[city])

    db.flush()
    return {"governorates": gov_ids, "cities": city_ids}


def seed_plan(db: Session) -> Plan:
    plan = db.execute(select(Plan).where(Plan.name == "Weekly")).scalar_one_or_none()
    if plan is None:
        plan = Plan(name="Weekly", price_egp=500, duration_days=7, priority_weight=0, active=True)
        db.add(plan)
    else:
        plan.price_egp = 500  # BR-1 default: 500 EGP per 7 days
        plan.duration_days = 7
        plan.active = True
    db.flush()
    return plan


def seed_super_admin(db: Session, settings: Settings) -> StaffUser:
    email = settings.staff_super_admin_email
    password = settings.staff_super_admin_password
    totp = settings.staff_super_admin_totp_secret
    if not password or not totp:
        if settings.is_prod:
            raise SystemExit(
                "STAFF_SUPER_ADMIN_PASSWORD and STAFF_SUPER_ADMIN_TOTP_SECRET "
                "must be set in production (refusing to seed a weak admin)."
            )
        password = password or "ChangeMeAdmin!2026"
        totp = totp or "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"
        logger.warning("STAFF_SUPER_ADMIN_* not set — using DEV defaults (change before prod!)")

    staff = db.execute(select(StaffUser).where(StaffUser.email == email)).scalar_one_or_none()
    if staff is None:
        staff = StaffUser(email=email, role=StaffRole.super_admin.value)
        db.add(staff)
    staff.password_hash = hash_password(password, settings.bcrypt_rounds)
    staff.two_factor_secret = totp
    staff.role = StaffRole.super_admin.value
    staff.status = StaffStatus.active.value
    db.flush()
    return staff


def seed_demo(db: Session, settings: Settings) -> None:
    """Demo owner (verified, Active listings) + tenant so search has content."""
    storage = build_storage(settings)

    owner = db.execute(select(User).where(User.phone == "+201000000001")).scalar_one_or_none()
    if owner is None:
        owner = User(
            phone="+201000000001",
            full_name="أحمد المالك",
            language="ar",
            verification_status=UserVerificationStatus.approved.value,
        )
        db.add(owner)
        db.flush()
        doc = VerificationDocument(
            user_id=owner.id,
            file_key=f"users/{owner.id}/verification/demo.jpg",
            doc_type="electricity_bill",
            status="approved",
        )
        db.add(doc)
        # tiny valid jpg for the demo doc
        photo, _, _ = process_photo(_demo_jpeg())
        storage.put(doc.file_key, photo, "image/jpeg")

    tenant = db.execute(select(User).where(User.phone == "+201111111111")).scalar_one_or_none()
    if tenant is None:
        tenant = User(phone="+201111111111", full_name="سارة مستأجرة", language="ar")
        db.add(tenant)
        db.flush()

    if db.execute(select(func.count()).select_from(Listing).where(Listing.owner_id == owner.id)).scalar_one():
        return

    plan = db.execute(select(Plan).where(Plan.active.is_(True))).scalars().first()
    cairo = db.execute(select(Location).where(Location.name_en == "Cairo", Location.level == "governorate")).scalars().first()
    cairo_city = db.execute(select(Location).where(Location.name_en == "Cairo", Location.level == "city")).scalars().first()
    maadi = db.execute(select(Location).where(Location.name_en == "Maadi")).scalars().first()
    dokki = db.execute(select(Location).where(Location.name_en == "Dokki")).scalars().first()
    giza = db.execute(select(Location).where(Location.name_en == "Giza", Location.level == "governorate")).scalars().first()
    giza_city = db.execute(select(Location).where(Location.name_en == "Giza", Location.level == "city")).scalars().first()

    demos = [
        ("شقة مفروشة في المعادي", PropertyType.apartment, Furnished.furnished, 12000,
         3, 2, 120.0, 30.0404, 31.2622, cairo.id, cairo_city.id, maadi.id if maadi else None,
         "شارع9 المعادي، قريب من محطة المترو"),
        ("استوديو في الدقي", PropertyType.studio, Furnished.unfurnished, 4500,
         1, 1, 45.0, 30.0370, 31.2100, giza.id if giza else cairo.id,
         giza_city.id if giza_city else cairo_city.id, dokki.id if dokki else None,
         "استوديو دور ثالث مع مصعد"),
        ("مكتب تجاري في وسط البلد", PropertyType.office, Furnished.semi, 8000,
         0, 1, 90.0, 30.0444, 31.2357, cairo.id, cairo_city.id, None,
         "مكتب مناسب لشركة ناشئة، تكييف مركزي"),
    ]
    for i, demo in enumerate(demos):
        (title, ptype, furn, price, beds, baths, area, lat, lon, gov, city, dist, addr) = demo
        listing = Listing(
            owner_id=owner.id,
            title=title,
            property_type=ptype.value,
            rental_type=RentalType.residential.value,
            furnished=furn.value,
            rent_monthly=price,
            deposit_months=2,
            area_m2=area,
            bedrooms=beds,
            bathrooms=max(1, baths),
            floor=2,
            has_elevator=True,
            finishing="finished",
            amenities={"parking": True, "security": True, "internet": i % 2 == 0},
            description="وحدة حقيقية بصور حقيقية، متاحة للانتقال الفوري.",
            governorate_id=gov,
            city_id=city,
            district_id=dist,
            address_text=addr,
            latitude=lat,
            longitude=lon,
            status=ListingStatus.approved.value,
        )
        db.add(listing)
        db.flush()
        photo, thumb, phash = process_photo(_demo_jpeg(color=(40 + i * 60, 90, 160)))
        fkey = f"listings/{listing.id}/media/1.jpg"
        tkey = f"listings/{listing.id}/media/1_thumb.jpg"
        storage.put(fkey, photo, "image/jpeg")
        storage.put(tkey, thumb, "image/jpeg")
        db.add(
            ListingMedia(
                listing_id=listing.id,
                type="photo",
                file_key=fkey,
                thumb_key=tkey,
                sort_order=0,
                phash=phash,
            )
        )
        # second & third photos (same canvas, different pattern → different phash)
        for n in (2, 3):
            p2, t2, h2 = process_photo(_demo_jpeg(color=(200, 60 + n * 40, 30 + i * 50), seed=n + i * 7))
            fk = f"listings/{listing.id}/media/{n}.jpg"
            tk = f"listings/{listing.id}/media/{n}_thumb.jpg"
            storage.put(fk, p2, "image/jpeg")
            storage.put(tk, t2, "image/jpeg")
            db.add(
                ListingMedia(
                    listing_id=listing.id, type="photo", file_key=fk, thumb_key=tk,
                    sort_order=n - 1, phash=h2,
                )
            )
        db.flush()
        activate_listing(db, listing, plan, weeks=2)  # demo ads run for 14 days

    # a promo for early owners (BR-9)
    if db.execute(select(PromoCode).where(PromoCode.code == "FIRSTAD")).scalar_one_or_none() is None:
        db.add(
            PromoCode(
                code="FIRSTAD",
                type="percent",
                value=100,
                max_uses=1000,
                expires_at=None,
                active=True,
            )
        )
    db.flush()


def _demo_jpeg(color=(70, 130, 180), seed=0) -> bytes:
    """A small synthetic JPEG (stands in for a real unit photo in dev only)."""
    import io
    import random

    from PIL import Image, ImageDraw

    random.seed(seed)
    img = Image.new("RGB", (640, 480), color)
    draw = ImageDraw.Draw(img)
    for _ in range(24):
        x1, y1 = random.randint(0, 600), random.randint(0, 440)
        x2, y2 = x1 + random.randint(20, 120), y1 + random.randint(20, 100)
        tint = tuple(min(255, c + random.randint(-40, 60)) for c in color)
        draw.rectangle([x1, y1, x2, y2], fill=tint)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def run_seed(db: Session, settings: Settings, demo: bool = False) -> dict[str, int]:
    locations = seed_locations(db)
    plan = seed_plan(db)
    admin = seed_super_admin(db, settings)
    if demo:
        seed_demo(db, settings)
    db.commit()
    return {
        "governorates": len(GOVERNORATES),
        "cities": len(METRO_CITIES) + len(MAIN_CITIES),
        "districts": len(DISTRICTS),
        "plans": 1,
        "staff_super_admin": 1,
        "demo": 1 if demo else 0,
    }
