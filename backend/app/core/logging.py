"""Structured-ish logging setup + secret/PII redaction (Phase 4C privacy).

Every log record is scrubbed before formatting: Egyptian mobile numbers,
14-digit national-ID-like runs, Bearer tokens and HMAC-looking hex strings.
"""

from __future__ import annotations

import logging
import re
import sys

# Order matters: NIDs before plain digit runs.
_REDACTIONS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\b\d{14}\b"), "[NID]"),
    (re.compile(r"(?<!\d)01[0125]\d{8}(?!\d)"), "[PHONE]"),
    (re.compile(r"(?<!\d)\+201[0125]\d{8}(?!\d)"), "[PHONE]"),
    (re.compile(r"(?i)(bearer\s+)[a-z0-9._\-]+"), r"\1[TOKEN]"),
    (re.compile(r"\b[A-Za-z0-9+/]{40,}={0,2}\b"), "[SECRET]"),
)


class RedactionFilter(logging.Filter):
    """Scrub PII/secrets from log messages (and formatted args)."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:  # noqa: BLE001 — never break logging
            return True
        scrubbed = message
        for pattern, replacement in _REDACTIONS:
            scrubbed = pattern.sub(replacement, scrubbed)
        if scrubbed != message:
            record.msg = scrubbed
            record.args = ()
        return True


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    if root.handlers:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )
    handler.addFilter(RedactionFilter())
    root.addHandler(handler)
    root.setLevel(level.upper())
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
