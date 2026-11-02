#!/usr/bin/env python3
"""Regenerate docs/openapi.json + docs/api-collection.json from the live app.

Run from the backend venv:
    cd backend && .venv/bin/python ../scripts/generate-api-docs.py

No hand-maintained API surface: every new router automatically appears in the
OpenAPI schema and Postman/Bruno collection.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.core.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402


def build_schema() -> dict:
    settings = Settings(
        _env_file=None,
        app_env="test",
        debug=True,
        secret_key="test-secret-key-for-docs-only-32bytes!!",
        database_url="sqlite:///./docs-generation.db",
    )
    return create_app(settings).openapi()


def postman_collection(schema: dict) -> dict:
    groups: dict[str, list[dict]] = {}
    for path, operations in schema["paths"].items():
        for method, op in operations.items():
            if method.lower() not in {"get", "post", "put", "patch", "delete"}:
                continue
            tag = (op.get("tags") or ["default"])[0]
            name = op.get("summary") or op.get("operationId") or f"{method.upper()} {path}"
            raw_path = re.sub(
                r"\{([^}]+)\}", lambda m: "{{" + m.group(1) + "}}", path
            ).lstrip("/")
            url: dict = {
                "raw": "{{baseUrl}}/" + raw_path,
                "host": ["{{baseUrl}}"],
                "path": raw_path.split("/"),
            }
            params = op.get("parameters") or []
            query, path_vars = [], []
            for p in params:
                if p.get("in") == "query":
                    query.append(
                        {
                            "key": p["name"],
                            "value": "",
                            "description": p.get("description", ""),
                            "disabled": not p.get("required", False),
                        }
                    )
                elif p.get("in") == "path":
                    path_vars.append({"key": p["name"], "value": ""})
            if query:
                url["query"] = query
            if path_vars:
                url["variable"] = path_vars

            header = [{"key": "Content-Type", "value": "application/json"}]
            body = None
            request_body = op.get("requestBody")
            if request_body:
                content = request_body.get("content") or {}
                if "application/json" in content:
                    example = content["application/json"].get("example")
                    body = {
                        "mode": "raw",
                        "raw": json.dumps(example or {}, ensure_ascii=False, indent=2),
                        "options": {"raw": {"language": "json"}},
                    }
                elif "multipart/form-data" in content:
                    body = {"mode": "formdata", "formdata": []}
            item = {
                "name": f"{method.upper()} · {name}",
                "request": {
                    "method": method.upper(),
                    "header": header,
                    "url": url,
                    "description": op.get("description") or name,
                },
                "response": [],
            }
            if body:
                item["request"]["body"] = body
            groups.setdefault(tag, []).append(item)

    return {
        "info": {
            "name": "Aqar Rent API — عقار رينت (full surface)",
            "description": (
                "Generated from docs/openapi.json. Auth: POST /auth/otp/request → "
                "/auth/otp/verify → copy access_token into the `token` variable. "
                "Production requires real Paymob + Twilio; mock providers are "
                "disabled when ENVIRONMENT=production."
            ),
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "variable": [
            {"key": "baseUrl", "value": "http://localhost:8000/api/v1"},
            {"key": "token", "value": ""},
            {"key": "phone", "value": "01000000001"},
            {"key": "listing_id", "value": ""},
            {"key": "order_id", "value": ""},
        ],
        "auth": {
            "type": "bearer",
            "bearer": [{"key": "token", "value": "{{token}}", "type": "string"}],
        },
        "item": [
            {"name": tag, "item": sorted(items, key=lambda x: x["name"])}
            for tag, items in sorted(groups.items())
        ],
    }


def main() -> None:
    schema = build_schema()
    (ROOT / "docs" / "openapi.json").write_text(
        json.dumps(schema, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (ROOT / "docs" / "api-collection.json").write_text(
        json.dumps(postman_collection(schema), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(schema['paths'])} paths, {len(schema['components']['schemas'])} schemas")


if __name__ == "__main__":
    main()
