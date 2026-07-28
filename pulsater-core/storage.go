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

type StorageBackend interface {
	Save(ctx context.Context, key string, r io.Reader, size int64) (url string, err error)
	Checksum(ctx context.Context, url string) (sha256hex string, err error)
}

// ---------------------------------------------------------------------------
// LocalDiskBackend
// ---------------------------------------------------------------------------

type LocalDiskBackend struct {
	stagingDir string // temp area during write
	rawDir     string // permanent storage root
	log        *slog.Logger
}

func NewLocalDiskBackend(stagingDir, rawDir string, log *slog.Logger) *LocalDiskBackend {
	return &LocalDiskBackend{stagingDir: stagingDir, rawDir: rawDir, log: log}
}

func (b *LocalDiskBackend) Save(ctx context.Context, key string, r io.Reader, size int64) (string, error) {
	if err := os.MkdirAll(b.stagingDir, 0o750); err != nil {
		return "", fmt.Errorf("localDisk: create staging dir: %w", err)
	}

	tmp, err := os.CreateTemp(b.stagingDir, "pulsater-upload-*")
	if err != nil {
		return "", fmt.Errorf("localDisk: create temp file: %w", err)
	}
	tmpName := tmp.Name()
	defer func() {
		tmp.Close()
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

const multipartThreshold = 100 * 1024 * 1024 // 100 MB

type S3Client interface {
	PutObject(ctx context.Context, in *s3.PutObjectInput, opts ...func(*s3.Options)) (*s3.PutObjectOutput, error)
	HeadObject(ctx context.Context, in *s3.HeadObjectInput, opts ...func(*s3.Options)) (*s3.HeadObjectOutput, error)
}

type S3Backend struct {
	client     S3Client
	uploader   *manager.Uploader
	bucket     string
	kmsKeyARN  string // empty = SSE-S3; set = SSE-KMS
	publicBase string // optional public URL prefix for returned URLs
	log        *slog.Logger
}

func NewS3Backend(ctx context.Context, log *slog.Logger) (*S3Backend, error) {
	bucket := os.Getenv("S3_BUCKET_NAME")
	if bucket == "" {
		return nil, fmt.Errorf("s3: S3_BUCKET_NAME env var is required")
	}

	optFns := []func(*awsconfig.LoadOptions) error{}

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

func (b *S3Backend) Save(ctx context.Context, key string, r io.Reader, size int64) (string, error) {
	input := &s3.PutObjectInput{
		Bucket: aws.String(b.bucket),
		Key:    aws.String(key),
		Body:   r,
	}

	if b.kmsKeyARN != "" {
		input.ServerSideEncryption = types.ServerSideEncryptionAwsKms
		input.SSEKMSKeyId = aws.String(b.kmsKeyARN)
	} else {
		input.ServerSideEncryption = types.ServerSideEncryptionAes256
	}

	// part size is already set large enough to be efficient).
	_, err := b.uploader.Upload(ctx, input)
	if err != nil {
		return "", fmt.Errorf("s3: upload failed (bucket=%s, key=%s): %w",
			sanitizeBucket(b.bucket), sanitizeKey(key), stripCredentials(err))
	}

	objectURL := fmt.Sprintf("s3://%s/%s", b.bucket, key)
	b.log.InfoContext(ctx, "s3: upload complete", "bucket", b.bucket, "key", key, "size", size)
	return objectURL, nil
}

func (b *S3Backend) Checksum(ctx context.Context, url string) (string, error) {
	key := strings.TrimPrefix(url, fmt.Sprintf("s3://%s/", b.bucket))
	out, err := b.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(b.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return "", fmt.Errorf("s3: HeadObject (key=%s): %w", sanitizeKey(key), err)
	}
	if stored, ok := out.Metadata["sha256"]; ok && stored != "" {
		return stored, nil
	}
	// ETag is MD5 for single-part uploads — not a SHA-256, mark accordingly.
	return "", fmt.Errorf("s3: no sha256 metadata on object (key=%s); re-download required for integrity check", sanitizeKey(key))
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

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

func sanitizeBucket(b string) string { return b }

func sanitizeKey(k string) string {
	if idx := strings.IndexByte(k, '?'); idx >= 0 {
		return k[:idx]
	}
	return k
}

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
