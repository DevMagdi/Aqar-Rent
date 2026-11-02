"""Phase-4C hard rules: boot validation, Twilio SMS, Redis rate limiting."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.core.config import Settings
from app.core.errors import AppError
from app.core.rate_limit import _check_redis, check_rate_limit, reset_rate_limits


def _base(**over) -> Settings:
    defaults = dict(
        _env_file=None,
        app_env="prod",
        debug=False,
        secret_key="a" * 48,
        database_url="postgresql+psycopg://user:pass@db:5432/aqar",
        storage_backend="s3",
        otp_provider="twilio",
        twilio_account_sid="ACxxxxxxxx",
        twilio_auth_token="token",
        twilio_from_number="+15551234567",
        webhook_secret="w" * 32,
        cors_origins="https://aqar.example.com",
        staff_super_admin_password="StrongPass!123",
        staff_super_admin_totp_secret="JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
        payment_provider="paymob",
        paymob_api_key="k",
        paymob_hmac_secret="h",
        paymob_integration_id_card="1",
        contract_nid_key="QWVhci1Kd3ItU2VjcmV0LUtleS1Gb3ItTmlkcy0hIQ==",
        site_url="https://aqar.example.com",
    )
    defaults.update(over)
    return Settings(**defaults)


# ── boot validation (B9 / A5) ────────────────────────────────────────────────


def test_prod_refuses_sqlite_debug_mock_console_and_weak_secrets():
    bad = Settings(
        _env_file=None,
        app_env="prod",
        debug=True,
        secret_key="dev-secret-change-me",
        database_url="sqlite:///./dev.db",
        storage_backend="local",
        otp_provider="console",
        payment_provider="mock",
        webhook_secret="",
        cors_origins="*",
        staff_super_admin_password="short",
        staff_super_admin_totp_secret="",
    )
    problems = bad.validate_runtime()
    joined = "\n".join(problems)
    assert "PostgreSQL" in joined
    assert "DEBUG" in joined
    assert "SECRET_KEY" in joined
    assert "STORAGE_BACKEND" in joined
    assert "OTP_PROVIDER=console" in joined
    assert "PAYMENT_PROVIDER=mock" in joined
    assert "WEBHOOK_SECRET" in joined
    assert "CORS_ORIGINS" in joined
    assert "STAFF_SUPER_ADMIN_PASSWORD" in joined
    assert "STAFF_SUPER_ADMIN_TOTP_SECRET" in joined


def test_staging_allows_mock_payments_but_never_console_otp_or_sqlite():
    # mock payments are tolerated in staging (Paymob sandbox onboarding)
    staging_mock = _base(app_env="staging", payment_provider="mock")
    assert not [p for p in staging_mock.validate_runtime() if "PAYMENT_PROVIDER" in p]
    # …but console OTP and SQLite are refused everywhere outside dev
    staging_console = _base(app_env="staging", otp_provider="console")
    assert any("OTP_PROVIDER=console" in p for p in staging_console.validate_runtime())
    staging_sqlite = _base(app_env="staging", database_url="sqlite:///./x.db")
    assert any("PostgreSQL" in p for p in staging_sqlite.validate_runtime())


def test_valid_prod_and_staging_config_pass_validation():
    assert _base().validate_runtime() == []
    assert _base(app_env="staging").validate_runtime() == []


def test_create_app_refuses_invalid_prod_config():
    from app.main import create_app

    bad = Settings(_env_file=None, app_env="prod", debug=True, secret_key="short")
    with pytest.raises(SystemExit) as exc:
        create_app(bad)
    assert "Refusing to start" in str(exc.value)


def test_dev_and_test_envs_are_lenient():
    dev = Settings(_env_file=None, app_env="dev")
    assert dev.validate_runtime() == []
    test = Settings(_env_file=None, app_env="test", database_url="sqlite:///:memory:")
    assert test.validate_runtime() == []


# ── Twilio provider (B7) ─────────────────────────────────────────────────────


def test_twilio_e164_normalization():
    from app.integrations.otp import TwilioOTPProvider

    assert TwilioOTPProvider._e164("01001112233") == "+201001112233"
    assert TwilioOTPProvider._e164("+201001112233") == "+201001112233"
    assert TwilioOTPProvider._e164("15551234567") == "+15551234567"


def test_twilio_send_posts_to_twilio_and_maps_errors():
    from app.integrations.otp import TwilioOTPProvider

    settings = _base()
    provider = TwilioOTPProvider(settings)

    with patch("httpx.post") as post:
        post.return_value = MagicMock(status_code=201)
        provider.send("01001112233", "123456")
        url = post.call_args.kwargs.get("url") or post.call_args.args[0]
        assert "ACxxxxxxxx" in url
        data = post.call_args.kwargs["data"]
        assert data["To"] == "+201001112233"
        assert "123456" in data["Body"]
        auth = post.call_args.kwargs["auth"]
        assert auth == ("ACxxxxxxxx", "token")

    with patch("httpx.post") as post:
        post.return_value = MagicMock(status_code=401)
        with pytest.raises(AppError) as exc:
            provider.send("01001112233", "123456")
        assert exc.value.status_code == 502
        assert "123456" not in exc.value.message  # never leak the code


def test_build_otp_provider_selects_twilio_and_console():
    from app.integrations.otp import ConsoleOTPProvider, TwilioOTPProvider, build_otp_provider

    assert isinstance(build_otp_provider(_base()), TwilioOTPProvider)
    assert isinstance(build_otp_provider(Settings(_env_file=None, otp_provider="console")), ConsoleOTPProvider)
    with pytest.raises(ValueError):
        build_otp_provider(Settings(_env_file=None, otp_provider="carrier-pigeon"))


# ── Redis sliding-window limiter (B6) ───────────────────────────────────────


class FakePipeline:
    def __init__(self, client: "FakeRedis"):
        self.client = client
        self.ops = []

    def zremrangebyscore(self, *a):
        self.ops.append(("zremrangebyscore", a))

    def zadd(self, *a):
        self.ops.append(("zadd", a))

    def zcard(self, *a):
        self.ops.append(("zcard", a))

    def expire(self, *a):
        self.ops.append(("expire", a))

    def execute(self):
        # simulate: current count = members inside window + this new one
        return [0, 1, self.client.next_count, 1]


class FakeRedis:
    def __init__(self, count: int):
        self.next_count = count
        self.removed = []

    def pipeline(self):
        return FakePipeline(self)

    def zrem(self, key, member):
        self.removed.append((key, member))

    def zrange(self, *a, **k):
        return [(0, 0.0)]


def test_redis_limiter_rejects_over_limit_and_unlinks_attempt():
    client = FakeRedis(count=6)  # 6 hits inside window > max 5
    with pytest.raises(AppError) as exc:
        _check_redis("ip:1.2.3.4", 5, 60, client)
    assert exc.value.status_code == 429
    assert client.removed, "rejected attempt must not consume quota"


def test_redis_limiter_allows_under_limit():
    client = FakeRedis(count=3)
    _check_redis("ip:1.2.3.4", 5, 60, client)  # no exception


def test_in_process_fallback_still_enforces(monkeypatch):
    import app.core.rate_limit as rl

    reset_rate_limits()
    # force the redis lookup to fail → in-process path
    monkeypatch.setattr("app.core.cache.get_redis_client", lambda: (_ for _ in ()).throw(RuntimeError("no redis")))
    for _ in range(3):
        check_rate_limit("test:unit:window", 3, 60)
    with pytest.raises(AppError) as exc:
        check_rate_limit("test:unit:window", 3, 60)
    assert exc.value.status_code == 429
    reset_rate_limits()
