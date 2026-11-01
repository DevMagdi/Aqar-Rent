"""Public search: visibility (BR-3), filters, bbox, sorts, cursor pagination, exact pin."""

from __future__ import annotations

import uuid

from tests.conftest import (
    CITY_CAIRO,
    CITY_GIZA,
    DIST_MAADI,
    GOV_CAIRO,
    GOV_GIZA,
    activate_listing_via_db,
    create_listing,
    otp_login,
    submit_and_approve,
    upload_photos,
    verify_owner,
)


def _make_active(client, headers: dict, **overrides) -> dict:
    verify_owner(client, headers)
    listing = create_listing(client, headers, **overrides)
    submit_and_approve(client, headers, listing["id"])
    activate_listing_via_db(client.app, listing["id"])
    return listing


def test_search_shows_only_active_with_running_ad(client, seeded):
    headers = otp_login(client, "01022345551")["Authorization"]
    h = {"Authorization": headers}
    verify_owner(client, h)

    # 1) draft → invisible
    draft = create_listing(client, h, title="مسودة لا تظهر أبداً")
    r = client.get("/api/v1/listings")
    assert all(i["id"] != draft["id"] for i in r.json()["items"])

    # 2) submitted → invisible
    sub = create_listing(client, h, title="مُرسل للمراجعة لا يظهر")
    upload_photos(client, h, sub["id"])
    client.post(f"/api/v1/listings/{sub['id']}/submit", headers=h)
    r = client.get("/api/v1/listings")
    assert all(i["id"] != sub["id"] for i in r.json()["items"])

    # 3) approved but UNPAID → invisible (BR-3/BR-5)
    appr = create_listing(client, h, title="موافق عليه بدون دفع")
    submit_and_approve(client, h, appr["id"])
    r = client.get("/api/v1/listings")
    assert all(i["id"] != appr["id"] for i in r.json()["items"])

    # 4) paid ad running → visible
    active = create_listing(client, h, title="نشط وظاهر في البحث")
    submit_and_approve(client, h, active["id"])
    activate_listing_via_db(client.app, active["id"])
    r = client.get("/api/v1/listings")
    ids = [i["id"] for i in r.json()["items"]]
    assert active["id"] in ids
    assert appr["id"] not in ids


def test_expired_ad_disappears_and_listing_expired(client, seeded):
    headers = otp_login(client, "01022345552")["Authorization"]
    h = {"Authorization": headers}
    listing = _make_active(client, h, title="سينتهي قريباً")
    assert any(i["id"] == listing["id"] for i in client.get("/api/v1/listings").json()["items"])

    # force the ad into the past, then run the hourly job
    from app.models.commerce import AdPeriod

    session = client.app.state.session_factory()
    try:
        period = session.query(AdPeriod).filter(AdPeriod.listing_id == uuid.UUID(listing["id"])).one()
        from datetime import timedelta

        from app.services.common import utcnow

        period.starts_at = utcnow() - timedelta(days=10)
        period.ends_at = utcnow() - timedelta(hours=1)
        session.commit()
    finally:
        session.close()

    # hidden IMMEDIATELY (search joins ad windows) — BR-3 says within 1h at latest
    r = client.get("/api/v1/listings")
    assert all(i["id"] != listing["id"] for i in r.json()["items"])

    from app.services.jobs import end_expired_ad_periods

    session = client.app.state.session_factory()
    try:
        end_expired_ad_periods(session)
        session.commit()
        from app.models.catalog import Listing

        assert session.get(Listing, uuid.UUID(listing["id"])).status == "expired"
    finally:
        session.close()


def test_filters(client, seeded):
    headers = otp_login(client, "01022345553")["Authorization"]
    h = {"Authorization": headers}
    a = _make_active(
        client,
        h,
        title="شقة في القاهرة الإيجار مرتفع",
        rent_monthly=15000,
        property_type="apartment",
        bedrooms=3,
        amenities={"parking": True},
    )
    b = _make_active(
        client,
        h,
        title="استوديو رخيص في المعادي",
        rent_monthly=4000,
        property_type="studio",
        bedrooms=0,
        governorate_id=str(GOV_CAIRO),
        city_id=str(CITY_CAIRO),
        district_id=str(DIST_MAADI),
        amenities={"balcony": True},
        latitude=29.95,
        longitude=31.26,
    )

    # governorate
    r = client.get(f"/api/v1/listings?governorate_id={GOV_CAIRO}")
    ids = [i["id"] for i in r.json()["items"]]
    assert a["id"] in ids and b["id"] in ids

    # price range
    r = client.get("/api/v1/listings?max_price=5000")
    ids = [i["id"] for i in r.json()["items"]]
    assert b["id"] in ids and a["id"] not in ids

    # property type
    r = client.get("/api/v1/listings?property_type=studio")
    ids = [i["id"] for i in r.json()["items"]]
    assert ids == [b["id"]]

    # bedrooms
    r = client.get("/api/v1/listings?bedrooms=3")
    ids = [i["id"] for i in r.json()["items"]]
    assert a["id"] in ids and b["id"] not in ids

    # amenities (JSONB contains-style filter)
    r = client.get("/api/v1/listings?amenities=parking")
    ids = [i["id"] for i in r.json()["items"]]
    assert a["id"] in ids and b["id"] not in ids

    # text query
    r = client.get("/api/v1/listings?q=استوديو")
    ids = [i["id"] for i in r.json()["items"]]
    assert ids == [b["id"]]

    # furnished
    r = client.get("/api/v1/listings?furnished=furnished")
    ids = [i["id"] for i in r.json()["items"]]
    assert a["id"] in ids

    # bbox around Maadi (a) excludes dokki-ish (b is also Maadi…) — use Giza point instead
    # b is in Maadi too; use a bbox that contains only part: Cairo center
    r = client.get("/api/v1/listings?bbox=31.20,29.90,31.30,30.00")
    assert r.status_code == 200  # both inside — just assert shape
    assert all("geo" in i for i in r.json()["items"])

    r = client.get("/api/v1/listings?bbox=31.2,29")  # malformed
    assert r.status_code == 422


def test_bbox_precise_filter(client, seeded):
    headers = otp_login(client, "01022345554")["Authorization"]
    h = {"Authorization": headers}
    inside = _make_active(client, h, title="داخل حدود القاهرة", latitude=30.0444, longitude=31.2357)
    outside = _make_active(
        client,
        h,
        title="في أسوان البحري",
        governorate_id=str(GOV_GIZA),
        city_id=str(CITY_GIZA),
        district_id=None,
        latitude=24.0889,
        longitude=32.8998,
    )
    r = client.get("/api/v1/listings?bbox=30.9,29.6,31.6,30.4")
    ids = [i["id"] for i in r.json()["items"]]
    assert inside["id"] in ids and outside["id"] not in ids


def test_sorts_and_cursor_pagination(client, seeded):
    headers = otp_login(client, "01022345555")["Authorization"]
    h = {"Authorization": headers}
    prices = [7000, 5000, 9000, 6000, 8000]
    made = []
    for p in prices:
        made.append(_make_active(client, h, title=f"وحدة بسعر {p}", rent_monthly=p))

    # price_asc
    r = client.get("/api/v1/listings?sort=price_asc&limit=2")
    ids = [i["id"] for i in r.json()["items"]]
    assert [i["rent_monthly"] for i in r.json()["items"]] == [5000, 6000]
    assert r.json()["next_cursor"]

    # walk the whole cursor chain without duplicates
    seen = ids[:]
    cursor = r.json()["next_cursor"]
    while cursor:
        r = client.get(f"/api/v1/listings?sort=price_asc&limit=2&cursor={cursor}")
        assert r.status_code == 200, r.text
        body = r.json()
        seen.extend(i["id"] for i in body["items"])
        cursor = body["next_cursor"]
    assert len(seen) == len(set(seen)) == len(prices)

    # price_desc
    r = client.get("/api/v1/listings?sort=price_desc&limit=5")
    assert [i["rent_monthly"] for i in r.json()["items"]] == sorted(prices, reverse=True)

    # newest (default) — created sequentially so order is stable
    r = client.get("/api/v1/listings?sort=newest&limit=5")
    assert r.status_code == 200
    assert r.json()["items"]  # non-empty


def test_invalid_cursor_rejected(client):
    r = client.get("/api/v1/listings?cursor=@@not-base64@@")
    assert r.status_code == 400
    assert r.json()["code"] == "INVALID_CURSOR"


def test_exact_location_requires_login(client, seeded):
    headers = otp_login(client, "01022345556")["Authorization"]
    h = {"Authorization": headers}
    listing = _make_active(client, h, title="موقع دقيق")

    # anonymous → approximate pin (150 m) and exact requires auth
    r = client.get(f"/api/v1/listings/{listing['id']}")
    geo = r.json()["geo"]
    assert geo["accuracy_m"] == 150

    r = client.get(f"/api/v1/listings/{listing['id']}?exact=true")
    assert r.status_code == 401

    # logged-in tenant taps "show exact location"
    r = client.get(f"/api/v1/listings/{listing['id']}?exact=true", headers=h)
    assert r.status_code == 200
    assert r.json()["geo"]["accuracy_m"] == 0
    assert r.json()["geo"]["latitude"] != geo["latitude"] or r.json()["geo"]["longitude"] != geo["longitude"]


def test_public_detail_increments_views_and_hides_internals(client, seeded):
    headers = otp_login(client, "01022345557")["Authorization"]
    h = {"Authorization": headers}
    listing = _make_active(client, h)

    r = client.get(f"/api/v1/listings/{listing['id']}")
    assert r.status_code == 200
    body = r.json()
    assert body["view_count"] is None  # hidden from public
    assert body["status"] is None
    assert body["verified_badge"] is True  # owner has approved proof
    assert body["media"][0]["url"]

    r = client.get(f"/api/v1/listings/{listing['id']}", headers=h)
    assert r.json()["view_count"] >= 1  # owner sees stats
    r = client.get(f"/api/v1/listings/{listing['id']}", headers=h)
    assert r.json()["view_count"] == 1  # own views don't inflate
