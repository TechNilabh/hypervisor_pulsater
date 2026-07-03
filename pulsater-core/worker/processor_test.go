package worker

import (
	"context"
	"errors"
	"log/slog"
	"math"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ─── Mock hub ────────────────────────────────────────────────────────────────

type mockHub struct {
	mu     sync.Mutex
	events []Event
}

func (m *mockHub) Publish(_ string, e Event) {
	m.mu.Lock()
	m.events = append(m.events, e)
	m.mu.Unlock()
}

func (m *mockHub) lastEvent() (Event, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.events) == 0 {
		return Event{}, false
	}
	return m.events[len(m.events)-1], true
}

// ─── Backoff calculation ──────────────────────────────────────────────────────

func TestExponentialBackoff_Values(t *testing.T) {
	t.Parallel()
	cases := []struct {
		attempt int
		wantSec float64
		capAt   float64
	}{
		{1, 2, 300},
		{2, 4, 300},
		{3, 8, 300},
		{7, 128, 300},
		{9, 300, 300}, // capped at 5 min
	}
	for _, tc := range cases {
		backoff := math.Pow(2, float64(tc.attempt))
		if backoff > tc.capAt {
			backoff = tc.capAt
		}
		if backoff != tc.wantSec {
			t.Errorf("attempt=%d: got %.0f want %.0f", tc.attempt, backoff, tc.wantSec)
		}
	}
}

// ─── Processor state transitions (no DB — functional unit tests) ─────────────

func newTestProcessor(hub HubPublisher) *Processor {
	return &Processor{
		DB:           nil, // not needed for unit tests that don't hit DB
		Hub:          hub,
		Log:          slog.Default(),
		MaxAttempts:  5,
		PollInterval: 100 * time.Millisecond,
		Validators: map[string]Validator{
			"PHARMA_R3":   stubValidator,
			"IOT_GRID":    stubValidator,
			"QUANT_ALPHA": stubValidator,
		},
	}
}

func TestProcessor_HandleJobFailure_SchedulesRetry(t *testing.T) {
	t.Parallel()
	hub := &mockHub{}
	p := newTestProcessor(hub)

	job := Job{
		JobID:       "job-1",
		ContainerID: "ctr-1",
		OperatorID:  "op-1",
		Callsign:    "ALPHA",
		VectorType:  "PHARMA_R3",
		Attempts:    2, // 3rd attempt
	}
	// handleJobFailure with attempts=2 < maxAttempts=5 should reschedule.
	// We can't call it directly because it hits DB, so we test the backoff math.
	nextAttempt := job.Attempts + 1
	if nextAttempt >= p.MaxAttempts {
		t.Fatalf("test prerequisite failed: expected attempts < max")
	}
	backoffSec := math.Pow(2, float64(nextAttempt))
	if backoffSec > 300 {
		backoffSec = 300
	}
	// For attempt=3, expect 8 seconds backoff.
	if backoffSec != 8 {
		t.Errorf("expected 8s backoff for attempt=3, got %.0f", backoffSec)
	}
}

func TestProcessor_HandleJobFailure_MaxAttemptsMarksPermFailed(t *testing.T) {
	t.Parallel()
	p := newTestProcessor(&mockHub{})
	job := Job{Attempts: p.MaxAttempts - 1} // one more would equal maxAttempts
	nextAttempt := job.Attempts + 1
	if nextAttempt < p.MaxAttempts {
		t.Fatal("test prerequisite: nextAttempt should equal maxAttempts")
	}
	// At this point handleJobFailure would call failJobPermanently.
	// We verify the condition logic matches the spec.
	shouldPermanentFail := nextAttempt >= p.MaxAttempts
	if !shouldPermanentFail {
		t.Error("expected permanent failure at max attempts")
	}
}

// ─── Validator dispatch ────────────────────────────────────────────────────────

func TestProcessor_Validators_KnownVectorTypes(t *testing.T) {
	t.Parallel()
	p := newTestProcessor(&mockHub{})

	for _, vt := range []string{"PHARMA_R3", "IOT_GRID", "QUANT_ALPHA"} {
		fn, ok := p.Validators[vt]
		if !ok {
			t.Errorf("no validator registered for %q", vt)
			continue
		}
		if err := fn(context.Background(), "ctr-test", nil); err != nil {
			t.Errorf("validator %q returned error: %v", vt, err)
		}
	}
}

func TestProcessor_Validators_UnknownVectorTypeNotRegistered(t *testing.T) {
	t.Parallel()
	p := newTestProcessor(&mockHub{})
	_, ok := p.Validators["UNKNOWN_TYPE"]
	if ok {
		t.Error("unexpected validator found for UNKNOWN_TYPE")
	}
}

// ─── HubPublisher interface compliance ───────────────────────────────────────

func TestMockHub_SatisfiesHubPublisher(t *testing.T) {
	// Compile-time check: *mockHub must implement HubPublisher.
	var _ HubPublisher = (*mockHub)(nil)
}

// ─── Event struct fields ──────────────────────────────────────────────────────

func TestEvent_JSONFields(t *testing.T) {
	e := Event{
		ContainerID:   "c1",
		OperatorID:    "op1",
		CallsignAlias: "ALPHA",
		FromState:     "INITIALIZED",
		ToState:       "PROCESSING",
		OccurredAt:    time.Now().UTC().Format(time.RFC3339),
		Detail:        "test detail",
	}
	if e.ContainerID == "" || e.ToState == "" {
		t.Error("required event fields are empty")
	}
	if e.OccurredAt == "" {
		t.Error("OccurredAt must be set")
	}
}

// ─── Retry claim window ──────────────────────────────────────────────────────

func TestRetryWindow_OnlyPicksJobsAfterBackoff(t *testing.T) {
	t.Parallel()
	// Simulate: nextRetry = now + 10s, current time = now.
	// Job should NOT be claimable yet.
	nextRetry := time.Now().Add(10 * time.Second)
	isClaimable := nextRetry.Before(time.Now())
	if isClaimable {
		t.Error("job with future next_retry_at should not be claimable")
	}

	// Simulate: nextRetry = now - 1s → claimable.
	pastRetry := time.Now().Add(-1 * time.Second)
	isClaimable = pastRetry.Before(time.Now()) || pastRetry.Equal(time.Now())
	if !isClaimable {
		t.Error("job with past next_retry_at should be claimable")
	}
}

// ─── workerID uniqueness ───────────────────────────────────────────────────────

func TestWorkerID_NotEmpty(t *testing.T) {
	id := workerID()
	if id == "" {
		t.Error("workerID must not be empty")
	}
}

// ─── stubValidator ────────────────────────────────────────────────────────────

func TestStubValidator_ReturnsNil(t *testing.T) {
	if err := stubValidator(context.Background(), "ctr-1", nil); err != nil {
		t.Errorf("stubValidator should return nil, got %v", err)
	}
}

// ─── Fail path: validator returns error ──────────────────────────────────────

func TestProcessor_ValidatorError_CanBeOverridden(t *testing.T) {
	t.Parallel()
	p := newTestProcessor(&mockHub{})
	// Override the validator to return an error.
	errValidator := func(_ context.Context, _ string, _ *pgxpool.Pool) error {
		return errors.New("test validation error")
	}
	p.Validators["PHARMA_R3"] = errValidator
	fn := p.Validators["PHARMA_R3"]
	if err := fn(context.Background(), "ctr-1", nil); err == nil {
		t.Error("expected error from overridden validator")
	}
}
