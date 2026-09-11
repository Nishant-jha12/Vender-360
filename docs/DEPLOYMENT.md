# Vendor360 Deployment Guide

## 🐳 Docker Deployment
```bash
docker compose up -d --build
```

## 🌐 Production Recommendations
- Terminate SSL with NGINX or Caddy reverse proxy.
- Set strong `SECRET_KEY` in `backend/.env`.
- Use PostgreSQL for production database concurrency.
