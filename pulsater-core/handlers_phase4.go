package main

// handlers_phase4.go — Phase 4 API handlers:

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/routing/topology
// ─────────────────────────────────────────────────────────────────────────────

type regionStat struct {
	Region       string  `json:"region"`
	Lat          float64 `json:"lat"`
	Lon          float64 `json:"lon"`
	ContainerCount int   `json:"container_count"`
	ActiveCount  int     `json:"active_count"` // PROCESSING state
	NewestEventAt *string `json:"newest_event_at,omitempty"`
}

type topologyResponse struct {
	Regions            []regionStat `json:"regions"`
	SSESubscriberCount int          `json:"sse_subscriber_count"`
}

func HandleRoutingTopology(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "Unauthenticated")
		return
	}

	rows, err := DB.Query(r.Context(), `
		SELECT
			c.origin_region,
			COUNT(*)::INT                                                        AS total,
			SUM(CASE WHEN c.status_state = 'PROCESSING' THEN 1 ELSE 0 END)::INT AS active,
			MAX(e.occurred_at)                                                   AS newest_event
		FROM containers c
		LEFT JOIN container_events e ON e.container_id = c.id
		WHERE c.operator_id = $1
		  AND c.origin_region IS NOT NULL
		  AND c.deleted_at IS NULL
		GROUP BY c.origin_region
	`, claims.UserID)
	if err != nil {
		slog.Error("routing/topology: query failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "Database error")
		return
	}
	defer rows.Close()

	var regions []regionStat
	for rows.Next() {
		var region string
		var total, active int
		var newestEvent *time.Time
		if err := rows.Scan(&region, &total, &active, &newestEvent); err != nil {
			continue
		}
		coord, ok := RegionCoords[region]
		if !ok {
			continue
		}
		rs := regionStat{
			Region:       region,
			Lat:          coord.Lat,
			Lon:          coord.Lon,
			ContainerCount: total,
			ActiveCount:  active,
		}
		if newestEvent != nil {
			s := newestEvent.UTC().Format(time.RFC3339)
			rs.NewestEventAt = &s
		}
		regions = append(regions, rs)
	}
	if regions == nil {
		regions = []regionStat{}
	}

	WriteJSON(w, http.StatusOK, topologyResponse{
		Regions:            regions,
		SSESubscriberCount: GlobalHub.SubscriberCount(claims.UserID),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/cluster/nodes
// ─────────────────────────────────────────────────────────────────────────────

type workerNodeRow struct {
	NodeID         string  `json:"node_id"`
	Status         string  `json:"status"` // "ONLINE" | "OFFLINE"
	LastHeartbeat  string  `json:"last_heartbeat"`
	GoroutineCount *int    `json:"goroutine_count,omitempty"`
	MemAllocBytes  *int64  `json:"mem_alloc_bytes,omitempty"`
	GCPauseNs      *int64  `json:"gc_pause_ns,omitempty"`
	StartedAt      string  `json:"started_at"`
}

type clusterNodesResponse struct {
	Nodes []workerNodeRow `json:"nodes"`
}

const onlineThreshold = 15 * time.Second

const queryWindowForNodes = 60 * time.Second

func HandleClusterNodes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "Unauthenticated")
		return
	}
	_ = claims // endpoint is not operator-scoped (worker telemetry is shared infrastructure)

	rows, err := DB.Query(r.Context(), `
		SELECT node_id, last_heartbeat, goroutine_count, mem_alloc_bytes, gc_pause_ns, started_at
		FROM worker_nodes
		WHERE last_heartbeat > now() - $1::interval
		ORDER BY last_heartbeat DESC
	`, queryWindowForNodes.String())
	if err != nil {
		slog.Error("cluster/nodes: query failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "Database error")
		return
	}
	defer rows.Close()

	var nodes []workerNodeRow
	now := time.Now().UTC()
	for rows.Next() {
		var nodeID string
		var lastHB, startedAt time.Time
		var goroutines *int
		var memAlloc, gcPause *int64
		if err := rows.Scan(&nodeID, &lastHB, &goroutines, &memAlloc, &gcPause, &startedAt); err != nil {
			continue
		}
		status := "OFFLINE"
		if now.Sub(lastHB) <= onlineThreshold {
			status = "ONLINE"
		}
		nodes = append(nodes, workerNodeRow{
			NodeID:         nodeID,
			Status:         status,
			LastHeartbeat:  lastHB.UTC().Format(time.RFC3339),
			GoroutineCount: goroutines,
			MemAllocBytes:  memAlloc,
			GCPauseNs:      gcPause,
			StartedAt:      startedAt.UTC().Format(time.RFC3339),
		})
	}
	if nodes == nil {
		nodes = []workerNodeRow{}
	}

	WriteJSON(w, http.StatusOK, clusterNodesResponse{Nodes: nodes})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/alerts
// ─────────────────────────────────────────────────────────────────────────────

type alertRow struct {
	EventID       string  `json:"event_id"`
	OccurredAt    string  `json:"occurred_at"`
	Severity      string  `json:"severity"`
	ContainerID   string  `json:"container_id"`
	CallsignAlias string  `json:"callsign_alias"`
	OriginRegion  *string `json:"origin_region,omitempty"`
	FromState     *string `json:"from_state,omitempty"`
	ToState       *string `json:"to_state,omitempty"`
	Detail        json.RawMessage `json:"detail,omitempty"`
}

type alertsResponse struct {
	Alerts           []alertRow `json:"alerts"`
	CritAnomalyIndex int        `json:"crit_anomaly_index"` // ERROR events last 24h
	NodeSaturation   float64    `json:"node_saturation"`    // % ONLINE nodes / 8 slots
	TelemetryFlux    int        `json:"telemetry_flux"`     // total events last 24h
}

func HandleAlerts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "Unauthenticated")
		return
	}

	severityParam := strings.TrimSpace(r.URL.Query().Get("severity"))
	var severityFilter []string
	if severityParam != "" {
		for _, s := range strings.Split(severityParam, ",") {
			s = strings.TrimSpace(strings.ToUpper(s))
			if s != "" {
				severityFilter = append(severityFilter, s)
			}
		}
	}

	limit := parseQueryInt(r, "limit", 50)
	if limit > 200 {
		limit = 200
	}
	offset := parseQueryInt(r, "offset", 0)

	where := "WHERE c.operator_id = $1 AND c.deleted_at IS NULL"
	args := []interface{}{claims.UserID}
	argIdx := 2

	if len(severityFilter) > 0 {
		placeholders := make([]string, len(severityFilter))
		for i, sv := range severityFilter {
			placeholders[i] = "$" + intToStr(argIdx)
			args = append(args, sv)
			argIdx++
		}
		where += " AND e.severity IN (" + strings.Join(placeholders, ",") + ")"
	}

	query := `
		SELECT e.event_id, e.occurred_at, e.severity,
		       c.id, c.callsign_alias, c.origin_region,
		       e.from_state, e.to_state, e.detail
		FROM container_events e
		JOIN containers c ON c.id = e.container_id
		` + where + `
		ORDER BY e.occurred_at DESC
		LIMIT $` + intToStr(argIdx) + ` OFFSET $` + intToStr(argIdx+1)

	args = append(args, limit, offset)

	rows, err := DB.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("alerts: query failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "Database error")
		return
	}
	defer rows.Close()

	var alerts []alertRow
	for rows.Next() {
		var a alertRow
		var occurredAt time.Time
		var detail []byte
		if err := rows.Scan(
			&a.EventID, &occurredAt, &a.Severity,
			&a.ContainerID, &a.CallsignAlias, &a.OriginRegion,
			&a.FromState, &a.ToState, &detail,
		); err != nil {
			continue
		}
		a.OccurredAt = occurredAt.UTC().Format(time.RFC3339)
		if len(detail) > 0 {
			a.Detail = json.RawMessage(detail)
		}
		alerts = append(alerts, a)
	}
	if alerts == nil {
		alerts = []alertRow{}
	}

	// ── Summary stats ─────────────────────────────────────────────────────
	// CRIT_ANOMALY_INDEX: ERROR-severity events last 24h for this operator.
	var critCount int
	DB.QueryRow(r.Context(), `
		SELECT COUNT(*)
		FROM container_events e
		JOIN containers c ON c.id = e.container_id
		WHERE c.operator_id = $1 AND c.deleted_at IS NULL
		  AND e.severity = 'ERROR'
		  AND e.occurred_at > now() - interval '24 hours'
	`, claims.UserID).Scan(&critCount)

	var onlineCount int
	DB.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM worker_nodes
		WHERE last_heartbeat > now() - $1::interval
	`, onlineThreshold.String()).Scan(&onlineCount)
	const totalProvisionedSlots = 8
	nodeSat := float64(onlineCount) / float64(totalProvisionedSlots) * 100

	var fluxCount int
	DB.QueryRow(r.Context(), `
		SELECT COUNT(*)
		FROM container_events e
		JOIN containers c ON c.id = e.container_id
		WHERE c.operator_id = $1 AND c.deleted_at IS NULL
		  AND e.occurred_at > now() - interval '24 hours'
	`, claims.UserID).Scan(&fluxCount)

	WriteJSON(w, http.StatusOK, alertsResponse{
		Alerts:           alerts,
		CritAnomalyIndex: critCount,
		NodeSaturation:   nodeSat,
		TelemetryFlux:    fluxCount,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/config
// ─────────────────────────────────────────────────────────────────────────────

type configRow struct {
	Key       string  `json:"key"`
	Value     string  `json:"value"`
	UpdatedAt string  `json:"updated_at"`
	UpdatedBy *string `json:"updated_by,omitempty"`
	ReadOnly  bool    `json:"read_only"`  // true for env-backed values
	Note      string  `json:"note,omitempty"`
}

type configResponse struct {
	Config []configRow `json:"config"`
}

var writableKeys = map[string]struct{}{
	"flush_interval_ms":   {},
	"replication_factor":  {},
	"verbosity_level":     {},
	"goroutine_threshold": {}, // writable but takes no runtime effect — documented
}

var keyNotes = map[string]string{
	"goroutine_threshold": "Display-only: stored for reference, Go scheduler manages goroutine count at runtime.",
	"flush_interval_ms":   "Effective at next worker poll tick (≤5s latency).",
	"replication_factor":  "Stored for reference; no active replication engine in this deployment.",
	"verbosity_level":     "Applied to worker log level within 10s (config cache TTL).",
}

func HandleConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "Unauthenticated")
		return
	}

	rows, err := DB.Query(r.Context(), `
		SELECT config_key, config_value, updated_at, updated_by::TEXT
		FROM app_config ORDER BY config_key`)
	if err != nil {
		slog.Error("config: query failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "Database error")
		return
	}
	defer rows.Close()

	var configs []configRow
	for rows.Next() {
		var key, value string
		var updatedAt time.Time
		var updatedBy *string
		if err := rows.Scan(&key, &value, &updatedAt, &updatedBy); err != nil {
			continue
		}
		_, isWritable := writableKeys[key]
		configs = append(configs, configRow{
			Key:       key,
			Value:     value,
			UpdatedAt: updatedAt.UTC().Format(time.RFC3339),
			UpdatedBy: updatedBy,
			ReadOnly:  !isWritable,
			Note:      keyNotes[key],
		})
	}

	configs = append(configs,
		configRow{
			Key:      "storage_backend",
			Value:    storageBackendLabel(),
			ReadOnly: true,
			Note:     "Env-backed (STORAGE_BACKEND). Requires process restart to change.",
		},
		configRow{
			Key:      "storage_raw_dir",
			Value:    storageRawDir(),
			ReadOnly: true,
			Note:     "Env-backed (STORAGE_RAW_DIR / UPLOAD_DIR). Changing live would corrupt in-flight uploads.",
		},
	)

	if configs == nil {
		configs = []configRow{}
	}
	WriteJSON(w, http.StatusOK, configResponse{Config: configs})
}

func storageBackendLabel() string {
	b := strings.ToLower(strings.TrimSpace(os.Getenv("STORAGE_BACKEND")))
	if b == "s3" {
		return "s3"
	}
	return "local"
}

func storageRawDir() string {
	if d := strings.TrimSpace(os.Getenv("STORAGE_RAW_DIR")); d != "" {
		return d
	}
	if d := strings.TrimSpace(os.Getenv("UPLOAD_DIR")); d != "" {
		return d
	}
	return "./uploads"
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/config/{key}
// ─────────────────────────────────────────────────────────────────────────────
//

func HandleConfigKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "Unauthenticated")
		return
	}

	// ── Admin gate ────────────────────────────────────────────────────────
	adminID := strings.TrimSpace(os.Getenv("ADMIN_OPERATOR_ID"))
	if adminID == "" {
		WriteError(w, http.StatusServiceUnavailable,
			"Config mutation is not enabled — ADMIN_OPERATOR_ID is not configured")
		return
	}
	if claims.UserID != adminID {
		WriteError(w, http.StatusForbidden,
			"Config mutation requires admin privileges")
		return
	}

	key := strings.TrimPrefix(r.URL.Path, "/api/v1/config/")
	key = strings.TrimSpace(key)
	if key == "" {
		WriteError(w, http.StatusBadRequest, "Missing config key in path")
		return
	}
	if _, ok := writableKeys[key]; !ok {
		WriteError(w, http.StatusBadRequest, "Config key is read-only or unknown: "+key)
		return
	}

	var body struct {
		Value string `json:"value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	body.Value = strings.TrimSpace(body.Value)
	if body.Value == "" {
		WriteError(w, http.StatusBadRequest, "config value must not be empty")
		return
	}

	_, err := DB.Exec(r.Context(), `
		INSERT INTO app_config (config_key, config_value, updated_at, updated_by)
		VALUES ($1, $2, now(), $3::UUID)
		ON CONFLICT (config_key) DO UPDATE SET
			config_value = EXCLUDED.config_value,
			updated_at   = EXCLUDED.updated_at,
			updated_by   = EXCLUDED.updated_by`,
		key, body.Value, claims.UserID)
	if err != nil {
		slog.Error("config PUT: upsert failed", "key", key, "error", err)
		WriteError(w, http.StatusInternalServerError, "Database error")
		return
	}

	slog.Info("config updated", "key", key, "by", claims.UserID)
	WriteJSON(w, http.StatusOK, map[string]string{
		"key":   key,
		"value": body.Value,
		"note":  keyNotes[key],
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

func intToStr(n int) string {
	return strconv.Itoa(n)
}
