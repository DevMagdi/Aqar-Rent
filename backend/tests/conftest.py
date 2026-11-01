"""Shared fixtures: per-test SQLite DB, app factory, auth & listing helpers."""

from __future__ import annotations

import io
import os
import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.rate_limit import reset_rate_limits
from app.db.base import Base
from app.main import create_app
from app.services.seed_service import NS, run_seed


def loc_uuid(key: str) -> uuid.UUID:
    """Same deterministic ids the seeder uses (uuid5 over `aqar:{key}`)."""
    return uuid.uuid5(NS, f"aqar:{key}")


GOV_CAIRO = loc_uuid("gov:Cairo")
CITY_CAIRO = loc_uuid("city:Cairo")
DIST_MAADI = loc_uuid("dist:Cairo:Maadi")
GOV_GIZA = loc_uuid("gov:Giza")
CITY_GIZA = loc_uuid("city:Giza")
DIST_DOKKI = loc_uuid("dist:Giza:Dokki")

ADMIN_EMAIL = "admin@aqar-rent.dev"
ADMIN_PASSWORD = "AdminPass123!"
ADMIN_TOTP = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"


@pytest.fixture
def settings(tmp_path) -> Settings:
    # TEST_DATABASE_URL (e.g. postgresql+psycopg://…) makes the same suite run
    # against PostgreSQL+PostGIS — CI does exactly that in its postgres matrix.
    db_url = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{tmp_path}/test.db"
    return Settings(
        _env_file=None,
        app_env="test",
        debug=True,
        secret_key="test-secret-key-for-pytest-only-32bytes!!",
        database_url=db_url,
        storage_backend="local",
        storage_local_root=str(tmp_path / "storage"),
        bcrypt_rounds=4,
        otp_provider="console",
        otp_max_requests_per_ip_hour=10_000,  # per-IP guard not under test here
        staff_super_admin_email=ADMIN_EMAIL,
        staff_super_admin_password=ADMIN_PASSWORD,
        staff_super_admin_totp_secret=ADMIN_TOTP,
    )


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    reset_rate_limits()
    yield
    reset_rate_limits()


@pytest.fixture
def app(settings):
    application = create_app(settings)
    if not settings.database_url.startswith("sqlite"):
        Base.metadata.drop_all(application.state.engine)  # shared server DB
    Base.metadata.create_all(application.state.engine)
    yield application
    application.state.engine.dispose()


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db(app):
    session = app.state.session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def seeded(app) -> dict:
    """Locations (governorates/cities/districts) + default plan + super admin."""
    session = app.state.session_factory()
    try:
        run_seed(session, app.state.settings, demo=False)
    finally:
        session.close()
    return {"ok": True}


# ── helpers ──────────────────────────────────────────────────────────────────


def otp_login(client: TestClient, phone: str) -> dict:
    r = client.post("/api/v1/auth/otp/request", json={"phone": phone})
    assert r.status_code == 200, r.text
    code = r.json()["dev_code"]
    assert code, "debug mode should expose dev_code"
    r = client.post("/api/v1/auth/otp/verify", json={"phone": phone, "code": code, "platform": "web"})
    assert r.status_code == 200, r.text
    body = r.json()
    return {"Authorization": f"Bearer {body['tokens']['access_token']}", **body}


def get_last_code(client: TestClient, phone: str) -> str | None:
    provider = client.app.state.otp_provider
    for p, code in reversed(provider.sent):
        if p == phone:
            return code
    return None


def admin_headers(client: TestClient) -> dict:
    import pyotp as _pyotp

    code = _pyotp.TOTP(ADMIN_TOTP).now()
    r = client.post(
        "/api/v1/admin/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "tam": "", "totp_code": code},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def make_jpeg(color=(120, 60, 200), seed: int = 0, size=(640, 480)) -> bytes:
    import random

    from PIL import Image, ImageDraw

    random.seed(seed)
    img = Image.new("RGB", size, color)
    draw = ImageDraw.Draw(img)
    for _ in range(30):
        x1, y1 = random.randint(0, size[0] - 30), random.randint(0, size[1] - 30)
        x2, y2 = x1 + random.randint(15, 120), y1 + random.randint(15, 100)
        tint = tuple(min(255, max(0, c + random.randint(-50, 70))) for c in color)
        draw.rectangle([x1, y1, x2, y2], fill=tint)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def make_pdf() -> bytes:
    return b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"


def listing_payload(**overrides) -> dict:
    payload = {
        "title": "شقة مفروشة تطل على النيل",
        "property_type": "apartment",
        "rental_type": "residential",
        "furnished": "furnished",
        "rent_monthly": 9500,
        "deposit_months": 2,
        "area_m2": 110.5,
        "bedrooms": 2,
        "bathrooms": 2,
        "floor": 4,
        "has_elevator": True,
        "finishing": "finished",
        "building_age": 5,
        "amenities": {"parking": True, "security": True, "internet": False},
        "description": "وحدة جميلة قريبة من كل الخدمات والمواصلات.",
        "governorate_id": str(GOV_CAIRO),
        "city_id": str(CITY_CAIRO),
        "district_id": str(DIST_MAADI),
        "address_text": "شارع9، المعادي، القاهرة",
        "latitude": 29.9602,
        "longitude": 31.2570,
        "available_from": None,
        "min_term_months": 6,
    }
    payload.update(overrides)
    return payload


def create_listing(client: TestClient, headers: dict, **overrides) -> dict:
    r = client.post("/api/v1/listings", json=listing_payload(**overrides), headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def upload_photos(client: TestClient, headers: dict, listing_id: str, count: int = 3) -> None:
    base = int(listing_id.replace("-", "")[:6], 16)  # unique visual content per listing
    for i in range(count):
        r = client.post(
            f"/api/v1/listings/{listing_id}/media",
            headers=headers,
            files={
                "file": (
                    f"photo{i}.jpg",
                    make_jpeg(color=(30 + i * 50, 90, 160), seed=base + i),
                    "image/jpeg",
                )
            },
            data={"media_type": "photo"},
        )
        assert r.status_code == 201, r.text


def verify_owner(client: TestClient, headers: dict) -> None:
    """Upload + admin-approve an ownership proof (BR-6) for the current user."""
    r = client.post(
        "/api/v1/me/verification",
        headers=headers,
        data={"doc_type": "electricity_bill"},
        files={"file": ("bill.jpg", make_jpeg(color=(90, 90, 90), seed=42), "image/jpeg")},
    )
    assert r.status_code == 201, r.text
    doc_id = r.json()["id"]
    admin = admin_headers(client)
    r = client.post(
        f"/api/v1/admin/verifications/{doc_id}/decision",
        headers=admin,
        json={"decision": "approve"},
    )
    assert r.status_code == 200, r.text


def submit_and_approve(client: TestClient, headers: dict, listing_id: str) -> dict:
    """Full happy path: photos → submit → moderator approve (returns listing detail)."""
    upload_photos(client, headers, listing_id)
    r = client.post(f"/api/v1/listings/{listing_id}/submit", headers=headers)
    assert r.status_code == 200, r.text
    admin = admin_headers(client)
    r = client.post(f"/api/v1/admin/listings/{listing_id}/approve", headers=admin)
    assert r.status_code == 200, r.text
    r = client.get(f"/api/v1/listings/{listing_id}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def activate_listing_via_db(app, listing_id: str, weeks: int = 1) -> None:
    """Phase-1 test hook: open a paid ad period directly (payment wiring is Phase 2)."""
    from app.models.catalog import Listing, Plan
    from app.services.listing_service import activate_listing

    session = app.state.session_factory()
    try:
        listing = session.get(Listing, uuid.UUID(listing_id))
        plan = session.query(Plan).filter(Plan.active.is_(True)).first()
        activate_listing(session, listing, plan, weeks=weeks)
        session.commit()
    finally:
        session.close()
