package main

// operator_signature_handler.go — POST /api/v1/operator/signature-key/generate
//
// Generates or rotates a deployment authorization key for the authenticated operator.
// The raw key is returned exactly once in the response and is never stored, logged,
// or retrievable again anywhere in the system. The stored value is always the bcrypt
// hash (cost 12) of the raw key.

import (
	"crypto/rand"
	"encoding/base64"
	"log/slog"
	"net/http"

	"golang.org/x/crypto/bcrypt"
)

// HandleGenerateSignatureKey handles POST /api/v1/operator/signature-key/generate.
// JWT middleware guarantees claims are present before this function runs.
func HandleGenerateSignatureKey(w http.ResponseWriter, r *http.Request) {
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

	// ── Step 1: Generate 32 cryptographically-random bytes ───────────────────
	rawBytes := make([]byte, 32)
	if _, err := rand.Read(rawBytes); err != nil {
		slog.Error("signature_key: rand.Read failed", "operator_id", operatorID, "error", err)
		WriteError(w, http.StatusInternalServerError, "Key generation failed")
		return
	}
	// Encode as base64url (no padding) — URL-safe, no special chars that would
	// confuse form fields or log parsers.
	rawKey := base64.RawURLEncoding.EncodeToString(rawBytes)
	// rawKey is 43 characters (ceil(32*8/6)=43). key_hint = last 4 chars.
	keyHint := rawKey[len(rawKey)-4:]

	// ── Step 2: bcrypt hash at cost 12 ───────────────────────────────────────
	// rawKey is intentionally NOT logged anywhere from this point forward.
	hashBytes, err := bcrypt.GenerateFromPassword([]byte(rawKey), 12)
	if err != nil {
		slog.Error("signature_key: bcrypt failed", "operator_id", operatorID, "error", err)
		WriteError(w, http.StatusInternalServerError, "Key hashing failed")
		return
	}
	keyHash := string(hashBytes)

	// ── Step 3: Upsert — detect rotation vs first-time creation ─────────────
	// Check if a row already exists for this operator.
	ctx := r.Context()
	var existingCount int
	if err := DB.QueryRow(ctx,
		`SELECT COUNT(*) FROM operator_signature_keys WHERE operator_id = $1`,
		operatorID,
	).Scan(&existingCount); err != nil {
		slog.Error("signature_key: existence check failed", "operator_id", operatorID, "error", err)
		WriteError(w, http.StatusInternalServerError, "Database error")
		return
	}

	rotated := existingCount > 0

	if rotated {
		// Rotation: overwrite the existing row's hash+hint and stamp rotated_at.
		// The old hash becomes invalid immediately because we overwrite it here.
		if _, err := DB.Exec(ctx, `
			UPDATE operator_signature_keys
			SET key_hash   = $1,
			    key_hint   = $2,
			    rotated_at = now(),
			    revoked_at = NULL
			WHERE operator_id = $3`,
			keyHash, keyHint, operatorID,
		); err != nil {
			slog.Error("signature_key: update failed", "operator_id", operatorID, "error", err)
			WriteError(w, http.StatusInternalServerError, "Database error during key rotation")
			return
		}
		slog.Info("signature_key: rotated",
			"operator_id", operatorID,
			"hint", keyHint,
		)
	} else {
		// First-time creation.
		if _, err := DB.Exec(ctx, `
			INSERT INTO operator_signature_keys (operator_id, key_hash, key_hint)
			VALUES ($1, $2, $3)`,
			operatorID, keyHash, keyHint,
		); err != nil {
			slog.Error("signature_key: insert failed", "operator_id", operatorID, "error", err)
			WriteError(w, http.StatusInternalServerError, "Database error during key creation")
			return
		}
		slog.Info("signature_key: created",
			"operator_id", operatorID,
			"hint", keyHint,
		)
	}

	// ── Step 4: Return raw key exactly once ───────────────────────────────────
	// After this write, rawKey goes out of scope. It is not in any log line above
	// and will not appear in any audit trail. The caller must save it.
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"signature_key": rawKey,
		"key_hint":      keyHint,
		"rotated":       rotated,
	})
}
