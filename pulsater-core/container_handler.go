package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Constants & configuration

// defaultMaxUploadBytes is the hard cap on total request body size (5 GiB).
const defaultMaxUploadBytes = 5 * 1024 * 1024 * 1024

const defaultUploadRateLimit = 10

var allowedContentTypes = map[string][]string{
	"PHARMA_R3":   {"application/json", "text/csv", "application/octet-stream", ".json", ".csv", ".parquet"},
	"IOT_GRID":    {"application/octet-stream", "application/json", ".bin", ".json", ".avro"},
	"QUANT_ALPHA": {"application/json", "text/csv", "application/parquet", ".json", ".csv", ".parquet"},
}

// Per-operator rate limiter (token bucket, in-memory)

type rateBucket struct {
	tokens   float64
	lastFill time.Time
	mu       sync.Mutex
}

var (
	rateLimiterMu      sync.Mutex
	rateLimiters       = make(map[string]*rateBucket)
	uploadRatePerMin   = parseEnvInt("UPLOAD_RATE_LIMIT_PER_MINUTE", defaultUploadRateLimit)
)

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

func checkRateLimit(operatorID string) bool {
	rateLimiterMu.Lock()
	bucket, ok := rateLimiters[operatorID]
	if !ok {
		bucket = &rateBucket{tokens: float64(uploadRatePerMin), lastFill: time.Now()}
		rateLimiters[operatorID] = bucket
	}
	rateLimiterMu.Unlock()

	bucket.mu.Lock()
	defer bucket.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(bucket.lastFill).Minutes()
	bucket.tokens = min(float64(uploadRatePerMin), bucket.tokens+elapsed*float64(uploadRatePerMin))
	bucket.lastFill = now

	if bucket.tokens < 1 {
		return false
	}
	bucket.tokens--
	return true
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

// Request types

type ContainerListResponse struct {
	Containers []ContainerRow `json:"containers"`
	Total      int            `json:"total"`
	Page       int            `json:"page"`
	Limit      int            `json:"limit"`
}

type ContainerRow struct {
	ContainerID      string  `json:"container_id"`
	OperatorID       string  `json:"operator_id"`
	CallsignAlias    string  `json:"callsign_alias"`
	TargetVectorType string  `json:"target_vector_type"`
	StatusState      string  `json:"status_state"`
	StorageBackend   string  `json:"storage_backend"`
	FileSizeBytes    *int64  `json:"file_size_bytes,omitempty"`
	ChecksumSHA256   *string `json:"checksum_sha256,omitempty"`
	ErrorMessage     *string `json:"error_message,omitempty"`
	RetryCount       int     `json:"retry_count"`
	CreatedAt        string  `json:"created_at"`
	UpdatedAt        string  `json:"updated_at"`
}

type ContainerDetailResponse struct {
	ContainerRow
	Events []ContainerEventRow `json:"events"`
}

type ContainerEventRow struct {
	EventID     string          `json:"event_id"`
	FromState   *string         `json:"from_state,omitempty"`
	ToState     *string         `json:"to_state,omitempty"`
	OccurredAt  string          `json:"occurred_at"`
	Detail      json.RawMessage `json:"detail,omitempty"`
}

// ---------------------------------------------------------------------------
// POST /api/v1/containers/stream/token — issues a one-time SSE ticket (Fix #1)
// ---------------------------------------------------------------------------

func HandleIssueSSETicket(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "Unauthenticated")
		return
	}

	ticket, err := issueSSETicket(claims.UserID)
	if err != nil {
		slog.Error("sse: ticket issue failed", "error", err, "operator_id", claims.UserID)
		WriteError(w, http.StatusInternalServerError, "Failed to issue SSE ticket")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"ticket": ticket})
}

// ---------------------------------------------------------------------------
// GET /api/v1/containers/stream — SSE endpoint
// ---------------------------------------------------------------------------

// HandleContainerStream opens an SSE connection. Auth is via one-time ticket
func HandleContainerStream(w http.ResponseWriter, r *http.Request) {
	ticket := r.URL.Query().Get("ticket")
	if ticket == "" {
		WriteError(w, http.StatusUnauthorized, "Missing SSE ticket")
		return
	}

	operatorID, err := validateAndConsumeTicket(ticket)
	if err != nil {
		slog.Warn("sse: invalid ticket", "error", err)
		WriteError(w, http.StatusUnauthorized, "Invalid or expired SSE ticket")
		return
	}

	var exists bool
	if err := DB.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, operatorID).Scan(&exists); err != nil || !exists {
		WriteError(w, http.StatusUnauthorized, "Operator not found")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		WriteError(w, http.StatusInternalServerError, "Streaming not supported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable nginx buffering
	flusher.Flush()

	ch := GlobalHub.Subscribe(operatorID)
	defer GlobalHub.Unsubscribe(operatorID, ch)

	slog.Info("sse: stream opened", "operator_id", operatorID)

	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			slog.Info("sse: client disconnected", "operator_id", operatorID)
			return

		case event, open := <-ch:
			if !open {
				fmt.Fprintf(w, "event: disconnect\ndata: {\"reason\":\"slow_client\"}\n\n")
				flusher.Flush()
				return
			}
			data, _ := json.Marshal(event)
			fmt.Fprintf(w, "event: container_update\ndata: %s\n\n", data)
			flusher.Flush()

		case <-heartbeat.C:
			fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		}
	}
}

// ---------------------------------------------------------------------------
// POST /api/v1/containers/upload — multipart upload handler (Task D)
// ---------------------------------------------------------------------------

func HandleContainerUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "Unauthenticated")
		return
	}

	// ── Rate limiting ──────────────────────────────────────────────────────
	if !checkRateLimit(claims.UserID) {
		w.Header().Set("Retry-After", "60")
		WriteError(w, http.StatusTooManyRequests, "Upload rate limit exceeded — max "+
			strconv.Itoa(uploadRatePerMin)+" uploads per minute per operator")
		return
	}

	// ── Upload size cap (Fix #2) ───────────────────────────────────────────
	maxBytes := parseEnvInt64("MAX_UPLOAD_BYTES", defaultMaxUploadBytes)
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)

	// ── Parse multipart (32MB in-memory, rest spills to OS temp) ──────────
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			WriteError(w, http.StatusRequestEntityTooLarge,
				fmt.Sprintf("Upload exceeds maximum allowed size (%d bytes)", maxBytes))
			return
		}
		WriteError(w, http.StatusBadRequest, "Failed to parse multipart form: "+err.Error())
		return
	}

	// ── Extract form fields ────────────────────────────────────────────────
	callsignAlias := strings.TrimSpace(r.FormValue("callsign_alias"))
	targetVectorType := strings.TrimSpace(r.FormValue("target_vector_type"))
	originRegion := strings.TrimSpace(r.FormValue("origin_region"))
	idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))

	if callsignAlias == "" || targetVectorType == "" {
		WriteError(w, http.StatusBadRequest, "callsign_alias and target_vector_type are required")
		return
	}
	if originRegion == "" {
		WriteError(w, http.StatusBadRequest, "origin_region is required")
		return
	}
	if !ValidRegion(originRegion) {
		WriteError(w, http.StatusBadRequest, "unknown origin_region: "+originRegion)
		return
	}

	allowed, ok := allowedContentTypes[targetVectorType]
	if !ok {
		WriteError(w, http.StatusBadRequest, fmt.Sprintf("unknown target_vector_type %q", targetVectorType))
		return
	}

	// ── File extraction ────────────────────────────────────────────────────
	file, fileHeader, err := r.FormFile("payload")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "Missing file field 'payload'")
		return
	}
	defer file.Close()

	fileContentType := fileHeader.Header.Get("Content-Type")
	if !contentTypeAllowed(fileContentType, fileHeader.Filename, allowed) {
		WriteError(w, http.StatusUnsupportedMediaType,
			fmt.Sprintf("content-type %q not permitted for target_vector_type %q", fileContentType, targetVectorType))
		return
	}

	if idempotencyKey != "" {
		existing, checksumStored, found, qErr := lookupByIdempotencyKey(r.Context(), claims.UserID, idempotencyKey)
		if qErr != nil {
			slog.Error("idempotency lookup failed", "error", qErr)
			WriteError(w, http.StatusInternalServerError, "Database error during idempotency check")
			return
		}
		if found {
			incomingChecksum, hashErr := hashReader(file)
			if hashErr != nil {
				WriteError(w, http.StatusInternalServerError, "Failed to compute incoming checksum")
				return
			}
			if checksumStored != nil && *checksumStored == incomingChecksum {
				WriteJSON(w, http.StatusOK, map[string]string{
					"container_id": existing,
					"status_state": "INITIALIZED",
					"idempotent":   "true",
				})
				return
			}
			WriteError(w, http.StatusConflict,
				"Idempotency-Key already used for a different payload. Use a new key or the original payload.")
			return
		}
	}

	// ── Stream to storage + compute SHA-256 concurrently ──────────────────
	// TeeReader lets us hash the stream as it flows into storage.
	pr, pw := io.Pipe()
	h := sha256.New()
	tee := io.TeeReader(file, h) // hash while reading

	var streamErr error
	go func() {
		defer pw.Close()
		if _, err := io.Copy(pw, tee); err != nil {
			streamErr = err
			pw.CloseWithError(err)
		}
	}()

	containerID, uuidErr := generateUUID()
	if uuidErr != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to generate container ID")
		return
	}

	storageKey := fmt.Sprintf("%s/%s/%s", claims.UserID, containerID, fileHeader.Filename)
	storedURL, saveErr := StorageInstance.Save(r.Context(), storageKey, pr, fileHeader.Size)
	if saveErr != nil {
		slog.Error("storage save failed", "key", storageKey, "error", saveErr,
			"operator_id", claims.UserID, "container_id", containerID)
		WriteError(w, http.StatusInternalServerError, "Storage error — upload could not be persisted")
		return
	}
	if streamErr != nil {
		WriteError(w, http.StatusInternalServerError, "Stream error during upload")
		return
	}

	checksumHex := hex.EncodeToString(h.Sum(nil))
	storageBackendName := strings.ToLower(strings.TrimSpace(os.Getenv("STORAGE_BACKEND")))
	if storageBackendName == "" {
		storageBackendName = "local"
	}

	// ── Transactional DB writes ────────────────────────────────────────────
	tx, err := DB.Begin(r.Context())
	if err != nil {
		slog.Error("tx begin failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "Database error")
		return
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(r.Context())
		}
	}()

	_, err = tx.Exec(r.Context(), `
		INSERT INTO containers (
			id, user_id, designation, ingestion_target_db, host_port_mapping,
			operator_id, callsign_alias, target_vector_type, status_state,
			storage_payload_url, storage_backend, file_size_bytes, checksum_sha256,
			idempotency_key, retry_count, origin_region, updated_at
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, 'INITIALIZED',
			$9, $10, $11, $12,
			$13, 0, $14, now()
		)`,
		containerID, claims.UserID, callsignAlias, targetVectorType, "N/A",
		claims.UserID, callsignAlias, targetVectorType,
		storedURL, storageBackendName, fileHeader.Size, checksumHex,
		nullableString(idempotencyKey), originRegion,
	)
	if err != nil {
		slog.Error("containers insert failed", "error", err, "container_id", containerID)
		WriteError(w, http.StatusInternalServerError, "Database error during container registration")
		return
	}

	_, err = tx.Exec(r.Context(), `
		INSERT INTO container_events (container_id, from_state, to_state, detail, severity)
		VALUES ($1, NULL, 'INITIALIZED', '{"source":"upload_handler"}', 'INFO')`,
		containerID,
	)
	if err != nil {
		slog.Error("container_events insert failed", "error", err, "container_id", containerID)
		WriteError(w, http.StatusInternalServerError, "Database error during event recording")
		return
	}

	_, err = tx.Exec(r.Context(), `
		INSERT INTO processing_jobs (container_id, job_status)
		VALUES ($1, 'QUEUED')`,
		containerID,
	)
	if err != nil {
		slog.Error("processing_jobs insert failed", "error", err, "container_id", containerID)
		WriteError(w, http.StatusInternalServerError, "Database error during job enqueue")
		return
	}

	if err = tx.Commit(r.Context()); err != nil {
		slog.Error("tx commit failed", "error", err, "container_id", containerID)
		WriteError(w, http.StatusInternalServerError, "Transaction commit failed")
		return
	}

	slog.Info("container upload accepted",
		"container_id", containerID,
		"operator_id", claims.UserID,
		"checksum", checksumHex,
		"bytes", fileHeader.Size,
		"vector_type", targetVectorType,
	)

	w.WriteHeader(http.StatusAccepted)
	WriteJSON(w, http.StatusAccepted, map[string]string{
		"container_id": containerID,
		"status_state": "INITIALIZED",
		"checksum":     checksumHex,
	})
}

// ---------------------------------------------------------------------------
// GET /api/v1/containers/active — paginated list
// ---------------------------------------------------------------------------

func HandleListContainers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "Unauthenticated")
		return
	}

	page := parseQueryInt(r, "page", 1)
	limit := parseQueryInt(r, "limit", 20)
	if limit > 100 {
		limit = 100
	}
	offset := (page - 1) * limit

	statusFilter := r.URL.Query().Get("status")
	vectorFilter := r.URL.Query().Get("target_vector_type")

	sortBy := r.URL.Query().Get("sort_by")
	if sortBy != "created_at" && sortBy != "updated_at" && sortBy != "status_state" {
		sortBy = "created_at"
	}
	sortDir := strings.ToUpper(r.URL.Query().Get("sort_dir"))
	if sortDir != "ASC" {
		sortDir = "DESC"
	}

	whereClause := "WHERE operator_id = $1 AND deleted_at IS NULL"
	args := []interface{}{claims.UserID}
	argIdx := 2

	if statusFilter != "" {
		whereClause += fmt.Sprintf(" AND status_state = $%d", argIdx)
		args = append(args, statusFilter)
		argIdx++
	}
	if vectorFilter != "" {
		whereClause += fmt.Sprintf(" AND target_vector_type = $%d", argIdx)
		args = append(args, vectorFilter)
		argIdx++
	}

	countQuery := "SELECT COUNT(*) FROM containers " + whereClause
	var total int
	if err := DB.QueryRow(r.Context(), countQuery, args...).Scan(&total); err != nil {
		slog.Error("containers count query failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "Database error")
		return
	}

	listQuery := fmt.Sprintf(`
		SELECT id, operator_id, callsign_alias, target_vector_type, status_state,
		       storage_backend, file_size_bytes, checksum_sha256, error_message,
		       retry_count, created_at, updated_at
		FROM containers %s
		ORDER BY %s %s
		LIMIT $%d OFFSET $%d`,
		whereClause, sortBy, sortDir, argIdx, argIdx+1,
	)
	args = append(args, limit, offset)

	rows, err := DB.Query(r.Context(), listQuery, args...)
	if err != nil {
		slog.Error("containers list query failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "Database error")
		return
	}
	defer rows.Close()

	containers := []ContainerRow{}
	for rows.Next() {
		var c ContainerRow
		var createdAt, updatedAt time.Time
		if err := rows.Scan(
			&c.ContainerID, &c.OperatorID, &c.CallsignAlias, &c.TargetVectorType,
			&c.StatusState, &c.StorageBackend, &c.FileSizeBytes, &c.ChecksumSHA256,
			&c.ErrorMessage, &c.RetryCount, &createdAt, &updatedAt,
		); err != nil {
			slog.Error("containers row scan failed", "error", err)
			continue
		}
		c.CreatedAt = createdAt.Format(time.RFC3339)
		c.UpdatedAt = updatedAt.Format(time.RFC3339)
		containers = append(containers, c)
	}

	WriteJSON(w, http.StatusOK, ContainerListResponse{
		Containers: containers,
		Total:      total,
		Page:       page,
		Limit:      limit,
	})
}

// ---------------------------------------------------------------------------
// GET /api/v1/containers/{id} — detail + event history
// ---------------------------------------------------------------------------

func HandleGetContainer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "Unauthenticated")
		return
	}

	containerID := strings.TrimPrefix(r.URL.Path, "/api/v1/containers/")
	containerID = strings.Trim(containerID, "/")
	if containerID == "" {
		WriteError(w, http.StatusBadRequest, "Container ID required")
		return
	}

	var c ContainerRow
	var createdAt, updatedAt time.Time
	err := DB.QueryRow(r.Context(), `
		SELECT id, operator_id, callsign_alias, target_vector_type, status_state,
		       storage_backend, file_size_bytes, checksum_sha256, error_message,
		       retry_count, created_at, updated_at
		FROM containers
		WHERE id = $1 AND operator_id = $2 AND deleted_at IS NULL`,
		containerID, claims.UserID,
	).Scan(
		&c.ContainerID, &c.OperatorID, &c.CallsignAlias, &c.TargetVectorType,
		&c.StatusState, &c.StorageBackend, &c.FileSizeBytes, &c.ChecksumSHA256,
		&c.ErrorMessage, &c.RetryCount, &createdAt, &updatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			WriteError(w, http.StatusNotFound, "Container not found")
			return
		}
		slog.Error("container fetch failed", "error", err, "container_id", containerID)
		WriteError(w, http.StatusInternalServerError, "Database error")
		return
	}
	c.CreatedAt = createdAt.Format(time.RFC3339)
	c.UpdatedAt = updatedAt.Format(time.RFC3339)

	evtRows, err := DB.Query(r.Context(), `
		SELECT event_id, from_state, to_state, occurred_at, detail
		FROM container_events
		WHERE container_id = $1
		ORDER BY occurred_at DESC
		LIMIT 100`,
		containerID,
	)
	if err != nil {
		slog.Error("container_events fetch failed", "error", err, "container_id", containerID)
		WriteError(w, http.StatusInternalServerError, "Database error")
		return
	}
	defer evtRows.Close()

	events := []ContainerEventRow{}
	for evtRows.Next() {
		var e ContainerEventRow
		var occurredAt time.Time
		if err := evtRows.Scan(&e.EventID, &e.FromState, &e.ToState, &occurredAt, &e.Detail); err != nil {
			continue
		}
		e.OccurredAt = occurredAt.Format(time.RFC3339)
		events = append(events, e)
	}

	WriteJSON(w, http.StatusOK, ContainerDetailResponse{ContainerRow: c, Events: events})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func contentTypeAllowed(contentType, filename string, allowed []string) bool {
	ct := strings.ToLower(strings.TrimSpace(strings.SplitN(contentType, ";", 2)[0]))
	ext := strings.ToLower(filepath.Ext(filename))

	for _, a := range allowed {
		if strings.HasPrefix(a, ".") {
			if ext == a {
				return true
			}
		} else {
			if ct == a {
				return true
			}
		}
	}
	return false
}

func hashReader(r io.Reader) (string, error) {
	h := sha256.New()
	if _, err := io.Copy(h, r); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func lookupByIdempotencyKey(ctx context.Context, operatorID, key string) (string, *string, bool, error) {
	var containerID string
	var checksum *string
	err := DB.QueryRow(ctx, `
		SELECT id, checksum_sha256
		FROM containers
		WHERE operator_id = $1 AND idempotency_key = $2 AND deleted_at IS NULL
		LIMIT 1`,
		operatorID, key,
	).Scan(&containerID, &checksum)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return "", nil, false, nil
		}
		return "", nil, false, err
	}
	return containerID, checksum, true, nil
}

func nullableString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func parseQueryInt(r *http.Request, key string, def int) int {
	v := r.URL.Query().Get(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		return def
	}
	return n
}

func parseEnvInt64(key string, def int64) int64 {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil || n <= 0 {
		return def
	}
	return n
}
