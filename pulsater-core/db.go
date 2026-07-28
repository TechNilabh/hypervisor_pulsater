package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

var DB *pgxpool.Pool

func LoadEnv(filePath string) {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return
	}
	lines := strings.Split(string(content), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if len(line) == 0 || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			if len(val) >= 2 && (val[0] == '"' && val[len(val)-1] == '"' || val[0] == '\'' && val[len(val)-1] == '\'') {
				val = val[1 : len(val)-1]
			}
			os.Setenv(key, val)
		}
	}
}

func InitDB() error {
	host := os.Getenv("DB_HOST")
	if host == "" {
		host = "localhost"
	}
	port := os.Getenv("DB_PORT")
	if port == "" {
		port = "5432"
	}
	user := os.Getenv("DB_USER")
	if user == "" {
		user = "postgres"
	}
	password := os.Getenv("DB_PASSWORD")
	if password == "" {
		password = "postgres"
	}
	dbname := os.Getenv("DB_NAME")
	if dbname == "" {
		dbname = "postgres"
	}

	// connStr := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", user, password, host, port, dbname)
	// log.Printf("Connecting to database: postgres://%s:****@%s:%s/%s", user, host, port, dbname)
	// // 1. Try to read the combined string from Render's environment variables
	connStr := os.Getenv("DATABASE_URL")

	// 2. If it's empty, fall back to your local manual construction format
	if connStr == "" {
		connStr = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", user, password, host, port, dbname)
		log.Printf("Connecting to LOCAL database: postgres://%s:****@%s:%s/%s", user, host, port, dbname)
	} else {
		log.Println("Connecting to CLOUD database via environment connection pool...")
	}
	config, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		return fmt.Errorf("unable to parse connection string: %w", err)
	}

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return fmt.Errorf("unable to create connection pool: %w", err)
	}

	err = pool.Ping(context.Background())
	if err != nil {
		return fmt.Errorf("unable to ping database: %w", err)
	}

	DB = pool
	log.Println("Database connection pool established successfully.")
	return nil
}
