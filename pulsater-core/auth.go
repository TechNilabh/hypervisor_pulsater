package main

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"context"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var jwtKey = []byte("pulsater-secret-key-neon-cyan")

type Claims struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	jwt.RegisteredClaims
}

type SignupRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Email    string `json:"email"` // Can be username or email
	Password string `json:"password"`
}

type AvatarRequest struct {
	AvatarID string `json:"avatar_id"`
}

// Generate a random UUIDv4 string
func generateUUID() (string, error) {
	b := make([]byte, 16)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	// Variant 10xxxxxx
	b[8] = (b[8] & 0x3f) | 0x80
	// Version 4 (pseudo-random)
	b[6] = (b[6] & 0x0f) | 0x40
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}

// WriteJSON writes a JSON payload to the response writer
func WriteJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
	}
}

// WriteError writes a JSON formatted error response
func WriteError(w http.ResponseWriter, status int, errMsg string) {
	WriteJSON(w, status, map[string]string{"error": errMsg})
}

// CORSMiddleware injects CORS headers and handles OPTIONS requests
func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// SignupHandler registers a new operator in Postgres
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

	// Generate salt and hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), 10)
	if err != nil {
		log.Printf("Bcrypt hashing error: %v", err)
		WriteError(w, http.StatusInternalServerError, "Failed to secure password")
		return
	}

	// Generate UUID
	uuid, err := generateUUID()
	if err != nil {
		log.Printf("UUID generation error: %v", err)
		WriteError(w, http.StatusInternalServerError, "Failed to generate ID")
		return
	}

	// Insert into Postgres
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

// LoginHandler verifies the credentials and returns a JWT token
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

	// Fetch from DB
	var id, username, email, passwordHash, avatarID string
	query := `SELECT id, username, email, password_hash, avatar_id FROM users WHERE email = $1 OR username = $1`
	err := DB.QueryRow(context.Background(), query, req.Email).Scan(&id, &username, &email, &passwordHash, &avatarID)
	if err != nil {
		log.Printf("SQL login lookup error: %v", err)
		WriteError(w, http.StatusUnauthorized, "Invalid username/email or password")
		return
	}

	// Compare passwords
	err = bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password))
	if err != nil {
		log.Printf("Invalid password match attempt for %s", req.Email)
		WriteError(w, http.StatusUnauthorized, "Invalid username/email or password")
		return
	}

	// Create JWT token
	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID:   id,
		Username: username,
		Email:    email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtKey)
	if err != nil {
		log.Printf("JWT sign error: %v", err)
		WriteError(w, http.StatusInternalServerError, "Failed to sign session token")
		return
	}

	log.Printf("Authorized operator %s session successful", username)
	WriteJSON(w, http.StatusOK, map[string]string{
		"token":     tokenString,
		"user_id":   id,
		"username":  username,
		"avatar_id": avatarID,
	})
}

// UpdateAvatarHandler updates the user's avatar selection
func UpdateAvatarHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Verify JWT from Authorization Header
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

	// Parse body for selected avatar_id
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

	// Update DB
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

type OAuthRequest struct {
	Provider       string `json:"provider"`
	ProviderUserID string `json:"provider_user_id"`
	Username       string `json:"username"`
	Email          string `json:"email"`
}

// OAuthHandler manages simulated third-party developer API links and logs them into database ledger
func OAuthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req OAuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.Provider = strings.TrimSpace(req.Provider)
	req.ProviderUserID = strings.TrimSpace(req.ProviderUserID)
	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(req.Email)

	if req.Provider == "" || req.ProviderUserID == "" || req.Username == "" || req.Email == "" {
		WriteError(w, http.StatusBadRequest, "All OAuth fields are required")
		return
	}

	ctx := context.Background()

	// 1. Check if user already exists by email or username
	var userID, username, avatarID string
	query := `SELECT id, username, avatar_id FROM users WHERE email = $1 OR username = $2`
	err := DB.QueryRow(ctx, query, req.Email, req.Username).Scan(&userID, &username, &avatarID)

	if err != nil {
		// User doesn't exist, create user
		uuid, err := generateUUID()
		if err != nil {
			log.Printf("OAuth UUID generation error: %v", err)
			WriteError(w, http.StatusInternalServerError, "Failed to generate user ID")
			return
		}
		userID = uuid
		username = req.Username
		avatarID = "Node_02" // default to Node_02 instead of operator-default to make it clean

		insertUserQuery := `INSERT INTO users (id, username, email, password_hash, avatar_id) VALUES ($1, $2, $3, $4, $5)`
		_, err = DB.Exec(ctx, insertUserQuery, userID, username, req.Email, "OAUTH_EXTERNAL_IDENTITY", avatarID)
		if err != nil {
			log.Printf("OAuth SQL insert user error: %v", err)
			WriteError(w, http.StatusInternalServerError, "Database error creating user via OAuth")
			return
		}
	}

	// 2. Link oauth_identity
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
	_, err = DB.Exec(ctx, insertOAuthQuery, oauthUUID, userID, req.Provider, req.ProviderUserID)
	if err != nil {
		log.Printf("OAuth SQL insert link error: %v", err)
		WriteError(w, http.StatusInternalServerError, "Database error linking OAuth identity")
		return
	}

	// 3. Generate JWT token
	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID:   userID,
		Username: username,
		Email:    req.Email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtKey)
	if err != nil {
		log.Printf("OAuth JWT sign error: %v", err)
		WriteError(w, http.StatusInternalServerError, "Failed to sign session token")
		return
	}

	log.Printf("OAuth successfully authenticated operator %s via %s", username, req.Provider)
	WriteJSON(w, http.StatusOK, map[string]string{
		"token":     tokenString,
		"user_id":   userID,
		"username":  username,
		"avatar_id": avatarID,
	})
}
