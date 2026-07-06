package main

// node_deploy_handler.go — POST /api/v1/nodes/deploy
//
// Deploys a CDC ingestion node without an associated file payload.
// Distinct from the upload path: no storage key, no checksum — just configuration.
// Authorization is gated by the operator's signature key (bcrypt verify).
//
// Security notes:
//   - The submitted operator_signature_key is NEVER logged at any log level.
//   - Invalid-key rejections return a specific error code so the wizard can
//     distinguish them from generic auth failures.
//   - Field validation is performed server-side regardless of what the form sends.

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// ── Allowlists & compiled regexes ────────────────────────────────────────────

// allowedIngestionDBs is the server-side allowlist for the ingestion_target_db
// field. Must match exactly the values shown in the /deploy wizard dropdown.
var allowedIngestionDBs = map[string]bool{
	"PostgreSQL": true,
	"MySQL":      true,
	"MongoDB":    true,
	"Cassandra":  true,
}

// allowedVectorTypes is the server-side allowlist for target_vector_type.
var allowedVectorTypes = map[string]bool{
	"PHARMA_R3":   true,
	"IOT_GRID":    true,
	"QUANT_ALPHA": true,
}

// designationRe restricts container_designation to characters that are safe
// in log lines and downstream file paths.
var designationRe = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// portMappingRe validates "host_port:container_port" before the numeric check.
var portMappingRe = regexp.MustCompile(`^\d{1,5}:\d{1,5}$`)

// ── Request type ─────────────────────────────────────────────────────────────

type NodeDeployRequest struct {
	ContainerDesignation string `json:"container_designation"`
	IngestionTargetDB    string `json:"ingestion_target_db"`
	TargetVectorType     string `json:"target_vector_type"`
	HostPortMapping      string `json:"host_port_mapping"`
	OperatorSignatureKey string `json:"operator_signature_key"`
}

// ── Handler ───────────────────────────────────────────────────────────────────

// HandleNodeDeploy processes POST /api/v1/nodes/deploy.
// JWT middleware guarantees claims are present before this function runs.
func HandleNodeDeploy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "Unauthenticated")
		return
	}
	operatorID := claims.UserID

	// ── Rate limit (same bucket as upload endpoint) ───────────────────────────
	if !checkRateLimit(operatorID) {
		w.Header().Set("Retry-After", "60")
		WriteError(w, http.StatusTooManyRequests,
			"Deployment rate limit exceeded — max "+
				strconv.Itoa(uploadRatePerMin)+" actions per minute per operator")
		return
	}

	// ── Decode body ───────────────────────────────────────────────────────────
	var req NodeDeployRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.ContainerDesignation = strings.TrimSpace(req.ContainerDesignation)
	req.IngestionTargetDB = strings.TrimSpace(req.IngestionTargetDB)
	req.TargetVectorType = strings.TrimSpace(req.TargetVectorType)
	req.HostPortMapping = strings.TrimSpace(req.HostPortMapping)
	// NOTE: req.OperatorSignatureKey is intentionally not trimmed or logged.

	// ── Field validation ─────────────────────────────────────────────────────
	// Each field returns a specific error so the wizard can highlight the correct input.

	// 1. container_designation
	if req.ContainerDesignation == "" {
		writeFieldError(w, "container_designation", "Container designation is required")
		return
	}
	if len(req.ContainerDesignation) > 64 {
		writeFieldError(w, "container_designation",
			"Container designation must be 64 characters or fewer")
		return
	}
	if !designationRe.MatchString(req.ContainerDesignation) {
		writeFieldError(w, "container_designation",
			"Container designation may only contain letters, digits, hyphens, and underscores")
		return
	}

	// 2. ingestion_target_db — server-side allowlist (do not trust the dropdown value alone)
	if !allowedIngestionDBs[req.IngestionTargetDB] {
		writeFieldError(w, "ingestion_target_db",
			"ingestion_target_db must be one of: PostgreSQL, MySQL, MongoDB, Cassandra")
		return
	}

	// 3. target_vector_type — server-side allowlist
	if !allowedVectorTypes[req.TargetVectorType] {
		writeFieldError(w, "target_vector_type",
			"target_vector_type must be one of: PHARMA_R3, IOT_GRID, QUANT_ALPHA")
		return
	}

	// 4. host_port_mapping — regex shape check, then numeric range check
	if !portMappingRe.MatchString(req.HostPortMapping) {
		writeFieldError(w, "host_port_mapping",
			"host_port_mapping must be in format HOST_PORT:CONTAINER_PORT (e.g. 5432:5432)")
		return
	}
	parts := strings.SplitN(req.HostPortMapping, ":", 2)
	hostPort, _ := strconv.Atoi(parts[0])
	containerPort, _ := strconv.Atoi(parts[1])
	if hostPort < 1 || hostPort > 65535 || containerPort < 1 || containerPort > 65535 {
		writeFieldError(w, "host_port_mapping",
			"Both port numbers in host_port_mapping must be between 1 and 65535")
		return
	}

	// ── Step 5: Verify operator signature key ────────────────────────────────
	// SECURITY: req.OperatorSignatureKey must never appear in any log line.
	ctx := r.Context()

	var storedHash string
	var revokedAt *string // non-nil means revoked
	err := DB.QueryRow(ctx, `
		SELECT key_hash, revoked_at::text
		FROM operator_signature_keys
		WHERE operator_id = $1`,
		operatorID,
	).Scan(&storedHash, &revokedAt)

	if err != nil {
		// No row → operator has not generated a key yet.
		if strings.Contains(err.Error(), "no rows") {
			writeDeployKeyError(w)
			return
		}
		slog.Error("node_deploy: signature key lookup failed",
			"operator_id", operatorID, "error", err)
		WriteError(w, http.StatusInternalServerError, "Database error during key verification")
		return
	}

	if revokedAt != nil {
		// Key has been revoked — reject immediately.
		slog.Warn("node_deploy: attempt with revoked key",
			"operator_id", operatorID)
		writeDeployKeyError(w)
		return
	}

	// bcrypt constant-time compare. req.OperatorSignatureKey is NOT logged.
	if err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(req.OperatorSignatureKey)); err != nil {
		slog.Warn("node_deploy: signature key mismatch",
			"operator_id", operatorID)
		writeDeployKeyError(w)
		return
	}

	// ── Step 6: Single transaction — containers + node_deployments + jobs + events ──
	tx, err := DB.Begin(ctx)
	if err != nil {
		slog.Error("node_deploy: begin tx failed", "operator_id", operatorID, "error", err)
		WriteError(w, http.StatusInternalServerError, "Database error")
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Generate a new container UUID (reuse the same helper as the upload path).
	containerID, err := generateUUID()
	if err != nil {
		slog.Error("node_deploy: UUID generation failed", "operator_id", operatorID, "error", err)
		WriteError(w, http.StatusInternalServerError, "Failed to generate container ID")
		return
	}

	// INSERT containers row.
	// storage_payload_url = NULL (no file for this path).
	// storage_backend    = 'none' (allowed by the Phase 3 constraint migration).
	if _, err := tx.Exec(ctx, `
		INSERT INTO containers (
			id, user_id, designation, ingestion_target_db, host_port_mapping,
			operator_id, callsign_alias, target_vector_type, status_state,
			storage_payload_url, storage_backend,
			file_size_bytes, checksum_sha256, idempotency_key,
			retry_count, updated_at
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, 'INITIALIZED',
			NULL, 'none',
			NULL, NULL, NULL,
			0, now()
		)`,
		containerID, operatorID, req.ContainerDesignation, req.IngestionTargetDB, req.HostPortMapping,
		operatorID, req.ContainerDesignation, req.TargetVectorType,
	); err != nil {
		slog.Error("node_deploy: containers insert failed",
			"operator_id", operatorID, "container_id", containerID, "error", err)
		WriteError(w, http.StatusInternalServerError, "Database error during container registration")
		return
	}

	// INSERT node_deployments row.
	if _, err := tx.Exec(ctx, `
		INSERT INTO node_deployments (
			container_id, operator_id,
			container_designation, ingestion_target_db, host_port_mapping
		) VALUES ($1, $2, $3, $4, $5)`,
		containerID, operatorID,
		req.ContainerDesignation, req.IngestionTargetDB, req.HostPortMapping,
	); err != nil {
		slog.Error("node_deploy: node_deployments insert failed",
			"operator_id", operatorID, "container_id", containerID, "error", err)
		WriteError(w, http.StatusInternalServerError, "Database error during deployment record")
		return
	}

	// INSERT processing_jobs row.
	if _, err := tx.Exec(ctx, `
		INSERT INTO processing_jobs (container_id, job_status)
		VALUES ($1, 'QUEUED')`,
		containerID,
	); err != nil {
		slog.Error("node_deploy: processing_jobs insert failed",
			"operator_id", operatorID, "container_id", containerID, "error", err)
		WriteError(w, http.StatusInternalServerError, "Database error during job enqueue")
		return
	}

	// INSERT initial container_events row.
	if _, err := tx.Exec(ctx, `
		INSERT INTO container_events (container_id, from_state, to_state, detail)
		VALUES ($1, NULL, 'INITIALIZED', '{"source":"node_deploy_handler"}')`,
		containerID,
	); err != nil {
		slog.Error("node_deploy: container_events insert failed",
			"operator_id", operatorID, "container_id", containerID, "error", err)
		WriteError(w, http.StatusInternalServerError, "Database error during event recording")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("node_deploy: tx commit failed",
			"operator_id", operatorID, "container_id", containerID, "error", err)
		WriteError(w, http.StatusInternalServerError, "Transaction commit failed")
		return
	}

	slog.Info("node_deploy: deployment accepted",
		"container_id", containerID,
		"operator_id", operatorID,
		"designation", req.ContainerDesignation,
		"target_db", req.IngestionTargetDB,
		"vector_type", req.TargetVectorType,
		"port_mapping", req.HostPortMapping,
		// operator_signature_key intentionally omitted from all log lines
	)

	// ── Step 7: 202 Accepted ──────────────────────────────────────────────────
	// The response body never echoes operator_signature_key.
	WriteJSON(w, http.StatusAccepted, map[string]string{
		"container_id": containerID,
		"status_state": "INITIALIZED",
	})
}

// writeDeployKeyError writes the specific 401 used for signature key failures.
// The error code "invalid_deployment_key" is distinct from generic auth failures
// so the wizard UI can show the correct inline message.
func writeDeployKeyError(w http.ResponseWriter) {
	WriteJSON(w, http.StatusUnauthorized, map[string]string{
		"error":      "invalid_deployment_key",
		"error_code": "invalid_deployment_key",
	})
}

// writeFieldError writes a 400 with a field-level error for inline display.
func writeFieldError(w http.ResponseWriter, field, message string) {
	WriteJSON(w, http.StatusBadRequest, map[string]string{
		"error": message,
		"field": field,
	})
}
