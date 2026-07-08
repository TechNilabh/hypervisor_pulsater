# HyperVisor: Pulsater

HyperVisor: Pulsater is a full-stack CDC (Change Data Capture) streaming and synchronization platform. It ingests payload data into versioned containers, processes them asynchronously through a typed validation pipeline, and delivers real-time status updates to operators via Server-Sent Events.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Environment Variables](#environment-variables)
3. [Running Locally](#running-locally)
4. [API Reference](#api-reference)
5. [Storage Backends](#storage-backends)
6. [Worker Pipeline](#worker-pipeline)
7. [Graceful Shutdown](#graceful-shutdown)
8. [Health Endpoints](#health-endpoints)
9. [Security Notes](#security-notes)

---

## Architecture

```
Next.js Frontend (Vercel)
        │
        │  HTTPS + JWT
        ▼
pulsater-core (Go HTTP server)
    ├── Auth handlers (signup / login / MFA / OAuth)
    ├── Container handlers (upload, list, detail)
    ├── SSE hub (real-time operator event fan-out)
    ├── Node deploy handler
    └── Worker (background job processor)
            │
            ├── pgxpool → PostgreSQL
            └── StorageBackend → LocalDisk | S3
```

### Key packages

| Package | Responsibility |
|---------|---------------|
| `main` | HTTP routing, lifecycle, migrations |
| `worker` | Async job poll/claim/validate/retry loop |
| `hub.go` | Operator-scoped SSE fan-out with backpressure |
| `storage.go` | `StorageBackend` interface (local disk + S3) |
| `auth.go` | JWT, MFA (SMTP OTP), OAuth (Google/GitHub/Facebook) |
| `health.go` | `/healthz` and `/readyz` probes |

---

## Environment Variables

All variables are read at startup. Missing **REQUIRED** variables cause an immediate `log.Fatalf` with the variable name.

### Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | **REQUIRED** | — | HMAC signing key for JWT session tokens. Min 32 characters. Generate with `openssl rand -hex 32`. |

### Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | One of these | — | Full PostgreSQL connection string (Render/Supabase/Railway format). Overrides all DB_* vars. |
| `DB_HOST` | — | `localhost` | PostgreSQL host |
| `DB_PORT` | — | `5432` | PostgreSQL port |
| `DB_USER` | — | `postgres` | PostgreSQL user |
| `DB_PASSWORD` | — | `postgres` | PostgreSQL password |
| `DB_NAME` | — | `postgres` | PostgreSQL database name |

### SMTP (MFA Emails)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | Warn-only | — | SMTP server hostname. If unset, OTPs are printed to stdout (dev mode). |
| `SMTP_PORT` | — | `587` | SMTP port |
| `SMTP_USER` | — | — | SMTP username / from address |
| `SMTP_PASS` | — | — | SMTP password / app token |
| `SMTP_FROM` | — | `SMTP_USER` | From header. Falls back to SMTP_USER if empty. |
| `SMTP_INSECURE` | — | `false` | Set `true` to skip TLS verification (localhost/dev mail catchers only) |

### OAuth 2.0

Each provider is optional. If CLIENT_ID is set, CLIENT_SECRET must also be set — startup will fail otherwise.

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth app client secret |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |
| `FACEBOOK_CLIENT_ID` | Facebook OAuth app client ID |
| `FACEBOOK_CLIENT_SECRET` | Facebook OAuth app client secret |

### Server / CORS

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | — | `8080` | HTTP listen port |
| `BACKEND_URL` | — | `http://localhost:8080` | Public backend URL (used in OAuth redirect URIs) |
| `FRONTEND_URL` | — | `http://localhost:3000` | Frontend URL (OAuth redirect after login) |
| `ALLOWED_ORIGIN` | — | permissive | Exact origin to allow in CORS. Any `*.vercel.app` origin is always reflected. |

### Storage

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STORAGE_BACKEND` | — | `local` | `local` or `s3` |
| `STORAGE_STAGING_DIR` | — | `./infra/staging` | Temp dir for atomic writes (local backend) |
| `STORAGE_RAW_DIR` | — | `./infra/storage/raw` | Final payload storage root (local backend) |
| `S3_BUCKET_NAME` | If s3 | — | S3 bucket name |
| `AWS_REGION` | If s3 | — | AWS region |
| `S3_ENDPOINT_URL` | — | — | Override for S3-compatible stores (R2, MinIO) |
| `S3_KMS_KEY_ARN` | — | — | SSE-KMS key ARN. If empty, uses SSE-S3. |

### Worker

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WORKER_POLL_INTERVAL_MS` | — | `5000` | How often the worker polls for new jobs (ms) |
| `WORKER_MAX_ATTEMPTS` | — | `5` | Max retry attempts before permanent failure |

### Upload Limits

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MAX_UPLOAD_BYTES` | — | `5368709120` (5 GB) | Maximum upload size |
| `UPLOAD_RATE_LIMIT_PER_MINUTE` | — | `10` | Uploads per operator per minute |

---

## Running Locally

### Prerequisites

- Go 1.22+
- PostgreSQL 14+ running locally
- (Optional) SMTP server or mail catcher for MFA emails

### Steps

```bash
# 1. Clone and enter the backend directory
cd pulsater-core

# 2. Copy the example env and fill in values
cp .env.example .env   # or edit .env directly
# At minimum, set JWT_SECRET to a 32+ character random string

# 3. Run
go run .
```

The server starts on `http://localhost:8080`. Database migrations run automatically on startup.

**Dev note on MFA:** If `SMTP_HOST` is not configured, the OTP is printed directly to the server log instead of being emailed:
```
[DEV_OTP] MFA token for user@example.com: 482910 (not emailed — SMTP not configured)
```

---

## API Reference

All endpoints except auth, `/healthz`, and `/readyz` require a `Authorization: Bearer <token>` header.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/auth/signup` | — | Register new operator |
| `POST` | `/api/v1/auth/login` | — | Initiate login (sends MFA OTP) |
| `POST` | `/api/v1/auth/verify-mfa` | — | Submit OTP, receive JWT |
| `POST` | `/api/v1/auth/resend-otp` | — | Resend current MFA OTP |
| `PUT` | `/api/v1/users/avatar` | JWT | Update operator avatar |
| `GET` | `/api/v1/auth/oauth/google` | — | Initiate Google OAuth |
| `GET` | `/api/v1/auth/oauth/google/callback` | — | Google OAuth callback |
| `GET` | `/api/v1/auth/oauth/github` | — | Initiate GitHub OAuth |
| `GET` | `/api/v1/auth/oauth/github/callback` | — | GitHub OAuth callback |
| `GET` | `/api/v1/auth/oauth/facebook` | — | Initiate Facebook OAuth |
| `GET` | `/api/v1/auth/oauth/facebook/callback` | — | Facebook OAuth callback |

#### POST /api/v1/auth/signup
```json
// Request
{ "username": "operator1", "email": "op@example.com", "password": "secret" }
// Response 201
{ "message": "Signup successful", "user_id": "<uuid>" }
```

#### POST /api/v1/auth/login
```json
// Request
{ "email": "op@example.com", "password": "secret" }
// Response 200
{ "mfa_required": true, "email": "op@example.com" }
```

#### POST /api/v1/auth/verify-mfa
```json
// Request
{ "email": "op@example.com", "otp": "482910" }
// Response 200
{ "session_token": "<jwt>", "user_id": "<uuid>", "username": "operator1", "avatar_id": "operator-default" }
```

### Containers

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/containers/provision` | JWT | Provision a new container |
| `POST` | `/api/v1/containers/upload` | JWT | Upload a payload file |
| `GET` | `/api/v1/containers/active` | JWT | List operator's containers |
| `GET` | `/api/v1/containers/{id}` | JWT | Get container detail + event history |
| `GET` | `/api/v1/containers/stream/token` | JWT | Issue SSE ticket |
| `GET` | `/api/v1/containers/stream?ticket=<ticket>` | Ticket | SSE event stream |

#### POST /api/v1/containers/upload

Multipart form upload (`Content-Type: multipart/form-data`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `container_designation` | string | Yes | Unique identifier slug (alphanumeric, underscores) |
| `ingestion_target_db` | string | Yes | `PostgreSQL`, `MySQL`, `MongoDB`, `Cassandra`, `SQLite` |
| `host_port_mapping` | string | Yes | Format `<host>:<port>` |
| `target_vector_type` | string | Yes | `PHARMA_R3`, `IOT_GRID`, or `QUANT_ALPHA` |
| `payload` | file | Yes | The CDC payload file |

Response `201`:
```json
{ "status": "queued", "container_id": "<uuid>", "callsign_alias": "...", "checksum_sha256": "..." }
```

Idempotency: include `Idempotency-Key: <uuid>` header. Duplicate requests return the original response.

#### GET /api/v1/containers/stream (SSE)

1. Obtain a ticket: `GET /api/v1/containers/stream/token` → `{ "ticket": "<hex>" }`
2. Open EventSource: `EventSource("/api/v1/containers/stream?ticket=<hex>")`

Events are JSON-encoded `ContainerEvent` objects:
```json
{
  "container_id": "<uuid>",
  "operator_id": "<uuid>",
  "callsign_alias": "PHARMA-0x3A2F",
  "from_state": "INITIALIZED",
  "to_state": "PROCESSING",
  "occurred_at": "2026-07-08T18:00:00Z",
  "detail": ""
}
```

Container states: `INITIALIZED` → `PROCESSING` → `SYNCED` | `FAILED`

### Operator Nodes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/operator/signature-key/generate` | JWT | Generate/rotate operator signature key |
| `POST` | `/api/v1/nodes/deploy` | JWT + Signature Key | Deploy a node |

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/healthz` | — | Liveness probe (always 200 if process is alive) |
| `GET` | `/readyz` | — | Readiness probe (checks DB + storage) |

#### GET /readyz — Response 200
```json
{ "status": "ready", "checks": { "db": "ok", "storage": "ok" } }
```

#### GET /readyz — Response 503
```json
{ "status": "not_ready", "checks": { "db": "error: connection refused", "storage": "ok" } }
```

---

## Storage Backends

### Local Disk (default)

Files are written atomically: streamed to a temp file in `STORAGE_STAGING_DIR`, then renamed to `STORAGE_RAW_DIR/<operator_id>/<container_id>/<filename>`. SHA-256 is computed from the staged file before rename.

### S3 / S3-Compatible

Set `STORAGE_BACKEND=s3`. Credentials come from the AWS SDK default chain (environment variables → shared credentials file → IAM instance/container role). Credentials are **never logged**.

- Objects < 5 MB: single `PutObject`
- Objects ≥ 5 MB: multipart upload (10 MB parts, 4 concurrent goroutines)
- Server-side encryption: SSE-S3 by default; SSE-KMS if `S3_KMS_KEY_ARN` is set

For Cloudflare R2 or MinIO, set `S3_ENDPOINT_URL`.

---

## Worker Pipeline

The worker polls `processing_jobs` every `WORKER_POLL_INTERVAL_MS` milliseconds using `SELECT ... FOR UPDATE SKIP LOCKED` for safe concurrent operation across multiple instances.

**Pipeline per job:**

1. **Claim**: atomically transition `QUEUED` → `RUNNING`
2. **Integrity gate**: re-compute SHA-256 of stored payload; fail permanently if mismatch
3. **Vector validator**: call the registered validator for `target_vector_type` (`PHARMA_R3`, `IOT_GRID`, `QUANT_ALPHA`)
4. **Success**: transition container → `SYNCED`, broadcast SSE event
5. **Failure**: exponential backoff retry (2^attempt seconds, max 300s); after `WORKER_MAX_ATTEMPTS`, permanently fail

**On shutdown**: RUNNING jobs owned by this worker are reset to `QUEUED` so they are picked up on next start.

---

## Graceful Shutdown

The server handles `SIGTERM` and `SIGINT`:

1. Stop accepting new HTTP connections (15-second drain for in-flight requests)
2. Cancel the worker context — worker finishes current poll tick, requeues any RUNNING jobs
3. Close the database pool

For Kubernetes, set `terminationGracePeriodSeconds: 30` (≥ HTTP drain + worker drain + DB close).

---

## Security Notes

- **JWT secret**: `JWT_SECRET` must be set. The server refuses to start with an empty or short (<32 char) secret. In production, use `openssl rand -hex 32` and store in your secrets manager.
- **No credential logging**: DB passwords, SMTP passwords, AWS credentials, and OAuth secrets are never written to logs.
- **SQL injection**: all queries use parameterized placeholders (`$1`, `$2`, ...) — never string concatenation.
- **Error responses**: internal details (SQL errors, file paths, stack traces) are logged server-side only. Clients receive generic error codes.
- **CORS**: only the `ALLOWED_ORIGIN` (and any `*.vercel.app` origin) is reflected. Set this explicitly in production.
- **Rate limiting**: upload endpoint is rate-limited per operator per minute (`UPLOAD_RATE_LIMIT_PER_MINUTE`).
- **Idempotency**: upload endpoint supports `Idempotency-Key` header for safe retries.
- **MFA stdout fallback is fatal-blocked in production**:
  - The server accepts a `APP_ENV` environment variable (default: `"production"` when unset — fail-safe, not fail-open).
  - The stdout OTP fallback (`[DEV_OTP]` in logs) is **only permitted** when `APP_ENV=development` AND `SMTP_HOST` is empty/placeholder.
  - If `APP_ENV` is unset or set to any value other than `"development"`, and `SMTP_HOST` is missing, `validateConfig()` calls `log.Fatalf` and the process exits before accepting any connections.
  - Startup logs always announce which mode is active: `[AUTH] MFA delivery: SMTP (host=...)` or `[AUTH] MFA delivery: DEV STDOUT FALLBACK (APP_ENV=development only)` — this is never ambiguous from logs alone.
  - **Never set `APP_ENV=development` on a production host.** On cloud platforms (Render, Railway, Fly.io), this variable should not be set at all, which causes the server to default to production-safe behaviour.

