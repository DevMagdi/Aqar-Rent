"""Prometheus metrics + HTTP instrumentation (Phase 4C reliability).

Exposed at GET /metrics (Prometheus text format). Counters that matter for
alerting: webhook failures, payment failures, job failures.
"""

from __future__ import annotations

import time

from prometheus_client import Counter, Gauge, Histogram, generate_latest
from prometheus_client.exposition import CONTENT_TYPE_LATEST

HTTP_REQUESTS = Counter(
    "aqar_http_requests_total",
    "HTTP requests",
    ["method", "path", "status"],
)
HTTP_LATENCY = Histogram(
    "aqar_http_request_duration_seconds",
    "HTTP request latency",
    ["method", "path"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
)
WEBHOOK_FAILURES = Counter(
    "aqar_webhook_failures_total",
    "Payment webhook failures (bad signature / invalid payload / unknown order)",
    ["reason"],
)
PAYMENT_FAILURES = Counter(
    "aqar_payment_failures_total",
    "Payment attempts that ended failed",
    ["method"],
)
JOB_FAILURES = Counter(
    "aqar_job_failures_total",
    "Background job failures",
    ["job"],
)
JOB_RUNS = Gauge(
    "aqar_job_last_run_timestamp_seconds",
    "Unix time of the last hourly job run",
    ["job"],
)


def metrics_response() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST


class MetricsMiddleware:
    """ASGI middleware counting every request (low-cardinality path labels)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        method = scope.get("method", "GET")
        path = scope.get("path", "/")
        # keep labels bounded: only known API prefixes are kept verbatim
        label = path if path.startswith("/api/v1/") or path in ("/metrics", "/health", "/ready") else "other"
        if label.startswith("/api/v1/") and label.count("/") > 4:
            label = "/".join(label.split("/")[:5]) + "/*"
        start = time.perf_counter()
        status = 500

        async def send_wrapper(message):
            nonlocal status
            if message.get("type") == "http.response.start":
                status = message.get("status", 500)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            HTTP_REQUESTS.labels(method, label, str(status)).inc()
            HTTP_LATENCY.labels(method, label).observe(time.perf_counter() - start)
