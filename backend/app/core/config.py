"""Application settings loaded from environment (.env supported)."""

import os
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_name: str = "Aqar Rent API"
    app_env: str = "dev"  # dev | test | prod
    debug: bool = False
    secret_key: str = "dev-secret-change-me"
    cors_origins: str = "*"
    log_level: str = "INFO"

    @model_validator(mode="after")
    def _environment_alias(self) -> "Settings":
        """Accept the deployment-standard `ENVIRONMENT=production|staging|...`.

        Backward compatibility: `APP_ENV=prod|staging|dev|test` remains the
        canonical setting. `ENVIRONMENT` is a pure alias; production → prod.
        """
        raw = os.environ.get("ENVIRONMENT", "").strip().lower()
        if not raw:
            return self
        aliases = {
            "production": "prod",
            "prod": "prod",
            "staging": "staging",
            "development": "dev",
            "dev": "dev",
            "test": "test",
            "testing": "test",
        }
        if raw not in aliases:
            raise ValueError(
                "ENVIRONMENT must be one of production, staging, development, test"
            )
        self.app_env = aliases[raw]
        return self

    # Database
    database_url: str = "postgresql+psycopg://aqar:aqar@localhost:5432/aqar"
    redis_url: str = "redis://localhost:6379/0"

    # Auth / JWT
    jwt_access_minutes: int = 15
    jwt_refresh_days: int = 30
    bcrypt_rounds: int = 12

    # OTP
    otp_provider: str = "console"  # console | test (dev only) | twilio (staging/prod)
    otp_ttl_minutes: int = 5
    # Twilio SMS (real delivery). Required when otp_provider=twilio.
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""  # e.g. +15551234567 or Egyptian sender ID
    otp_max_attempts: int = 5
    otp_max_per_hour: int = 5
    otp_max_requests_per_ip_hour: int = 30

    # Contact reveal rate limit (BR-11 logging + anti-scraping)
    contact_rate_limit_per_hour: int = 30

    # Storage
    storage_backend: str = "local"  # local | s3
    storage_local_root: str = "./data/storage"
    s3_endpoint_url: str | None = None
    s3_public_endpoint_url: str | None = None
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "us-east-1"
    s3_bucket_media: str = "aqar-media"
    s3_bucket_documents: str = "aqar-documents"
    s3_use_path_style: bool = True

    # Staff super admin (seeded from env)
    staff_super_admin_email: str = "admin@aqar-rent.dev"
    staff_super_admin_password: str = ""
    staff_super_admin_totp_secret: str = ""

    # Bank transfer instructions (display only; receipt flow in Phase 2)
    bank_name: str = "Example Bank Egypt"
    bank_account_name: str = "Aqar Rent LLC"
    bank_account_number: str = ""
    bank_iban: str = ""
    bank_swift: str = ""

    # Phase 2 — payments
    payment_provider: str = "mock"  # mock (dev/tests) | paymob
    webhook_secret: str = ""  # HMAC secret for the Mock provider webhooks
    webhook_ip_allowlist: str = ""  # comma-separated IPs/CIDRs; empty = allow all
    order_rate_limit_per_hour: int = 30  # POST /orders per user
    bank_receipt_max_mb: int = 5  # bank transfer receipt upload cap
    # Phase 5 — anti-fraud & abuse limits (documented in docs/security/threat-model.md)
    verification_upload_rate_limit_per_hour: int = 10
    lead_rate_limit_per_hour: int = 120
    office_invite_rate_limit_per_hour: int = 30
    subscription_rate_limit_per_hour: int = 10
    # Official registry seam: ONLY "none" is shipped (no Ejar equivalent in Egypt).
    registry_adapter: str = "none"

    # Phase 4 — contracts & handovers
    site_url: str = "http://localhost:3000"  # public links (QR verification page)
    contract_fee_egp: int = 0  # optional contract fee;0 = free, suggested 50
    contract_nid_key: str = ""  # Fernet key for national IDs (env); derived from SECRET_KEY when empty
    contract_template_dir: str = ""  # override for editable templates (defaults to app/contract_templates)
    handover_photo_max_mb: int = 10
    handover_video_max_mb: int = 50
    # retention (4C privacy): days to keep final-decision verification docs / contact events
    verification_retention_days: int = 90
    contact_event_retention_months: int = 12
    csp_extra: str = ""  # appended to the production Content-Security-Policy
    sentry_dsn: str = ""  # optional error tracking (no-op when empty)

    paymob_base_url: str = "https://accept.paymob.com"
    paymob_api_key: str = ""
    paymob_integration_id_card: str = ""
    paymob_integration_id_wallet: str = ""
    paymob_integration_id_fawry: str = ""  # kiosk/fawry integration (falls back to wallet id)
    paymob_hmac_secret: str = ""
    paymob_iframe_id: str = ""
    paymob_currency: str = "EGP"
    # Endpoint overrides — defaults are built from paymob_base_url; set these
    # if Paymob ever changes a path (nothing endpoint-ish is hard-coded).
    paymob_auth_url: str = ""
    paymob_orders_url: str = ""
    paymob_payment_keys_url: str = ""
    paymob_pay_url: str = ""
    paymob_refund_url: str = ""
    paymob_iframe_url_template: str = ""  # {iframe_id} {payment_type} {token} placeholders

    fawry_base_url: str = ""  # reserved: standalone Fawry (currently via Paymob kiosk)
    fawry_merchant_id: str = ""
    fawry_security_code: str = ""
    fawry_expiry_hours: int = 48  # pending fawry/wallet orders expire after this

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_prod(self) -> bool:
        return self.app_env == "prod"

    def validate_runtime(self) -> list[str]:
        """Refuse unsafe prod/staging configuration at boot (Phase 4C #9).

        Returns the list of problems (empty = OK). `dev`/`test` are lenient —
        everything strict applies from `staging` upwards, per the hard rules:
        PostgreSQL+PostGIS only, no DEBUG, no weak secrets, no console OTP,
        no mock payments in prod, S3 storage, explicit CORS, Paymob keys.
        """
        if self.app_env not in ("prod", "staging"):
            return []
        problems: list[str] = []
        if not self.database_url.startswith("postgres"):
            problems.append("DATABASE_URL must be PostgreSQL (PostGIS image) — SQLite is unit-test only")
        if self.debug:
            problems.append("DEBUG must be false outside dev")
        weak = len(self.secret_key) < 32 or self.secret_key in {
            "dev-secret-change-me",
            "dev-secret-key-arena-stage3a-0123456789",
            "test-secret-key-for-pytest-only-32bytes!!",
        }
        if weak:
            problems.append("SECRET_KEY is weak/short (min 32 chars, not a known dev value)")
        if self.storage_backend != "s3":
            problems.append("STORAGE_BACKEND must be s3 (MinIO/S3) outside dev")
        if self.otp_provider == "console":
            problems.append("OTP_PROVIDER=console is dev-only — configure twilio for real SMS")
        if self.otp_provider not in ("twilio",):
            problems.append(
                "OTP_PROVIDER must be twilio outside dev/test — mock/console SMS is disabled"
            )
        if self.otp_provider == "twilio" and not (
            self.twilio_account_sid and self.twilio_auth_token and self.twilio_from_number
        ):
            problems.append("twilio_account_sid/twilio_auth_token/twilio_from_number are required")
        if not self.webhook_secret:
            problems.append("WEBHOOK_SECRET is required (payment webhook HMAC)")
        origins = self.cors_origin_list
        if not origins or origins == ["*"]:
            problems.append("CORS_ORIGINS must be an explicit allow-list outside dev")
        if not self.staff_super_admin_password or len(self.staff_super_admin_password) < 12:
            problems.append("STAFF_SUPER_ADMIN_PASSWORD must be set (min 12 chars)")
        if not self.staff_super_admin_totp_secret:
            problems.append("STAFF_SUPER_ADMIN_TOTP_SECRET must be set")
        if self.app_env == "prod":
            if self.payment_provider != "paymob":
                problems.append(
                    "PAYMENT_PROVIDER must be paymob in prod — mock/dev providers are completely disabled"
                )
            if not self.webhook_ip_allowlist.strip():
                problems.append("WEBHOOK_IP_ALLOWLIST is required in prod (Paymob callback CIDRs)")
            if not self.bank_account_number.strip():
                problems.append("BANK_ACCOUNT_NUMBER is required in prod (real bank-transfer instructions)")
            if self.payment_provider == "paymob" and not (
                self.paymob_api_key
                and self.paymob_hmac_secret
                and (self.paymob_integration_id_card or self.paymob_integration_id_wallet)
            ):
                problems.append("Paymob keys incomplete (api_key, hmac_secret, integration ids)")
            if not self.contract_nid_key:
                problems.append("CONTRACT_NID_KEY must be set explicitly in prod (Fernet)")
            if not self.site_url.startswith("https://"):
                problems.append("SITE_URL must be https in prod")
            if self.registry_adapter != "none":
                problems.append(
                    "REGISTRY_ADAPTER must be 'none' — no official Egyptian digital rental registry exists"
                )
        return problems


@lru_cache
def get_settings() -> Settings:
    return Settings()
