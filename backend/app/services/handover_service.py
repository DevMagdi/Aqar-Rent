"""Handover (check-in / check-out) lifecycle — Phase 4B.

Attached to a **confirmed** contract. A check-out is always created from a
confirmed check-in (structure copied, conditions re-assessed). Either party can
edit while the record is a draft, add photos/videos and comments; both parties
confirm with a fresh OTP and the record freezes with a SHA-256 hash.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.crypto_service import terms_hash
from app.core.errors import AppError
from app.models.identity import User
from app.models.social import Contract, Handover, HandoverMedia
from app.services.common import utcnow
from app.services.contract_service import get_contract_for_user
from app.services.media import process_photo, validate_video
from app.services.notifications import create_notification

logger = logging.getLogger(__name__)

VALID_ROOMS = (
    "living_room",
    "bedroom_1",
    "bedroom_2",
    "bedroom_3",
    "kitchen",
    "bathroom_1",
    "bathroom_2",
    "balcony",
    "other",
)
METER_KEYS = ("electricity", "water", "gas")
CONDITIONS = ("good", "needs_repair", "damaged")


def _kind_ar(handover: Handover) -> str:
    return "الدخول" if handover.kind == "check_in" else "الخروج"


def _role(contract: Contract, user: User) -> str | None:
    if user.id == contract.owner_id:
        return "owner"
    if user.id == contract.tenant_id:
        return "tenant"
    return None


def get_handover_for_user(db: Session, handover_id: UUID, user: User) -> Handover:
    handover = db.get(Handover, handover_id)
    if handover is None:
        raise AppError("HANDOVER_NOT_FOUND", "Handover not found", status_code=404)
    contract = db.get(Contract, handover.contract_id)
    if contract is None or _role(contract, user) is None:
        raise AppError("HANDOVER_NOT_FOUND", "Handover not found", status_code=404)
    return handover


def _validate_data(data: dict[str, Any]) -> dict[str, Any]:
    rooms = data.get("rooms") or []
    if len(rooms) > 30:
        raise AppError("INVALID_HANDOVER", "Too many rooms", status_code=422)
    for room in rooms:
        name = str(room.get("name", "")).strip()
        if not name:
            raise AppError("INVALID_HANDOVER", "Every room needs a name", status_code=422)
        for item in room.get("items") or []:
            if not str(item.get("label", "")).strip():
                raise AppError("INVALID_HANDOVER", "Every item needs a label", status_code=422)
            cond = item.get("condition")
            if cond is not None and cond not in CONDITIONS:
                raise AppError("INVALID_HANDOVER", f"Bad condition {cond}", status_code=422)
    meters = data.get("meters") or {}
    for key, entry in meters.items():
        if key not in METER_KEYS:
            raise AppError("INVALID_HANDOVER", f"Unknown meter {key}", status_code=422)
        raw = entry.get("value") if isinstance(entry, dict) else entry
        if raw in (None, ""):
            continue
        try:
            value = float(raw)
        except (TypeError, ValueError) as exc:
            raise AppError(
                "INVALID_HANDOVER", f"Meter {key} reading must be a number", status_code=422
            ) from exc
        if value < 0 or value > 1_000_000_000:
            raise AppError(
                "INVALID_HANDOVER", f"Meter {key} reading is out of range", status_code=422
            )
        if isinstance(entry, dict):
            entry["value"] = value
    keys = data.get("keys_count")
    if keys is not None:
        try:
            keys_int = int(keys)
        except (TypeError, ValueError) as exc:
            raise AppError("INVALID_HANDOVER", "keys_count must be an integer", status_code=422) from exc
        if not (0 <= keys_int <= 100):
            raise AppError("INVALID_HANDOVER", "keys_count out of range", status_code=422)
    return data


def create_handover(
    db: Session,
    settings: Settings,
    *,
    contract_id: UUID,
    user: User,
    kind: str,
    source_handover_id: UUID | None,
    data: dict[str, Any],
) -> Handover:
    contract = get_contract_for_user(db, contract_id, user)
    if contract.status != "confirmed":
        raise AppError("CONTRACT_NOT_CONFIRMED", "Handovers require a confirmed contract", status_code=409)
    if kind not in ("check_in", "check_out"):
        raise AppError("INVALID_HANDOVER", "kind must be check_in or check_out", status_code=422)

    source: Handover | None = None
    if kind == "check_out":
        if source_handover_id is None:
            raise AppError("SOURCE_REQUIRED", "Check-out must be created from a check-in", status_code=422)
        source = db.get(Handover, source_handover_id)
        if source is None or source.contract_id != contract.id or source.kind != "check_in":
            raise AppError("SOURCE_NOT_FOUND", "Source check-in not found", status_code=404)
        if source.status != "confirmed":
            raise AppError("SOURCE_NOT_CONFIRMED", "Source check-in must be confirmed first", status_code=409)
        data = _checkout_from_checkin(source, data)
    else:
        data = _validate_data(data)

    payload = dict(data)
    payload["created_by"] = str(user.id)
    handover = Handover(
        contract_id=contract.id,
        kind=kind,
        data=payload,
        status="draft",
        confirmations={},
        source_handover_id=source.id if source else None,
    )
    db.add(handover)
    db.flush()
    other = db.get(User, contract.tenant_id if user.id == contract.owner_id else contract.owner_id)
    if other is not None:
        create_notification(
            db,
            other.id,
            "handover_created",
            "محضر تسليم جديد 🏠",
            f"{'دخول' if kind == 'check_in' else 'خروج'} جديد للعقد {contract.reference_no} بانتظار مراجعتك.",
            {"handover_id": str(handover.id), "contract_id": str(contract.id)},
        )
    db.flush()
    return handover


def _checkout_from_checkin(source: Handover, incoming: dict[str, Any]) -> dict[str, Any]:
    """Copy the confirmed check-in structure; keep incoming conditions/notes."""
    src = source.data or {}
    incoming = incoming or {}
    src_rooms = {r.get("name"): r for r in src.get("rooms") or []}
    rooms = []
    for room in incoming.get("rooms") or []:
        base = src_rooms.get(room.get("name"), {"items": []})
        labels = [i.get("label") for i in base.get("items") or []]
        items = room.get("items") or []
        # ensure every check-in item exists in the check-out (condition re-assessed)
        seen = {i.get("label") for i in items}
        for label in labels:
            if label not in seen:
                items.append({"label": label, "condition": None, "note": ""})
        room["items"] = items
        rooms.append(room)
    # include check-in rooms missing from the incoming payload
    seen_rooms = {r.get("name") for r in rooms}
    for name, base in src_rooms.items():
        if name not in seen_rooms:
            rooms.append(
                {
                    "name": name,
                    "items": [
                        {"label": i.get("label"), "condition": None, "note": ""}
                        for i in base.get("items") or []
                    ],
                }
            )
    incoming["rooms"] = rooms
    meters = incoming.get("meters") or {}
    for key in src.get("meters") or {}:
        meters.setdefault(key, {"value": ""})
    incoming["meters"] = meters
    if incoming.get("keys_count") is None:
        incoming["keys_count"] = src.get("keys_count")
    if not incoming.get("inventory"):
        incoming["inventory"] = [
            {"label": i.get("label"), "condition": None, "note": ""} for i in src.get("inventory") or []
        ]
    incoming["source_check_in_date"] = src.get("occurred_at") or None
    return _validate_data(incoming)


def patch_handover(db: Session, handover: Handover, user: User, data: dict[str, Any]) -> Handover:
    if handover.status != "draft":
        raise AppError("HANDOVER_IMMUTABLE", "Confirmed handovers cannot be edited", status_code=409)
    payload = dict(handover.data or {})
    incoming = _validate_data(dict(data))
    payload.update(incoming)
    handover.data = payload
    db.flush()
    return handover


def add_media(
    db: Session,
    settings: Settings,
    handover: Handover,
    user: User,
    *,
    room: str,
    filename: str,
    content_type: str,
    payload: bytes,
    note: str | None,
) -> HandoverMedia:
    if handover.status != "draft":
        raise AppError("HANDOVER_IMMUTABLE", "Confirmed handovers accept no new media", status_code=409)
    if not room.strip():
        raise AppError("INVALID_HANDOVER", "room is required", status_code=422)

    from uuid import uuid4

    media_id = uuid4()
    if content_type.startswith("image/"):
        image_bytes, _thumb, _phash = process_photo(payload)  # re-encoded (magic bytes checked by PIL)
        ext = "jpg"
        stored = image_bytes
        media_type = "photo"
    elif content_type.startswith("video/"):
        stored = validate_video(payload, content_type)
        ext = "mp4" if "mp4" in content_type else "mov"
        media_type = "video"
    else:
        raise AppError("INVALID_MEDIA_TYPE", "Only images and short videos are allowed", status_code=415)

    key = f"handovers/{handover.id}/{media_id}.{ext}"
    storage = _storage(settings)
    storage.put(key, stored, content_type if media_type == "video" else "image/jpeg")
    media = HandoverMedia(
        handover_id=handover.id,
        room=room.strip()[:60],
        file_key=key,
        note=(note or None),
        media_type=media_type,
        added_by=user.id,
    )
    db.add(media)
    db.flush()
    return media


def _storage(settings: Settings):
    from app.services.storage import build_storage

    return build_storage(settings)


def confirm_handover(
    db: Session,
    settings: Settings,
    handover: Handover,
    user: User,
    *,
    ip: str | None,
    user_agent: str | None,
) -> Handover:
    contract = db.get(Contract, handover.contract_id)
    if contract is None:
        raise AppError("CONTRACT_NOT_FOUND", "Contract not found", status_code=404)
    role = _role(contract, user)
    if role is None:
        raise AppError("NOT_PARTY", "Not a party to this contract", status_code=403)
    if handover.status == "confirmed":
        raise AppError("HANDOVER_IMMUTABLE", "Handover already confirmed", status_code=409)

    conf = dict(handover.confirmations or {})
    if str(user.id) in conf:
        raise AppError("ALREADY_CONFIRMED", "You already confirmed this handover", status_code=409)
    conf[str(user.id)] = {
        "party": role,
        "at": utcnow().isoformat(),
        "ip": ip or "",
        "device": (user_agent or "")[:200],
        "otp_verified": True,
    }
    handover.confirmations = conf

    other_id = contract.tenant_id if user.id == contract.owner_id else contract.owner_id
    if len(conf) >= 2:
        handover.status = "confirmed"
        handover.hash = terms_hash(
            {
                "contract_id": str(contract.id),
                "kind": handover.kind,
                "source_handover_id": str(handover.source_handover_id or ""),
                "data": handover.data or {},
                "media": sorted(m.file_key for m in _media_rows(db, handover.id)),
            }
        )
        for uid in (contract.owner_id, contract.tenant_id):
            create_notification(
                db,
                uid,
                "handover_confirmed",
                "محضر التسليم نهائي ✅",
                f"محضر {_kind_ar(handover)} للعقد {contract.reference_no} أصبح نهائياً.",
                {"handover_id": str(handover.id), "contract_id": str(contract.id)},
            )
    else:
        create_notification(
            db,
            other_id,
            "handover_confirmation_requested",
            "محضر تسليم بانتظار تأكيدك 🏠",
            f"راجع محضر {'الدخول' if handover.kind == 'check_in' else 'الخروج'} وأكّده برمز التحقق.",
            {"handover_id": str(handover.id), "contract_id": str(contract.id)},
        )
    db.flush()
    return handover


def _media_rows(db: Session, handover_id: UUID) -> list[HandoverMedia]:
    return list(db.execute(select(HandoverMedia).where(HandoverMedia.handover_id == handover_id)).scalars())


def comparison_for(db: Session, contract: Contract, user: User) -> dict[str, Any]:
    """Rich side-by-side comparison for the check-in / check-out pair.

    Returns room/item condition deltas, meter consumption differences, key
    counts and media-evidence counts so the two parties can settle the deposit
    on evidence — the platform never decides or holds the money.
    """
    rows = list(db.execute(select(Handover).where(Handover.contract_id == contract.id)).scalars())
    check_ins = [h for h in rows if h.kind == "check_in" and h.status == "confirmed"]
    check_outs = [h for h in rows if h.kind == "check_out"]
    pairs: list[dict[str, Any]] = []
    for cin in check_ins:
        cout = next((c for c in check_outs if c.source_handover_id == cin.id), None)
        in_data = cin.data or {}
        out_data = (cout.data or {}) if cout else {}

        def _room_map(data: dict[str, Any]) -> dict[str, dict[str, str]]:
            out: dict[str, dict[str, str]] = {}
            for room in data.get("rooms") or []:
                name = str(room.get("name", "")).strip()
                for item in room.get("items") or []:
                    label = str(item.get("label", "")).strip()
                    if name and label:
                        out[f"{name}/{label}"] = {
                            "condition": str(item.get("condition") or "good"),
                            "note": str(item.get("note") or ""),
                        }
            return out

        in_items, out_items = _room_map(in_data), _room_map(out_data)
        items = []
        for key in sorted(set(in_items) | set(out_items)):
            before, after = in_items.get(key, {}), out_items.get(key, {})
            items.append(
                {
                    "key": key,
                    "check_in_condition": before.get("condition"),
                    "check_out_condition": after.get("condition"),
                    "changed": before.get("condition") != after.get("condition"),
                    "check_in_note": before.get("note", ""),
                    "check_out_note": after.get("note", ""),
                }
            )

        meters = []
        in_meters = in_data.get("meters") or {}
        out_meters = out_data.get("meters") or {}
        for key in sorted(set(in_meters) | set(out_meters)):
            def _val(source: dict[str, Any], meter_key: str = key):
                entry = source.get(meter_key)
                raw = entry.get("value") if isinstance(entry, dict) else entry
                if raw is None:
                    return None
                try:
                    return float(raw)
                except (TypeError, ValueError):
                    return None

            before, after = _val(in_meters), _val(out_meters)
            meters.append(
                {
                    "key": key,
                    "check_in": before,
                    "check_out": after,
                    "consumption": (
                        round(after - before, 2)
                        if before is not None and after is not None
                        else None
                    ),
                    "suspicious": before is not None and after is not None and after < before,
                }
            )
        media_in = len(_media_rows(db, cin.id))
        media_out = len(_media_rows(db, cout.id)) if cout else 0
        pairs.append(
            {
                "check_in": {
                    "id": str(cin.id),
                    "occurred_at": in_data.get("occurred_at"),
                    "status": cin.status,
                    "media_count": media_in,
                    "keys_count": in_data.get("keys_count"),
                },
                "check_out": (
                    {
                        "id": str(cout.id),
                        "occurred_at": out_data.get("occurred_at"),
                        "status": cout.status,
                        "media_count": media_out,
                        "keys_count": out_data.get("keys_count"),
                    }
                    if cout
                    else None
                ),
                "items": items,
                "items_changed": sum(1 for i in items if i["changed"]),
                "meters": meters,
                "evidence_note_ar": (
                    "المقارنة دليل بين الطرفين فقط؛ المنصة لا تُقدّر ولا تحصّل خصماً من التأمين."
                ),
                "evidence_note_en": (
                    "Evidence for the parties only; the platform never assesses or "
                    "collects deposit deductions."
                ),
            }
        )
    return {"contract_id": str(contract.id), "pairs": pairs, "handovers": [str(h.id) for h in rows]}
