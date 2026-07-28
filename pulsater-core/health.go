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

func sanitizeReadyzError(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	for _, needle := range []string{"password", "passwd", "://", "@"} {
		if strings.Contains(strings.ToLower(msg), needle) {
			return "connection refused or credentials error"
		}
	}
	return msg
}
