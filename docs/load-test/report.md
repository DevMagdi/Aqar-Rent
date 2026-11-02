# Load-test report — Aqar Rent (Phase 4C #4)

Date: 2026-11-02 · Target: **search p95 < 600 ms at 100k listings**

## Environment

| | |
|---|---|
| Dataset | **100,000 active listings** (each with a running ad period), 600 approved listings for the checkout bench, 2,000 owners |
| DB | SQLite (file, WAL, `busy_timeout=10s`) — *the conservative floor; production runs PostgreSQL 16* |
| Server | uvicorn, **4 workers**, single container |
| Tool | Locust (20 users, 60 s, ramp 1/s) + a sequential micro-benchmark + a checkout bench |
| Seed | `python -m app.scripts.seed_load --listings 100000 --approved 600` (≈ 8.5 s) |

## Headline results

### Sequential per-variant p95 (20 samples each, warm)

| Variant | p50 | **p95** | max | Target |
|---|---|---|---|---|
| `sort=newest` (default home/search) | 4.3 ms | **5.0 ms** | 5.1 ms | <600 ms ✅ |
| `sort=price_asc` | 14.9 ms | **16.7 ms** | 17.8 ms | <600 ms ✅ |
| `bbox` (map search, Cairo window) | 10.3 ms | **12.0 ms** | 12.8 ms | <600 ms ✅ |
| `property_type+bedrooms+furnished` | 8.6 ms | **11.3 ms** | 12.6 ms | <600 ms ✅ |
| free-text `q=شقة` (title/description/address LIKE) | 5.8 ms | **8.3 ms** | 9.1 ms | <600 ms ✅ |
| listing detail | 8 ms | **15 ms** | 30 ms | — |

### Concurrent: Locust, 20 users, 60 s, 4 workers — 4,143 requests, **0 failures**

| Endpoint | reqs | p50 | **p95** | p99 |
|---|---|---|---|---|
| `GET /listings [latest]` | 1,301 | 7 ms | **23 ms** | 74 ms |
| `GET /listings/{id}` (detail) | 960 | 12 ms | **32 ms** | 67 ms |
| `POST /auth/otp/request` | 266 | 6 ms | **26 ms** | 44 ms |
| `GET /plans` (cached) | 317 | 3 ms | **12 ms** | 31 ms |
| `GET /locations` (cached) | 320 | 3 ms | **16 ms** | 37 ms |
| `GET /listings [filtered mix*]` | 978 | 20 ms | **1,500 ms**† | 1,800 ms |
| Aggregated | 4,143 | 9 ms | 360 ms | 1,500 ms |

\* mixed price/type/bbox/free-text variants under 20-user contention.
† the tail is the free-text `LIKE '%…%'` variant under concurrent SQLite write contention (p90=1.1 s). Structured filters stay ≤20 ms p50. See “Known gaps”.

### Checkout bench — `POST /orders` ×100 distinct listings (bank_transfer)

```
statuses: {201: 100}   p50=182.5 ms   p95=231.7 ms   p99=254.9 ms   max=257.4 ms
```

## What the load test found (and we fixed)

1. **`sort=newest` timed out (>20 s) at 100k rows.** Root cause: two correlated
   scalar subqueries in `ORDER BY` (≈200k subquery executions per request).
   Fixed twice, ending at the denormalized design: `listings.ad_priority` /
   `listings.ad_starts_at` maintained by `refresh_ad_rank()` on activate /
   cancel / expire / refund, sorted via the `ix_listings_active_rank` index
   (migration `0005`). **20 s → 5 ms sequential, 23 ms p95 under load.**
2. **`price_asc`/`area` ≈ 500 ms** — SQLite preferred the status index + full
   temp sort. Composite `(status, rent_monthly)` / `(status, area_m2)` indexes
   (migration `0006`) give early-exit ordering: **500 ms → 17 ms**.
3. **A “covering” `ad_periods` window index made the visibility `EXISTS`
   O(n²)** (range columns before the correlated key) — dropped again in `0005`.
4. **Migration backfill** with correlated SQL took >10 min at 100k rows;
   rewritten as two `GROUP BY` passes + a batched UPDATE → **2.7 s**.
5. **Detail `500`s from seed data** (`amenities` stored as a string) — fixed in
   `seed_load` and repaired on the dataset.
6. SQLite **WAL + busy_timeout** enabled for file databases (multi-worker safe).

## Known gaps / recommendations (honest tail-risk)

- Free-text search tail under concurrency on SQLite (table above †). At launch
  the platform runs **PostgreSQL**: add `pg_trgm` GIN indexes on
  `title/description/address` (or FTS5 on SQLite) before relying on text search
  under heavy load — tracked in ASSUMPTIONS.
- Numbers are single-node, no CDN, no Redis (cache fell back to in-process TTL
  during the run — same code path, Redis enabled via `REDIS_URL` in staging).
- Re-run: `python -m app.scripts.seed_load && uvicorn … --port 8011 --workers 4`
  then `locust -f loadtest/locustfile.py --headless -u 20 -t 60s --host http://localhost:8011`
  and `python loadtest/bench_checkout.py --n 100`.
