"""
Custom exception handlers
"""
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.core.logging import get_logger

logger = get_logger()


class AltrionException(Exception):
    """Base exception for Altrion API"""
    def __init__(self, message: str, status_code: int = 500, details: dict = None):
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class AuthenticationError(AltrionException):
    """Authentication related errors"""
    def __init__(self, message: str = "Authentication failed", details: dict = None):
        super().__init__(message, status_code=401, details=details)


class AuthorizationError(AltrionException):
    """Authorization related errors"""
    def __init__(self, message: str = "Not authorized", details: dict = None):
        super().__init__(message, status_code=403, details=details)


class NotFoundError(AltrionException):
    """Resource not found errors"""
    def __init__(self, message: str = "Resource not found", details: dict = None):
        super().__init__(message, status_code=404, details=details)


class ValidationError(AltrionException):
    """Validation errors"""
    def __init__(self, message: str = "Validation failed", details: dict = None):
        super().__init__(message, status_code=400, details=details)


class RateLimitError(AltrionException):
    """Rate limiting errors"""
    def __init__(self, message: str = "Rate limit exceeded", details: dict = None):
        super().__init__(message, status_code=429, details=details)


class ProviderError(AltrionException):
    """Provider integration errors"""
    def __init__(self, message: str = "Provider error", details: dict = None):
        super().__init__(message, status_code=502, details=details)


def setup_exception_handlers(app: FastAPI):
    """Setup global exception handlers"""
    
    @app.exception_handler(AltrionException)
    async def altrion_exception_handler(request: Request, exc: AltrionException):
        logger.error(
            "Altrion exception",
            path=request.url.path,
            status_code=exc.status_code,
            message=exc.message,
            details=exc.details,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "message": exc.message,
                "details": exc.details,
            },
        )
    
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        logger.error(
            "HTTP exception",
            path=request.url.path,
            status_code=exc.status_code,
            detail=exc.detail,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "message": exc.detail,
            },
        )
    
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        logger.error(
            "Validation error",
            path=request.url.path,
            errors=exc.errors(),
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "success": False,
                "message": "Validation failed",
                "details": exc.errors(),
            },
        )
    
    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        logger.exception(
            "Unhandled exception",
            path=request.url.path,
            exception=str(exc),
        )
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "Internal server error",
            },
        )
