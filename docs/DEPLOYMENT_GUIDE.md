# Production Deployment & Operations Guide

**Platform:** Activity Discovery Platform  
**Target Environments:** Production Linux/Container (Docker / PM2 / Cloud Run / ECS), Supabase PostgreSQL + PostGIS, Android Mobile (APK / AAB)

---

## Table of Contents

1. [Architectural Overview & Prerequisites](#1-architectural-overview--prerequisites)
2. [Environment Configuration Reference](#2-environment-configuration-reference)
3. [Supabase & PostgreSQL/PostGIS Setup](#3-supabase--postgresqlpostgis-setup)
4. [Database Migrations & Seeding](#4-database-migrations--seeding)
5. [Backend Deployment (NestJS)](#5-backend-deployment-nestjs)
6. [Real-Time WebSocket & Socket.IO Infrastructure](#6-real-time-websocket--socketio-infrastructure)
7. [Push Notifications (Firebase Cloud Messaging)](#7-push-notifications-firebase-cloud-messaging)
8. [Scheduled Background Worker (Activity Reminders)](#8-scheduled-background-worker-activity-reminders)
9. [Mobile Release Preparation (Flutter Android)](#9-mobile-release-preparation-flutter-android)
10. [Backup & Disaster Recovery Procedures](#10-backup--disaster-recovery-procedures)
11. [Troubleshooting & Runbook](#11-troubleshooting--runbook)

---

## 1. Architectural Overview & Prerequisites

The platform consists of:
- **NestJS REST API & WebSocket Gateway** (`/api/v1` and `/socket.io`).
- **PostgreSQL 15+** with the **PostGIS** extension (`postgis`) for geospatial radius queries (`ST_DWithin`, `ST_MakePoint`).
- **Supabase Auth** for identity management (sign-in, token issuance, secure password hashing).
- **Socket.IO** for low-latency activity group chat and typing indicators.
- **Firebase Cloud Messaging (FCM)** for background push notifications and activity reminders.
- **Flutter Mobile Application** for Android & iOS.

### Production Hardware & Tool Requirements
- **Node.js**: `20.x` LTS or `22.x` LTS.
- **PostgreSQL**: `15+` with `PostGIS` `3.x` enabled.
- **Reverse Proxy**: Nginx, Caddy, Cloudflare, or AWS ALB with TLS 1.3 termination and WebSocket upgrade support.
- **Flutter SDK**: `3.47.x` / Dart `3.13.x` with Android SDK (API 34+ / Java 17+).

---

## 2. Environment Configuration Reference

### Backend Environment Variables (`backend/.env` or Cloud Dashboard)

| Variable | Required | Description | Example / Safe Placeholder | Where to Obtain |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | Runtime environment mode (`production` for cloud deployment). | `production` | Set in cloud deployment settings / `render.yaml`. |
| `PORT` | Yes | Port on which the NestJS HTTP & WebSocket server listens. | `10000` (Render) or `3000` | Automatically injected by Render, Cloud Run, or ALB. |
| `API_PREFIX` | Yes | Global URL prefix for versioned REST routes. | `api/v1` | Application default configured in codebase. |
| `DATABASE_URL` | Yes | PostgreSQL connection string. Remote/hosted DB connections automatically negotiate SSL with strict certificate verification (`rejectUnauthorized: true`). | `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres?schema=public` | Supabase Dashboard -> Project Settings -> Database -> Connection string (URI). Use Session Pooler (`port 5432`) or direct connection for migrations, and Session (`port 5432`) or Transaction (`port 6543`) for application traffic. |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | Optional | Set to `false` only if your PostgreSQL host uses self-signed certificates without a custom CA. Defaults to `true` for security. | `true` | Set in cloud deployment environment variables if needed. |
| `DATABASE_CA_CERT` | Optional | Custom PEM-encoded root CA certificate or path to `.crt`/`.pem` file for private or enterprise PostgreSQL instances. | `"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"` | Provided by internal database administrator. |
| `SUPABASE_URL` | Yes | The Supabase project base HTTPS URL. | `https://[project-ref].supabase.co` | Supabase Dashboard -> Project Settings -> API -> Project URL. |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous / public publishable key (`sb_publishable_...`). | `sb_publishable_[key]` | Supabase Dashboard -> Project Settings -> API -> Project API keys (`anon` / `public`). |
| `SUPABASE_JWT_SECRET` | Optional | Legacy symmetric HS256 JWT secret. **Not required** for current Supabase projects using asymmetric ES256 keys, which verify cryptographically via project JWKS (`/.well-known/jwks.json`) and Supabase Auth API. Leave blank or omit. | `[supabase-jwt-secret]` | Supabase Dashboard -> Project Settings -> API -> JWT Settings (leave empty if using JWKS / ES256). |
| `CORS_ORIGIN` | Yes | Comma-separated allowlist of allowed web origins, or `*` (mobile-first API). In production, web requests with credentials from arbitrary origins are blocked unless listed here; native mobile apps (no Origin header) are always permitted. | `https://app.yourdomain.com` | Custom domain settings or `*` for mobile applications. |
| `CRON_SECRET` | Optional | Shared authorization token to secure the background activity reminders endpoint (`/api/v1/activities/reminders/process`). | `[random-high-entropy-string]` | Generate with `openssl rand -hex 32` and set on backend and cloud scheduler. |
| `FIREBASE_PROJECT_ID` | Optional | Firebase project identifier for server push notifications. | `activity-discovery-prod` | Firebase Console -> Project Settings -> General. |
| `FIREBASE_CLIENT_EMAIL` | Optional | Service account email for FCM push delivery. | `firebase-adminsdk@[project].iam.gserviceaccount.com` | Firebase Console -> Project Settings -> Service accounts. |
| `FIREBASE_PRIVATE_KEY` | Optional | PEM-encoded private key for FCM service account. | `"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"` | Downloaded service account JSON private key. |
| `FCM_SERVER_KEY` | Optional | Alternative FCM API key or JSON config string. | `[server-key]` | Firebase Console -> Cloud Messaging. |

> [!NOTE]
> Supabase projects generated in 2024+ use asymmetric ES256 signing keys. The backend automatically fetches and caches the project's public keys from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, guaranteeing high-performance local cryptographic verification without needing a placeholder JWT secret.

### Mobile Flutter Build Definitions (`--dart-define`)

Release builds enforce explicit HTTPS URLs and reject `localhost` or local IPs:

```bash
flutter build apk --release \
  --dart-define=API_BASE_URL=https://activity-discovery-backend.onrender.com/api/v1 \
  --dart-define=SUPABASE_URL=https://viiwqzyrjhetpsypgpdh.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=sb_publishable_pWGsGud7sFXaNSTLtlpA7g_SqquD0j1
```

---

## 3. Supabase & PostgreSQL/PostGIS Setup

### 1. Enable PostGIS Extension
Before executing migrations, ensure PostGIS is enabled on the database:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 2. Connection Pooling Configuration
When deploying against Supabase:
- **Port 5432 (Session Mode / Direct Connection)**: **MANDATORY for DDL migrations**. Session mode retains connection state for atomic DDL execution. Also recommended for persistent server instances (5–20 connections per server container).
- **Port 6543 (Transaction Mode)**: Suitable for runtime application queries in serverless or horizontal autoscaling environments. *Do not run DDL migrations via port 6543.*
- **SSL / TLS Verification**: The backend strictly validates server TLS certificates against system root CAs (`rejectUnauthorized: true`). Supabase certificates are issued by trusted root CAs (Google Trust Services / DigiCert / Let's Encrypt). If using a private enterprise database, attach `DATABASE_CA_CERT`.

### 3. Row Level Security & Table Isolation
- All domain tables (`users`, `activities`, `activity_memberships`, `messages`, `notifications`, etc.) are owned and accessed exclusively by the backend application via `DATABASE_URL`.
- Direct client writes to business tables from the Supabase public API should remain disabled.

---

## 4. Database Migrations & Seeding

Migrations are located in `backend/migrations/` and run sequentially:
- `001_create_profiles_and_interests.sql`: Users, interest taxonomy, user interests.
- `002_create_activities.sql`: Activities, PostGIS spatial point (`location_point`), GiST index, status checks.
- `003_create_activity_memberships.sql`: Activity memberships, unique user/activity constraint, role and approval status.
- `004_create_activity_messages.sql`: Real-time chat messages, indices for activity-based pagination.
- `005_create_notifications.sql`: In-app notifications, FCM device tokens, notification idempotency and unread counts.

### Safe Migration Execution
Migrations are idempotent and protected by transaction-level advisory locks (`pg_advisory_xact_lock(847291)`):
- If multiple containers deploy simultaneously, only one instance applies pending migrations while others wait safely.
- Each migration is executed inside an atomic transaction (`BEGIN ... COMMIT`) and recorded in `schema_migrations`.
- To apply pending migrations on production:
  ```bash
  cd backend
  npm run db:migrate
  ```

### Seeding Initial Taxonomy
To seed default activity categories and interests (270+ curated activities):
```bash
cd backend
npm run db:seed
```

> [!CAUTION]
> Never run destructive commands such as `DROP TABLE` or `npm run db:reset` in production. Always test migration rollbacks on an isolated staging database before running against production.

---

## 5. Backend Deployment (NestJS)

### Option A: Render Cloud Deployment (Recommended)

A declarative `render.yaml` blueprint is included in the project root:
1. Connect the GitHub repository to [Render](https://render.com).
2. Create a new **Blueprint** and select `render.yaml`.
3. In the Render Dashboard, supply the sensitive secrets (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`).
4. Render automatically runs the pre-deploy command (`npm run db:migrate`), launches the Node web service on `PORT`, and monitors `/api/v1/health`.

### Option B: Containerized Deployment (Docker)

Create a production container image using multi-stage builds:

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations

USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### Option C: Process Manager (PM2 on Linux VM)

1. Build backend on CI/CD runner:
   ```bash
   npm ci
   npm run build
   ```
2. Run database migrations:
   ```bash
   node dist/database/migrate.js
   ```
3. Start or reload with PM2:
   ```bash
   pm2 start dist/main.js --name "activity-api" -i max --max-memory-restart 512M
   ```
4. Enable PM2 systemd startup:
   ```bash
   pm2 save
   pm2 startup
   ```

### Reverse Proxy Configuration (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    client_max_body_size 1M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

---

## 6. Real-Time WebSocket & Socket.IO Infrastructure

- The Socket.IO gateway mounts on `/socket.io`.
- All connections authenticate using a Supabase JWT sent in `auth.token`.
- Room isolation ensures users can only join `activity_{id}` rooms if they are the host or an approved participant.

### Multi-Instance Horizontal Scaling
If deploying multiple backend replicas behind a load balancer:
1. Configure **Sticky Sessions** (Session Affinity via Cookie or Client IP) on the load balancer, OR
2. Attach the `@socket.io/redis-adapter` so room broadcasts propagate across all container instances.

---

## 7. Push Notifications (Firebase Cloud Messaging)

### Server Configuration
1. Go to **Firebase Console** -> **Project Settings** -> **Service Accounts**.
2. Click **Generate new private key** to download the credentials JSON.
3. Supply `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` as environment variables.
4. FCM failures are automatically caught and logged without aborting atomic database transactions.

### Mobile Client Configuration
- Place `google-services.json` in `mobile/android/app/`.
- Ensure `POST_NOTIFICATIONS` permission is requested on Android 13+ devices.

---

## 8. Scheduled Background Worker (Activity Reminders)

The API exposes an idempotent reminder processing endpoint:
```
POST /api/v1/activities/reminders/process
```

### Setting Up a Cron Job or Cloud Scheduler
Run every 15 minutes:
```bash
*/15 * * * * curl -s -X POST https://api.yourdomain.com/api/v1/activities/reminders/process \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: YOUR_CRON_SECRET" > /dev/null 2>&1
```

> [!TIP]
> If `CRON_SECRET` is set in the backend environment variables, all invocations must provide the matching `x-cron-secret: <secret>` or `Authorization: Bearer <secret>` header. If `CRON_SECRET` is unset, requests proceed without token authorization.

Reminders check for activities starting within the next 24 hours, send push notifications to approved participants, and mark the reminder as sent to guarantee idempotency.

---

## 9. Mobile Release Preparation (Flutter Android)

### 1. Keystore Creation (Run Once)
Generate a private release signing keystore (keep outside version control):
```bash
keytool -genkey -v -keystore C:/keys/activity-release-key.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias activitykey
```

### 2. Configure `key.properties`
Create `mobile/android/key.properties` (ignored by `.gitignore`):
```properties
storePassword=your_keystore_password
keyPassword=your_key_password
keyAlias=activitykey
storeFile=C:/keys/activity-release-key.jks
```

### 3. Build Production Artifacts
- **Release APK**:
  ```bash
  cd mobile
  flutter build apk --release \
    --dart-define=API_BASE_URL=https://api.yourdomain.com/api/v1 \
    --dart-define=SUPABASE_URL=https://[ref].supabase.co \
    --dart-define=SUPABASE_ANON_KEY=sb_publishable_[key]
  ```
  Output: `mobile/build/app/outputs/flutter-apk/app-release.apk`

- **Release App Bundle (AAB for Google Play)**:
  ```bash
  cd mobile
  flutter build appbundle --release \
    --dart-define=API_BASE_URL=https://api.yourdomain.com/api/v1 \
    --dart-define=SUPABASE_URL=https://[ref].supabase.co \
    --dart-define=SUPABASE_ANON_KEY=sb_publishable_[key]
  ```
  Output: `mobile/build/app/outputs/bundle/release/app-release.aab`

---

## 10. Backup & Disaster Recovery Procedures

### 1. Automated PostgreSQL Backups
Create regular logical backups using `pg_dump`:
```bash
# Full compressed backup
pg_dump -Fc --no-acl --no-owner -h [host] -p [port] -U [user] -d [dbname] > backup_$(date +%Y%m%d_%H%M%S).dump
```

### 2. Database Restoration
To restore a snapshot into a clean target database:
```bash
pg_restore -v --clean --no-acl --no-owner -h [host] -p [port] -U [user] -d [dbname] backup_file.dump
```

### 3. Point-in-Time Recovery (PITR)
For Supabase Pro projects, continuous WAL archiving provides 7-day PITR directly via the Supabase dashboard.

---

## 11. Troubleshooting & Runbook

| Symptom | Probable Cause | Remediation Step |
| :--- | :--- | :--- |
| **503 on `/api/v1/health/ready`** | Database unreachable or credentials invalid. | Check `DATABASE_URL`, pooler status, and network connectivity. |
| **401 on API endpoints** | Expired Supabase JWT or missing `Bearer` header. | Refresh token on client or verify `SUPABASE_JWT_SECRET`. |
| **429 Too Many Requests** | Rate limit exceeded on abuse-prone routes. | Check `X-RateLimit-Reset` header and adjust sliding window if legitimate traffic. |
| **WebSocket connection fails** | Proxy stripping `Upgrade` headers. | Ensure Nginx/ALB includes `proxy_set_header Upgrade $http_upgrade;`. |
| **Spatial search returns 0 results** | Points not transformed to geography or invalid radius. | Ensure `location_point` has valid EPSG:4326 coords (latitude [-90, 90], longitude [-180, 180]). |
| **Flutter app cannot connect on device** | Using `localhost` or `10.0.2.2` in release build. | Build with `--dart-define=API_BASE_URL=https://api.yourdomain.com/api/v1`. |
