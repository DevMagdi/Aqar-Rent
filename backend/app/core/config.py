"""Application settings loaded from environment (.env supported)."""

from functools import lru_cache

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

    # Database
    database_url: str = "postgresql+psycopg://aqar:aqar@localhost:5432/aqar"
    redis_url: str = "redis://localhost:6379/0"

    # Auth / JWT
    jwt_access_minutes: int = 15
    jwt_refresh_days: int = 30
    bcrypt_rounds: int = 12

    # OTP
    otp_provider: str = "console"  # console | test
    otp_ttl_minutes: int = 5
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
