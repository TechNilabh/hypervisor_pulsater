package main

import (
	"context"
	"log"
	"net/http"
	"os"
)

func main() {
	log.Println("Initializing HYPERVISOR_PULSATER core auth backend...")

	// Attempt to load .env file if present
	LoadEnv(".env")

	// Connect to Database
	if err := InitDB(); err != nil {
		log.Fatalf("Fatal: Database initialization failed: %v", err)
	}
	defer DB.Close()

	// Run migration to auto-create user schema
	if err := runMigrations(); err != nil {
		log.Fatalf("Fatal: Database migrations failed: %v", err)
	}

	// Create request router multiplexer
	mux := http.NewServeMux()

	// Bind endpoints
	mux.HandleFunc("/api/v1/auth/signup", SignupHandler)
	mux.HandleFunc("/api/v1/auth/login", LoginHandler)
	mux.HandleFunc("/api/v1/users/avatar", UpdateAvatarHandler)
	mux.HandleFunc("/api/v1/auth/oauth", OAuthHandler)

	// Wrap multiplexer with CORS middleware
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

// runMigrations auto-creates tables if they do not exist
func runMigrations() error {
	migrationQuery := `
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
	`
	_, err := DB.Exec(context.Background(), migrationQuery)
	if err != nil {
		return err
	}
	log.Println("Database schemas verified (tables 'users' and 'oauth_identities' are active).")
	return nil
}
