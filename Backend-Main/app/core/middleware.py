"""
FastAPI middleware for request context and logging.

Automatically injects user context and timing into every log
entry via structlog's contextvars mechanism.
"""
import time

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings


# Paths that should not generate request_started/request_completed logs
# (health checks from load balancers create thousands of useless entries)
SILENT_PATHS = {"/", "/health", "/health/ready"}


class RequestContextMiddleware(BaseHTTPMiddleware):
    """
    Middleware that:
    1. Binds method, path to structlog contextvars
    2. Extracts user_id/user_email from JWT (unverified peek for logging only)
    3. Logs request start and completion with duration
    4. Adds response-time and secure headers
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        start_time = time.time()
        path = request.url.path
        is_silent = path in SILENT_PATHS

        # Clear stale context and bind fresh request context
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            method=request.method,
            path=path,
        )

        logger = structlog.get_logger("request")

        # Peek at JWT for user context (does NOT verify - auth middleware handles that)
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            try:
                from jose import jwt as jose_jwt
                token = auth_header.split(" ", 1)[1]
                claims = jose_jwt.get_unverified_claims(token)
                user_id = claims.get("sub")
                user_email = claims.get("email")
                if user_id:
                    structlog.contextvars.bind_contextvars(user_id=user_id)
                if user_email:
                    structlog.contextvars.bind_contextvars(user_email=user_email)
            except Exception:
                pass

        if not is_silent:
            logger.info(
                "request_started",
                client=request.client.host if request.client else "unknown",
            )

        try:
            response = await call_next(request)
        except Exception as exc:
            duration_ms = round((time.time() - start_time) * 1000)
            logger.error(
                "request_failed",
                duration_ms=duration_ms,
                error=str(exc),
                error_type=type(exc).__name__,
            )
            raise
        else:
            duration_ms = round((time.time() - start_time) * 1000)
            if not is_silent:
                logger.info(
                    "request_completed",
                    duration_ms=duration_ms,
                    status_code=response.status_code,
                )

        # Response headers
        response.headers["x-response-time-ms"] = str(duration_ms)

        if settings.SECURE_HEADERS:
            response.headers.setdefault("x-content-type-options", "nosniff")
            response.headers.setdefault("x-frame-options", "DENY")
            response.headers.setdefault("referrer-policy", "no-referrer")
            response.headers.setdefault("permissions-policy", "camera=(), microphone=(), geolocation=()")

        return response
