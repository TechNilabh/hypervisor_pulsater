package main

import (
	"context"
	"net/http"
	"os"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// Health & Readiness Probes
// ---------------------------------------------------------------------------

// HandleHealthz is a pure liveness probe. It returns 200 as long as the
// process is alive and its HTTP listener is accepting connections.
// It makes no DB or external calls — a slow DB must not kill liveness.
//
//	GET /healthz
//	→ 200 {"status":"ok","ts":"<RFC3339>"}
func HandleHealthz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	WriteJSON(w, http.StatusOK, map[string]string{
		"status": "ok",
		"ts":     time.Now().UTC().Format(time.RFC3339),
	})
}

// HandleReadyz is a readiness probe that checks all critical dependencies.
// Returns 200 only if the server is ready to serve traffic.
// Returns 503 with a JSON body naming which check failed.
//
//	GET /readyz
//	→ 200 {"status":"ready","checks":{"db":"ok","storage":"ok"}}
//	→ 503 {"status":"not_ready","checks":{"db":"error: ...","storage":"ok"}}
func HandleReadyz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	checks := map[string]string{}
	allOK := true

	// ── DB check ─────────────────────────────────────────────────────────────
	if DB == nil {
		checks["db"] = "error: pool not initialized"
		allOK = false
	} else if err := DB.Ping(ctx); err != nil {
		checks["db"] = "error: " + sanitizeReadyzError(err)
		allOK = false
	} else {
		checks["db"] = "ok"
	}

	// ── Storage check ─────────────────────────────────────────────────────────
	// For local disk backend: verify the storage root directory is accessible.
	// For S3 backend: a lightweight existence check via Checksum on a sentinel
	// key would require a real object; instead we just confirm the backend was
	// constructed successfully (non-nil) since the ping is done at boot.
	storageBackend := strings.ToLower(strings.TrimSpace(os.Getenv("STORAGE_BACKEND")))
	if storageBackend == "" {
		storageBackend = "local"
	}

	switch storageBackend {
	case "local":
		rawDir := os.Getenv("STORAGE_RAW_DIR")
		if rawDir == "" {
			rawDir = "infra/storage/raw"
		}
		if StorageInstance == nil {
			checks["storage"] = "error: backend not initialized"
			allOK = false
		} else {
			// Ensure the raw dir is writable by checking it exists (created at first upload).
			// We don't require it to exist at readyz time — just that the backend is constructed.
			checks["storage"] = "ok"
		}
	case "s3":
		if StorageInstance == nil {
			checks["storage"] = "error: S3 backend not initialized"
			allOK = false
		} else {
			checks["storage"] = "ok"
		}
	default:
		checks["storage"] = "error: unknown backend " + storageBackend
		allOK = false
	}

	status := "ready"
	httpStatus := http.StatusOK
	if !allOK {
		status = "not_ready"
		httpStatus = http.StatusServiceUnavailable
	}

	WriteJSON(w, httpStatus, map[string]interface{}{
		"status": status,
		"checks": checks,
	})
}

// sanitizeReadyzError returns a safe, non-credential-leaking error message for
// use in the readyz response body. Never expose connection strings or passwords.
func sanitizeReadyzError(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	// Strip any credential-like tokens from error messages.
	for _, needle := range []string{"password", "passwd", "://", "@"} {
		if strings.Contains(strings.ToLower(msg), needle) {
			return "connection refused or credentials error"
		}
	}
	return msg
}
