# Altrion Backend - Logging Strategy

## Architecture Overview

The logging system uses **structlog** piped through Python's **stdlib logging** with two output handlers:

```
structlog.get_logger()
    |
    v
structlog processors (contextvars, timestamps, formatting)
    |
    v
stdlib logging (root logger)
    |
    +---> RotatingFileHandler --> logs/altrion.log (JSON)
    |
    +---> StreamHandler ------> console (human-readable in dev, JSON in prod)
```

**Key components:**
- `app/core/logging.py` - Central configuration (`setup_logging()`, `get_logger()`, `timing_log()`)
- `app/core/middleware.py` - Request context middleware (request_id, user_id injection)
- `app/core/config.py` - Logging settings (LOG_LEVEL, LOG_DIR, rotation params)

## How to Use Logging

### Standard logging (in any module)

```python
from app.core.logging import get_logger

logger = get_logger()

# Basic events
logger.info("user_registered", email="user@example.com")
logger.error("payment_failed", error="timeout", amount=99.99)
logger.warning("rate_limit_approaching", user_id="abc", count=45)
logger.debug("cache_hit", key="portfolio:123")  # Only shown when LOG_LEVEL=DEBUG
```

### Performance timing (replaces old tlog())

```python
from app.core.logging import timing_log

timing_log(
    endpoint="SIGNIN",           # Operation name
    step="supabase_auth",        # Step description
    duration_ms=350,             # How long it took
    module="auth.py",            # Source file
    user_email="user@demo.com",  # Context
    step_number=1,               # Ordering
)

# Final summary for an operation
timing_log(
    endpoint="SIGNIN",
    step="complete",
    duration_ms=1200,
    module="auth.py",
    is_complete=True,            # Marks this as the summary line
)
```

### Adding custom context to a request

Context is automatically injected by the middleware (request_id, user_id, method, path).
No manual action needed - all logs within a request automatically include this context.

## Log Levels

| Level | Usage |
|-------|-------|
| **ERROR** | Exceptions, failed operations, data loss risks |
| **WARNING** | Degraded behavior, stale cache fallbacks, unmapped symbols |
| **INFO** | Successful operations, timing data, state changes |
| **DEBUG** | Per-item details (holdings, assets, prices), cache hits |

**Default:** INFO (set via `LOG_LEVEL` in `.env`)

## Log File Location and Rotation

| Setting | Default | Description |
|---------|---------|-------------|
| `LOG_DIR` | `logs` | Directory for log files |
| `LOG_FILE` | `altrion.log` | Main log file name |
| `LOG_MAX_BYTES` | `10485760` (10MB) | Max size before rotation |
| `LOG_BACKUP_COUNT` | `5` | Number of rotated backups |

**Total retention:** ~60MB (10MB active + 5 x 10MB backups)

Rotated files: `altrion.log.1`, `altrion.log.2`, ..., `altrion.log.5`

## Environment Configuration

Add to `.env` to override defaults:

```env
LOG_LEVEL=DEBUG          # Show debug-level detail logs
LOG_DIR=logs             # Log file directory
LOG_FILE=altrion.log     # Log file name
LOG_MAX_BYTES=10485760   # 10MB per file
LOG_BACKUP_COUNT=5       # Keep 5 backups
```

## Log Format

### File output (JSON - always)

```json
{
  "event": "timing",
  "endpoint": "SIGNIN",
  "step": "supabase_auth",
  "step_number": 1,
  "duration_ms": 350,
  "module": "auth.py",
  "user_email": "sarah@demo.com",
  "request_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "method": "POST",
  "path": "/api/auth/signin",
  "timestamp": "2026-02-16T15:30:00.123456Z",
  "logger": "timing",
  "level": "info"
}
```

### Console output (development - human-readable)

```
2026-02-16T15:30:00.123Z [info] timing  endpoint=SIGNIN step=supabase_auth duration_ms=350 request_id=a1b2c3d4-...
```

## Querying Logs

Log files are newline-delimited JSON. Use `jq` to query:

```bash
# All timing logs
jq 'select(.event == "timing")' logs/altrion.log

# All errors
jq 'select(.level == "error")' logs/altrion.log

# Logs for a specific request
jq 'select(.request_id == "a1b2c3d4-...")' logs/altrion.log

# Slowest operations (completed only)
jq 'select(.event == "timing" and .is_complete == true) | {endpoint, duration_ms, user_email}' logs/altrion.log

# All signin timing steps
jq 'select(.event == "timing" and .endpoint == "SIGNIN")' logs/altrion.log

# Errors in the last hour (approximate - check timestamps)
jq 'select(.level == "error")' logs/altrion.log
```

## What Gets Logged

### Always logged (INFO level)
- Request start/completion with duration and status code
- Authentication steps with timing (signin, signup)
- Portfolio aggregation steps with timing
- Database query timing (holdings, accounts, prices)
- Background refresh start/completion
- Application startup/shutdown events
- Provider connection/disconnection

### Debug level only (LOG_LEVEL=DEBUG)
- Per-holding details (symbol, quantity, asset class)
- Per-account details (name, provider, last synced)
- Per-price details (symbol, USD value)
- Per-asset portfolio breakdown
- Category totals
- Cache operations

### Never logged
- Passwords or secrets
- Full JWT tokens
- Raw provider API responses (stored in Redis instead)
- High-frequency loop iterations

## Request ID Correlation

Every request gets a unique `X-Request-ID` header in the response. This same ID appears in all log entries for that request, enabling full request tracing:

1. Frontend receives `X-Request-ID: a1b2c3d4-...` in response headers
2. Search logs: `jq 'select(.request_id == "a1b2c3d4-...")' logs/altrion.log`
3. See the complete request lifecycle: middleware -> controller -> service -> response
