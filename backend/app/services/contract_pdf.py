"""Arabic contract PDF (Phase 4A).

ReportLab + Amiri (embedded OFL font) + arabic-reshaper + python-bidi, a QR
code pointing at the public verification page, the reference number, the
SHA-256 terms hash and the confirmation log (timestamps / IPs / devices).
Generated on demand for the two parties only; stored under
`contracts/<id>.pdf` in object storage.
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.models.identity import User
from app.models.social import Contract
from app.services.contract_service import (
    DISCLAIMER,
    DRAFT_BANNER,
    contract_values,
    load_template,
    render_template,
)
from app.services.storage import Storage

FONT_PATH = Path(__file__).resolve().parent.parent / "assets" / "fonts" / "Amiri-Regular.ttf"


def _ar(text: str) -> str:
    import arabic_reshaper
    from bidi.algorithm import get_display

    if not text:
        return text
    return get_display(arabic_reshaper.reshape(text))


def _qr_png(payload: str) -> bytes:
    import qrcode

    qr = qrcode.QRCode(box_size=6, border=2)
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _footer(canvas, doc):  # pragma: no cover - page furniture
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4

    canvas.saveState()
    canvas.setFont("Amiri", 8)
    canvas.setFillColor(colors.HexColor("#78716c"))
    canvas.drawCentredString(A4[0] / 2, 8 * mm(), "Aqar Rent — عقد خاص / private agreement template")
    canvas.restoreState()


def mm() -> float:
    from reportlab.lib.units import mm as _mm

    return _mm


def build_contract_pdf(
    settings: Settings,
    contract: Contract,
    owner: User,
    tenant: User,
    listing_title: str | None,
) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    if "Amiri" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("Amiri", str(FONT_PATH)))

    verify_url = f"{settings.site_url.rstrip('/')}/verify/{contract.reference_no}"
    template_text = load_template(settings, contract.template)
    body = render_template(template_text, contract_values(settings, contract, owner, tenant))
    body_lines = [ln for ln in body.splitlines() if ln.strip() and not ln.startswith("#")]
    body_text = "\n".join(body_lines)

    st_title = ParagraphStyle(
        "t", fontName="Amiri", fontSize=17, leading=24, alignment=1, textColor=colors.HexColor("#1c1917")
    )
    st_small = ParagraphStyle(
        "s", fontName="Amiri", fontSize=9.5, leading=14, alignment=1, textColor=colors.HexColor("#57534e")
    )
    st_body = ParagraphStyle("b", fontName="Amiri", fontSize=11.5, leading=20, alignment=TA_RIGHT)
    st_warn = ParagraphStyle(
        "w", fontName="Amiri", fontSize=10, leading=15, alignment=1, textColor=colors.HexColor("#b91c1c")
    )

    story: list[Any] = [Paragraph(_ar(f"عقد إيجار — {contract.reference_no}"), st_title)]
    if listing_title:
        story.append(Paragraph(_ar(listing_title), st_small))
    story.append(Spacer(1, 6))
    story.append(Paragraph(_ar(f"[ {DRAFT_BANNER} ]"), st_warn))
    story.append(Paragraph(_ar(DISCLAIMER), st_warn))
    story.append(Spacer(1, 10))

    for para in body_text.split("\n"):
        story.append(Paragraph(_ar(para), st_body))
        story.append(Spacer(1, 3))

    story.append(Spacer(1, 12))
    story.append(Paragraph(_ar("سجل التأكيد / Confirmation log"), st_title))
    log_rows = [
        [
            Paragraph(_ar("الطرف"), st_small),
            Paragraph(_ar("التاريخ (UTC)"), st_small),
            Paragraph(_ar("IP"), st_small),
            Paragraph(_ar("الجهاز"), st_small),
        ]
    ]
    for entry in contract.confirmations_log or []:
        log_rows.append(
            [
                Paragraph(_ar(str(entry.get("party", ""))), st_small),
                Paragraph(str((entry.get("at") or "")[:19]).replace("T", " "), st_small),
                Paragraph(str(entry.get("ip") or "-")[:15], st_small),
                Paragraph(_ar(str(entry.get("device") or "-")[:36]), st_small),
            ]
        )
    table = Table(log_rows, colWidths=[28 * mm, 45 * mm, 38 * mm, 54 * mm])
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d6d3d1")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f5f4")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 8))
    story.append(Paragraph(_ar(f"بصمة النص النهائي SHA-256: {contract.terms_hash or '-'}"), st_small))
    story.append(Spacer(1, 8))

    qr_image = Image(io.BytesIO(_qr_png(verify_url)), width=84, height=84)
    story.append(qr_image)
    story.append(Paragraph(_ar(f"امسح الرمز للتحقق من العقد: {verify_url}"), st_small))

    out = io.BytesIO()
    doc = SimpleDocTemplate(
        out,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=16 * mm,
        title=f"Aqar Rent contract {contract.reference_no}",
        author="Aqar Rent",
    )
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return out.getvalue()


def store_contract_pdf(settings: Settings, storage: Storage, contract: Contract, payload: bytes) -> str:
    key = f"contracts/{contract.id}.pdf"
    storage.put(key, payload, "application/pdf")
    return key
