package main

import (
	"context"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"os"
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

	// Load .env — try both locations, log which one worked
	if err := godotenv.Load(".env"); err != nil {
		if err2 := godotenv.Load("pulsater-core/.env"); err2 != nil {
			log.Println("[WARN] No .env file found in either location — relying on system environment")
		} else {
			log.Println("[ENV] Loaded from pulsater-core/.env")
		}
	} else {
		log.Println("[ENV] Loaded from .env")
	}

	// Validate OAuth credentials at startup so you catch this immediately
	validateOAuthEnv()

	// Initialise slog as the structured logger for Phase 2 components.
	slogger := slog.Default()

	// Initialise storage backend (local or S3, driven by STORAGE_BACKEND env var).
	var storageErr error
	StorageInstance, storageErr = NewStorageBackend(context.Background(), slogger)
	if storageErr != nil {
		log.Fatalf("Fatal: Storage backend init failed: %v", storageErr)
	}
	log.Printf("[STORAGE] Backend initialised: %s", os.Getenv("STORAGE_BACKEND"))

	// Initialise the SSE hub and start ticket GC.
	GlobalHub = NewSSEHub(slogger)
	startTicketGC()

	if err := InitDB(); err != nil {
		log.Fatalf("Fatal: Database initialization failed: %v", err)
	}
	defer DB.Close()

	if err := runMigrations(); err != nil {
		log.Fatalf("Fatal: Database migrations failed: %v", err)
	}

	// Start async processing worker (hub is wrapped in adapter to satisfy worker.HubPublisher).
	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()
	proc := worker.NewProcessor(DB, &hubAdapter{hub: GlobalHub}, slog.Default())
	go proc.Run(workerCtx)

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

	mux := http.NewServeMux()

	// ── Phase 1 routes (unchanged) ───────────────────────────────────────────
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

	mux.HandleFunc("/api/v1/containers/provision", JWTAuthMiddleware(ProvisionContainerHandler))

	// ── Phase 2 routes ───────────────────────────────────────────────────────
	// SSE ticket (must come before /stream so the mux matches it first)
	mux.HandleFunc("/api/v1/containers/stream/token", JWTAuthMiddleware(HandleIssueSSETicket))
	// SSE stream — authenticated via one-time ticket in ?ticket= (Fix #1)
	mux.HandleFunc("/api/v1/containers/stream", HandleContainerStream)
	// Upload endpoint
	mux.HandleFunc("/api/v1/containers/upload", JWTAuthMiddleware(HandleContainerUpload))
	// Paginated list
	mux.HandleFunc("/api/v1/containers/active", JWTAuthMiddleware(HandleListContainers))
	// Detail + event history — catches /api/v1/containers/{id}
	mux.HandleFunc("/api/v1/containers/", JWTAuthMiddleware(HandleGetContainer))

	handler := CORSMiddleware(mux)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Authentication service listening on http://localhost:%s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("Fatal: HTTP server failed to start: %v", err)
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
	return nil
}

func validateOAuthEnv() {
	providers := map[string][2]string{
		"google":   {os.Getenv("GOOGLE_CLIENT_ID"), os.Getenv("GOOGLE_CLIENT_SECRET")},
		"github":   {os.Getenv("GITHUB_CLIENT_ID"), os.Getenv("GITHUB_CLIENT_SECRET")},
		"facebook": {os.Getenv("FACEBOOK_CLIENT_ID"), os.Getenv("FACEBOOK_CLIENT_SECRET")},
	}
	for name, creds := range providers {
		if creds[0] == "" || creds[1] == "" {
			log.Printf("[WARN] OAuth provider [%s] — credentials missing (CLIENT_ID empty: %v, CLIENT_SECRET empty: %v)",
				name, creds[0] == "", creds[1] == "")
		} else {
			idSnippet := creds[0]
			if len(idSnippet) > 6 {
				idSnippet = idSnippet[:6]
			}
			log.Printf("[OK] OAuth provider [%s] — credentials loaded (ID: %s...)", name, idSnippet)
		}
	}
}
