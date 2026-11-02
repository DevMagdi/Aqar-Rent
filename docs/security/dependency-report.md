# Dependency scan report (Phase 4C #1)

Run date: 2026-11-02 (also runs on every CI push — `audit` job in ci.yml).

## pip-audit — `backend/requirements.txt`

```
$ pip-audit -r backend/requirements.txt
No known vulnerabilities found
(exit 0)
```

## npm audit — `web/`, `admin/`, `e2e/` (audit-level=high)

```
web:   found 0 vulnerabilities  (exit 0)
admin: found 0 vulnerabilities  (exit 0)
e2e:   found 0 vulnerabilities  (exit 0)
```

## CI enforcement

- `.github/workflows/ci.yml` → job `audit` fails the build when pip-audit
  finds a vulnerability.
- `web` / `admin` jobs run `npm audit --audit-level=high` before building.

## Policy

- New dependencies require the same three scans locally.
- High/critical findings: patch in the same PR; if a transitive pin blocks the
  fix, document the exception here with an expiry date.
