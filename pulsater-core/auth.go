// this is the true auth.go
package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/facebook"
	"golang.org/x/oauth2/github"
	"golang.org/x/oauth2/google"
)

// ---------------------------------------------------------------------------
// JWT Configuration
// ---------------------------------------------------------------------------

// jwtKey holds the HMAC signing key loaded from JWT_SECRET at startup.
// Never set directly — always loaded via LoadJWTSecret() in main().
// The fallback value is intentionally weak and will fail validateConfig().
var jwtKey = []byte("UNSET_REPLACE_WITH_JWT_SECRET")

// LoadJWTSecret reads JWT_SECRET from the environment and populates jwtKey.
// Must be called after LoadEnv (or equivalent) and after validateConfig confirms
// the var is present and long enough. This is called exactly once from main().
func LoadJWTSecret() {
	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if secret == "" {
		// validateConfig should have caught this — panic here to make the
		// programmer error obvious instead of silently using a weak key.
		panic("LoadJWTSecret: JWT_SECRET is empty — validateConfig must be called first")
	}
	jwtKey = []byte(secret)
	log.Printf("[AUTH] JWT signing key loaded (%d bytes)", len(jwtKey))
}

// Claims is the JWT payload structure used for all signed session tokens.
type Claims struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	jwt.RegisteredClaims
}

// ---------------------------------------------------------------------------
// OTP Cache — sync.Map with TTL wrapper
// ---------------------------------------------------------------------------

// otpEntry holds a one-time password and its creation timestamp for TTL enforcement.
type otpEntry struct {
	OTP       string
	CreatedAt time.Time
}

// OTPCache is the global thread-safe in-memory store for pending MFA tokens.
// Key: user email (string), Value: otpEntry
var OTPCache sync.Map

const otpTTL = 5 * time.Minute

// generateOTP returns a cryptographically secure 6-digit numeric string.
func generateOTP() (string, error) {
	digits := ""
	for i := 0; i < 6; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", fmt.Errorf("OTP digit generation failed: %w", err)
		}
		digits += n.String()
	}
	return digits, nil
}

// ---------------------------------------------------------------------------
// Brevo HTTPS MFA Email Dispatcher
// ---------------------------------------------------------------------------

// brevoEmailPayload is the JSON body sent to the Brevo transactional email API.
type brevoEmailPayload struct {
	Sender      brevoAddress   `json:"sender"`
	To          []brevoAddress `json:"to"`
	Subject     string         `json:"subject"`
	HTMLContent string         `json:"htmlContent"`
}

type brevoAddress struct {
	Email string `json:"email"`
}

// SendMFAEmail dispatches the OTP to toEmail via the Brevo transactional
// email HTTPS API (port 443). No SMTP dialling — works on all hosting tiers.
//
// Required env vars (in production):
//
//	EMAIL_API_KEY      — Brevo API key (never logged)
//	EMAIL_FROM_ADDRESS — verified sender address in the Brevo account
//
// Returns an error if the API key / from-address are missing, if the HTTP
// request fails, or if Brevo returns a non-2xx status code.
func SendMFAEmail(toEmail, otp string) error {
	apiKey := strings.TrimSpace(os.Getenv("EMAIL_API_KEY"))
	fromAddr := strings.TrimSpace(os.Getenv("EMAIL_FROM_ADDRESS"))

	if apiKey == "" {
		return fmt.Errorf("email API not configured (EMAIL_API_KEY is unset)")
	}
	if fromAddr == "" {
		return fmt.Errorf("email API not configured (EMAIL_FROM_ADDRESS is unset)")
	}

	expiry := time.Now().Add(otpTTL).Format("2006-01-02 15:04:05 UTC")

	htmlContent := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>HYPERVISOR PULSATER — MFA Verification Token</title>
</head>
<body style="margin:0;padding:0;background-color:#0d0f12;font-family:monospace;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background-color:#0d0f12;min-height:100vh;">
    <tr>
      <td align="center" valign="top" style="padding:40px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%%;">

          <!-- Header Bar -->
          <tr>
            <td style="background-color:#0a0c0f;border:1px solid #00f0ff;border-bottom:none;padding:16px 24px;">
              <p style="margin:0;font-size:10px;letter-spacing:0.25em;color:#00f0ff;text-transform:uppercase;">
                &#x25B6; HYPERVISOR_PULSATER // SECURE_MFA_ENGINE v2.0
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#0d0f12;border:1px solid #00f0ff;border-top:none;border-bottom:none;padding:40px 24px;">
              <p style="margin:0 0 8px 0;font-size:10px;color:#4a5568;letter-spacing:0.15em;text-transform:uppercase;">
                [ AUTHENTICATION_PROTOCOL ]
              </p>
              <h1 style="margin:0 0 24px 0;font-size:20px;color:#e2e8f0;letter-spacing:0.05em;font-weight:700;">
                IDENTITY_VERIFICATION_PROTOCOL // SECURE_NODE_ACCESS
              </h1>
              <p style="margin:0 0 32px 0;font-size:13px;color:#94a3b8;line-height:1.7;">
                A secure authentication request has been initiated for your operator node.<br/>
                Enter the following one-time verification token in the PULSATER interface to complete access.
              </p>

              <!-- OTP Block -->
              <table width="100%%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td align="center" style="background-color:#0a0c0f;border:1px solid #00f0ff;
                      box-shadow:0 0 20px rgba(0,240,255,0.15);padding:32px 24px;">
                    <p style="margin:0 0 8px 0;font-size:9px;letter-spacing:0.3em;color:#00f0ff;text-transform:uppercase;">
                      VERIFICATION TOKEN
                    </p>
                    <p style="margin:0;font-size:40px;font-weight:700;color:#00f0ff;letter-spacing:0.4em;
                        text-shadow:0 0 20px rgba(0,240,255,0.6);">
                      %s
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Expiry Warning -->
              <table width="100%%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background-color:#1a0a0a;border:1px solid #ff4444;padding:16px 20px;">
                    <p style="margin:0;font-size:11px;color:#ff6666;letter-spacing:0.1em;">
                      &#9888; TOKEN EXPIRES AT: <strong>%s</strong><br/>
                      This token is single-use and will be invalidated after verification or expiry.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:11px;color:#4a5568;line-height:1.6;">
                If you did not initiate this authentication request, disregard this message.<br/>
                Your account remains secure until the token expires.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#0a0c0f;border:1px solid #00f0ff;border-top:none;padding:16px 24px;">
              <p style="margin:0;font-size:9px;color:#2d3748;letter-spacing:0.2em;text-transform:uppercase;">
                HYPERVISOR_PULSATER SECURE NODE // DO NOT REPLY TO THIS MESSAGE
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`, otp, expiry)

	payload := brevoEmailPayload{
		Sender:      brevoAddress{Email: fromAddr},
		To:          []brevoAddress{{Email: toEmail}},
		Subject:     "HYPERVISOR PULSATER — MFA Verification Token",
		HTMLContent: htmlContent,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("email: failed to marshal request payload: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.brevo.com/v3/smtp/email", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("email: failed to build HTTP request: %w", err)
	}
	// NOTE: EMAIL_API_KEY is set in the header but never written to logs.
	req.Header.Set("api-key", apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("email: Brevo API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Read up to 512 bytes of the error body for diagnostics.
		// We deliberately do NOT log the full request body (contains OTP).
		rawErr, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		log.Printf("[MFA_EMAIL] Brevo API returned non-2xx status %d: %s", resp.StatusCode, string(rawErr))
		return fmt.Errorf("email: Brevo API returned status %d", resp.StatusCode)
	}

	log.Printf("[MFA_EMAIL] Brevo accepted email dispatch for %s (status %d)", toEmail, resp.StatusCode)
	return nil
}

// ---------------------------------------------------------------------------
// Request / Response Types
// ---------------------------------------------------------------------------

type SignupRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AvatarRequest struct {
	AvatarID string `json:"avatar_id"`
}

type MFAVerifyRequest struct {
	Email string `json:"email"`
	OTP   string `json:"otp"`
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

func generateUUID() (string, error) {
	b := make([]byte, 16)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	b[8] = (b[8] & 0x3f) | 0x80
	b[6] = (b[6] & 0x0f) | 0x40
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}

func WriteJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
	}
}

func WriteError(w http.ResponseWriter, status int, errMsg string) {
	WriteJSON(w, status, map[string]string{"error": errMsg})
}

func signSessionJWT(userID, username, email string) (string, error) {
	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID:   userID,
		Username: username,
		Email:    email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtKey)
}

// ---------------------------------------------------------------------------
// CORS Middleware — elastic origin matching
// ---------------------------------------------------------------------------

func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		allowedOrigin := os.Getenv("ALLOWED_ORIGIN")
		incomingOrigin := r.Header.Get("Origin")

		var reflectedOrigin string
		switch {
		case incomingOrigin != "" && allowedOrigin != "" && incomingOrigin == allowedOrigin:
			reflectedOrigin = incomingOrigin
		case incomingOrigin != "" && strings.HasSuffix(incomingOrigin, ".vercel.app"):
			reflectedOrigin = incomingOrigin
		case incomingOrigin != "" && allowedOrigin == "":
			reflectedOrigin = incomingOrigin
		default:
			reflectedOrigin = "*"
		}

		w.Header().Set("Access-Control-Allow-Origin", reflectedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// ---------------------------------------------------------------------------
// JWT Auth Middleware
// ---------------------------------------------------------------------------

func JWTAuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			WriteError(w, http.StatusUnauthorized, "Authorization header required")
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			WriteError(w, http.StatusUnauthorized, "Authorization format must be Bearer <token>")
			return
		}

		tokenString := parts[1]
		claims := &Claims{}

		token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return jwtKey, nil
		})

		if err != nil || !token.Valid {
			log.Printf("JWT middleware rejection: %v", err)
			WriteError(w, http.StatusUnauthorized, "Invalid or expired session token")
			return
		}

		ctx := context.WithValue(r.Context(), claimsContextKey{}, claims)
		next(w, r.WithContext(ctx))
	}
}

type claimsContextKey struct{}

func ClaimsFromContext(ctx context.Context) *Claims {
	c, _ := ctx.Value(claimsContextKey{}).(*Claims)
	return c
}

// ---------------------------------------------------------------------------
// Auth Handlers
// ---------------------------------------------------------------------------

func SignupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req SignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(req.Email)
	req.Password = strings.TrimSpace(req.Password)

	if req.Username == "" || req.Email == "" || req.Password == "" {
		WriteError(w, http.StatusBadRequest, "All fields are required")
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), 10)
	if err != nil {
		log.Printf("Bcrypt hashing error: %v", err)
		WriteError(w, http.StatusInternalServerError, "Failed to secure password")
		return
	}

	uuid, err := generateUUID()
	if err != nil {
		log.Printf("UUID generation error: %v", err)
		WriteError(w, http.StatusInternalServerError, "Failed to generate ID")
		return
	}

	query := `INSERT INTO users (id, username, email, password_hash, avatar_id) VALUES ($1, $2, $3, $4, $5)`
	_, err = DB.Exec(context.Background(), query, uuid, req.Username, req.Email, string(hashedPassword), "operator-default")
	if err != nil {
		log.Printf("SQL signup insert error: %v", err)
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
			WriteError(w, http.StatusConflict, "Username or Email already exists")
		} else {
			WriteError(w, http.StatusInternalServerError, "Database error during registration")
		}
		return
	}

	log.Printf("Created operator %s with ID %s", req.Username, uuid)
	WriteJSON(w, http.StatusCreated, map[string]string{
		"message": "Signup successful",
		"user_id": uuid,
	})
}

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.Email = strings.TrimSpace(req.Email)
	req.Password = strings.TrimSpace(req.Password)

	if req.Email == "" || req.Password == "" {
		WriteError(w, http.StatusBadRequest, "Credentials are required")
		return
	}

	var id, username, email, passwordHash, avatarID string
	query := `SELECT id, username, email, password_hash, avatar_id FROM users WHERE email = $1 OR username = $1`
	err := DB.QueryRow(context.Background(), query, req.Email).Scan(&id, &username, &email, &passwordHash, &avatarID)
	if err != nil {
		log.Printf("SQL login lookup error: %v", err)
		WriteError(w, http.StatusUnauthorized, "Invalid username/email or password")
		return
	}

	if err = bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		log.Printf("Invalid password attempt for %s", req.Email)
		WriteError(w, http.StatusUnauthorized, "Invalid username/email or password")
		return
	}

	otp, err := generateOTP()
	if err != nil {
		log.Printf("OTP generation error: %v", err)
		WriteError(w, http.StatusInternalServerError, "Failed to generate MFA token")
		return
	}
	OTPCache.Store(email, otpEntry{OTP: otp, CreatedAt: time.Now()})

	if err := SendMFAEmail(email, otp); err != nil {
		log.Printf("MFA email dispatch error for %s: %v", email, err)
		// Stdout OTP fallback is ONLY permitted when:
		//   1. APP_ENV == "development"  (explicitly set, never defaulted)
		//   2. EMAIL_API_KEY is unset
		//
		// validateConfig() guarantees this combination is only reachable in dev.
		// In production (APP_ENV unset or != "development") this branch returns
		// 500 regardless of email config, because validateConfig() would
		// have already aborted startup if EMAIL_API_KEY was missing in production.
		appEnv := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
		emailAPIKey := strings.TrimSpace(os.Getenv("EMAIL_API_KEY"))
		if appEnv == "development" && emailAPIKey == "" {
			log.Printf("[DEV_OTP] MFA token for %s: %s (DEV STDOUT FALLBACK — APP_ENV=development, email API not configured)", email, otp)
		} else {
			WriteError(w, http.StatusInternalServerError, "Failed to send MFA email")
			return
		}
	}


	log.Printf("MFA initiated for operator %s (%s)", username, email)
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"mfa_required": true,
		"email":        email,
	})
}

func VerifyMFAHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req MFAVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.Email = strings.TrimSpace(req.Email)
	req.OTP = strings.TrimSpace(req.OTP)

	if req.Email == "" || req.OTP == "" {
		WriteError(w, http.StatusBadRequest, "Email and OTP are required")
		return
	}

	raw, ok := OTPCache.Load(req.Email)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "No pending MFA token for this address")
		return
	}

	entry, ok := raw.(otpEntry)
	if !ok {
		WriteError(w, http.StatusInternalServerError, "Corrupted OTP cache entry")
		return
	}

	if time.Since(entry.CreatedAt) > otpTTL {
		OTPCache.Delete(req.Email)
		WriteError(w, http.StatusUnauthorized, "MFA token has expired — please login again")
		return
	}

	if entry.OTP != req.OTP {
		WriteError(w, http.StatusUnauthorized, "Invalid MFA token")
		return
	}

	OTPCache.Delete(req.Email)

	var id, username, email, avatarID string
	query := `SELECT id, username, email, avatar_id FROM users WHERE email = $1`
	err := DB.QueryRow(context.Background(), query, req.Email).Scan(&id, &username, &email, &avatarID)
	if err != nil {
		log.Printf("SQL user fetch post-MFA error: %v", err)
		WriteError(w, http.StatusInternalServerError, "Failed to retrieve user record")
		return
	}

	tokenString, err := signSessionJWT(id, username, email)
	if err != nil {
		log.Printf("JWT sign error post-MFA: %v", err)
		WriteError(w, http.StatusInternalServerError, "Failed to sign session token")
		return
	}

	log.Printf("MFA verification successful for operator %s (%s)", username, email)
	WriteJSON(w, http.StatusOK, map[string]string{
		"session_token": tokenString,
		"user_id":       id,
		"username":      username,
		"avatar_id":     avatarID,
	})
}

func ResendOTPHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.Email = strings.TrimSpace(req.Email)
	if req.Email == "" {
		WriteError(w, http.StatusBadRequest, "Email is required")
		return
	}

	_, ok := OTPCache.Load(req.Email)
	if !ok {
		WriteError(w, http.StatusForbidden, "No pending authentication session found for this address")
		return
	}

	otp, err := generateOTP()
	if err != nil {
		log.Printf("OTP generation error: %v", err)
		WriteError(w, http.StatusInternalServerError, "Failed to generate MFA token")
		return
	}
	OTPCache.Store(req.Email, otpEntry{OTP: otp, CreatedAt: time.Now()})

	if err := SendMFAEmail(req.Email, otp); err != nil {
		log.Printf("MFA email dispatch error for %s: %v", req.Email, err)
		WriteError(w, http.StatusInternalServerError, "Failed to send MFA email")
		return
	}

	log.Printf("MFA OTP resent for operator %s", req.Email)
	WriteJSON(w, http.StatusOK, map[string]string{
		"message": "Verification token resent successfully",
	})
}

func UpdateAvatarHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		WriteError(w, http.StatusUnauthorized, "Authorization header required")
		return
	}

	tokenParts := strings.Split(authHeader, " ")
	if len(tokenParts) != 2 || strings.ToLower(tokenParts[0]) != "bearer" {
		WriteError(w, http.StatusUnauthorized, "Authorization format must be Bearer <token>")
		return
	}

	tokenString := tokenParts[1]
	claims := &Claims{}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return jwtKey, nil
	})

	if err != nil || !token.Valid {
		log.Printf("JWT parsing/verification error: %v", err)
		WriteError(w, http.StatusUnauthorized, "Invalid or expired session token")
		return
	}

	var req AvatarRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.AvatarID = strings.TrimSpace(req.AvatarID)
	if req.AvatarID == "" {
		WriteError(w, http.StatusBadRequest, "Avatar ID is required")
		return
	}

	query := `UPDATE users SET avatar_id = $1 WHERE id = $2`
	_, err = DB.Exec(context.Background(), query, req.AvatarID, claims.UserID)
	if err != nil {
		log.Printf("SQL update avatar error: %v", err)
		WriteError(w, http.StatusInternalServerError, "Failed to update database record")
		return
	}

	log.Printf("Updated avatar for user %s (%s) to %s", claims.Username, claims.UserID, req.AvatarID)
	WriteJSON(w, http.StatusOK, map[string]string{
		"message":   "Avatar updated successfully",
		"avatar_id": req.AvatarID,
	})
}

// ---------------------------------------------------------------------------
// Native Multi-Vector OAuth Matrix (Google, GitHub, Facebook)
// ---------------------------------------------------------------------------

var (
// Decoupled from static boot declarations to prevent empty client ID initialization order bug
)

// 1. DYNAMIC CONFIGURATION FACTORY
func getOAuthConfig(provider string) *oauth2.Config {
	backendURL := os.Getenv("BACKEND_URL")
	if backendURL == "" {
		backendURL = "http://localhost:8080"
	}

	switch provider {
	case "google":
		return &oauth2.Config{
			ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
			ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
			RedirectURL:  fmt.Sprintf("%s/api/v1/auth/oauth/google/callback", backendURL),
			Scopes:       []string{"https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"},
			Endpoint:     google.Endpoint,
		}
	case "github":
		return &oauth2.Config{
			ClientID:     os.Getenv("GITHUB_CLIENT_ID"),
			ClientSecret: os.Getenv("GITHUB_CLIENT_SECRET"),
			RedirectURL:  fmt.Sprintf("%s/api/v1/auth/oauth/github/callback", backendURL),
			Scopes:       []string{"user:email", "read:user"},
			Endpoint:     github.Endpoint,
		}
	case "facebook":
		return &oauth2.Config{
			ClientID:     os.Getenv("FACEBOOK_CLIENT_ID"),
			ClientSecret: os.Getenv("FACEBOOK_CLIENT_SECRET"),
			RedirectURL:  fmt.Sprintf("%s/api/v1/auth/oauth/facebook/callback", backendURL),
			Scopes:       []string{"email", "public_profile"},
			Endpoint:     facebook.Endpoint,
		}
	}
	return nil
}

// 2. CENTRALIZED ROUTE ROUTING GATEWAYS
func HandleOAuthLogin(provider string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		config := getOAuthConfig(provider)
		if config == nil {
			WriteError(w, http.StatusBadRequest, "Unsupported OAuth provider")
			return
		}

		if config.ClientID == "" || config.ClientSecret == "" {
			log.Printf("[AUTH][ERROR] OAuth provider [%s] credentials not configured", provider)
			WriteError(w, http.StatusInternalServerError, fmt.Sprintf("OAuth provider %q is not configured on this server", provider))
			return
		}

		stateToken := fmt.Sprintf("state-%s", provider)
		url := config.AuthCodeURL(stateToken, oauth2.AccessTypeOffline)

		log.Printf("[AUTH] Redirecting OAuth handshake to [%s]", provider)
		http.Redirect(w, r, url, http.StatusSeeOther)
	}
}

// Callback Processors

func GoogleCallbackHandler(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if strings.HasPrefix(code, "mock_code_google_") && os.Getenv("APP_ENV") == "development" {
		handleOAuthSuccess(w, r, "google", strings.TrimPrefix(code, "mock_code_google_"), "Mock Google User", "mock_google@pulsater.test")
		return
	}
	config := getOAuthConfig("google")
	if config == nil {
		log.Printf("Google OAuth callback: config is nil")
		WriteError(w, http.StatusInternalServerError, "OAuth configuration not found")
		return
	}
	token, err := config.Exchange(context.Background(), code)
	if err != nil {
		log.Printf("Google OAuth exchange failed: %v", err)
		WriteError(w, http.StatusBadRequest, "OAuth code exchange failed")
		return
	}

	client := config.Client(context.Background(), token)
	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		log.Printf("Failed to get Google user info: %v", err)
		WriteError(w, http.StatusBadRequest, "Failed to get user info from Google")
		return
	}
	defer resp.Body.Close()

	var userInfo struct {
		ID    string `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to parse Google user info")
		return
	}

	handleOAuthSuccess(w, r, "google", userInfo.ID, userInfo.Name, userInfo.Email)
}

func GithubCallbackHandler(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if strings.HasPrefix(code, "mock_code_github_") && os.Getenv("APP_ENV") == "development" {
		handleOAuthSuccess(w, r, "github", strings.TrimPrefix(code, "mock_code_github_"), "Mock Github User", "mock_github@pulsater.test")
		return
	}
	config := getOAuthConfig("github")
	if config == nil {
		log.Printf("GitHub OAuth callback: config is nil")
		WriteError(w, http.StatusInternalServerError, "OAuth configuration not found")
		return
	}
	token, err := config.Exchange(context.Background(), code)
	if err != nil {
		log.Printf("GitHub OAuth exchange failed: %v", err)
		WriteError(w, http.StatusBadRequest, "OAuth code exchange failed")
		return
	}

	client := config.Client(context.Background(), token)
	resp, err := client.Get("https://api.github.com/user")
	if err != nil {
		log.Printf("Failed to get GitHub user info: %v", err)
		WriteError(w, http.StatusBadRequest, "Failed to get user info from GitHub")
		return
	}
	defer resp.Body.Close()

	var userInfo struct {
		ID    int    `json:"id"`
		Login string `json:"login"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to parse GitHub user info")
		return
	}

	email := userInfo.Email
	if email == "" {
		emailResp, err := client.Get("https://api.github.com/user/emails")
		if err == nil {
			defer emailResp.Body.Close()
			var emails []struct {
				Email    string `json:"email"`
				Primary  bool   `json:"primary"`
				Verified bool   `json:"verified"`
			}
			if err := json.NewDecoder(emailResp.Body).Decode(&emails); err == nil {
				for _, e := range emails {
					if e.Primary {
						email = e.Email
						break
					}
				}
				if email == "" && len(emails) > 0 {
					email = emails[0].Email
				}
			}
		}
	}
	if email == "" {
		email = fmt.Sprintf("%s@github.pulsater.net", userInfo.Login)
	}

	name := userInfo.Name
	if name == "" {
		name = userInfo.Login
	}

	handleOAuthSuccess(w, r, "github", fmt.Sprintf("%d", userInfo.ID), name, email)
}

func FacebookCallbackHandler(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if strings.HasPrefix(code, "mock_code_facebook_") && os.Getenv("APP_ENV") == "development" {
		handleOAuthSuccess(w, r, "facebook", strings.TrimPrefix(code, "mock_code_facebook_"), "Mock Facebook User", "mock_facebook@pulsater.test")
		return
	}
	config := getOAuthConfig("facebook")
	if config == nil {
		log.Printf("Facebook OAuth callback: config is nil")
		WriteError(w, http.StatusInternalServerError, "OAuth configuration not found")
		return
	}
	token, err := config.Exchange(context.Background(), code)
	if err != nil {
		log.Printf("Facebook OAuth exchange failed: %v", err)
		WriteError(w, http.StatusBadRequest, "OAuth code exchange failed")
		return
	}

	client := config.Client(context.Background(), token)
	resp, err := client.Get("https://graph.facebook.com/me?fields=id,name,email")
	if err != nil {
		log.Printf("Failed to get Facebook user info: %v", err)
		WriteError(w, http.StatusBadRequest, "Failed to get user info from Facebook")
		return
	}
	defer resp.Body.Close()

	var userInfo struct {
		ID    string `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to parse Facebook user info")
		return
	}

	email := userInfo.Email
	if email == "" {
		email = fmt.Sprintf("%s@facebook.pulsater.net", userInfo.ID)
	}

	handleOAuthSuccess(w, r, "facebook", userInfo.ID, userInfo.Name, email)
}

// Unified OAuth success routine (JWT redirect)

func handleOAuthSuccess(w http.ResponseWriter, r *http.Request, provider, providerUserID, name, email string) {
	ctx := context.Background()
	email = strings.TrimSpace(email)
	name = strings.TrimSpace(name)
	if name == "" {
		name = strings.Split(email, "@")[0]
	}

	var userID, username, avatarID string
	query := `SELECT id, username, avatar_id FROM users WHERE email = $1 OR username = $2`
	err := DB.QueryRow(ctx, query, email, name).Scan(&userID, &username, &avatarID)
	if err != nil {
		uuid, err := generateUUID()
		if err != nil {
			log.Printf("OAuth UUID generation error: %v", err)
			WriteError(w, http.StatusInternalServerError, "Failed to generate user ID")
			return
		}
		userID = uuid
		username = name
		avatarID = "Node_02" // default active avatar for OAuth users

		insertUserQuery := `INSERT INTO users (id, username, email, password_hash, avatar_id) VALUES ($1, $2, $3, $4, $5)`
		_, err = DB.Exec(ctx, insertUserQuery, userID, username, email, "OAUTH_EXTERNAL_IDENTITY", avatarID)
		if err != nil {
			log.Printf("OAuth SQL insert user error: %v", err)
			WriteError(w, http.StatusInternalServerError, "Database error creating user via OAuth")
			return
		}
	}

	oauthUUID, err := generateUUID()
	if err != nil {
		log.Printf("OAuth identity UUID generation error: %v", err)
		WriteError(w, http.StatusInternalServerError, "Failed to generate OAuth ID")
		return
	}

	insertOAuthQuery := `
	INSERT INTO oauth_identities (id, user_id, provider, provider_user_id)
	VALUES ($1, $2, $3, $4)
	ON CONFLICT (provider, provider_user_id) DO NOTHING
	`
	_, err = DB.Exec(ctx, insertOAuthQuery, oauthUUID, userID, provider, providerUserID)
	if err != nil {
		log.Printf("OAuth SQL insert link error: %v", err)
		WriteError(w, http.StatusInternalServerError, "Database error linking OAuth identity")
		return
	}

	token, err := signSessionJWT(userID, username, email)
	if err != nil {
		log.Printf("OAuth JWT sign error: %v", err)
		WriteError(w, http.StatusInternalServerError, "Failed to sign session token")
		return
	}

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}

	log.Printf("OAuth operator %s successfully authenticated via %s — Redirecting to frontend identity portal", username, provider)
	http.Redirect(w, r, fmt.Sprintf("%s/identity?token=%s", frontendURL, token), http.StatusSeeOther)
}

func HandleOAuthCallback(provider string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch provider {
		case "google":
			GoogleCallbackHandler(w, r)
		case "github":
			GithubCallbackHandler(w, r)
		case "facebook":
			FacebookCallbackHandler(w, r)
		default:
			WriteError(w, http.StatusBadRequest, "Unsupported OAuth provider")
		}
	}
}
