# OWASP Top 10 checklist — with evidence (Phase 4C #1)

Every line points at the code/test that enforces it (evidence, not intent).

| # | Risk | Control (as built) | Evidence |
|---|---|---|---|
| A01 | Broken access control | Role deps (`CurrentUser`/`OptionalUser`/`require_roles`), ownership checks (`get_owned_listing`, `get_contract_for_user`), contract/handover party checks, admin router role-gated, web `RequireAuth` | `tests/test_contracts.py::test_third_party_cannot_see_contract`, `tests/test_admin.py`, e2e admin-console spec |
| A02 | Cryptographic failures | National IDs Fernet-encrypted at rest (`CONTRACT_NID_KEY`/derived), OTP codes stored hashed (`hash_otp`), refresh tokens stored hashed, TLS terminated at infra, log redaction filter | `app/core/crypto_service.py`, `tests/test_contracts.py` (ciphertext assertions), `tests/test_privacy_and_ops.py::test_log_redaction…` |
| A03 | Injection | SQLAlchemy 2.0 bound statements everywhere (no string SQL for inputs), Pydantic validation on every body/path/query, LIKE inputs escaped (`_escape_like`), template variables substituted only into template files | `app/services/search_service.py::_escape_like`, full pytest suite |
| A04 | Insecure design | Broker-free flow (never touches rent), ads only after payment + approval, OTP required for contract/handover confirmations, immutability via SHA-256, rate limits (OTP per phone/IP, contact, contracts, media, orders), BR-1..BR-12 enforced server-side | `app/core/rate_limit.py`, contract/handover tests |
| A05 | Security misconfiguration | CSP (prod), security headers middleware, CORS from env with explicit origins in prod, `APP_ENV=prod` refuses weak admin secrets, no secrets in git (`.env*` gitignored), error body `{code,message,details}` without stack traces | `app/core/security_headers.py`, `tests/test_privacy_and_ops.py::test_ready_metrics_and_security_headers` |
| A06 | Vulnerable components | **pip-audit + npm audit in CI** (audit job), current results: 0 known vulns | `.github/workflows/ci.yml`, `docs/security/dependency-report.md` |
| A07 | Auth failures | OTP single-use (burned on success), attempt cap (5), expiry, per-phone/per-IP rate limits, bcrypt(12) staff passwords, TOTP 2FA for staff, refresh-token rotation with reuse detection, banned/deleted account enforcement | `app/services/auth_service.py`, `tests/test_auth.py` |
| A08 | Data integrity failures | Payment webhooks HMAC-verified + idempotent (unique `gateway_txn_id`, row lock), contract/handover confirmations OTP + hash, `CommitBeforeSendMiddleware` prevents partial-visibility commits, migrations versioned `0001…0006` | `tests/test_payments.py` (duplicate/replay), `tests/test_migration.py` |
| A09 | Logging & monitoring failures | Structured logs, PII/secret redaction filter, Prometheus metrics (`/metrics`) incl. webhook/payment/job failure counters, audit log for every staff action, Sentry hook via `SENTRY_DSN` | `app/core/logging.py`, `app/core/metrics.py`, `tests/test_privacy_and_ops.py` |
| A10 | SSRF | No user-controlled outbound URLs: webhooks go to fixed gateway config, media served from own storage, no URL-fetch endpoints | code review of `httpx` call sites (payments/OTP only) |

## File-upload controls (cross-cutting)

- Listing photos: type allow-list (JPEG/PNG/WebP) + **PIL decode (magic bytes) +
  re-encode** + size cap + phash duplicate detection (`app/services/media.py`).
- Handover media: images re-encoded via `process_photo`; videos type+size
  checked; unknown types → 415 (`handover_service.add_media`).
- Verification docs: JPEG/PNG/WebP/PDF, ≤8 MB, stored privately (signed URL).
- Bank receipts: ≤5 MB, private signed URL.
- Malware scan hook: `app/services/media.py` runs a pluggable
  `scan_malware(payload)` hook (no-op when no scanner is configured — wire
  ClamAV by setting `MALWARE_SCAN_CMD`).

## Threat model (related)

See `docs/security/threat-model.md` for the broker-impersonation and
fake-listing abuse cases.
