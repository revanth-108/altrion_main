"""
Centralized logging configuration for Altrion API.

Architecture:
    - structlog pipes through Python stdlib logging
    - Two handlers: RotatingFileHandler (JSON) + StreamHandler (console)
    - contextvars for automatic request_id / user_id injection
    - timing_log() for structured performance timing (replaces old tlog())

Usage:
    from app.core.logging import setup_logging, get_logger, timing_log

    # At startup (call once in main.py):
    setup_logging()

    # In any module:
    logger = get_logger()
    logger.info("something_happened", user_id="abc", detail="xyz")

    # For performance timing:
    timing_log(endpoint="SIGNIN", step="supabase_auth", duration_ms=350, module="auth.py")
"""
import logging
import logging.handlers
import re
import sys
from pathlib import Path

import structlog

from app.core.config import settings

# Keys whose values should be masked in log output
_SENSITIVE_KEYS = re.compile(
    r"(password|secret|token|api_key|authorization|credit_card|ssn|private_key)",
    re.IGNORECASE,
)
_MASK = "***REDACTED***"


def _scrub_sensitive_data(logger, method_name, event_dict):
    """Structlog processor that masks sensitive field values."""
    for key in list(event_dict.keys()):
        if _SENSITIVE_KEYS.search(key):
            event_dict[key] = _MASK
    return event_dict


def setup_logging() -> None:
    """
    Initialize the complete logging system.
    Call once at application startup before any logger is used.
    """
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    log_level_file = getattr(logging, settings.LOG_LEVEL_FILE.upper(), logging.INFO)
    is_dev = settings.ENVIRONMENT == "development"

    # --- 1. Log directory and file path (always relative to backend root) ---
    backend_root = Path(__file__).resolve().parent.parent.parent
    log_dir = backend_root / settings.LOG_DIR
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / settings.LOG_FILE

    # --- 2. Build stdlib root logger with two handlers ---
    root_logger = logging.getLogger()
    root_logger.setLevel(min(log_level, log_level_file))
    root_logger.handlers.clear()

    # File handler: RotatingFileHandler with JSON output (flush immediately)
    file_handler = logging.handlers.RotatingFileHandler(
        filename=str(log_file),
        maxBytes=settings.LOG_MAX_BYTES,
        backupCount=settings.LOG_BACKUP_COUNT,
        encoding="utf-8",
    )
    file_handler.setLevel(log_level_file)
    file_handler.stream.reconfigure(write_through=True)

    # Console handler: human-readable in dev, JSON in production
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)

    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)

    # Quiet down noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("hpack").setLevel(logging.WARNING)

    # --- 3. Build structlog processor chains ---
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        _scrub_sensitive_data,
        structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
    ]

    # File output: always JSON
    json_formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.JSONRenderer(),
        ],
    )

    # Console output: pretty in dev, JSON in prod
    if is_dev:
        console_formatter = structlog.stdlib.ProcessorFormatter(
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                structlog.dev.ConsoleRenderer(colors=True),
            ],
        )
    else:
        console_formatter = structlog.stdlib.ProcessorFormatter(
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                structlog.processors.JSONRenderer(),
            ],
        )

    file_handler.setFormatter(json_formatter)
    console_handler.setFormatter(console_formatter)

    # --- 4. Configure structlog ---
    structlog.configure(
        processors=shared_processors,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


def get_logger(**initial_bindings):
    """Get a structlog logger with optional initial bindings."""
    return structlog.get_logger(**initial_bindings)


def timing_log(
    endpoint: str,
    step: str,
    duration_ms: int,
    *,
    module: str = "",
    user_email: str = "",
    user_id: str = "",
    detail: str = "",
    step_number: int = 0,
    is_complete: bool = False,
    **extra,
) -> None:
    """
    Structured timing log entry. Replaces the old tlog() function.

    Emits an INFO-level log with event="timing" and all performance
    data as discrete, searchable JSON fields.

    Args:
        endpoint:    Operation name (SIGNIN, PORTFOLIO, AGGREGATION, etc.)
        step:        Step description (supabase_auth, db_user_lookup, etc.)
        duration_ms: Duration of this step in milliseconds
        module:      Source filename (auth.py, portfolio.py, etc.)
        user_email:  User email for context
        user_id:     User ID for context
        detail:      Human-readable extra detail
        step_number: Step ordering (1, 2, 3...)
        is_complete: True if this is the final summary line
        **extra:     Additional key-value pairs
    """
    logger = structlog.get_logger("timing")
    logger.info(
        "timing",
        endpoint=endpoint,
        step=step,
        step_number=step_number,
        duration_ms=duration_ms,
        module=module,
        user_email=user_email,
        user_id=user_id,
        detail=detail,
        is_complete=is_complete,
        **extra,
    )
