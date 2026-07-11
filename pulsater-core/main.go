package main

import (
	"context"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/nilabh/pulsater-core/worker"
)


// StorageInstance is the process-wide storage backend (local or S3).
// Initialised in main() before any handler is invoked.
var StorageInstance StorageBackend

// hubAdapter wraps *SSEHub so it satisfies worker.HubPublisher.
// worker.Event and ContainerEvent carry identical fields; this adapter
// converts between them without coupling the two packages (Fix #5).
type hubAdapter struct{ hub *SSEHub }

func (a *hubAdapter) Publish(operatorID string, e worker.Event) {
	a.hub.Publish(operatorID, ContainerEvent{
		ContainerID:   e.ContainerID,
		OperatorID:    e.OperatorID,
		CallsignAlias: e.CallsignAlias,
		FromState:     e.FromState,
		ToState:       e.ToState,
		OccurredAt:    e.OccurredAt,
		Detail:        e.Detail,
	})
}


func main() {
	log.Println("Initializing HYPERVISOR_PULSATER core auth backend...")

	// ── Step 1: Load environment ───────────────────────────────────────────
	if err := godotenv.Load(".env"); err != nil {
		if err2 := godotenv.Load("pulsater-core/.env"); err2 != nil {
			log.Println("[WARN] No .env file found in either location — relying on system environment")
		} else {
			log.Println("[ENV] Loaded from pulsater-core/.env")
		}
	} else {
		log.Println("[ENV] Loaded from .env")
	}

	// ── Step 2: Fail-fast config validation ───────────────────────────────
	// Any missing required variable exits with a clear message naming the var.
	validateConfig()

	// ── Step 3: Load JWT secret from environment ───────────────────────────
	// validateConfig already confirmed JWT_SECRET is non-empty.
	LoadJWTSecret()

	// ── Step 4: Initialise subsystems ─────────────────────────────────────
	slogger := slog.Default()

	var storageErr error
	StorageInstance, storageErr = NewStorageBackend(context.Background(), slogger)
	if storageErr != nil {
		log.Fatalf("Fatal: Storage backend init failed: %v", storageErr)
	}
	log.Printf("[STORAGE] Backend initialised: %T (env=%s)", StorageInstance, os.Getenv("STORAGE_BACKEND"))

	GlobalHub = NewSSEHub(slogger)
	startTicketGC()

	if err := InitDB(); err != nil {
		log.Fatalf("Fatal: Database initialization failed: %v", err)
	}

	if err := runMigrations(); err != nil {
		DB.Close()
		log.Fatalf("Fatal: Database migrations failed: %v", err)
	}

	// ── Step 5: Start background worker ───────────────────────────────────
	workerCtx, workerCancel := context.WithCancel(context.Background())
	proc := worker.NewProcessor(DB, &hubAdapter{hub: GlobalHub}, slog.Default())
	workerDone := make(chan struct{})
	go func() {
		defer close(workerDone)
		proc.Run(workerCtx)
	}()

	// ── Step 6: OTP garbage collector ─────────────────────────────────────
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			evicted := 0
			OTPCache.Range(func(key, value any) bool {
				entry, ok := value.(otpEntry)
				if !ok || time.Since(entry.CreatedAt) > otpTTL {
					OTPCache.Delete(key)
					evicted++
				}
				return true
			})
			if evicted > 0 {
				log.Printf("[OTP_GC] Evicted %d expired OTP cache entries", evicted)
			}
		}
	}()

	// ── Step 7: Register routes ────────────────────────────────────────────
	mux := http.NewServeMux()

	// Health / readiness (unauthenticated — used by load balancers)
	mux.HandleFunc("/healthz", HandleHealthz)
	mux.HandleFunc("/readyz", HandleReadyz)

	// Phase 1 — Auth
	mux.HandleFunc("/api/v1/auth/signup", SignupHandler)
	mux.HandleFunc("/api/v1/auth/login", LoginHandler)
	mux.HandleFunc("/api/v1/auth/verify-mfa", VerifyMFAHandler)
	mux.HandleFunc("/api/v1/auth/resend-otp", ResendOTPHandler)

	mux.HandleFunc("/api/v1/auth/oauth/google", HandleOAuthLogin("google"))
	mux.HandleFunc("/api/v1/auth/oauth/google/callback", HandleOAuthCallback("google"))
	mux.HandleFunc("/api/v1/auth/oauth/github", HandleOAuthLogin("github"))
	mux.HandleFunc("/api/v1/auth/oauth/github/callback", HandleOAuthCallback("github"))
	mux.HandleFunc("/api/v1/auth/oauth/facebook", HandleOAuthLogin("facebook"))
	mux.HandleFunc("/api/v1/auth/oauth/facebook/callback", HandleOAuthCallback("facebook"))

	mux.HandleFunc("/api/v1/users/avatar", UpdateAvatarHandler)

	// Phase 2 — Containers & Streaming
	mux.HandleFunc("/api/v1/containers/provision", JWTAuthMiddleware(ProvisionContainerHandler))
	mux.HandleFunc("/api/v1/containers/stream/token", JWTAuthMiddleware(HandleIssueSSETicket))
	mux.HandleFunc("/api/v1/containers/stream", HandleContainerStream)
	mux.HandleFunc("/api/v1/containers/upload", JWTAuthMiddleware(HandleContainerUpload))
	mux.HandleFunc("/api/v1/containers/active", JWTAuthMiddleware(HandleListContainers))
	mux.HandleFunc("/api/v1/containers/", JWTAuthMiddleware(HandleGetContainer))

	// Phase 3 — Operator Nodes
	mux.HandleFunc("/api/v1/operator/signature-key/generate", JWTAuthMiddleware(HandleGenerateSignatureKey))
	mux.HandleFunc("/api/v1/nodes/deploy", JWTAuthMiddleware(HandleNodeDeploy))

	handler := CORSMiddleware(mux)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      handler,
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 0, // 0 = no timeout (SSE streams must not be cut)
		IdleTimeout:  120 * time.Second,
	}

	// ── Step 8: Start server in goroutine so we can listen for signals ─────
	serverErr := make(chan error, 1)
	go func() {
		log.Printf("[SERVER] Listening on http://0.0.0.0:%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			serverErr <- err
		}
	}()

	// ── Step 9: Block until SIGTERM / SIGINT or server error ──────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-quit:
		log.Printf("[SHUTDOWN] Received signal %s — beginning graceful shutdown", sig)
	case err := <-serverErr:
		log.Fatalf("[SHUTDOWN] HTTP server error: %v", err)
	}

	// ── Step 10: Graceful drain ───────────────────────────────────────────
	// Order: stop accepting → drain HTTP → stop worker → close DB.
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()

	log.Println("[SHUTDOWN] Stopping HTTP server (15s drain)...")
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("[SHUTDOWN] HTTP drain exceeded timeout: %v", err)
	} else {
		log.Println("[SHUTDOWN] HTTP server stopped cleanly.")
	}

	// Cancel worker context and wait for the worker goroutine to finish
	// (the worker's deferred requeueOrphanedJobs will requeue RUNNING rows).
	log.Println("[SHUTDOWN] Stopping worker...")
	workerCancel()
	select {
	case <-workerDone:
		log.Println("[SHUTDOWN] Worker stopped.")
	case <-time.After(10 * time.Second):
		log.Println("[SHUTDOWN] Worker did not stop within 10s — orphaned jobs will be requeued on next start.")
	}

	log.Println("[SHUTDOWN] Closing DB pool...")
	DB.Close()
	log.Println("[SHUTDOWN] Shutdown complete.")
}

// validateConfig checks that all required environment variables are present and
// well-formed. Any failure calls log.Fatalf, naming the specific missing var.
// Must be called before InitDB, storage init, or any request handling.
func validateConfig() {
	var errs []string

	requireEnv := func(key string) {
		if strings.TrimSpace(os.Getenv(key)) == "" {
			errs = append(errs, fmt.Sprintf("required env var %q is not set or empty", key))
		}
	}

	// ── JWT ────────────────────────────────────────────────────────────────
	jwtSecret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if jwtSecret == "" {
		errs = append(errs, "required env var \"JWT_SECRET\" is not set or empty — generate with: openssl rand -hex 32")
	} else if len(jwtSecret) < 32 {
		errs = append(errs, fmt.Sprintf("JWT_SECRET must be at least 32 characters (got %d) — use a strong random secret", len(jwtSecret)))
	}

	// ── Database ───────────────────────────────────────────────────────────
	// Accept either DATABASE_URL or the individual DB_* vars.
	if strings.TrimSpace(os.Getenv("DATABASE_URL")) == "" {
		// Fall back to component vars — at minimum DB_PASSWORD must be set
		// (host/port/user/name all have defaults in db.go).
		// We warn rather than hard-fail because local dev uses defaults.
		if strings.TrimSpace(os.Getenv("DB_PASSWORD")) == "" {
			log.Println("[CONFIG][WARN] Neither DATABASE_URL nor DB_PASSWORD is set — using default 'postgres' password")
		}
	}

	// ── Email delivery (Brevo HTTPS API) — fail-fast in production ───────────
	// Default to "production" if APP_ENV is unset — fail-safe, not fail-open.
	// The stdout OTP fallback is only permitted when APP_ENV=="development"
	// AND EMAIL_API_KEY is not set.  Any other combination is fatal so the
	// production deploy never silently enables an MFA bypass.
	//
	// SMTP vars (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) are deprecated:
	// Render free tier blocks outbound ports 25/465/587. Use Brevo API vars instead.
	appEnv := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	if appEnv == "" {
		appEnv = "production" // conservative default
	}
	emailAPIKey := strings.TrimSpace(os.Getenv("EMAIL_API_KEY"))
	emailFrom := strings.TrimSpace(os.Getenv("EMAIL_FROM_ADDRESS"))
	switch {
	case emailAPIKey == "" && appEnv == "development":
		// Permitted: explicit dev environment, no email API configured.
		// LoginHandler will print the OTP to stdout instead of emailing.
		log.Println("[CONFIG][WARN] EMAIL_API_KEY not configured; OTP fallback to stdout is ENABLED (APP_ENV=development)")
	case emailAPIKey == "":
		// APP_ENV is 'production' (or unset — defaults to production).
		// Missing EMAIL_API_KEY means MFA is broken and users cannot authenticate.
		errs = append(errs,
			fmt.Sprintf(
				"EMAIL_API_KEY is not set (APP_ENV=%q) — "+
					"Brevo API key is required for MFA email delivery in production. "+
					"Set APP_ENV=development to enable the stdout OTP fallback for local dev.",
				appEnv,
			))
	default:
		// EMAIL_API_KEY is set — also require EMAIL_FROM_ADDRESS.
		if emailFrom == "" {
			errs = append(errs, "EMAIL_API_KEY is set but EMAIL_FROM_ADDRESS is empty — Brevo requires a verified sender address")
		}
	}

	// ── Storage backend ────────────────────────────────────────────────────
	storageBackend := strings.ToLower(strings.TrimSpace(os.Getenv("STORAGE_BACKEND")))
	if storageBackend == "" {
		storageBackend = "local"
	}
	if storageBackend == "s3" {
		requireEnv("S3_BUCKET_NAME")
		requireEnv("AWS_REGION")
		// AWS credentials come from the SDK chain (env/shared file/instance role) — not validated here.
	} else if storageBackend != "local" {
		errs = append(errs, fmt.Sprintf("STORAGE_BACKEND=%q is not valid — must be 'local' or 's3'", storageBackend))
	}

	// ── OAuth provider pairs ───────────────────────────────────────────────
	// Each provider is optional (we just warn if one has ID but not secret).
	for _, prov := range []struct{ id, secret string }{
		{"GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"},
		{"GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"},
		{"FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET"},
	} {
		hasID := strings.TrimSpace(os.Getenv(prov.id)) != ""
		hasSecret := strings.TrimSpace(os.Getenv(prov.secret)) != ""
		if hasID && !hasSecret {
			errs = append(errs, fmt.Sprintf("%s is set but %s is empty — OAuth for this provider will fail", prov.id, prov.secret))
		} else if !hasID && hasSecret {
			errs = append(errs, fmt.Sprintf("%s is set but %s is empty — OAuth for this provider will fail", prov.secret, prov.id))
		}
	}

	if len(errs) > 0 {
		for _, e := range errs {
			log.Printf("[CONFIG][FATAL] %s", e)
		}
		log.Fatalf("[CONFIG] %d configuration error(s) found — fix them before starting the server", len(errs))
	}

	log.Println("[CONFIG] All required environment variables validated.")

	// Announce MFA delivery mode unambiguously in startup logs.
	appEnvFinal := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	if appEnvFinal == "" {
		appEnvFinal = "production"
	}
	emailAPIKeyFinal := strings.TrimSpace(os.Getenv("EMAIL_API_KEY"))
	if emailAPIKeyFinal != "" {
		// Never log the key itself — log only that it is active.
		log.Printf("[AUTH] MFA delivery: Brevo HTTPS API (EMAIL_FROM_ADDRESS=%s)", strings.TrimSpace(os.Getenv("EMAIL_FROM_ADDRESS")))
	} else {
		// Only reachable when APP_ENV=development (production case was fatal above).
		log.Printf("[AUTH] MFA delivery: DEV STDOUT FALLBACK (APP_ENV=development only)")
	}
}

func runMigrations() error {
	ctx := context.Background()

	// ── Phase 1 baseline ────────────────────────────────────────────────────
	phase1Query := `
	CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
	CREATE EXTENSION IF NOT EXISTS "pgcrypto";

	CREATE TABLE IF NOT EXISTS users (
		id UUID PRIMARY KEY,
		username VARCHAR(255) UNIQUE NOT NULL,
		email VARCHAR(255) UNIQUE NOT NULL,
		password_hash VARCHAR(255) NOT NULL,
		avatar_id VARCHAR(255) NOT NULL DEFAULT 'operator-default',
		created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS oauth_identities (
		id UUID PRIMARY KEY,
		user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		provider VARCHAR(50) NOT NULL,
		provider_user_id VARCHAR(255) NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(provider, provider_user_id)
	);

	CREATE TABLE IF NOT EXISTS containers (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		designation VARCHAR(255) NOT NULL,
		ingestion_target_db VARCHAR(100) NOT NULL,
		host_port_mapping VARCHAR(100) NOT NULL,
		status VARCHAR(50) NOT NULL DEFAULT 'PROVISIONED',
		provisioned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
	);
	`
	if _, err := DB.Exec(ctx, phase1Query); err != nil {
		return fmt.Errorf("phase 1 migration failed: %w", err)
	}
	log.Println("[MIGRATION] Phase 1 schemas verified.")

	// ── Phase 2 — single transaction, strict dependency order ────────────────
	//
	// Ordering contract (enforced by code structure, not comments):
	//   STEP 1 — ALTER TABLE containers ADD COLUMN IF NOT EXISTS  (all columns)
	//   STEP 2 — CREATE TABLE IF NOT EXISTS container_events / processing_jobs
	//   STEP 3 — Assertion: verify every column referenced by an index exists
	//   STEP 4 — CREATE INDEX IF NOT EXISTS  (only after steps 1-3 pass)
	//
	// The entire block runs inside one explicit transaction. Any failure rolls
	// back cleanly, preventing the "different error on every restart" behaviour
	// caused by partial schema application.

	tx, err := DB.Begin(ctx)
	if err != nil {
		return fmt.Errorf("phase 2 migration: begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op after Commit

	// execStep logs and executes a single DDL statement via the transaction.
	// Logging the statement means any future 42703 names the exact failing line.
	execStep := func(label, sql string) error {
		log.Printf("[MIGRATION][P2] %s", label)
		if _, err := tx.Exec(ctx, sql); err != nil {
			return fmt.Errorf("phase 2 migration — %s: %w", label, err)
		}
		return nil
	}

	// ── STEP 1: ALTER TABLE containers — add every Phase 2 column ─────────────
	// Columns are added with DEFAULT now() / DEFAULT 0 / DEFAULT 'local' so that
	// existing Phase-1 rows receive a valid non-NULL value immediately on ALTER,
	// without requiring a backfill UPDATE. Each ALTER is independently idempotent
	// via IF NOT EXISTS.
	//
	// IMPORTANT — created_at is NOT in the Phase 1 containers DDL (that table
	// only has provisioned_at). We add it here so that idx_containers_created_desc
	// has a column to reference. DEFAULT now() ensures existing rows are covered.
	phase2AlterCols := []struct{ label, sql string }{
		{
			"ALTER containers ADD operator_id",
			`ALTER TABLE containers ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES users(id)`,
		},
		{
			"ALTER containers ADD callsign_alias",
			`ALTER TABLE containers ADD COLUMN IF NOT EXISTS callsign_alias TEXT`,
		},
		{
			"ALTER containers ADD target_vector_type",
			`ALTER TABLE containers ADD COLUMN IF NOT EXISTS target_vector_type TEXT CHECK (target_vector_type IN ('PHARMA_R3','IOT_GRID','QUANT_ALPHA'))`,
		},
		{
			"ALTER containers ADD status_state",
			`ALTER TABLE containers ADD COLUMN IF NOT EXISTS status_state TEXT NOT NULL DEFAULT 'INITIALIZED' CHECK (status_state IN ('INITIALIZED','PROCESSING','SYNCED','FAILED'))`,
		},
		{
			"ALTER containers ADD storage_payload_url",
			`ALTER TABLE containers ADD COLUMN IF NOT EXISTS storage_payload_url TEXT`,
		},
		{
			"ALTER containers ADD storage_backend",
			`ALTER TABLE containers ADD COLUMN IF NOT EXISTS storage_backend TEXT NOT NULL DEFAULT 'local'`,
		},
		{
			"ALTER containers ADD file_size_bytes",
			`ALTER TABLE containers ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT`,
		},
		{
			"ALTER containers ADD checksum_sha256",
			`ALTER TABLE containers ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT`,
		},
		{
			"ALTER containers ADD idempotency_key",
			`ALTER TABLE containers ADD COLUMN IF NOT EXISTS idempotency_key TEXT`,
		},
		{
			"ALTER containers ADD retry_count",
			`ALTER TABLE containers ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0`,
		},
		{
			"ALTER containers ADD error_message",
			`ALTER TABLE containers ADD COLUMN IF NOT EXISTS error_message TEXT`,
		},
		{
			// created_at is absent from the Phase 1 containers DDL — add it now.
			// idx_containers_created_desc depends on this column; without it the
			// index CREATE fails with SQLSTATE 42703 (column does not exist).
			// DEFAULT now() gives existing provisioned rows a valid timestamp.
			"ALTER containers ADD created_at (missing from Phase 1 containers — required by idx_containers_created_desc)",
			`ALTER TABLE containers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
		},
		{
			"ALTER containers ADD updated_at",
			`ALTER TABLE containers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
		},
		{
			"ALTER containers ADD deleted_at",
			`ALTER TABLE containers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
		},
	}

	for _, col := range phase2AlterCols {
		if err := execStep(col.label, col.sql); err != nil {
			return err
		}
	}
	log.Println("[MIGRATION][P2] STEP 1 complete — all containers columns applied.")

	// ── STEP 2: CREATE TABLE container_events and processing_jobs ─────────────
	// These must come after the ALTER statements so that the FK reference to
	// containers(id) sees the complete column set, and so that the index
	// statements in STEP 4 can reference their columns.

	newTables := []struct{ label, sql string }{
		{
			"CREATE TABLE container_events",
			`CREATE TABLE IF NOT EXISTS container_events (
				event_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				container_id UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
				from_state   TEXT,
				to_state     TEXT,
				occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
				detail       JSONB
			)`,
		},
		{
			"CREATE TABLE processing_jobs",
			`CREATE TABLE IF NOT EXISTS processing_jobs (
				job_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				container_id  UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
				job_status    TEXT NOT NULL DEFAULT 'QUEUED' CHECK (job_status IN ('QUEUED','RUNNING','DONE','FAILED')),
				attempts      INT  NOT NULL DEFAULT 0,
				locked_by     TEXT,
				locked_at     TIMESTAMPTZ,
				next_retry_at TIMESTAMPTZ,
				created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
				updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
			)`,
		},
	}

	for _, tbl := range newTables {
		if err := execStep(tbl.label, tbl.sql); err != nil {
			return err
		}
	}
	log.Println("[MIGRATION][P2] STEP 2 complete — container_events and processing_jobs created.")

	// ── STEP 3: Assertion — verify all index-referenced columns exist ──────────
	// This runs inside the same transaction, after STEP 1 and STEP 2, so any
	// column that was successfully added will be visible here.
	// If a column is still missing at this point (e.g. the ALTER silently no-
	// op'd against a schema that already has a conflicting definition), we fail
	// fast with a clear diagnostic instead of getting a raw 42703 from Postgres.

	requiredColumns := []string{
		"created_at",   // idx_containers_created_desc
		"updated_at",   // idx_containers_operator_status (implicit via operator_id)
		"status_state", // idx_containers_operator_status, idx_containers_active
		"operator_id",  // idx_containers_operator_status, idx_containers_idempotency
		"idempotency_key", // idx_containers_idempotency
	}

	log.Println("[MIGRATION][P2] STEP 3 — asserting required columns exist before index creation...")
	for _, col := range requiredColumns {
		var found bool
		assertSQL := `
			SELECT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_schema = 'public'
				  AND table_name   = 'containers'
				  AND column_name  = $1
			)`
		// Use the transaction so we see our own uncommitted ALTERs.
		if err := tx.QueryRow(ctx, assertSQL, col).Scan(&found); err != nil {
			return fmt.Errorf("phase 2 migration — column assertion query failed for %q: %w", col, err)
		}
		if !found {
			return fmt.Errorf(
				"phase 2 migration — assertion failed: column %q does not exist on containers "+
					"after ALTER TABLE step; cannot proceed to index creation (SQLSTATE 42703 would follow)",
				col,
			)
		}
		log.Printf("[MIGRATION][P2] assertion OK: containers.%s exists", col)
	}
	log.Println("[MIGRATION][P2] STEP 3 complete — all required columns confirmed present.")

	// ── STEP 4: CREATE INDEX — after every column and table is guaranteed ──────
	// Each index statement is executed individually so a failure names the exact
	// index that broke, not a generic "phase 2 migration failed" message.

	indexes := []struct{ label, sql string }{
		{
			"CREATE INDEX idx_containers_operator_status",
			`CREATE INDEX IF NOT EXISTS idx_containers_operator_status
				ON containers (operator_id, status_state)`,
		},
		{
			"CREATE INDEX idx_containers_created_desc",
			// created_at was added in STEP 1 and verified in STEP 3.
			`CREATE INDEX IF NOT EXISTS idx_containers_created_desc
				ON containers (created_at DESC)`,
		},
		{
			"CREATE INDEX idx_containers_active (partial)",
			`CREATE INDEX IF NOT EXISTS idx_containers_active
				ON containers (status_state)
				WHERE status_state != 'SYNCED'`,
		},
		{
			"CREATE UNIQUE INDEX idx_containers_idempotency (partial)",
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_containers_idempotency
				ON containers (operator_id, idempotency_key)
				WHERE idempotency_key IS NOT NULL`,
		},
		{
			"CREATE INDEX idx_processing_jobs_queue",
			`CREATE INDEX IF NOT EXISTS idx_processing_jobs_queue
				ON processing_jobs (job_status, next_retry_at)`,
		},
		{
			"CREATE INDEX idx_container_events_container",
			`CREATE INDEX IF NOT EXISTS idx_container_events_container
				ON container_events (container_id, occurred_at DESC)`,
		},
	}

	for _, idx := range indexes {
		if err := execStep(idx.label, idx.sql); err != nil {
			return err
		}
	}
	log.Println("[MIGRATION][P2] STEP 4 complete — all indexes created.")

	// ── Commit the Phase 2 transaction ────────────────────────────────────────
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("phase 2 migration — commit failed: %w", err)
	}

	log.Println("[MIGRATION] Phase 2 schemas verified (container_events, processing_jobs, all indexes active).")

	// ── Phase 3 — single transaction, same dependency-order discipline ────────
	//
	// Ordering contract:
	//   STEP 0 — ALTER TABLE containers: relax storage_backend CHECK to allow 'none'
	//   STEP 1 — CREATE TABLE operator_signature_keys (depends only on users.id)
	//   STEP 2 — CREATE TABLE node_deployments (depends on containers.id + users.id)
	//   STEP 3 — Assertion: verify node_deployments.operator_id exists
	//   STEP 4 — CREATE INDEX idx_node_deployments_operator
	//
	// NOTE: DROP CONSTRAINT IF EXISTS is the correct Postgres syntax.
	// "IF NOT EXISTS" is not valid on DROP CONSTRAINT and will fail to parse.

	tx3, err := DB.Begin(ctx)
	if err != nil {
		return fmt.Errorf("phase 3 migration: begin transaction: %w", err)
	}
	defer func() { _ = tx3.Rollback(ctx) }()

	execStep3 := func(label, sql string) error {
		log.Printf("[MIGRATION][P3] %s", label)
		if _, err := tx3.Exec(ctx, sql); err != nil {
			return fmt.Errorf("phase 3 migration — %s: %w", label, err)
		}
		return nil
	}

	// ── STEP 0: Relax containers.storage_backend CHECK ────────────────────────
	// The Phase 2 column definition uses DEFAULT 'local'. Node-deploy rows carry
	// no file backend, so we need 'none' as a valid value.
	// Correct Postgres syntax: DROP CONSTRAINT IF EXISTS (not "IF NOT EXISTS").
	p3Step0 := []struct{ label, sql string }{
		{
			"DROP old storage_backend check constraint (IF EXISTS — valid Postgres syntax)",
			`ALTER TABLE containers DROP CONSTRAINT IF EXISTS containers_storage_backend_check`,
		},
		{
			"ADD storage_backend check constraint with 'none' included",
			`ALTER TABLE containers ADD CONSTRAINT containers_storage_backend_check
				CHECK (storage_backend IN ('local', 's3', 'none'))`,
		},
	}
	for _, s := range p3Step0 {
		if err := execStep3(s.label, s.sql); err != nil {
			return err
		}
	}
	log.Println("[MIGRATION][P3] STEP 0 complete — storage_backend constraint updated.")

	// ── STEP 1: CREATE TABLE operator_signature_keys ───────────────────────────
	if err := execStep3("CREATE TABLE operator_signature_keys", `
		CREATE TABLE IF NOT EXISTS operator_signature_keys (
			operator_id  UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
			key_hash     TEXT NOT NULL,
			key_hint     TEXT,
			created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
			rotated_at   TIMESTAMPTZ,
			revoked_at   TIMESTAMPTZ
		)`); err != nil {
		return err
	}
	log.Println("[MIGRATION][P3] STEP 1 complete — operator_signature_keys created.")

	// ── STEP 2: CREATE TABLE node_deployments ─────────────────────────────────
	// container_id is one-to-one with containers.id (NOT containers.container_id —
	// the PK column is named 'id' in the containers table).
	if err := execStep3("CREATE TABLE node_deployments", `
		CREATE TABLE IF NOT EXISTS node_deployments (
			deployment_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			container_id           UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
			operator_id            UUID NOT NULL REFERENCES users(id),
			container_designation  TEXT NOT NULL,
			ingestion_target_db    TEXT NOT NULL,
			host_port_mapping      TEXT NOT NULL,
			created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
		)`); err != nil {
		return err
	}
	log.Println("[MIGRATION][P3] STEP 2 complete — node_deployments created.")

	// ── STEP 3: Assertion — verify node_deployments.operator_id exists ─────────
	log.Println("[MIGRATION][P3] STEP 3 — asserting node_deployments.operator_id exists...")
	var ndColFound bool
	assertND := `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = 'public'
			  AND table_name   = 'node_deployments'
			  AND column_name  = 'operator_id'
		)`
	if err := tx3.QueryRow(ctx, assertND).Scan(&ndColFound); err != nil {
		return fmt.Errorf("phase 3 migration — column assertion query failed for node_deployments.operator_id: %w", err)
	}
	if !ndColFound {
		return fmt.Errorf(
			"phase 3 migration — assertion failed: column %q does not exist on node_deployments "+
				"after CREATE TABLE step; cannot proceed to index creation (SQLSTATE 42703 would follow)",
			"operator_id",
		)
	}
	log.Println("[MIGRATION][P3] assertion OK: node_deployments.operator_id exists")
	log.Println("[MIGRATION][P3] STEP 3 complete.")

	// ── STEP 4: CREATE INDEX ───────────────────────────────────────────────────
	if err := execStep3(
		"CREATE INDEX idx_node_deployments_operator",
		`CREATE INDEX IF NOT EXISTS idx_node_deployments_operator
			ON node_deployments (operator_id)`,
	); err != nil {
		return err
	}
	log.Println("[MIGRATION][P3] STEP 4 complete — idx_node_deployments_operator created.")

	if err := tx3.Commit(ctx); err != nil {
		return fmt.Errorf("phase 3 migration — commit failed: %w", err)
	}
	log.Println("[MIGRATION] Phase 3 schemas verified (operator_signature_keys, node_deployments, index active).")
	return nil
}



