# Operations Runbook

## Monitoring and Alerts

Recommended minimum:
- Uptime checks on `GET /health` and `GET /health/ready`.
- Log aggregation (stdout from backend container).
- Alert on elevated 5xx rates and high request latency.

Optional:
- Sentry (or equivalent) for exception tracking.
- APM for slow requests.

## Backups

Database (Supabase/Postgres):
- Enable automated daily backups in your provider.
- Keep at least 7–30 days of retention.
- Test restore procedures at least monthly.

Redis:
- Use managed Redis with persistence or snapshots if you rely on cached data.
- If Redis only stores cache/ephemeral data, document that it can be rebuilt.

## Incident Checklist

- Check `GET /health/ready` for dependency status.
- Inspect backend logs for `request_id` from error responses.
- Verify DB and Redis connectivity.
- Roll back to last known good build if needed.
