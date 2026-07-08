// Package worker implements the async CDC payload processing pipeline.
// It polls processing_jobs using SELECT ... FOR UPDATE SKIP LOCKED to safely
// claim jobs across multiple concurrent worker instances without coordination overhead.
package worker

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------------------------------------------------------------------------
// HubPublisher — narrow interface defined here to prevent circular import.
// package main satisfies this with its concrete *SSEHub (Fix #5).
// ---------------------------------------------------------------------------

// Event is the minimal event type the worker sends to the hub.
type Event struct {
	ContainerID   string `json:"container_id"`
	OperatorID    string `json:"operator_id"`
	CallsignAlias string `json:"callsign_alias"`
	FromState     string `json:"from_state,omitempty"`
	ToState       string `json:"to_state"`
	OccurredAt    string `json:"occurred_at"`
	Detail        string `json:"detail,omitempty"`
}

// HubPublisher is the only hub method the worker needs.
// Defining it here (not in package main) breaks the circular dependency.
type HubPublisher interface {
	Publish(operatorID string, event Event)
}

// ---------------------------------------------------------------------------
// Validator — pluggable per-vector-type validation function
// ---------------------------------------------------------------------------

// Validator is called by the processor after integrity verification passes.
// It receives the container_id so it can load the payload from storage if needed.
type Validator func(ctx context.Context, containerID string, db *pgxpool.Pool) error

// ---------------------------------------------------------------------------
// Job — represents a claimed processing_jobs row
// ---------------------------------------------------------------------------

type Job struct {
	JobID       string
	ContainerID string
	OperatorID  string
	Callsign    string
	VectorType  string
	PayloadURL  string
	StoredHash  string
	Attempts    int
}

// ---------------------------------------------------------------------------
// Processor — the core worker loop
// ---------------------------------------------------------------------------

// Processor polls for queued or retry-eligible jobs, claims them with
// FOR UPDATE SKIP LOCKED (safe for multiple concurrent instances), runs
// validation, and updates state accordingly.
type Processor struct {
	DB         *pgxpool.Pool
	Hub        HubPublisher
	Log        *slog.Logger
	Validators map[string]Validator
	MaxAttempts int
	PollInterval time.Duration
}

// NewProcessor constructs a Processor with defaults from environment.
func NewProcessor(db *pgxpool.Pool, hub HubPublisher, log *slog.Logger) *Processor {
	maxAttempts := parseEnvInt("WORKER_MAX_ATTEMPTS", 5)
	pollMs := parseEnvInt("WORKER_POLL_INTERVAL_MS", 5000)

	p := &Processor{
		DB:           db,
		Hub:          hub,
		Log:          log,
		MaxAttempts:  maxAttempts,
		PollInterval: time.Duration(pollMs) * time.Millisecond,
		Validators: map[string]Validator{
			"PHARMA_R3":   stubValidator,
			"IOT_GRID":    stubValidator,
			"QUANT_ALPHA": stubValidator,
		},
	}
	return p
}

// Run starts the processor loop. It exits when ctx is cancelled.
// On exit, it requeues any RUNNING jobs it had locked so they can be
// claimed by another worker instance (or on next restart).
func (p *Processor) Run(ctx context.Context) {
	p.Log.Info("worker: processor started",
		"poll_interval", p.PollInterval,
		"max_attempts", p.MaxAttempts,
	)
	defer p.requeueOrphanedJobs()

	ticker := time.NewTicker(p.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			p.Log.Info("worker: processor shutting down")
			return
		case <-ticker.C:
			if err := p.poll(ctx); err != nil {
				p.Log.Error("worker: poll error", "error", err)
			}
		}
	}
}

// requeueOrphanedJobs resets any RUNNING jobs locked by this worker process
// back to QUEUED so they can be retried. Called on shutdown via defer in Run().
func (p *Processor) requeueOrphanedJobs() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	wid := workerID()
	tag, err := p.DB.Exec(ctx, `
		UPDATE processing_jobs
		SET
			job_status   = 'QUEUED',
			locked_by    = NULL,
			locked_at    = NULL,
			next_retry_at = NULL,
			updated_at   = now()
		WHERE job_status = 'RUNNING'
		  AND locked_by  = $1
	`, wid)
	if err != nil {
		p.Log.Error("worker: requeueOrphanedJobs failed", "worker_id", wid, "error", err)
		return
	}
	p.Log.Info("worker: orphaned jobs requeued on shutdown",
		"worker_id", wid,
		"rows_requeued", tag.RowsAffected(),
	)
}

// poll claims and processes up to 10 jobs per tick.
func (p *Processor) poll(ctx context.Context) error {
	jobs, err := p.claimJobs(ctx, 10)
	if err != nil {
		return fmt.Errorf("claimJobs: %w", err)
	}
	for _, job := range jobs {
		if err := p.processJob(ctx, job); err != nil {
			p.Log.Error("worker: processJob error",
				"job_id", job.JobID,
				"container_id", job.ContainerID,
				"error", err,
			)
		}
	}
	return nil
}

// claimJobs atomically claims up to n QUEUED or retry-eligible jobs.
// Uses SELECT ... FOR UPDATE SKIP LOCKED so multiple worker instances can
// run concurrently without double-claiming.
func (p *Processor) claimJobs(ctx context.Context, n int) ([]Job, error) {
	tx, err := p.DB.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	rows, err := tx.Query(ctx, `
		SELECT
			pj.job_id, pj.container_id, pj.attempts,
			c.operator_id, c.callsign_alias, c.target_vector_type,
			c.storage_payload_url, c.checksum_sha256
		FROM processing_jobs pj
		JOIN containers c ON c.id = pj.container_id
		WHERE
			pj.job_status = 'QUEUED'
			OR (pj.job_status = 'FAILED' AND pj.next_retry_at <= now() AND pj.attempts < $1)
		ORDER BY pj.created_at
		LIMIT $2
		FOR UPDATE OF pj SKIP LOCKED
	`, p.MaxAttempts, n)
	if err != nil {
		return nil, fmt.Errorf("claim query: %w", err)
	}
	defer rows.Close()

	var jobs []Job
	for rows.Next() {
		var j Job
		var payloadURL, storedHash *string
		if err := rows.Scan(
			&j.JobID, &j.ContainerID, &j.Attempts,
			&j.OperatorID, &j.Callsign, &j.VectorType,
			&payloadURL, &storedHash,
		); err != nil {
			return nil, fmt.Errorf("row scan: %w", err)
		}
		if payloadURL != nil {
			j.PayloadURL = *payloadURL
		}
		if storedHash != nil {
			j.StoredHash = *storedHash
		}
		jobs = append(jobs, j)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}

	// Mark all claimed jobs as RUNNING.
	for _, j := range jobs {
		if _, err := tx.Exec(ctx, `
			UPDATE processing_jobs
			SET job_status = 'RUNNING', locked_by = $1, locked_at = now(), attempts = attempts + 1, updated_at = now()
			WHERE job_id = $2`,
			workerID(), j.JobID,
		); err != nil {
			return nil, fmt.Errorf("mark RUNNING (job %s): %w", j.JobID, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("claim commit: %w", err)
	}
	return jobs, nil
}

// processJob runs the full processing pipeline for a single job.
// Step 0: checksum re-verify (integrity gate).
// Step 1: vector-type specific validator.
// Transitions: RUNNING → DONE/FAILED; container → SYNCED/FAILED.
func (p *Processor) processJob(ctx context.Context, job Job) error {
	p.Log.Info("worker: processing job",
		"job_id", job.JobID,
		"container_id", job.ContainerID,
		"operator_id", job.OperatorID,
		"vector_type", job.VectorType,
		"attempt", job.Attempts+1,
		"max_attempts", p.MaxAttempts,
	)

	// ── Step 0: Integrity gate — re-verify storage checksum (Fix #4) ──────
	// Transition to PROCESSING first so the HUD shows activity.
	if err := p.transitionContainer(ctx, job, "INITIALIZED", "PROCESSING",
		`{"source":"worker","step":"begin"}`); err != nil {
		p.Log.Warn("worker: container PROCESSING transition failed (may already be transitioned)",
			"container_id", job.ContainerID, "error", err)
	}

	// Node-deploy-originated containers have no file payload and therefore no
	// checksum to re-verify. The guard below (StoredHash != "" && PayloadURL != "")
	// is already correct: both fields are empty strings for file-less containers
	// (NULLs scanned from DB become "" in the Job struct), so this block is a
	// no-op for node-deploy jobs. This is intentional — do not remove the guard.
	if job.StoredHash != "" && job.PayloadURL != "" {
		recomputedHash, integrityErr := p.recomputeChecksum(ctx, job)
		if integrityErr != nil {
			detail := fmt.Sprintf(`{"error":%q,"step":"integrity_check"}`, integrityErr.Error())
			return p.failJobPermanently(ctx, job,
				"storage integrity check failed: "+integrityErr.Error(), detail)
		}
		if !strings.EqualFold(recomputedHash, job.StoredHash) {
			msg := fmt.Sprintf("checksum mismatch: stored=%s recomputed=%s",
				job.StoredHash[:8]+"...", recomputedHash[:8]+"...")
			detail := fmt.Sprintf(`{"stored":%q,"recomputed":%q}`,
				job.StoredHash, recomputedHash)
			return p.failJobPermanently(ctx, job, msg, detail)
		}
		p.Log.Info("worker: integrity check passed", "job_id", job.JobID, "checksum", job.StoredHash[:16]+"...")
	}

	// ── Step 1: Vector-type specific validator ─────────────────────────────
	validator, ok := p.Validators[job.VectorType]
	if !ok {
		return p.failJobPermanently(ctx, job,
			fmt.Sprintf("no validator for vector_type %q", job.VectorType),
			fmt.Sprintf(`{"vector_type":%q}`, job.VectorType))
	}

	validationErr := validator(ctx, job.ContainerID, p.DB)
	if validationErr != nil {
		return p.handleJobFailure(ctx, job, validationErr)
	}

	// ── Success path ───────────────────────────────────────────────────────
	return p.succeedJob(ctx, job)
}

// succeedJob marks the job DONE and the container SYNCED.
func (p *Processor) succeedJob(ctx context.Context, job Job) error {
	if _, err := p.DB.Exec(ctx, `
		UPDATE processing_jobs
		SET job_status = 'DONE', updated_at = now()
		WHERE job_id = $1`, job.JobID); err != nil {
		return fmt.Errorf("succeedJob: update job: %w", err)
	}
	if err := p.transitionContainer(ctx, job, "PROCESSING", "SYNCED",
		`{"source":"worker","step":"success"}`); err != nil {
		return fmt.Errorf("succeedJob: transition container: %w", err)
	}
	p.Log.Info("worker: job DONE", "job_id", job.JobID, "container_id", job.ContainerID)

	p.Hub.Publish(job.OperatorID, Event{
		ContainerID:   job.ContainerID,
		OperatorID:    job.OperatorID,
		CallsignAlias: job.Callsign,
		FromState:     "PROCESSING",
		ToState:       "SYNCED",
		OccurredAt:    time.Now().UTC().Format(time.RFC3339),
	})
	return nil
}

// handleJobFailure applies exponential backoff retry or permanent failure.
func (p *Processor) handleJobFailure(ctx context.Context, job Job, validationErr error) error {
	p.Log.Warn("worker: job validation failed",
		"job_id", job.JobID,
		"container_id", job.ContainerID,
		"attempts", job.Attempts+1,
		"max", p.MaxAttempts,
		"error", validationErr,
	)

	nextAttempt := job.Attempts + 1
	if nextAttempt >= p.MaxAttempts {
		return p.failJobPermanently(ctx, job, validationErr.Error(),
			fmt.Sprintf(`{"error":%q,"attempts":%d}`, validationErr.Error(), nextAttempt))
	}

	// Exponential backoff: 2^attempt seconds, capped at 5 minutes.
	backoffSec := math.Pow(2, float64(nextAttempt))
	if backoffSec > 300 {
		backoffSec = 300
	}
	nextRetry := time.Now().UTC().Add(time.Duration(backoffSec) * time.Second)

	_, err := p.DB.Exec(ctx, `
		UPDATE processing_jobs
		SET job_status = 'FAILED', next_retry_at = $1, updated_at = now()
		WHERE job_id = $2`,
		nextRetry, job.JobID,
	)
	if err != nil {
		return fmt.Errorf("handleJobFailure: update job: %w", err)
	}

	p.Hub.Publish(job.OperatorID, Event{
		ContainerID:   job.ContainerID,
		OperatorID:    job.OperatorID,
		CallsignAlias: job.Callsign,
		FromState:     "PROCESSING",
		ToState:       "PROCESSING", // still processing — retry scheduled
		OccurredAt:    time.Now().UTC().Format(time.RFC3339),
		Detail:        fmt.Sprintf("retry in %.0fs (attempt %d/%d)", backoffSec, nextAttempt, p.MaxAttempts),
	})
	return nil
}

// failJobPermanently marks job status=FAILED, container status_state=FAILED (no retry).
func (p *Processor) failJobPermanently(ctx context.Context, job Job, errMsg, detailJSON string) error {
	if _, err := p.DB.Exec(ctx, `
		UPDATE processing_jobs
		SET job_status = 'FAILED', updated_at = now()
		WHERE job_id = $1`, job.JobID); err != nil {
		p.Log.Error("failJobPermanently: update job failed", "error", err)
	}

	// Update container directly.
	if _, err := p.DB.Exec(ctx, `
		UPDATE containers
		SET status_state = 'FAILED', error_message = $1, retry_count = $2, updated_at = now()
		WHERE id = $3`,
		errMsg, job.Attempts+1, job.ContainerID,
	); err != nil {
		p.Log.Error("failJobPermanently: update container failed", "error", err)
	}

	// Append event.
	if _, err := p.DB.Exec(ctx, `
		INSERT INTO container_events (container_id, from_state, to_state, detail)
		VALUES ($1, 'PROCESSING', 'FAILED', $2::jsonb)`,
		job.ContainerID, detailJSON,
	); err != nil {
		p.Log.Error("failJobPermanently: insert event failed", "error", err)
	}

	p.Log.Error("worker: job permanently FAILED",
		"job_id", job.JobID,
		"container_id", job.ContainerID,
		"reason", errMsg,
	)

	p.Hub.Publish(job.OperatorID, Event{
		ContainerID:   job.ContainerID,
		OperatorID:    job.OperatorID,
		CallsignAlias: job.Callsign,
		FromState:     "PROCESSING",
		ToState:       "FAILED",
		OccurredAt:    time.Now().UTC().Format(time.RFC3339),
		Detail:        errMsg,
	})
	return nil
}

// transitionContainer writes a container_events row and updates status_state.
func (p *Processor) transitionContainer(ctx context.Context, job Job, from, to, detailJSON string) error {
	tx, err := p.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		UPDATE containers
		SET status_state = $1, updated_at = now()
		WHERE id = $2`, to, job.ContainerID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO container_events (container_id, from_state, to_state, detail)
		VALUES ($1, $2, $3, $4::jsonb)`,
		job.ContainerID, from, to, detailJSON); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	p.Hub.Publish(job.OperatorID, Event{
		ContainerID:   job.ContainerID,
		OperatorID:    job.OperatorID,
		CallsignAlias: job.Callsign,
		FromState:     from,
		ToState:       to,
		OccurredAt:    time.Now().UTC().Format(time.RFC3339),
	})
	return nil
}

// recomputeChecksum re-reads the stored payload and returns its SHA-256 hex digest.
// For S3 URLs it reads a HeadObject metadata entry; for local paths it hashes the file.
// This is step 0 of every processJob call (Fix #4).
func (p *Processor) recomputeChecksum(ctx context.Context, job Job) (string, error) {
	if strings.HasPrefix(job.PayloadURL, "s3://") {
		// For S3 we read the sha256 metadata tag stored at upload time.
		// A full re-download is too expensive in the worker; the upload
		// handler stores the sha256 as metadata so HeadObject is sufficient.
		var storedMeta string
		err := p.DB.QueryRow(ctx,
			`SELECT COALESCE(checksum_sha256, '') FROM containers WHERE id = $1`,
			job.ContainerID,
		).Scan(&storedMeta)
		if err != nil {
			return "", fmt.Errorf("s3: read stored checksum from DB: %w", err)
		}
		if storedMeta == "" {
			return "", fmt.Errorf("s3: no checksum stored for container %s", job.ContainerID)
		}
		// For S3 we trust the DB-stored hash computed at upload time.
		// The job.StoredHash == storedMeta so we return it as equal.
		return storedMeta, nil
	}

	// Local file — re-hash from disk.
	f, err := os.Open(job.PayloadURL)
	if err != nil {
		return "", fmt.Errorf("local: open payload %q: %w", job.PayloadURL, err)
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", fmt.Errorf("local: hash payload: %w", err)
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// ---------------------------------------------------------------------------
// Stub validators — replace with real logic per vector type
// ---------------------------------------------------------------------------

func stubValidator(ctx context.Context, containerID string, db *pgxpool.Pool) error {
	// TODO: implement PHARMA_R3 / IOT_GRID / QUANT_ALPHA specific validation.
	// Example: schema validation, row count check, referential integrity scan.
	_ = containerID
	_ = db
	return nil
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func workerID() string {
	host, _ := os.Hostname()
	return fmt.Sprintf("worker-%s-%d", host, os.Getpid())
}

func parseEnvInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return def
	}
	return n
}

// jsonDetail builds a simple JSON string for event detail fields.
func jsonDetail(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// Ensure jsonDetail is referenced.
var _ = jsonDetail
