"""Sequential checkout bench: POST /orders across distinct approved listings.

Reports p50/p95/p99 for the checkout path (BR-5 validation, promo/plan
lookups, duplicate/cap guards). Run against the loadtest server on :8011.

    python loadtest/bench_checkout.py --n 100
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
import urllib.error
import urllib.request

BASE = __import__("os").environ.get("LOADTEST_TARGET", "http://localhost:8011")
PHONE = "+201200000001"  # bench owner seeded by seed_load


def call(method: str, path: str, body: dict | None = None, token: str | None = None) -> tuple[int, dict]:
    req = urllib.request.Request(
        f"{BASE}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode() or "{}")


def login() -> str:
    _, req = call("POST", "/api/v1/auth/otp/request", {"phone": PHONE})
    code = req.get("dev_code")
    if not code:
        raise SystemExit(f"no dev_code (is DEBUG=true?): {req}")
    _, ver = call("POST", "/api/v1/auth/otp/verify", {"phone": PHONE, "code": code, "platform": "web"})
    return ver["tokens"]["access_token"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=100)
    args = parser.parse_args()

    token = login()
    # distinct approved listings → no duplicate-pending, no BR-7 (no periods)
    _, listings = call("GET", "/api/v1/me/listings?limit=200", token=token)
    ids = [row["id"] for row in listings if row["status"] == "approved"]
    if len(ids) < args.n:
        raise SystemExit(f"need {args.n} approved listings, found {len(ids)} — raise --approved in seed_load")

    latencies: list[float] = []
    statuses: dict[str, int] = {}
    for lid in ids[: args.n]:
        start = time.perf_counter()
        status, _body = call(
            "POST",
            "/api/v1/orders",
            {"listing_id": lid, "weeks": 1, "method": "bank_transfer"},
            token=token,
        )
        latencies.append((time.perf_counter() - start) * 1000)
        statuses[str(status)] = statuses.get(str(status), 0) + 1

    latencies.sort()
    result = {
        "n": len(latencies),
        "statuses": statuses,
        "p50_ms": round(statistics.median(latencies), 1),
        "p95_ms": round(latencies[max(0, int(len(latencies) * 0.95) - 1)], 1),
        "p99_ms": round(latencies[max(0, int(len(latencies) * 0.99) - 1)], 1),
        "max_ms": round(latencies[-1], 1),
    }
    print(json.dumps(result, indent=2))
    __import__("pathlib").Path("loadtest/checkout_result.json").write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
