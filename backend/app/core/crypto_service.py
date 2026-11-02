"""National-ID encryption at rest (Phase 4).

Fernet (AES-128-CBC + HMAC-SHA256, authenticated) with the key from
`CONTRACT_NID_KEY` when set. In dev/test the key is **derived** from
`SECRET_KEY` so nothing is hard-coded.

Key rotation notes
-----------------
1. Set a fresh random key (Fernet.generate_key()) and put it in the
   environment as ``CONTRACT_NID_KEY`` — never in the repo.
2. Rotation requires re-encrypting existing rows: decrypt each
   `contracts.ids_encrypted` with the old key and re-encrypt with the new one
   (script: `python -m app.scripts.rotate_nid_key --old KEY --new KEY`).
3. Keep the previous key available (env `CONTRACT_NID_KEY_OLD`) during the
   rotation window so old ciphertexts stay readable, then retire it.
4. Logs must never contain national IDs — see `app/core/logging.py` redaction
   and the masking helpers below.
"""

from __future__ import annotations

import base64
import hashlib
import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.core.errors import AppError


def _fernet(secret_key: str, configured: str) -> Fernet:
    if configured:
        return Fernet(configured.encode("utf-8"))
    # Dev/test fallback: deterministic derivation, never printed.
    digest = hashlib.sha256(f"aqar-nid:{secret_key}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_nids(secret_key: str, configured_key: str, payload: dict[str, str]) -> str:
    """Encrypt `{"owner": nid, "tenant": nid}` → URL-safe ciphertext."""
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    return _fernet(secret_key, configured_key).encrypt(raw).decode()


def decrypt_nids(secret_key: str, configured_key: str, ciphertext: str) -> dict[str, str]:
    try:
        data = json.loads(_fernet(secret_key, configured_key).decrypt(ciphertext.encode()))
    except (InvalidToken, ValueError, json.JSONDecodeError) as exc:
        raise AppError("NID_DECRYPT_FAILED", "Cannot decrypt national IDs", status_code=500) from exc
    return {str(k): str(v) for k, v in data.items()}


def mask_nid(nid: str) -> str:
    """12345678901234 → 1234******7890 (never log or API-return the full value)."""
    digits = "".join(c for c in nid if c.isdigit())
    if len(digits) < 8:
        return "***"
    return f"{digits[:4]}{'*' * (len(digits) - 8)}{digits[-4:]}"


def mask_name(name: str) -> str:
    """Public verification page: 'محمد أحمد' → 'م*** أ***'."""
    parts = [p for p in (name or "").split() if p.strip()]
    if not parts:
        return "***"
    return " ".join(f"{p[0]}***" for p in parts[:2])


def canonical_json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def terms_hash(payload: Any) -> str:
    """SHA-256 over the canonical JSON of the final contract payload."""
    return hashlib.sha256(canonical_json(payload).encode()).hexdigest()
