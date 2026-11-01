"""File serving.

- GET /files/public/{path}  → listing media (public bucket / local dev only)
- GET /files?key&expires&token → PRIVATE documents via short-lived HMAC-signed
  URLs (verification proofs, receipts, …) — never publicly listable.
"""

from __future__ import annotations

import mimetypes

from fastapi import APIRouter, Query, Request
from fastapi.responses import Response

from app.api.deps import DbDep, StorageDep
from app.core.errors import AppError

router = APIRouter(prefix="/files", tags=["files"])


@router.get("/public/{path:path}", summary="Public media file (local storage dev mode)")
def public_file(path: str, request: Request, storage: StorageDep) -> Response:
    from app.services.storage import S3Storage

    if isinstance(storage, S3Storage):
        raise AppError("NOT_FOUND", "Files are served from object storage", status_code=404)
    try:
        data = storage.read(path)
    except AppError:
        raise AppError("FILE_NOT_FOUND", "File not found", status_code=404) from None
    ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
    return Response(content=data, media_type=ctype, headers={"Cache-Control": "public, max-age=86400"})


@router.get("", summary="Private file via short-lived signed URL")
def private_file(
    storage: StorageDep,
    key: str = Query(...),
    expires: int = Query(...),
    token: str = Query(...),
) -> Response:
    from app.services.storage import LocalStorage

    if isinstance(storage, LocalStorage):
        if not storage.verify(key, expires, token):
            raise AppError("INVALID_SIGNATURE", "Signed URL is invalid or expired", status_code=403)
        data = storage.read(key)
        ctype = mimetypes.guess_type(key)[0] or "application/octet-stream"
        return Response(content=data, media_type=ctype, headers={"Cache-Control": "private, max-age=300"})
    raise AppError("NOT_FOUND", "Use the presigned URL from the API", status_code=404)
