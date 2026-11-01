"""PDF receipts (Arabic + English) for paid orders.

Rendered with ReportLab using the embedded Amiri (OFL) Arabic font +
arabic-reshaper + python-bidi so Arabic text shapes and reads RTL correctly.
Generated on demand by GET /orders/{id}/receipt and pre-warmed by the worker
(heavy work stays off the webhook path). Stored in object storage under
`receipts/<order_id>.pdf`.
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.models.catalog import Listing
from app.models.commerce import AdPeriod, Order, Payment
from app.models.identity import User
from app.services.common import as_utc
from app.services.storage import Storage

FONT_PATH = Path(__file__).resolve().parent.parent / "assets" / "fonts" / "Amiri-Regular.ttf"
RECEIPT_PREFIX = "REC"

METHOD_LABELS = {
    "card": "بطاقة / Card",
    "fawry": "فوري / Fawry",
    "vodafone_cash": "فودافون كاش / Vodafone Cash",
    "bank_transfer": "تحويل بنكي / Bank transfer",
}


def _ar(text: str) -> str:
    """Shape + reorder Arabic for visual RTL rendering."""
    import arabic_reshaper
    from bidi.algorithm import get_display

    if not text:
        return text
    return get_display(arabic_reshaper.reshape(text))


def receipt_number(order: Order) -> str:
    return f"{RECEIPT_PREFIX}-{order.id.hex[:10].upper()}"


def _fmt_dt(value) -> str:
    v = as_utc(value)
    return v.strftime("%Y-%m-%d %H:%M UTC") if v else "-"


def build_receipt_pdf(
    db: Session,
    settings: Settings,
    order: Order,
) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A5
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas as pdf_canvas

    if "Amiri" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("Amiri", str(FONT_PATH)))

    owner = db.get(User, order.owner_id)
    listing = db.get(Listing, order.listing_id)
    period = (
        db.execute(
            select(AdPeriod)
            .where(AdPeriod.order_id == order.id)
            .order_by(AdPeriod.created_at.desc())
            .limit(1)
        )
        .scalars()
        .first()
    )

    from io import BytesIO

    buffer = BytesIO()
    width, height = A5
    c = pdf_canvas.Canvas(buffer, pagesize=A5)
    title = _ar("إيصال دفع — إيجار مباشر")
    c.setTitle(f"Receipt {receipt_number(order)}")
    c.setFont("Amiri", 16)
    c.drawCentredString(width / 2, height - 18 * mm, title)

    # Platform line (LTR): name is shared brand text.
    c.setFont("Amiri", 9)
    c.setFillColor(colors.HexColor("#555555"))
    c.drawCentredString(width / 2, height - 24 * mm, "Aqar Rent — عقار رينت (no commission)")
    c.setFillColor(colors.black)

    rows = [
        (_ar("رقم الإيصال"), receipt_number(order)),
        (_ar("المالك"), (owner.full_name if owner and owner.full_name else "-")),
        (_ar("الإعلان"), (listing.title if listing else "-")),
        (_ar("عدد الأسابيع"), str(order.weeks)),
        (
            _ar("فترة الإعلان"),
            f"{_fmt_dt(period.starts_at)} → {_fmt_dt(period.ends_at)}" if period else "-",
        ),
        (_ar("المجموع"), f"{Decimal(str(order.subtotal))} EGP"),
        (_ar("الخصم"), f"{Decimal(str(order.discount))} EGP"),
        (_ar("الإجمالي"), f"{Decimal(str(order.total))} EGP"),
        (_ar("طريقة الدفع"), METHOD_LABELS.get(order.method, order.method)),
        (_ar("التاريخ"), _fmt_dt(order.paid_at or order.created_at)),
        (_ar("الحالة"), order.status),
    ]

    y = height - 34 * mm
    label_x = 14 * mm
    value_x = width - 14 * mm
    for label, value in rows:
        c.setFont("Amiri", 10)
        c.setFillColor(colors.HexColor("#333333"))
        c.drawRightString(value_x, y, _ar(str(label)))
        c.setFillColor(colors.black)
        # Values: Arabic parts shaped, digits stay LTR naturally.
        c.drawString(label_x, y, _ar(str(value)))
        c.setStrokeColor(colors.HexColor("#DDDDDD"))
        c.line(label_x, y - 2.2 * mm, value_x, y - 2.2 * mm)
        y -= 7.2 * mm

    c.setFont("Amiri", 8)
    c.setFillColor(colors.HexColor("#777777"))
    c.drawCentredString(
        width / 2,
        8 * mm,
        _ar("إيصال رسوم إعلان — لا يشمل أي عمولة أو إيجار"),
    )
    c.save()
    return buffer.getvalue()


def ensure_receipt(db: Session, settings: Settings, storage: Storage, order: Order) -> str:
    """Generate (if needed) and store the receipt; returns the storage key."""
    if order.status not in ("paid", "refunded"):
        raise AppError(
            "RECEIPT_UNAVAILABLE",
            "Receipt is only available for paid orders",
            status_code=409,
            details={"status": order.status},
        )
    payment = (
        db.execute(
            select(Payment).where(Payment.order_id == order.id).order_by(Payment.created_at.desc()).limit(1)
        )
        .scalars()
        .first()
    )
    if payment is not None and payment.receipt_key and storage.exists(payment.receipt_key):
        return payment.receipt_key

    pdf = build_receipt_pdf(db, settings, order)
    key = f"receipts/{order.id}.pdf"
    storage.put(key, pdf, "application/pdf")
    if payment is not None:
        payment.receipt_key = key
        db.flush()
    return key


def generate_receipts_for_pending(settings: Settings, storage: Storage, db: Session, limit: int = 20) -> int:
    """Worker sweep: pre-generate receipts for paid orders missing one."""
    rows = (
        db.execute(
            select(Payment)
            .join(Order, Order.id == Payment.order_id)
            .where(
                Payment.status.in_(["paid", "refunded"]),
                Payment.receipt_key.is_(None),
                Order.status.in_(["paid", "refunded"]),
            )
            .order_by(Payment.created_at.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    count = 0
    for payment in rows:
        order = db.get(Order, payment.order_id)
        if order is None:
            continue
        try:
            ensure_receipt(db, settings, storage, order)
            count += 1
        except AppError:  # pragma: no cover - defensive
            continue
    db.flush()
    return count
