# Deployment Guide

This repo is split into `Backend-Main` (FastAPI) and `Frontend-Main` (React/Vite).

## AWS (S3 + CloudFront + EC2 + Caddy)

See `AWS_DEPLOYMENT_GUIDE.md` for a full, cost-efficient production walkthrough.

## Docker (recommended)

1) Configure environment variables:
   - Copy `Backend-Main/.env.example` to `Backend-Main/.env` and fill in production values.
   - For the frontend, set `VITE_API_URL` during the Docker build (see compose).

2) Build and run:

```bash
docker compose up --build
```

3) Validate:
   - Backend: `http://localhost:8000/health`
   - Frontend: `http://localhost:5173`

## Migrations

If you are using the local database (or Supabase Postgres), run:

```bash
cd Backend-Main
alembic upgrade head
```

## Production Checklist

- Set `ENVIRONMENT=production` in `Backend-Main/.env`.
- Set `ALLOWED_ORIGINS` to your frontend URL.
- Set `ALLOWED_HOSTS` to your domain(s).
- Set `SUPABASE_JWT_SECRET` (to enable JWT verification).
- Verify `/health/ready` returns `ready`.
