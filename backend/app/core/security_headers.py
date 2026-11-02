"""Security headers (Phase 4C): CORS is handled by FastAPI's CORSMiddleware;
this adds hardening headers + a Content-Security-Policy.

CSP is enforced only when `app_env=prod` (dev needs inline HMR scripts and
blob/media for the map & uploads). Set CSP_EXTRA to append directives.
"""

from __future__ import annotations

from app.core.config import Settings

# Pragmatic CSP for the Next.js + Vite clients. 'unsafe-inline' for styles is
# required by both frameworks' inline style attributes; scripts stay self-only
# in prod (Next emits inline bootstrap — hence 'unsafe-inline' there too, a
# known trade-off documented in docs/security/owasp-checklist.md).
_CSP_PROD = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    "media-src 'self' blob:; "
    "font-src 'self' data:; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "object-src 'none'"
)

BASE_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
}


class SecurityHeadersMiddleware:
    def __init__(self, app, settings: Settings):
        self.app = app
        self.settings = settings

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message):
            if message.get("type") == "http.response.start":
                headers = list(message.get("headers") or [])
                for key, value in BASE_HEADERS.items():
                    headers.append((key.encode().lower(), value.encode()))
                if self.settings.app_env == "prod":
                    csp = _CSP_PROD
                    extra = getattr(self.settings, "csp_extra", "")
                    if extra:
                        csp = f"{csp}; {extra}"
                    headers.append((b"content-security-policy", csp.encode()))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_wrapper)
