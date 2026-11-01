"""Image processing: compression to ≤1.5 MB, thumbnails, perceptual hashes."""

from __future__ import annotations

import io

from PIL import Image, ImageOps

from app.core.errors import AppError

MAX_IMAGE_BYTES = int(1.5 * 1024 * 1024)  # spec: ~1.5 MB after client/server compression
MAX_INPUT_BYTES = 12 * 1024 * 1024  # headroom for un-compressed uploads
MAX_DIMENSION = 2560
THUMB_WIDTH = 400
ALLOWED_IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "jpg"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/quicktime"}
MAX_VIDEO_BYTES = 50 * 1024 * 1024


def process_photo(data: bytes) -> tuple[bytes, bytes, str]:
    """Return (compressed_jpeg, thumbnail_jpeg, phash_hex16) for an uploaded photo."""
    if len(data) > MAX_INPUT_BYTES:
        raise AppError("FILE_TOO_LARGE", "Image too large", status_code=413)
    try:
        opened = Image.open(io.BytesIO(data))
        opened.load()
    except Exception as exc:  # noqa: BLE001
        raise AppError("INVALID_IMAGE", "File is not a valid image", status_code=415) from exc

    img = ImageOps.exif_transpose(opened)
    if img.mode != "RGB":
        img = img.convert("RGB")

    if max(img.size) > MAX_DIMENSION:
        img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)

    phash = average_hash(img)

    # Quality loop: stay under 1.5 MB while keeping as much quality as possible.
    quality = 88
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    while buf.tell() > MAX_IMAGE_BYTES and quality > 55:
        quality -= 8
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
    photo_bytes = buf.getvalue()

    thumb = img.copy()
    thumb.thumbnail((THUMB_WIDTH, THUMB_WIDTH), Image.Resampling.LANCZOS)
    tbuf = io.BytesIO()
    thumb.save(tbuf, format="JPEG", quality=80, optimize=True)
    return photo_bytes, tbuf.getvalue(), phash


def average_hash(img: Image.Image, size: int = 8) -> str:
    """64-bit average hash as 16 hex chars (duplicate-photo detection)."""
    gray = img.convert("L").resize((size, size), Image.Resampling.LANCZOS)
    pixels = list(gray.getdata())
    avg = sum(pixels) / len(pixels)
    bits = "".join("1" if p >= avg else "0" for p in pixels)
    return f"{int(bits, 2):016x}"


def hamming_distance(a: str, b: str) -> int:
    try:
        return bin(int(a, 16) ^ int(b, 16)).count("1")
    except (ValueError, TypeError):
        return 64


def validate_video(data: bytes, content_type: str) -> bytes:
    if content_type not in ALLOWED_VIDEO_TYPES:
        raise AppError("INVALID_MEDIA_TYPE", "Only MP4/MOV videos are allowed", status_code=415)
    if len(data) > MAX_VIDEO_BYTES:
        raise AppError("FILE_TOO_LARGE", "Video too large (max 50 MB)", status_code=413)
    return data
