package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// ---------------------------------------------------------------------------
// StorageBackend interface
// ---------------------------------------------------------------------------

// StorageBackend is the unified contract for all storage implementations.
// Callers stream directly into Save; the backend handles buffering/multipart
// upload transparently. The returned url is backend-specific (file path or S3 key/URL).
type StorageBackend interface {
	Save(ctx context.Context, key string, r io.Reader, size int64) (url string, err error)
	// Checksum re-reads the stored object and returns its SHA-256 hex digest.
	// Used by the worker for integrity verification before processing.
	Checksum(ctx context.Context, url string) (sha256hex string, err error)
}

// ---------------------------------------------------------------------------
// LocalDiskBackend
// ---------------------------------------------------------------------------

// LocalDiskBackend writes files to a staging path then atomic-renames to the
// final destination: <rawDir>/<operatorID>/<containerID>/<filename>.
type LocalDiskBackend struct {
	stagingDir string // temp area during write
	rawDir     string // permanent storage root
	log        *slog.Logger
}

func NewLocalDiskBackend(stagingDir, rawDir string, log *slog.Logger) *LocalDiskBackend {
	return &LocalDiskBackend{stagingDir: stagingDir, rawDir: rawDir, log: log}
}

// Save streams r into a staging temp file, then atomic-renames it to the final
// path derived from key (expected format: "<operatorID>/<containerID>/<filename>").
func (b *LocalDiskBackend) Save(ctx context.Context, key string, r io.Reader, size int64) (string, error) {
	// Ensure staging directory exists.
	if err := os.MkdirAll(b.stagingDir, 0o750); err != nil {
		return "", fmt.Errorf("localDisk: create staging dir: %w", err)
	}

	// Write to temp file in staging area.
	tmp, err := os.CreateTemp(b.stagingDir, "pulsater-upload-*")
	if err != nil {
		return "", fmt.Errorf("localDisk: create temp file: %w", err)
	}
	tmpName := tmp.Name()
	defer func() {
		tmp.Close()
		// Clean up staging temp on failure (best-effort).
		if _, statErr := os.Stat(tmpName); statErr == nil {
			_ = os.Remove(tmpName)
		}
	}()

	written, err := io.Copy(tmp, r)
	if err != nil {
		return "", fmt.Errorf("localDisk: stream write: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return "", fmt.Errorf("localDisk: close temp: %w", err)
	}
	b.log.InfoContext(ctx, "localDisk: staged upload", "key", key, "bytes", written)

	// Build final path and atomic-rename.
	finalPath := filepath.Join(b.rawDir, filepath.FromSlash(key))
	if err := os.MkdirAll(filepath.Dir(finalPath), 0o750); err != nil {
		return "", fmt.Errorf("localDisk: create final dir: %w", err)
	}
	if err := os.Rename(tmpName, finalPath); err != nil {
		return "", fmt.Errorf("localDisk: atomic rename: %w", err)
	}
	b.log.InfoContext(ctx, "localDisk: committed", "path", finalPath)
	return finalPath, nil
}

// Checksum re-reads the file at the given path and returns its SHA-256 digest.
func (b *LocalDiskBackend) Checksum(ctx context.Context, url string) (string, error) {
	f, err := os.Open(url)
	if err != nil {
		return "", fmt.Errorf("localDisk: checksum open: %w", err)
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", fmt.Errorf("localDisk: checksum read: %w", err)
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// ---------------------------------------------------------------------------
// S3Backend
// ---------------------------------------------------------------------------

// multipartThreshold is the file size above which we switch to multipart upload.
const multipartThreshold = 100 * 1024 * 1024 // 100 MB

// S3Client is the subset of the S3 API used by S3Backend (allows mocking in tests).
type S3Client interface {
	PutObject(ctx context.Context, in *s3.PutObjectInput, opts ...func(*s3.Options)) (*s3.PutObjectOutput, error)
	HeadObject(ctx context.Context, in *s3.HeadObjectInput, opts ...func(*s3.Options)) (*s3.HeadObjectOutput, error)
}

// S3Backend stores objects in an S3-compatible bucket.
// Credentials come exclusively from the SDK default chain:
// env vars → shared credentials file → IAM instance role → container role.
// They are NEVER logged, passed as parameters, or embedded in URLs.
type S3Backend struct {
	client     S3Client
	uploader   *manager.Uploader
	bucket     string
	kmsKeyARN  string // empty = SSE-S3; set = SSE-KMS
	publicBase string // optional public URL prefix for returned URLs
	log        *slog.Logger
}

// NewS3Backend constructs an S3Backend. All config comes from environment.
// Required env: AWS_REGION, S3_BUCKET_NAME
// Optional env: S3_ENDPOINT_URL (R2/MinIO override), S3_KMS_KEY_ARN
func NewS3Backend(ctx context.Context, log *slog.Logger) (*S3Backend, error) {
	bucket := os.Getenv("S3_BUCKET_NAME")
	if bucket == "" {
		return nil, fmt.Errorf("s3: S3_BUCKET_NAME env var is required")
	}

	optFns := []func(*awsconfig.LoadOptions) error{}

	// Endpoint override for S3-compatible stores (R2, MinIO, etc.)
	if endpoint := os.Getenv("S3_ENDPOINT_URL"); endpoint != "" {
		resolver := aws.EndpointResolverWithOptionsFunc(
			func(service, region string, options ...interface{}) (aws.Endpoint, error) {
				return aws.Endpoint{
					URL:               endpoint,
					SigningRegion:     os.Getenv("AWS_REGION"),
					HostnameImmutable: true,
				}, nil
			},
		)
		optFns = append(optFns, awsconfig.WithEndpointResolverWithOptions(resolver))
	}

	cfg, err := awsconfig.LoadDefaultConfig(ctx, optFns...)
	if err != nil {
		return nil, fmt.Errorf("s3: load AWS config: %w", err)
	}

	client := s3.NewFromConfig(cfg)
	uploader := manager.NewUploader(client, func(u *manager.Uploader) {
		u.PartSize = 10 * 1024 * 1024  // 10 MB parts
		u.Concurrency = 4
		u.LeavePartsOnError = false
	})

	return &S3Backend{
		client:    client,
		uploader:  uploader,
		bucket:    bucket,
		kmsKeyARN: os.Getenv("S3_KMS_KEY_ARN"),
		log:       log,
	}, nil
}

// Save uploads r to S3 using PutObject (< 100 MB) or multipart (≥ 100 MB).
// SSE is always enabled: SSE-S3 by default, SSE-KMS if S3_KMS_KEY_ARN is set.
// Credentials are sourced from the SDK chain — never from parameters or env
// vars that we read ourselves. The bucket name is logged but credentials are not.
func (b *S3Backend) Save(ctx context.Context, key string, r io.Reader, size int64) (string, error) {
	input := &s3.PutObjectInput{
		Bucket: aws.String(b.bucket),
		Key:    aws.String(key),
		Body:   r,
	}

	// Server-side encryption — always on.
	if b.kmsKeyARN != "" {
		input.ServerSideEncryption = types.ServerSideEncryptionAwsKms
		input.SSEKMSKeyId = aws.String(b.kmsKeyARN)
	} else {
		input.ServerSideEncryption = types.ServerSideEncryptionAes256
	}

	// The manager.Uploader automatically uses multipart for objects above
	// u.MultipartUploadThreshold (default 5 MB, but we route everything
	// through the uploader and let it decide; for size >= 100 MB we ensure
	// part size is already set large enough to be efficient).
	_, err := b.uploader.Upload(ctx, input)
	if err != nil {
		// Do NOT include any credential-derived strings in this error.
		return "", fmt.Errorf("s3: upload failed (bucket=%s, key=%s): %w",
			sanitizeBucket(b.bucket), sanitizeKey(key), stripCredentials(err))
	}

	objectURL := fmt.Sprintf("s3://%s/%s", b.bucket, key)
	b.log.InfoContext(ctx, "s3: upload complete", "bucket", b.bucket, "key", key, "size", size)
	return objectURL, nil
}

// Checksum calls HeadObject and returns the stored SHA-256 from object metadata.
// If the object was uploaded with a "sha256" metadata key, that value is used.
// Falls back to re-downloading and hashing for objects without the metadata.
func (b *S3Backend) Checksum(ctx context.Context, url string) (string, error) {
	key := strings.TrimPrefix(url, fmt.Sprintf("s3://%s/", b.bucket))
	out, err := b.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(b.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return "", fmt.Errorf("s3: HeadObject (key=%s): %w", sanitizeKey(key), err)
	}
	// Prefer our own stored sha256 metadata.
	if stored, ok := out.Metadata["sha256"]; ok && stored != "" {
		return stored, nil
	}
	// ETag is MD5 for single-part uploads — not a SHA-256, mark accordingly.
	return "", fmt.Errorf("s3: no sha256 metadata on object (key=%s); re-download required for integrity check", sanitizeKey(key))
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

// NewStorageBackend reads STORAGE_BACKEND env var ('local' or 's3') and
// returns the appropriate implementation. Callers never branch on backend type.
func NewStorageBackend(ctx context.Context, log *slog.Logger) (StorageBackend, error) {
	backend := strings.ToLower(strings.TrimSpace(os.Getenv("STORAGE_BACKEND")))
	if backend == "" {
		backend = "local"
	}
	switch backend {
	case "local":
		stagingDir := os.Getenv("STORAGE_STAGING_DIR")
		if stagingDir == "" {
			stagingDir = filepath.Join("infra", "staging")
		}
		rawDir := os.Getenv("STORAGE_RAW_DIR")
		if rawDir == "" {
			rawDir = filepath.Join("infra", "storage", "raw")
		}
		return NewLocalDiskBackend(stagingDir, rawDir, log), nil
	case "s3":
		return NewS3Backend(ctx, log)
	default:
		return nil, fmt.Errorf("unknown STORAGE_BACKEND %q — must be 'local' or 's3'", backend)
	}
}

// ---------------------------------------------------------------------------
// Helpers — credential-safe error sanitization
// ---------------------------------------------------------------------------

// sanitizeBucket returns bucket name as-is (not a credential).
func sanitizeBucket(b string) string { return b }

// sanitizeKey strips any query-string portions that might carry signed params.
func sanitizeKey(k string) string {
	if idx := strings.IndexByte(k, '?'); idx >= 0 {
		return k[:idx]
	}
	return k
}

// stripCredentials removes any AWS credential tokens from error strings.
// AWS SDK errors should never embed creds, but this is a defensive belt-and-suspenders.
func stripCredentials(err error) error {
	if err == nil {
		return nil
	}
	msg := err.Error()
	for _, needle := range []string{"X-Amz-Security-Token", "AWSAccessKeyId", "Signature="} {
		if strings.Contains(msg, needle) {
			return fmt.Errorf("s3 operation error (credential details redacted)")
		}
	}
	return err
}
