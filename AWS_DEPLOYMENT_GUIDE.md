# AWS Deployment Guide (S3 + CloudFront + EC2 + Docker + Caddy)

This guide deploys:
- Frontend: S3 + CloudFront (cheap, production-style static hosting)
- Backend: EC2 (Ubuntu) running Docker Compose + Caddy for HTTPS
- Redis: Docker container (cost-saving; move to ElastiCache later)

Assumed domains (replace with yours):
- `app.yourdomain.com` -> frontend
- `api.yourdomain.com` -> backend

## 0) Prereqs

Local machine:
- Node + npm
- Git
- AWS CLI (`aws configure`) or use AWS Console for everything

AWS services:
- EC2
- S3
- CloudFront
- ACM (Certificate Manager)
- Route 53 optional (or use external DNS provider)

Repo layout:
- `Backend-Main/` (FastAPI + alembic)
- `Frontend-Main/` (Vite app)

## 1) Architecture

Traffic flow:
- User hits `https://app.yourdomain.com` -> CloudFront -> S3 (static files)
- Frontend calls `https://api.yourdomain.com/api/...` -> EC2 -> Caddy -> backend container

Public ports:
- EC2: 80 and 443 only
- Backend port 8000 stays internal (not publicly exposed)

## 2) DNS setup

You will create two DNS records:
- `app.yourdomain.com` -> CloudFront distribution
- `api.yourdomain.com` -> EC2 public IP (Elastic IP recommended)

If your DNS is outside Route 53, do this in your current DNS provider.

## 3) Backend on EC2 (Docker Compose + Caddy)

### 3.1 Launch EC2
- AMI: Ubuntu 22.04 LTS
- Type: t3.micro
- Storage: 20-30 GB gp3
- Security group inbound:
  - 22 (SSH) from your IP only
  - 80 (HTTP) from 0.0.0.0/0
  - 443 (HTTPS) from 0.0.0.0/0
  - Do NOT open 8000

Optional but recommended:
- Allocate and associate an Elastic IP

### 3.2 Point `api.yourdomain.com` to EC2
Create an A record:
- Host: `api`
- Value: EC2 public IP (Elastic IP if you use one)

### 3.3 SSH into EC2
```bash
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@api.yourdomain.com
```

### 3.4 Install Docker + Compose on EC2
```bash
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-build-plugin docker-compose-plugin

sudo usermod -aG docker ubuntu
newgrp docker

docker version
docker compose version
```

### 3.5 Pull repo on EC2
```bash
sudo apt-get install -y git
git clone <YOUR_REPO_URL>
cd <YOUR_REPO_FOLDER>
```

### 3.6 Create production `.env`
Edit `Backend-Main/.env` with production values:
```bash
ENVIRONMENT=production

FRONTEND_URL=https://app.yourdomain.com
API_BASE_URL=https://api.yourdomain.com/api

ALLOWED_ORIGINS=https://app.yourdomain.com
ALLOWED_HOSTS=api.yourdomain.com

REDIS_URL=redis://redis:6379

DATABASE_URL=postgresql+asyncpg://...
```
Notes:
- `ALLOWED_ORIGINS` must match the frontend domain exactly.
- `ALLOWED_HOSTS` must match the API domain.

### 3.7 Create Caddyfile
Create `Caddyfile` in the repo root:
```
api.yourdomain.com {
  reverse_proxy api:8000
}
```

### 3.8 Use production docker compose
Use `docker-compose.prod.yml` (included in this repo):
```bash
docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml ps
```

### 3.9 Run migrations
```bash
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
```

### 3.10 Verify backend
```bash
curl -I https://api.yourdomain.com
curl https://api.yourdomain.com/health
```
Debug:
```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f caddy
```

## 4) Frontend on S3 + CloudFront

### 4.1 Build frontend locally
```bash
cd Frontend-Main
npm ci
VITE_API_URL=https://api.yourdomain.com/api npm run build
```
This creates `dist/`. Any API domain change requires a rebuild.

### 4.2 Create S3 bucket
- Create a unique bucket name, e.g. `altrion-frontend-prod-<yourname>`
- Keep "Block all public access" ON

### 4.3 Upload `dist/`
Console upload OR:
```bash
aws s3 sync dist s3://YOUR_BUCKET_NAME --delete
```

### 4.4 Create CloudFront distribution
- Origin: your S3 bucket
- Origin access: use OAC
- Viewer protocol: Redirect HTTP to HTTPS
- Default root object: `index.html`

SPA routing fix (important):
- Add custom error responses:
  - 403 -> `/index.html` with 200
  - 404 -> `/index.html` with 200

### 4.5 HTTPS cert for `app.yourdomain.com`
CloudFront certs must be in `us-east-1`:
- ACM (N. Virginia) -> Request public cert for `app.yourdomain.com`
- DNS validate it (add record from ACM)
- Wait for status `Issued`

### 4.6 Attach domain to CloudFront
- Add CNAME: `app.yourdomain.com`
- Select the ACM cert you issued

### 4.7 Point `app.yourdomain.com` to CloudFront
- Route 53: A record alias -> CloudFront
- External DNS: CNAME -> `dxxxxxxx.cloudfront.net`

### 4.8 Invalidate CloudFront on deploy
```bash
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

## 5) Verification checklist

Backend:
- `https://api.yourdomain.com/health` returns healthy
- Browser calls from `app.yourdomain.com` succeed (CORS OK)

Frontend:
- `https://app.yourdomain.com` loads
- Hard refresh on nested route works (SPA error routing OK)

## 6) Repeatable deploy flow

Backend (EC2):
```bash
cd <repo>
git pull
docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
```

Frontend (local):
```bash
cd Frontend-Main
VITE_API_URL=https://api.yourdomain.com/api npm run build
aws s3 sync dist s3://YOUR_BUCKET_NAME --delete
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

## 7) Later upgrades
- Move Redis to ElastiCache
- Move backend to ECS Fargate + ALB
- Add autoscaling and blue/green deploys
