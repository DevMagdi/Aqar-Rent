"""Locust load test — search (p95 target < 600 ms), detail, plans, locations, OTP.

Run (from repo root, with the loadtest server on :8011):
    locust -f loadtest/locustfile.py --headless -u 20 -t 60s --host http://localhost:8011
"""

from __future__ import annotations

import os
import random

from locust import HttpUser, between, task

TARGET_IDS: list[str] = []
PHONE_PREFIX = os.environ.get("LOADTEST_PHONE_PREFIX", "015")


class AqarUser(HttpUser):
    wait_time = between(0.05, 0.3)

    def on_start(self) -> None:
        if not TARGET_IDS:
            try:
                res = self.client.get("/api/v1/listings?limit=50", timeout=30)
                for item in res.json().get("items", []):
                    TARGET_IDS.append(item["id"])
            except Exception:  # noqa: BLE001 — seeding may still be running
                pass

    @task(40)
    def search_latest(self) -> None:
        self.client.get("/api/v1/listings?limit=20&sort=newest", name="/api/v1/listings [latest]")

    @task(30)
    def search_filtered(self) -> None:
        params = random.choice(
            [
                {"min_price": "3000", "max_price": "15000", "limit": "20"},
                {"property_type": "apartment", "sort": "price_asc", "limit": "20"},
                {"bbox": "31.0,29.7,31.6,30.2", "limit": "20"},  # Cairo
                {"q": "شقة", "limit": "20"},
                {"bedrooms": "2", "furnished": "furnished", "limit": "20"},
            ]
        )
        self.client.get("/api/v1/listings", params=params, name="/api/v1/listings [filtered]")

    @task(30)
    def listing_detail(self) -> None:
        if TARGET_IDS:
            lid = random.choice(TARGET_IDS)
            self.client.get(f"/api/v1/listings/{lid}", name="/api/v1/listings/{id}")

    @task(10)
    def plans(self) -> None:
        self.client.get("/api/v1/plans", name="/api/v1/plans [cached]")

    @task(10)
    def locations(self) -> None:
        self.client.get("/api/v1/locations?level=governorate", name="/api/v1/locations [cached]")

    @task(8)
    def otp_request(self) -> None:
        phone = f"{PHONE_PREFIX}{random.randint(10_000_000, 99_999_999)}"
        self.client.post("/api/v1/auth/otp/request", json={"phone": phone}, name="/api/v1/auth/otp/request")
