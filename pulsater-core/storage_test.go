package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"log/slog"

	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// ─── Helpers ─────────────────────────────────────────────────────────────────

func sha256HexOf(data []byte) string {
	h := sha256.New()
	h.Write(data)
	return hex.EncodeToString(h.Sum(nil))
}

// ─── LocalDiskBackend ────────────────────────────────────────────────────────

func TestLocalDiskBackend_Save_WritesAndRenames(t *testing.T) {
	t.Parallel()
	staging := t.TempDir()
	raw := t.TempDir()
	b := NewLocalDiskBackend(staging, raw, slog.Default())

	payload := "hello pulsater"
	key := "op-abc/ctr-001/test.json"
	url, err := b.Save(context.Background(), key, strings.NewReader(payload), int64(len(payload)))
	if err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	data, err := os.ReadFile(url)
	if err != nil {
		t.Fatalf("ReadFile failed: %v", err)
	}
	if string(data) != payload {
		t.Errorf("got %q want %q", string(data), payload)
	}

	// Staging directory must be empty (atomic rename succeeded).
	entries, _ := os.ReadDir(staging)
	if len(entries) != 0 {
		t.Errorf("staging dir should be empty after rename, got %d entries", len(entries))
	}
}

func TestLocalDiskBackend_Save_CreatesIntermediateDirectories(t *testing.T) {
	t.Parallel()
	staging := t.TempDir()
	raw := t.TempDir()
	b := NewLocalDiskBackend(staging, raw, slog.Default())

	key := "deep/nested/operator/container/file.csv"
	_, err := b.Save(context.Background(), key, strings.NewReader("data"), 4)
	if err != nil {
		t.Fatalf("Save with nested key failed: %v", err)
	}

	finalPath := filepath.Join(raw, filepath.FromSlash(key))
	if _, err := os.Stat(finalPath); os.IsNotExist(err) {
		t.Errorf("expected file at %s but it does not exist", finalPath)
	}
}

func TestLocalDiskBackend_Checksum_MatchesKnownHash(t *testing.T) {
	t.Parallel()
	staging := t.TempDir()
	raw := t.TempDir()
	b := NewLocalDiskBackend(staging, raw, slog.Default())

	payload := "checksum-test-payload"
	wantHash := sha256HexOf([]byte(payload))

	key := "op/ctr/file.bin"
	url, err := b.Save(context.Background(), key, strings.NewReader(payload), int64(len(payload)))
	if err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := b.Checksum(context.Background(), url)
	if err != nil {
		t.Fatalf("Checksum: %v", err)
	}
	if got != wantHash {
		t.Errorf("checksum mismatch: got %s want %s", got, wantHash)
	}
}

func TestLocalDiskBackend_Checksum_DetectsTampering(t *testing.T) {
	t.Parallel()
	staging := t.TempDir()
	raw := t.TempDir()
	b := NewLocalDiskBackend(staging, raw, slog.Default())

	key := "op/ctr/tampered.bin"
	url, err := b.Save(context.Background(), key, strings.NewReader("original"), 8)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}

	original := sha256HexOf([]byte("original"))
	// Tamper with the file.
	if err := os.WriteFile(url, []byte("tampered!"), 0o644); err != nil {
		t.Fatalf("WriteFile (tamper): %v", err)
	}

	recomputed, err := b.Checksum(context.Background(), url)
	if err != nil {
		t.Fatalf("Checksum: %v", err)
	}
	if recomputed == original {
		t.Error("expected checksum mismatch after tampering, but hashes matched")
	}
}

// ─── S3Backend — mock client ──────────────────────────────────────────────────

// mockS3Client satisfies the S3Client interface for unit tests with no AWS calls.
type mockS3Client struct {
	putObjectCalled int
	putObjectErr    error
	headMetadata    map[string]string
}

func (m *mockS3Client) PutObject(_ context.Context, in *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	m.putObjectCalled++
	if m.putObjectErr != nil {
		return nil, m.putObjectErr
	}
	return &s3.PutObjectOutput{}, nil
}

func (m *mockS3Client) HeadObject(_ context.Context, _ *s3.HeadObjectInput, _ ...func(*s3.Options)) (*s3.HeadObjectOutput, error) {
	return &s3.HeadObjectOutput{Metadata: m.headMetadata}, nil
}

func TestS3Backend_Checksum_ReadsMetadata(t *testing.T) {
	want := "abc123deadbeef"
	mock := &mockS3Client{headMetadata: map[string]string{"sha256": want}}
	b := &S3Backend{client: mock, bucket: "test-bucket", log: slog.Default()}

	got, err := b.Checksum(context.Background(), "s3://test-bucket/some/key")
	if err != nil {
		t.Fatalf("Checksum: %v", err)
	}
	if got != want {
		t.Errorf("got %q want %q", got, want)
	}
}

func TestS3Backend_Checksum_NoMetadataReturnsError(t *testing.T) {
	mock := &mockS3Client{headMetadata: map[string]string{}} // no sha256 key
	b := &S3Backend{client: mock, bucket: "test-bucket", log: slog.Default()}

	_, err := b.Checksum(context.Background(), "s3://test-bucket/some/key")
	if err == nil {
		t.Error("expected error when sha256 metadata is missing")
	}
}

// ─── SSEHub ──────────────────────────────────────────────────────────────────

func TestSSEHub_Publish_Delivery(t *testing.T) {
	t.Parallel()
	hub := NewSSEHub(slog.Default())

	ch := hub.Subscribe("op-1")
	defer hub.Unsubscribe("op-1", ch)

	evt := ContainerEvent{ContainerID: "c1", OperatorID: "op-1", ToState: "SYNCED"}
	hub.Publish("op-1", evt)

	select {
	case got := <-ch:
		if got.ContainerID != evt.ContainerID {
			t.Errorf("unexpected event: %+v", got)
		}
	default:
		t.Error("expected event in channel, got none")
	}
}

func TestSSEHub_Publish_OperatorIsolation(t *testing.T) {
	t.Parallel()
	hub := NewSSEHub(slog.Default())

	chA := hub.Subscribe("op-A")
	chB := hub.Subscribe("op-B")
	defer hub.Unsubscribe("op-A", chA)
	defer hub.Unsubscribe("op-B", chB)

	hub.Publish("op-A", ContainerEvent{OperatorID: "op-A", ToState: "SYNCED"})

	select {
	case <-chA:
	default:
		t.Error("op-A channel should have received event")
	}
	select {
	case got := <-chB:
		t.Errorf("op-B should not have received event, got %+v", got)
	default:
	}
}

func TestSSEHub_Backpressure_DoesNotBlockPublisher(t *testing.T) {
	t.Parallel()
	hub := NewSSEHub(slog.Default())
	ch := hub.Subscribe("op-bp")
	defer hub.Unsubscribe("op-bp", ch)

	evt := ContainerEvent{OperatorID: "op-bp", ToState: "PROCESSING"}

	// Publish many more events than the buffer. If Publish blocks, this test will timeout.
	for i := 0; i < sseChannelBuf*3; i++ {
		hub.Publish("op-bp", evt)
	}
	// If we reach here, backpressure worked — publisher was never blocked.
}

// ─── SSE Tickets ─────────────────────────────────────────────────────────────

func TestSSETicket_IssueAndConsume(t *testing.T) {
	t.Parallel()
	ticket, err := issueSSETicket("op-ticket-test")
	if err != nil {
		t.Fatalf("issueSSETicket: %v", err)
	}
	if ticket == "" {
		t.Fatal("empty ticket")
	}

	operatorID, err := validateAndConsumeTicket(ticket)
	if err != nil {
		t.Fatalf("validateAndConsumeTicket: %v", err)
	}
	if operatorID != "op-ticket-test" {
		t.Errorf("got %q want %q", operatorID, "op-ticket-test")
	}

	// Second consume must fail — one-time use only.
	_, err = validateAndConsumeTicket(ticket)
	if err == nil {
		t.Error("expected error on second consume of same ticket (one-time use)")
	}
}

func TestSSETicket_UnknownTicketRejected(t *testing.T) {
	t.Parallel()
	_, err := validateAndConsumeTicket("notavalidticketXXXXXXXXXXXXXXXX")
	if err == nil {
		t.Error("expected error for unknown ticket")
	}
}

func TestSSETicket_Uniqueness(t *testing.T) {
	t.Parallel()
	t1, _ := issueSSETicket("op-u")
	t2, _ := issueSSETicket("op-u")
	if t1 == t2 {
		t.Error("two tickets for same operator should be unique")
	}
	// Clean up.
	_, _ = validateAndConsumeTicket(t1)
	_, _ = validateAndConsumeTicket(t2)
}
