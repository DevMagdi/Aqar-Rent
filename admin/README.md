# Aqar Rent — /admin (React + Vite)

Staff operations console: moderation, verification, reports, users, finance,
plans/promos, audit — role-aware for **Moderator / Finance / Super Admin**.

## Run

```bash
npm install
BACKEND_URL=http://localhost:8000 npm run dev   # http://localhost:5173
```

Login = **email + password + TOTP 2FA** (`POST /api/v1/admin/auth/login`).
Dev seed credentials: `admin@aqar-rent.dev` / `ChangeMeAdmin!2026`, authenticator
secret `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` (dev defaults — override via
`STAFF_SUPER_ADMIN_*` in production).

## Features

| Area | Notes |
| --- | --- |
| Dashboard | KPIs (users, revenue, contacts, open reports, pending verifications, active ad periods), listings/orders by-status charts, **top areas derived from the active-listings queue** (the API has no per-area breakdown) |
| Moderation | status tabs + owner-phone/user search, detail modal with media, **Approve** / **Reject with preset reasons** (`REJECT_REASONS` mirrored from `enums.py`) + note — this is also the “request changes” flow (rejected listings are editable & resubmittable) |
| Verifications | queue tabs, secure document viewer over **short-lived signed URLs**, approve/reject with reason |
| Reports | the API's four actions only: dismiss · resolve · remove listing · send to moderation |
| Users | search, ban/unban account, raise listing cap |
| Payments | filters, revenue (total/refunded/net + daily/monthly/by-method charts), **refunds** (full = BR-8, or partial amount), CSV export |
| Bank transfers | receipt viewer, approve (ad goes live) / reject with reason |
| Plans & promos | CRUD (super admin) |
| Staff & roles | **read-only**: role matrix + per-staff audit activity (the API exposes no staff CRUD) |
| Audit log | entity/action filters with before/after JSON diff |
| Settings | read-only limits & presets owned by the backend |

Role-based sidebar: every route is guarded client-side **and** enforced
server-side (`require_roles`) — Finance never sees Moderation, Moderator never
sees Audit, etc.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind CSS 4 · react-router-dom 7 ·
plain-Tailwind charts (no chart dependency) · TOTP helper (`src/lib/totp.ts`)
for dev/e2e convenience.
