package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"runtime"
	"time"
)

const (
	heartbeatInterval = 5 * time.Second
	staleHeartbeatAge = 24 * time.Hour
)

func nodeHostname() string {
	h, err := os.Hostname()
	if err != nil {
		return fmt.Sprintf("unknown-host-%d", os.Getpid())
	}
	return h
}

// StartWorkerHeartbeat runs the background heartbeat loop.
// then upserts this instance's telemetry row every heartbeatInterval.
func StartWorkerHeartbeat(ctx context.Context) {
	nodeID := nodeHostname()
	startedAt := time.Now().UTC()

	log.Printf("[HEARTBEAT] starting — node_id=%s interval=%s", nodeID, heartbeatInterval)

	// ── Startup cleanup: remove truly stale rows (renamed/retired hosts) ───
	cleanCtx, cleanCancel := context.WithTimeout(ctx, 10*time.Second)
	defer cleanCancel()

	if _, err := DB.Exec(cleanCtx,
		`DELETE FROM worker_nodes WHERE last_heartbeat < now() - $1::interval`,
		staleHeartbeatAge.String(),
	); err != nil {
		log.Printf("[HEARTBEAT] startup cleanup error (non-fatal): %v", err)
	} else {
		log.Printf("[HEARTBEAT] startup cleanup complete — stale nodes pruned (threshold: %s)", staleHeartbeatAge)
	}

	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("[HEARTBEAT] context cancelled — stopping")
			return
		case <-ticker.C:
			upsertHeartbeat(ctx, nodeID, startedAt)
		}
	}
}

func upsertHeartbeat(ctx context.Context, nodeID string, startedAt time.Time) {
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)

	var gcPauseNs uint64
	if ms.NumGC > 0 {
		gcPauseNs = ms.PauseNs[(ms.NumGC+255)%256]
	}

	_, err := DB.Exec(ctx, `
		INSERT INTO worker_nodes (node_id, last_heartbeat, goroutine_count, mem_alloc_bytes, gc_pause_ns, started_at)
		VALUES ($1, now(), $2, $3, $4, $5)
		ON CONFLICT (node_id) DO UPDATE SET
			last_heartbeat  = EXCLUDED.last_heartbeat,
			goroutine_count = EXCLUDED.goroutine_count,
			mem_alloc_bytes = EXCLUDED.mem_alloc_bytes,
			gc_pause_ns     = EXCLUDED.gc_pause_ns`,
		nodeID,
		runtime.NumGoroutine(),
		int64(ms.Alloc),
		int64(gcPauseNs),
		startedAt,
	)
	if err != nil {
		log.Printf("[HEARTBEAT] upsert failed (non-fatal): %v", err)
	}
}
