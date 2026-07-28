package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// ---------------------------------------------------------------------------
// ContainerEvent — the payload broadcast to SSE subscribers
// ---------------------------------------------------------------------------

type ContainerEvent struct {
	ContainerID  string `json:"container_id"`
	OperatorID   string `json:"operator_id"`
	CallsignAlias string `json:"callsign_alias"`
	FromState    string `json:"from_state,omitempty"`
	ToState      string `json:"to_state"`
	OccurredAt   string `json:"occurred_at"` // RFC3339
	Detail       string `json:"detail,omitempty"`
}

// ---------------------------------------------------------------------------
// SSEHub — operator-scoped fan-out, buffered with non-blocking publish
// ---------------------------------------------------------------------------

const (
	sseChannelBuf      = 32 // per-subscriber buffer depth
	sseMaxConsecDrops  = 16 // consecutive drop threshold before disconnecting slow client
)

type SSEHub struct {
	mu   sync.RWMutex
	subs map[string][]sseSubscriber // keyed by operatorID
	log  *slog.Logger
}

type sseSubscriber struct {
	ch    chan ContainerEvent
	drops int // consecutive drop count
}

func NewSSEHub(log *slog.Logger) *SSEHub {
	return &SSEHub{
		subs: make(map[string][]sseSubscriber),
		log:  log,
	}
}

var GlobalHub *SSEHub

func (h *SSEHub) Subscribe(operatorID string) chan ContainerEvent {
	ch := make(chan ContainerEvent, sseChannelBuf)
	h.mu.Lock()
	h.subs[operatorID] = append(h.subs[operatorID], sseSubscriber{ch: ch})
	h.mu.Unlock()
	h.log.Info("sse: subscriber added", "operator_id", operatorID)
	return ch
}

func (h *SSEHub) Unsubscribe(operatorID string, ch chan ContainerEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	subs := h.subs[operatorID]
	remaining := subs[:0]
	for _, s := range subs {
		if s.ch == ch {
			close(s.ch)
			h.log.Info("sse: subscriber removed", "operator_id", operatorID)
		} else {
			remaining = append(remaining, s)
		}
	}
	if len(remaining) == 0 {
		delete(h.subs, operatorID)
	} else {
		h.subs[operatorID] = remaining
	}
}

func (h *SSEHub) Publish(operatorID string, event ContainerEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()

	subs, ok := h.subs[operatorID]
	if !ok {
		return
	}

	surviving := subs[:0]
	for i := range subs {
		s := &subs[i]
		select {
		case s.ch <- event:
			s.drops = 0 // successful send — reset drop counter
			surviving = append(surviving, *s)
		default:
			select {
			case <-s.ch: // drain oldest
			default:
			}
			select {
			case s.ch <- event:
				s.drops++
				h.log.Warn("sse: dropped event for slow subscriber",
					"operator_id", operatorID,
					"consecutive_drops", s.drops,
					"to_state", event.ToState,
				)
				if s.drops < sseMaxConsecDrops {
					surviving = append(surviving, *s)
				} else {
					h.log.Warn("sse: evicting slow subscriber",
						"operator_id", operatorID,
						"drops", s.drops,
					)
					close(s.ch) // signal SSE handler to close the connection
				}
			default:
				h.log.Warn("sse: evicting unresponsive subscriber", "operator_id", operatorID)
				close(s.ch)
			}
		}
	}
	h.subs[operatorID] = surviving
	if len(surviving) == 0 {
		delete(h.subs, operatorID)
	}
}

func (h *SSEHub) SubscriberCount(operatorID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subs[operatorID])
}

// ---------------------------------------------------------------------------
// SSE Ticket Store — one-time short-lived tokens (Fix #1)
// ---------------------------------------------------------------------------

const sseTicketTTL = 30 * time.Second

type sseTicketEntry struct {
	operatorID string
	issuedAt   time.Time
}

var (
	sseTicketMu    sync.Mutex
	sseTicketStore = make(map[string]sseTicketEntry)
)

func issueSSETicket(operatorID string) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("sse: ticket generation failed: %w", err)
	}
	ticket := hex.EncodeToString(b)

	sseTicketMu.Lock()
	sseTicketStore[ticket] = sseTicketEntry{operatorID: operatorID, issuedAt: time.Now()}
	sseTicketMu.Unlock()

	return ticket, nil
}

func validateAndConsumeTicket(ticket string) (string, error) {
	sseTicketMu.Lock()
	entry, ok := sseTicketStore[ticket]
	if ok {
		delete(sseTicketStore, ticket) // one-time use
	}
	sseTicketMu.Unlock()

	if !ok {
		return "", fmt.Errorf("sse: unknown or already-used ticket")
	}
	if time.Since(entry.issuedAt) > sseTicketTTL {
		return "", fmt.Errorf("sse: ticket expired")
	}
	return entry.operatorID, nil
}

// startTicketGC runs a background goroutine that purges expired tickets
// that were never consumed (tab closed before EventSource connected, etc.).
func startTicketGC() {
	go func() {
		for range time.NewTicker(sseTicketTTL).C {
			sseTicketMu.Lock()
			for ticket, entry := range sseTicketStore {
				if time.Since(entry.issuedAt) > sseTicketTTL {
					delete(sseTicketStore, ticket)
				}
			}
			sseTicketMu.Unlock()
		}
	}()
}
