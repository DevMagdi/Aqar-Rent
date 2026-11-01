"""OTP auth flow: request, verify, rate limits, refresh rotation, logout."""

from __future__ import annotations

from tests.conftest import get_last_code, otp_login


def test_otp_request_and_verify_returns_tokens(client):
    r = client.post("/api/v1/auth/otp/request", json={"phone": "01012345678"})
    assert r.status_code == 200
    body = r.json()
    assert body["expires_in"] == 300  # 5 minutes
    assert body["dev_code"] and len(body["dev_code"]) == 6

    r = client.post("/api/v1/auth/otp/verify", json={"phone": "01012345678", "code": body["dev_code"]})
    assert r.status_code == 200
    data = r.json()
    assert data["tokens"]["access_token"]
    assert data["tokens"]["refresh_token"]
    assert data["user"]["phone"] == "+201012345678"  # normalized to +20...


def test_otp_verify_wrong_code_max_attempts(client):
    r = client.post("/api/v1/auth/otp/request", json={"phone": "+201111111111"})
    assert r.status_code == 200, r.text
    for i in range(5):
        r = client.post("/api/v1/auth/otp/verify", json={"phone": "01111111111", "code": "000000"})
        if i < 4:
            assert r.status_code == 400, r.text
            assert r.json()["code"] == "OTP_INVALID"
        else:
            assert r.status_code == 400
            assert r.json()["code"] == "OTP_INVALID"
    # code was burned after the 5th attempt
    r = client.post("/api/v1/auth/otp/verify", json={"phone": "01111111111", "code": "000000"})
    assert r.status_code == 400
    assert r.json()["code"] == "OTP_NOT_FOUND"


def test_otp_request_rate_limit_per_number(client):
    # 5 requests per number per hour
    for i in range(5):
        r = client.post("/api/v1/auth/otp/request", json={"phone": "01099999999"})
        assert r.status_code == 200, f"attempt {i}: {r.text}"
    r = client.post("/api/v1/auth/otp/request", json={"phone": "01099999999"})
    assert r.status_code == 429
    assert r.json()["code"] == "OTP_RATE_LIMITED"


def test_otp_request_invalid_phone(client):
    r = client.post("/api/v1/auth/otp/request", json={"phone": "12345"})
    assert r.status_code == 422


def test_otp_new_request_invalidates_previous_code(client):
    client.post("/api/v1/auth/otp/request", json={"phone": "01011112222"})
    old = get_last_code(client, "+201011112222")
    client.post("/api/v1/auth/otp/request", json={"phone": "01011112222"})
    new = get_last_code(client, "+201011112222")
    assert old != new
    r = client.post("/api/v1/auth/otp/verify", json={"phone": "01011112222", "code": old})
    assert r.status_code == 400


def test_refresh_rotates_and_revokes(client):
    body = otp_login(client, "01012345670")
    refresh = body["tokens"]["refresh_token"]

    r = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 200
    rotated = r.json()["refresh_token"]
    assert rotated != refresh

    # old token is dead (rotation)
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 401

    # reuse detection: replaying the stale token kills the whole device session
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": rotated})
    assert r.status_code == 401


def test_logout_revokes_refresh_token(client):
    body = otp_login(client, "01012345671")
    refresh = body["tokens"]["refresh_token"]
    r = client.post("/api/v1/auth/logout", json={"refresh_token": refresh})
    assert r.status_code == 200
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 401


def test_access_token_protects_me(client):
    r = client.get("/api/v1/me")
    assert r.status_code == 401
    assert r.json()["code"] == "AUTH_REQUIRED"
    headers = otp_login(client, "01012345672")["Authorization"]
    r = client.get("/api/v1/me", headers={"Authorization": headers})
    assert r.status_code == 200


def test_invalid_access_token(client):
    r = client.get("/api/v1/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401
