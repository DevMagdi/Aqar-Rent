"""Arabic handover PDF (check-in / check-out) — Phase 4B.

Room-by-room table (item · condition · notes), meter readings (with the
check-out vs check-in difference when applicable), keys count, furniture
inventory, both confirmation entries and the SHA-256 hash.
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.models.identity import User
from app.models.social import Contract, Handover
from app.services.contract_pdf import _ar, _qr_png  # shared shaping + QR helpers

FONT_PATH = Path(__file__).resolve().parent.parent / "assets" / "fonts" / "Amiri-Regular.ttf"

CONDITION_LABELS = {"good": "جيدة", "needs_repair": "تحتاج صيانة", "damaged": "متضررة", None: "—", "": "—"}
ROOM_LABELS = {
    "living_room": "الصالة",
    "bedroom_1": "غرفة النوم 1",
    "bedroom_2": "غرفة النوم 2",
    "bedroom_3": "غرفة النوم 3",
    "kitchen": "المطبخ",
    "bathroom_1": "الحمام 1",
    "bathroom_2": "الحمام 2",
    "balcony": "البلكونة",
    "other": "أخرى",
}
METER_LABELS = {"electricity": "الكهرباء", "water": "المياه", "gas": "الغاز"}


def _room_label(name: str) -> str:
    return ROOM_LABELS.get(name, name)


def _party_label(user) -> str:
    if user is None:
        return "—"
    return user.full_name or user.phone or "—"


def build_handover_pdf(
    settings: Settings,
    handover: Handover,
    contract: Contract,
    parties: list[User],
    source: Handover | None = None,
) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    if "Amiri" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("Amiri", str(FONT_PATH)))

    data = handover.data or {}
    verify_url = f"{settings.site_url.rstrip('/')}/verify/{contract.reference_no}"

    st_title = ParagraphStyle(
        "t", fontName="Amiri", fontSize=16, leading=22, alignment=1, textColor=colors.HexColor("#1c1917")
    )
    st_small = ParagraphStyle(
        "s", fontName="Amiri", fontSize=9.5, leading=13, alignment=1, textColor=colors.HexColor("#57534e")
    )
    st_cell = ParagraphStyle("c", fontName="Amiri", fontSize=10, leading=14, alignment=2)

    def P(text: str, style=st_cell) -> Paragraph:
        return Paragraph(_ar(str(text)), style)

    title = "محضر تسليم دخول" if handover.kind == "check_in" else "محضر تسليم خروج"
    story: list[Any] = [
        Paragraph(_ar(f"{title} — {contract.reference_no}"), st_title),
        Spacer(1, 4),
        Paragraph(
            _ar(f"الأطراف: {_party_label(parties[0])} / {_party_label(parties[1])}"),
            st_small,
        ),
        Paragraph(_ar(f"التاريخ: {data.get('occurred_at') or ''}"), st_small),
        Spacer(1, 8),
    ]

    # rooms table
    rows = [[P("الغرفة"), P("البند"), P("الحالة"), P("ملاحظات")]]
    src_map: dict[str, str] = {}
    if source is not None:
        for room in (source.data or {}).get("rooms") or []:
            for item in room.get("items") or []:
                src_map[f"{room.get('name')}|{item.get('label')}"] = item.get("condition") or ""
    for room in data.get("rooms") or []:
        for item in room.get("items") or []:
            cond = item.get("condition")
            note = item.get("note") or ""
            if handover.kind == "check_out":
                before = src_map.get(f"{room.get('name')}|{item.get('label')}", "")
                if before and before != (cond or ""):
                    note = f"(كان: {CONDITION_LABELS.get(before, before)}) {note}"
            rows.append(
                [
                    P(_room_label(str(room.get("name")))),
                    P(item.get("label")),
                    P(CONDITION_LABELS.get(cond, cond or "—")),
                    P(note or "—"),
                ]
            )
    if len(rows) == 1:
        rows.append([P("—"), P("—"), P("—"), P("—")])
    table = Table(rows, colWidths=[32 * mm, 55 * mm, 32 * mm, 51 * mm])
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d6d3d1")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f5f4")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story += [Paragraph(_ar("تفصيل الغرف"), st_title), Spacer(1, 4), table, Spacer(1, 10)]

    # meters (+ difference for check-out)
    meters = data.get("meters") or {}
    if meters:
        mrows = [[P("العداد"), P("القراءة"), P("الفرق")]]
        src_meters = ((source.data or {}).get("meters") or {}) if source is not None else {}
        for key, label in METER_LABELS.items():
            if key in meters:
                value = (meters.get(key) or {}).get("value", "")
                before = (src_meters.get(key) or {}).get("value", "")
                diff = ""
                if handover.kind == "check_out" and before and value:
                    try:
                        diff = str(float(value) - float(before))
                    except ValueError:
                        diff = "—"
                mrows.append([P(label), P(value or "—"), P(diff or "—")])
        mtable = Table(mrows, colWidths=[50 * mm, 55 * mm, 55 * mm])
        mtable.setStyle(
            TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d6d3d1")),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f5f4")),
                ]
            )
        )
        story += [Paragraph(_ar("قراءات العدادات"), st_title), Spacer(1, 4), mtable, Spacer(1, 10)]

    story.append(
        Paragraph(
            _ar(f"عدد المفاتيح: {data.get('keys_count') if data.get('keys_count') is not None else '—'}"),
            st_small,
        )
    )
    inventory = data.get("inventory") or []
    if inventory:
        irows = [[P("الأثاث/الأجهزة"), P("الحالة"), P("ملاحظات")]]
        for item in inventory:
            irows.append(
                [
                    P(item.get("label")),
                    P(CONDITION_LABELS.get(item.get("condition"), item.get("condition") or "—")),
                    P(item.get("note") or "—"),
                ]
            )
        itable = Table(irows, colWidths=[80 * mm, 40 * mm, 50 * mm])
        itable.setStyle(
            TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d6d3d1")),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f5f4")),
                ]
            )
        )
        story += [Paragraph(_ar("محتويات التأسيس"), st_title), Spacer(1, 4), itable, Spacer(1, 10)]

    comments = data.get("comments") or {}
    if comments:
        story.append(Paragraph(_ar("ملاحظات الأطراف"), st_title))
        for _uid, text in comments.items():
            story.append(Paragraph(_ar(f"• {text}"), st_small))
        story.append(Spacer(1, 6))

    # confirmations + hash
    story.append(Paragraph(_ar("سجل التأكيد"), st_title))
    crows = [[P("الطرف"), P("التاريخ (UTC)"), P("IP")]]
    for uid, entry in (handover.confirmations or {}).items():
        crows.append(
            [
                P(entry.get("party", uid)),
                P(str(entry.get("at", ""))[:19].replace("T", " ")),
                P(str(entry.get("ip") or "-")),
            ]
        )
    ctable = Table(crows, colWidths=[40 * mm, 75 * mm, 55 * mm])
    ctable.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d6d3d1")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f5f4")),
            ]
        )
    )
    story += [ctable, Spacer(1, 6)]
    story.append(Paragraph(_ar(f"SHA-256: {handover.hash or '-'}"), st_small))
    story.append(Spacer(1, 6))
    story.append(Image(io.BytesIO(_qr_png(verify_url)), width=72, height=72))
    story.append(Paragraph(_ar(f"تحقق من العقد: {verify_url}"), st_small))

    out = io.BytesIO()
    doc = SimpleDocTemplate(
        out,
        pagesize=A4,
        rightMargin=14 * mm,
        leftMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title=f"Handover {handover.kind} {contract.reference_no}",
        author="Aqar Rent",
    )
    doc.build(story)
    return out.getvalue()


def store_handover_pdf(storage, handover: Handover, payload: bytes) -> str:
    key = f"handovers/{handover.id}.pdf"
    storage.put(key, payload, "application/pdf")
    return key
