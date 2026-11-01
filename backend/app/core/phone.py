"""Egyptian phone number normalization/validation (E.164 +20…)."""

from __future__ import annotations

import re

from app.core.errors import AppError

# Egyptian mobile numbers: 010/011/012/015 + 8 digits (11 total with leading 0).
_MOBILE_RE = re.compile(r"^(?:\+?20|0020|0)?(1[0125]\d{8})$")


def normalize_phone(raw: str) -> str:
    """Return canonical +201XXXXXXXXX or raise a validation AppError."""
    cleaned = re.sub(r"[\s\-().]", "", (raw or "").strip())
    m = _MOBILE_RE.match(cleaned)
    if not m:
        raise AppError(
            "INVALID_PHONE",
            "Phone number must be a valid Egyptian mobile number",
            status_code=422,
            details={"field": "phone"},
        )
    return f"+20{m.group(1)}"


def looks_like_phone(text: str) -> bool:
    """Detect phone-number-like digit runs inside user content (BR-12)."""
    digits = re.sub(r"\D", "", text or "")
    # Any long uninterrupted digit run (10+) or an explicit Egyptian mobile.
    if len(digits) >= 11:
        return True
    return bool(_MOBILE_RE.search(re.sub(r"[\s\-().]", "", text or "")))
