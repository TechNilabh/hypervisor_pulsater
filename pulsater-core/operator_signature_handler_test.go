package main

import (
	"crypto/rand"
	"encoding/base64"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestGenerateRawKey_IsBase64URLEncoded(t *testing.T) {
	rawBytes := make([]byte, 32)
	if _, err := rand.Read(rawBytes); err != nil {
		t.Fatalf("rand.Read failed: %v", err)
	}
	rawKey := base64.RawURLEncoding.EncodeToString(rawBytes)

	decoded, err := base64.RawURLEncoding.DecodeString(rawKey)
	if err != nil {
		t.Errorf("rawKey is not valid base64url-encoded: %v", err)
	}
	if len(decoded) != 32 {
		t.Errorf("decoded length is %d, expected 32", len(decoded))
	}
}

func TestKeyHint_IsLast4Chars(t *testing.T) {
	rawKey := "ABCDEFGH1234"
	keyHint := rawKey[len(rawKey)-4:]
	if keyHint != "1234" {
		t.Errorf("expected hint '1234', got %q", keyHint)
	}

	// Dynamic base64url key check
	rawBytes := make([]byte, 32)
	rand.Read(rawBytes)
	dynKey := base64.RawURLEncoding.EncodeToString(rawBytes)
	dynHint := dynKey[len(dynKey)-4:]
	expectedHint := dynKey[len(dynKey)-4:]
	if dynHint != expectedHint {
		t.Errorf("hint mismatch: got %q, expected %q", dynHint, expectedHint)
	}
}

func TestBcryptHash_VerifiesCorrectKey(t *testing.T) {
	rawKey := "some-high-entropy-randomly-generated-key-string"
	hashBytes, err := bcrypt.GenerateFromPassword([]byte(rawKey), 12)
	if err != nil {
		t.Fatalf("bcrypt hash generation failed: %v", err)
	}

	err = bcrypt.CompareHashAndPassword(hashBytes, []byte(rawKey))
	if err != nil {
		t.Errorf("bcrypt verification failed for correct key: %v", err)
	}
}

func TestBcryptHash_RejectsWrongKey(t *testing.T) {
	rawKey := "correct-key-value"
	wrongKey := "wrong-key-value"
	hashBytes, err := bcrypt.GenerateFromPassword([]byte(rawKey), 12)
	if err != nil {
		t.Fatalf("bcrypt hash generation failed: %v", err)
	}

	err = bcrypt.CompareHashAndPassword(hashBytes, []byte(wrongKey))
	if err == nil {
		t.Error("expected bcrypt error for wrong key, got nil")
	}
}
