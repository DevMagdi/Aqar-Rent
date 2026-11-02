"""Phase 4B: handovers — check-in/out, media, OTP confirm, immutability, PDF."""

from __future__ import annotations

from tests.conftest import (
    get_last_code,
    make_jpeg,
)
from tests.test_contracts import OWNER, TENANT, _approved_listing, _headers, confirm_as, create_draft

CHECK_IN = {
    "occurred_at": "2026-12-01",
    "rooms": [
        {
            "name": "living_room",
            "items": [
                {"label": "باركيه", "condition": "good", "note": ""},
                {"label": "مكيف شباك", "condition": "needs_repair", "note": "يحتاج تعبئة فريون"},
            ],
        },
        {
            "name": "kitchen",
            "items": [
                {"label": "دولاب مطبخ", "condition": "good", "note": ""},
                {"label": "بوتاجاز", "condition": "damaged", "note": "شاوش"},
            ],
        },
    ],
    "meters": {"electricity": {"value": "12540"}, "water": {"value": "3310"}, "gas": {"value": "870"}},
    "keys_count": 2,
    "inventory": [{"label": "أريكة3 مقاعد", "condition": "good", "note": ""}],
}


def _request_code(client, phone: str) -> str:
    r = client.post("/api/v1/auth/otp/request", json={"phone": phone})
    assert r.status_code == 200, r.text
    code = r.json().get("dev_code") or get_last_code(client, phone)
    assert code
    return code


def make_confirmed_contract(client, headers, listing_id: str | None = None) -> dict:
    if listing_id is None:
        listing = _approved_listing(client, headers)
        listing_id = listing["id"]
    c = create_draft(client, headers, listing_id)
    client.post(f"/api/v1/contracts/{c['id']}/request-confirmation", headers=headers)
    confirm_as(client, OWNER, c["id"])
    confirm_as(client, TENANT, c["id"])
    return c


def _create_checkin(client, contract_id: str, headers: dict, data: dict | None = None) -> dict:
    r = client.post(
        f"/api/v1/contracts/{contract_id}/handovers",
        json={"kind": "check_in", "data": data or CHECK_IN},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


# ── creation rules ───────────────────────────────────────────────────────────


def test_handover_requires_confirmed_contract(client, seeded):
    h = _headers(client, OWNER)
    listing = _approved_listing(client, h)
    c = create_draft(client, h, listing["id"])  # still draft
    r = client.post(
        f"/api/v1/contracts/{c['id']}/handovers",
        json={"kind": "check_in", "data": CHECK_IN},
        headers=h,
    )
    assert r.status_code == 409
    assert r.json()["code"] == "CONTRACT_NOT_CONFIRMED"


def test_checkin_validation_rejects_bad_condition(client, seeded):
    h = _headers(client, OWNER)
    c = make_confirmed_contract(client, h)
    bad = dict(CHECK_IN, rooms=[{"name": "kitchen", "items": [{"label": "x", "condition": "wrecked"}]}])
    r = client.post(
        f"/api/v1/contracts/{c['id']}/handovers", json={"kind": "check_in", "data": bad}, headers=h
    )
    assert r.status_code == 422


def test_checkout_must_come_from_confirmed_checkin(client, seeded):
    h = _headers(client, OWNER)
    c = make_confirmed_contract(client, h)

    # without source →422
    r = client.post(
        f"/api/v1/contracts/{c['id']}/handovers", json={"kind": "check_out", "data": {}}, headers=h
    )
    assert r.status_code == 422

    # draft (unconfirmed) check-in cannot be a source
    cin = _create_checkin(client, c["id"], h)
    r = client.post(
        f"/api/v1/contracts/{c['id']}/handovers",
        json={"kind": "check_out", "source_handover_id": cin["id"], "data": {}},
        headers=h,
    )
    assert r.status_code == 409

    # confirm the check-in with both parties → source accepted, structure copied
    code = _request_code(client, OWNER)
    r = client.post(f"/api/v1/handovers/{cin['id']}/confirm", json={"otp_code": code}, headers=h)
    assert r.status_code == 200
    th = _headers(client, TENANT)
    code = _request_code(client, TENANT)
    r = client.post(f"/api/v1/handovers/{cin['id']}/confirm", json={"otp_code": code}, headers=th)
    assert r.status_code == 200 and r.json()["status"] == "confirmed"

    r = client.post(
        f"/api/v1/contracts/{c['id']}/handovers",
        json={
            "kind": "check_out",
            "source_handover_id": cin["id"],
            "data": {
                "occurred_at": "2027-12-01",
                "rooms": [{"name": "living_room", "items": [{"label": "باركيه", "condition": "good"}]}],
                "meters": {"electricity": {"value": "13990"}},
            },
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["source_handover_id"] == cin["id"]
    names = {room["name"] for room in out["data"]["rooms"]}
    assert "kitchen" in names  # missing check-in room was copied over
    kitchen = next(r_ for r_ in out["data"]["rooms"] if r_["name"] == "kitchen")
    assert {i["label"] for i in kitchen["items"]} == {"دولاب مطبخ", "بوتاجاز"}
    assert out["data"]["keys_count"] == 2  # inherited from check-in
    assert set(out["data"]["meters"]) == {"electricity", "water", "gas"}


# ── media ────────────────────────────────────────────────────────────────────


def test_media_upload_photo_and_reject_unknown_type(client, seeded):
    h = _headers(client, OWNER)
    c = make_confirmed_contract(client, h)
    cin = _create_checkin(client, c["id"], h)

    r = client.post(
        f"/api/v1/handovers/{cin['id']}/media",
        headers=h,
        files={"file": ("room.jpg", make_jpeg(seed=7), "image/jpeg")},
        data={"room": "living_room", "note": "باركيه"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["room"] == "living_room" and body["media_type"] == "photo"
    assert body["url"].startswith("/api/v1/files?")  # signed, short-lived

    r = client.post(
        f"/api/v1/handovers/{cin['id']}/media",
        headers=h,
        files={"file": ("evil.exe", b"MZ9000", "application/x-msdownload")},
        data={"room": "living_room"},
    )
    assert r.status_code == 415

    # only parties can upload
    intruder = _headers(client, "01007770097")
    r = client.post(
        f"/api/v1/handovers/{cin['id']}/media",
        headers=intruder,
        files={"file": ("room.jpg", make_jpeg(seed=8), "image/jpeg")},
        data={"room": "living_room"},
    )
    assert r.status_code == 404


# ── comments + OTP confirmation + immutability ───────────────────────────────


def test_other_party_comments_then_both_confirm_immutable(client, seeded):
    h = _headers(client, OWNER)
    c = make_confirmed_contract(client, h)
    cin = _create_checkin(client, c["id"], h)

    # tenant (non-creator) reviews and adds a comment
    th = _headers(client, TENANT)
    r = client.patch(
        f"/api/v1/handovers/{cin['id']}",
        json={"data": dict(CHECK_IN, comments={"tenant-note": "تمت ملاحظة تلف البوتاجاز"})},
        headers=th,
    )
    assert r.status_code == 200
    assert r.json()["data"]["comments"]

    # owner confirms first (fresh OTP)
    code = _request_code(client, OWNER)
    r = client.post(f"/api/v1/handovers/{cin['id']}/confirm", json={"otp_code": code}, headers=h)
    assert r.status_code == 200
    out = r.json()
    assert out["status"] == "draft" and out["can_confirm"] is False

    # wrong code rejected
    code = _request_code(client, TENANT)
    r = client.post(f"/api/v1/handovers/{cin['id']}/confirm", json={"otp_code": "999999"}, headers=th)
    assert r.status_code == 400

    code = _request_code(client, TENANT)
    r = client.post(f"/api/v1/handovers/{cin['id']}/confirm", json={"otp_code": code}, headers=th)
    assert r.status_code == 200
    out = r.json()
    assert out["status"] == "confirmed"
    assert len(out["hash"]) == 64
    assert len(out["confirmations"]) == 2

    # immutable: no edits, no new media, no re-confirm
    r = client.patch(f"/api/v1/handovers/{cin['id']}", json={"data": CHECK_IN}, headers=h)
    assert r.status_code == 409
    r = client.post(
        f"/api/v1/handovers/{cin['id']}/media",
        headers=h,
        files={"file": ("x.jpg", make_jpeg(seed=9), "image/jpeg")},
        data={"room": "kitchen"},
    )
    assert r.status_code == 409
    code = _request_code(client, OWNER)
    r = client.post(f"/api/v1/handovers/{cin['id']}/confirm", json={"otp_code": code}, headers=h)
    assert r.status_code == 409

    # notifications for confirmation requests
    notes = client.get("/api/v1/notifications", headers=th).json()["items"]
    assert any(n["type"] in ("handover_confirmation_requested", "handover_created") for n in notes)


def test_handover_pdf_after_confirmation_only(client, seeded):
    h = _headers(client, OWNER)
    c = make_confirmed_contract(client, h)
    cin = _create_checkin(client, c["id"], h)

    assert client.get(f"/api/v1/handovers/{cin['id']}/pdf", headers=h).status_code == 409

    th = _headers(client, TENANT)  # login FIRST (it burns its own OTP)
    code = _request_code(client, OWNER)
    r1 = client.post(f"/api/v1/handovers/{cin['id']}/confirm", json={"otp_code": code}, headers=h)
    assert r1.status_code == 200, r1.text
    code = _request_code(client, TENANT)
    r2 = client.post(f"/api/v1/handovers/{cin['id']}/confirm", json={"otp_code": code}, headers=th)
    assert r2.status_code == 200, r2.text

    r = client.get(f"/api/v1/handovers/{cin['id']}/pdf", headers=h)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    # tenant can download it too
    r = client.get(f"/api/v1/handovers/{cin['id']}/pdf", headers=th)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")


def test_listing_contract_handover_end_to_end(client, app, seeded):
    """Full acceptance slice: listing → contract → check-in → check-out → PDFs."""
    h = _headers(client, OWNER)
    listing = _approved_listing(client, h)
    c = make_confirmed_contract(client, h, listing["id"])

    cin = _create_checkin(client, c["id"], h)
    for phone, headers in ((OWNER, h), (TENANT, _headers(client, TENANT))):
        code = _request_code(client, phone)
        r = client.post(f"/api/v1/handovers/{cin['id']}/confirm", json={"otp_code": code}, headers=headers)
        assert r.status_code == 200
    assert client.get(f"/api/v1/handovers/{cin['id']}/pdf", headers=h).status_code == 200

    # contract PDF too
    assert client.get(f"/api/v1/contracts/{c['id']}/pdf", headers=h).status_code == 200

    # check-out with side-by-side meter difference data
    th = _headers(client, TENANT)
    r = client.post(
        f"/api/v1/contracts/{c['id']}/handovers",
        json={
            "kind": "check_out",
            "source_handover_id": cin["id"],
            "data": {
                "occurred_at": "2027-12-01",
                "rooms": [
                    {
                        "name": "living_room",
                        "items": [{"label": "باركيه", "condition": "damaged", "note": "خدش"}],
                    },
                    {
                        "name": "kitchen",
                        "items": [
                            {"label": "دولاب مطبخ", "condition": "good"},
                            {"label": "بوتاجاز", "condition": "good"},
                        ],
                    },
                ],
                "meters": {
                    "electricity": {"value": "13990"},
                    "water": {"value": "3455"},
                    "gas": {"value": "905"},
                },
                "keys_count": 2,
            },
        },
        headers=th,
    )
    assert r.status_code == 201, r.text
    cout = r.json()
    # confirmations from both sides
    for phone, headers in ((OWNER, h), (TENANT, th)):
        code = _request_code(client, phone)
        assert (
            client.post(
                f"/api/v1/handovers/{cout['id']}/confirm", json={"otp_code": code}, headers=headers
            ).status_code
            == 200
        )
    final = client.get(f"/api/v1/handovers/{cout['id']}", headers=h).json()
    assert final["status"] == "confirmed" and final["hash"]
    pdf = client.get(f"/api/v1/handovers/{cout['id']}/pdf", headers=h)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
