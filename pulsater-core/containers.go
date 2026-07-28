package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

// Container Provisioning — Request / Response Types

type ProvisionRequest struct {
	ContainerDesignation string `json:"container_designation"`
	IngestionTargetDB    string `json:"ingestion_target_db"`
	HostPortMapping      string `json:"host_port_mapping"`
}

// ProvisionContainerHandler — POST /api/v1/containers/provision

func ProvisionContainerHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "Unauthenticated request — claims missing from context")
		return
	}

	var req ProvisionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.ContainerDesignation = strings.TrimSpace(req.ContainerDesignation)
	req.IngestionTargetDB = strings.TrimSpace(req.IngestionTargetDB)
	req.HostPortMapping = strings.TrimSpace(req.HostPortMapping)

	if req.ContainerDesignation == "" || req.IngestionTargetDB == "" || req.HostPortMapping == "" {
		WriteError(w, http.StatusBadRequest, "container_designation, ingestion_target_db, and host_port_mapping are all required")
		return
	}

	insertQuery := `
	INSERT INTO containers (user_id, designation, ingestion_target_db, host_port_mapping, status)
	VALUES ($1, $2, $3, $4, 'PROVISIONED')
	RETURNING id
	`

	var containerID string
	err := DB.QueryRow(
		context.Background(),
		insertQuery,
		claims.UserID,
		req.ContainerDesignation,
		req.IngestionTargetDB,
		req.HostPortMapping,
	).Scan(&containerID)

	if err != nil {
		log.Printf("SQL container insert error for user %s: %v", claims.UserID, err)
		WriteError(w, http.StatusInternalServerError, "Database error during container provisioning")
		return
	}

	log.Printf(
		"Container provisioned: id=%s designation=%s db=%s ports=%s operator=%s",
		containerID, req.ContainerDesignation, req.IngestionTargetDB, req.HostPortMapping, claims.Username,
	)

	WriteJSON(w, http.StatusCreated, map[string]string{
		"status":       "provisioned",
		"container_id": containerID,
		"designation":  req.ContainerDesignation,
		"operator":     claims.Username,
	})
}
