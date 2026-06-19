package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/joho/godotenv"
)

func main() {
	log.Println("Initializing HYPERVISOR_PULSATER core auth backend...")

	if err := godotenv.Load(); err != nil {
		log.Println("Warning: No .env file found, reading system environment instead.")
	}

	LoadEnv(".env")

	initOAuth()

	if err := InitDB(); err != nil {
		log.Fatalf("Fatal: Database initialization failed: %v", err)
	}
	defer DB.Close()

	if err := runMigrations(); err != nil {
		log.Fatalf("Fatal: Database migrations failed: %v", err)
	}

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
	migrationQuery := `
	CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

	_, err := DB.Exec(context.Background(), migrationQuery)
	if err != nil {
		return err
	}

	log.Println("Database schemas verified (users, oauth_identities, containers tables active).")
	return nil
}