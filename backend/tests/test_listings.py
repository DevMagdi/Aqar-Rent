"""Listing lifecycle: BR-7 cap, content rules, media, submit, moderation (BR-6), rented."""

from __future__ import annotations

from tests.conftest import (
    admin_headers,
    create_listing,
    listing_payload,
    make_jpeg,
    otp_login,
    submit_and_approve,
    upload_photos,
    verify_owner,
)


def test_create_listing_draft_and_detail(client, seeded):
    headers = otp_login(client, "01012342221")["Authorization"]
    h = {"Authorization": headers}
    listing = create_listing(client, h)
    assert listing["status"] == "draft"

    # owner sees own draft; strangers get 404 (not public)
    r = client.get(f"/api/v1/listings/{listing['id']}", headers=h)
    assert r.status_code == 200
    assert r.json()["status"] == "draft"
    r = client.get(f"/api/v1/listings/{listing['id']}")
    assert r.status_code == 404


def test_listing_cap_br7(client, seeded):
    headers = otp_login(client, "01012342222")["Authorization"]
    h = {"Authorization": headers}
    for i in range(5):
        r = client.post(
            "/api/v1/listings",
            json=listing_payload(title=f"إعلان رقم {i + 1} للتجربة"),
            headers=h,
        )
        assert r.status_code == 201, r.text
    r = client.post("/api/v1/listings", json=listing_payload(title="السادس يجب أن يُرفض"), headers=h)
    assert r.status_code == 409
    assert r.json()["code"] == "LISTING_CAP_REACHED"
    assert r.json()["details"]["cap"] == 5


def test_listing_cap_raise_by_super_admin(client, seeded):
    headers = otp_login(client, "01012342223")["Authorization"]
    h = {"Authorization": headers}
    for i in range(5):
        client.post("/api/v1/listings", json=listing_payload(title=f"listing {i} here"), headers=h)

    # find user id
    me = client.get("/api/v1/me", headers=h).json()
    admin = admin_headers(client)
    r = client.patch(
        f"/api/v1/admin/users/{me['id']}",
        json={"listing_cap": 8},
        headers=admin,
    )
    assert r.status_code == 200, r.text
    r = client.post("/api/v1/listings", json=listing_payload(title="السادس بعد رفع السقف"), headers=h)
    assert r.status_code == 201


def test_description_phone_rejected_br12(client, seeded):
    headers = otp_login(client, "01012342224")["Authorization"]
    r = client.post(
        "/api/v1/listings",
        json=listing_payload(description="اتصل بي على 01001112233 لأي استفسار"),
        headers={"Authorization": headers},
    )
    assert r.status_code == 422
    assert r.json()["code"] == "CONTENT_RULE_VIOLATION"


def test_location_hierarchy_validated(client, seeded):
    headers = otp_login(client, "01012342225")["Authorization"]
    bad = listing_payload()
    bad["city_id"] = str(__import__("uuid").uuid4())
    r = client.post("/api/v1/listings", json=bad, headers={"Authorization": headers})
    assert r.status_code == 422


def test_media_and_submit_requires_three_photos(client, seeded):
    headers = otp_login(client, "01012342226")["Authorization"]
    h = {"Authorization": headers}
    listing = create_listing(client, h)

    # 2 photos → submit rejected
    upload_photos(client, h, listing["id"], count=2)
    r = client.post(f"/api/v1/listings/{listing['id']}/submit", headers=h)
    assert r.status_code == 422
    assert r.json()["code"] == "MEDIA_COUNT_INVALID"

    # without verification upload → BR-6 gate at submit
    upload_photos(client, h, listing["id"], count=1)
    r = client.post(f"/api/v1/listings/{listing['id']}/submit", headers=h)
    assert r.status_code == 409
    assert r.json()["code"] == "VERIFICATION_REQUIRED"


def test_submit_needs_verification_upload_and_approve_needs_approval(client, seeded):
    headers = otp_login(client, "01012342227")["Authorization"]
    h = {"Authorization": headers}
    listing = create_listing(client, h)
    upload_photos(client, h, listing["id"], count=3)

    # upload proof but NOT approved yet
    r = client.post(
        "/api/v1/me/verification",
        headers=h,
        data={"doc_type": "electricity_bill"},
        files={"file": ("bill.jpg", make_jpeg(seed=7), "image/jpeg")},
    )
    assert r.status_code == 201

    # submit works (proof uploaded)
    r = client.post(f"/api/v1/listings/{listing['id']}/submit", headers=h)
    assert r.status_code == 200, r.text

    # approve blocked until verification is approved (BR-6)
    admin = admin_headers(client)
    r = client.post(f"/api/v1/admin/listings/{listing['id']}/approve", headers=admin)
    assert r.status_code == 409
    assert r.json()["code"] == "VERIFICATION_REQUIRED"


def test_reject_with_preset_reason(client, seeded):
    headers = otp_login(client, "01012342228")["Authorization"]
    h = {"Authorization": headers}
    listing = create_listing(client, h)
    verify_owner(client, h)
    upload_photos(client, h, listing["id"], count=3)
    client.post(f"/api/v1/listings/{listing['id']}/submit", headers=h)

    admin = admin_headers(client)
    r = client.post(
        f"/api/v1/admin/listings/{listing['id']}/reject",
        json={"reason_code": "fake_photos", "note": "الصور غير حقيقية"},
        headers=admin,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "rejected"

    # owner sees reason and can edit + resubmit
    r = client.get(f"/api/v1/listings/{listing['id']}", headers=h)
    assert "Photos do not match" in r.json()["reject_reason"]


def test_reject_requires_known_reason_code(client, seeded):
    headers = otp_login(client, "01012342229")["Authorization"]
    h = {"Authorization": headers}
    listing = create_listing(client, h)
    verify_owner(client, h)
    upload_photos(client, h, listing["id"], count=3)
    client.post(f"/api/v1/listings/{listing['id']}/submit", headers=h)
    admin = admin_headers(client)
    r = client.post(
        f"/api/v1/admin/listings/{listing['id']}/reject",
        json={"reason_code": "made_up_reason"},
        headers=admin,
    )
    assert r.status_code == 422


def test_duplicate_photo_detection(client, seeded):
    headers_a = otp_login(client, "01012342230")["Authorization"]
    ha = {"Authorization": headers_a}
    verify_owner(client, ha)
    l1 = create_listing(client, ha)
    photo = make_jpeg(color=(11, 22, 33), seed=5)
    # owner A lists first with a given photo
    for i in range(3):
        client.post(
            f"/api/v1/listings/{l1['id']}/media",
            headers=ha,
            files={"file": (f"p{i}.jpg", photo if i == 0 else make_jpeg(seed=100 + i), "image/jpeg")},
            data={"media_type": "photo"},
        )
    submit_and_approve(client, ha, l1["id"])

    # same owner tries to reuse the same photo on another listing
    l2 = create_listing(client, ha, title="إعادة استخدام الصورة")
    for i in range(3):
        client.post(
            f"/api/v1/listings/{l2['id']}/media",
            headers=ha,
            files={"file": (f"q{i}.jpg", photo if i == 0 else make_jpeg(seed=200 + i), "image/jpeg")},
            data={"media_type": "photo"},
        )
    r = client.post(f"/api/v1/listings/{l2['id']}/submit", headers=ha)
    assert r.status_code == 409
    assert r.json()["code"] == "DUPLICATE_PHOTO"


def test_mark_rented_and_hidden_from_search(client, seeded):
    headers = otp_login(client, "01012342231")["Authorization"]
    h = {"Authorization": headers}
    verify_owner(client, h)
    listing = create_listing(client, h)
    submit_and_approve(client, h, listing["id"])

    from tests.conftest import activate_listing_via_db

    activate_listing_via_db(client.app, listing["id"])
    r = client.get("/api/v1/listings")
    assert any(i["id"] == listing["id"] for i in r.json()["items"])

    r = client.post(f"/api/v1/listings/{listing['id']}/mark-rented", headers=h)
    assert r.status_code == 200
    assert r.json()["status"] == "rented"

    r = client.get("/api/v1/listings")
    assert all(i["id"] != listing["id"] for i in r.json()["items"])
    r = client.get(f"/api/v1/listings/{listing['id']}")
    assert r.status_code == 404


def test_update_only_in_editable_states(client, seeded):
    headers = otp_login(client, "01012342232")["Authorization"]
    h = {"Authorization": headers}
    verify_owner(client, h)
    listing = create_listing(client, h)

    r = client.patch(f"/api/v1/listings/{listing['id']}", json={"rent_monthly": 11000}, headers=h)
    assert r.status_code == 200

    upload_photos(client, h, listing["id"], count=3)
    client.post(f"/api/v1/listings/{listing['id']}", headers=h)  # wrong method, ignored
    r = client.post(f"/api/v1/listings/{listing['id']}/submit", headers=h)
    assert r.status_code == 200

    # submitted → editing blocked
    r = client.patch(f"/api/v1/listings/{listing['id']}", json={"rent_monthly": 12000}, headers=h)
    assert r.status_code == 409
    assert r.json()["code"] == "LISTING_NOT_EDITABLE"


def test_cannot_touch_others_listing(client, seeded):
    headers_a = otp_login(client, "01012342233")["Authorization"]
    headers_b = otp_login(client, "01012342234")["Authorization"]
    listing = create_listing(client, {"Authorization": headers_a})
    r = client.patch(
        f"/api/v1/listings/{listing['id']}",
        json={"rent_monthly": 1234},
        headers={"Authorization": headers_b},
    )
    assert r.status_code == 404
    r = client.post(f"/api/v1/listings/{listing['id']}/submit", headers={"Authorization": headers_b})
    assert r.status_code == 404
