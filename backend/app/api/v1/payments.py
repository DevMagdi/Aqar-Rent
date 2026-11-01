"""Payments: gateway webhook, checkout re-mint, bank receipts, PDF receipts."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select

from app.api.deps import (
    CurrentUser,
    DbDep,
    SettingsDep,
    StorageDep,
    UserOrStaff,
    client_ip,
)
from app.core.errors import AppError
from app.models.commerce import BankTransfer, Order
from app.models.identity import User
from app.schemas.orders import BankReceiptOut, CheckoutOut
from app.services import payment_service
from app.services.receipt_service import ensure_receipt

router = APIRouter(tags=["payments"])


def _owned_order(db, order_id: UUID, user: User) -> Order:
    order = db.get(Order, order_id)
    if order is None or order.owner_id != user.id:
        raise AppError("ORDER_NOT_FOUND", "Order not found", status_code=404)
    return order


# ── gateway webhook ──────────────────────────────────────────────────────────


def _ip_allowed(settings, ip: str | None) -> bool:
    allow = [x.strip() for x in settings.webhook_ip_allowlist.split(",") if x.strip()]
    if not allow:
        return True
    if not ip:
        return False
    import ipaddress

    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    for entry in allow:
        try:
            if addr in ipaddress.ip_network(entry, strict=False):
                return True
        except ValueError:
            if entry == ip:
                return True
    return False


@router.post(
    "/payments/webhook",
    summary="Payment webhook (public, HMAC-verified, idempotent)",
)
async def payments_webhook(request: Request, db: DbDep, settings: SettingsDep) -> dict:
    """Gateway callbacks (Paymob / Mock). Verifies the signature, dedupes on
    gateway_txn_id under a row lock, stores the raw payload and settles the
    order. Authentic-but-ignorable events return 200 so gateways do not
    retry-storm; bad signature → 401, bad payload → 400.
    """
    ip = (request.client.host if request.client else None) or client_ip(request)
    if not _ip_allowed(settings, ip):
        raise AppError("WEBHOOK_FORBIDDEN", "Webhook source not allowed", status_code=403)
    raw = await request.body()
    return payment_service.handle_webhook(db, settings, dict(request.query_params), raw)


# ── owner flows ──────────────────────────────────────────────────────────────


@router.post(
    "/orders/{order_id}/checkout",
    response_model=CheckoutOut,
    summary="Re-mint checkout details for a pending order",
)
def order_checkout(order_id: UUID, user: CurrentUser, db: DbDep, settings: SettingsDep) -> CheckoutOut:
    order = _owned_order(db, order_id, user)
    if order.status != "pending":
        raise AppError(
            "ORDER_NOT_PENDING",
            "Checkout is only available for pending orders",
            status_code=409,
            details={"status": order.status},
        )
    checkout = payment_service.initiate_checkout(db, settings, order, user)
    return CheckoutOut(
        checkout_url=checkout["checkout_url"],
        payment_reference=checkout["payment_reference"],
        expires_at=order.expires_at,
    )


@router.post(
    "/orders/{order_id}/bank-receipt",
    response_model=BankReceiptOut,
    summary="Upload a bank-transfer receipt (owner)",
)
def upload_bank_receipt(
    order_id: UUID,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
    storage: StorageDep,
    file: UploadFile = File(...),
) -> BankReceiptOut:
    order = _owned_order(db, order_id, user)
    data = file.file.read()
    transfer = payment_service.upload_bank_receipt(
        db, settings, storage, order, data, file.filename or "receipt.jpg"
    )
    url = storage.signed_url(transfer.receipt_file_key) if transfer.receipt_file_key else None
    return BankReceiptOut(
        order_id=str(order.id),
        status=transfer.status,
        receipt_url=url,
        reject_reason=transfer.reject_reason,
    )


@router.get(
    "/orders/{order_id}/receipt",
    summary="PDF receipt of a paid order (owner or staff)",
)
def order_receipt(
    order_id: UUID,
    db: DbDep,
    settings: SettingsDep,
    storage: StorageDep,
    caller: UserOrStaff,
) -> Response:
    user, staff = caller
    order = db.get(Order, order_id)
    if order is None:
        raise AppError("ORDER_NOT_FOUND", "Order not found", status_code=404)
    is_owner = user is not None and user.id == order.owner_id
    if not is_owner and staff is None:
        raise AppError("ORDER_NOT_FOUND", "Order not found", status_code=404)

    key = ensure_receipt(db, settings, storage, order)
    data = storage.read(key)
    filename = f"receipt-{order.gateway_ref or order.id.hex[:10]}.pdf"
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/orders/{order_id}/bank-receipt",
    response_model=BankReceiptOut,
    summary="Current bank-transfer receipt status (owner)",
)
def bank_receipt_status(order_id: UUID, user: CurrentUser, db: DbDep, storage: StorageDep) -> BankReceiptOut:
    order = _owned_order(db, order_id, user)
    transfer = db.execute(select(BankTransfer).where(BankTransfer.order_id == order.id)).scalars().first()
    if transfer is None:
        raise AppError("RECEIPT_MISSING", "No receipt uploaded yet", status_code=404)
    url = storage.signed_url(transfer.receipt_file_key) if transfer.receipt_file_key else None
    return BankReceiptOut(
        order_id=str(order.id),
        status=transfer.status,
        receipt_url=url,
        reject_reason=transfer.reject_reason,
    )
