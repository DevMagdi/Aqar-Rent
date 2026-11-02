"""Dump the OpenAPI document to docs/openapi.json (single source: the app).

Usage: python -m app.scripts.export_openapi
"""

from __future__ import annotations

import json
from pathlib import Path

DOCS = Path(__file__).resolve().parents[3] / "docs"


def main() -> None:
    from app.main import create_app

    app = create_app()
    spec = app.openapi()
    out = DOCS / "openapi.json"
    out.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out} ({len(spec['paths'])} paths)")


if __name__ == "__main__":
    main()
