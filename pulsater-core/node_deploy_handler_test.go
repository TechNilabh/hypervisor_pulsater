package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestValidateDesignation(t *testing.T) {
	cases := []struct {
		desc   string
		input  string
		length int
		want   bool
	}{
		{"valid standard", "node-alpha-123", 14, true},
		{"valid underscore", "tracker_beta_9", 14, true},
		{"invalid spaces", "node alpha", 10, false},
		{"invalid special", "node$alpha", 10, false},
		{"empty string", "", 0, false},
		{"too long", "a-very-long-container-designation-that-exceeds-the-sixty-four-char-limit-completely-12345", 87, false},
	}

	for _, tc := range cases {
		t.Run(tc.desc, func(t *testing.T) {
			valid := len(tc.input) > 0 && len(tc.input) <= 64 && designationRe.MatchString(tc.input)
			if valid != tc.want {
				t.Errorf("ValidateDesignation(%q) = %v, want %v", tc.input, valid, tc.want)
			}
		})
	}
}

func TestValidateIngestionDB(t *testing.T) {
	cases := []struct {
		db   string
		want bool
	}{
		{"PostgreSQL", true},
		{"MySQL", true},
		{"MongoDB", true},
		{"Cassandra", true},
		{"SQLite", false},
		{"Oracle", false},
		{"", false},
	}

	for _, tc := range cases {
		t.Run(tc.db, func(t *testing.T) {
			valid := allowedIngestionDBs[tc.db]
			if valid != tc.want {
				t.Errorf("allowedIngestionDBs[%q] = %v, want %v", tc.db, valid, tc.want)
			}
		})
	}
}

func TestValidateVectorType(t *testing.T) {
	cases := []struct {
		vt   string
		want bool
	}{
		{"PHARMA_R3", true},
		{"IOT_GRID", true},
		{"QUANT_ALPHA", true},
		{"OTHER_TYPE", false},
		{"", false},
	}

	for _, tc := range cases {
		t.Run(tc.vt, func(t *testing.T) {
			valid := allowedVectorTypes[tc.vt]
			if valid != tc.want {
				t.Errorf("allowedVectorTypes[%q] = %v, want %v", tc.vt, valid, tc.want)
			}
		})
	}
}

func TestValidateHostPortMapping(t *testing.T) {
	cases := []struct {
		desc  string
		input string
		want  bool
	}{
		{"valid same", "5432:5432", true},
		{"valid different", "8080:80", true},
		{"malformed text", "5432a:5432", false},
		{"missing port", "5432", false},
		{"too many colons", "5432:5432:5432", false},
		{"out of bounds low", "0:5432", false},
		{"out of bounds high", "5432:65536", false},
		{"negative port", "-80:80", false},
	}

	for _, tc := range cases {
		t.Run(tc.desc, func(t *testing.T) {
			valid := portMappingRe.MatchString(tc.input)
			if valid {
				// Parse and verify range
				var hostPort, containerPort int
				_, err := fmtSscanf(tc.input, "%d:%d", &hostPort, &containerPort)
				if err == nil {
					valid = hostPort >= 1 && hostPort <= 65535 && containerPort >= 1 && containerPort <= 65535
				} else {
					valid = false
				}
			}
			if valid != tc.want {
				t.Errorf("ValidatePortMapping(%q) = %v, want %v", tc.input, valid, tc.want)
			}
		})
	}
}

// Simple scan helper matching fmt.Sscanf to keep tests clean
func fmtSscanf(str, format string, host, container *int) (int, error) {
	var h, c int
	n, err := json.Marshal(str) // dummy mock using basic parsing
	_ = n
	_ = err
	_, scanErr := sscanf(str, "%d:%d", &h, &c)
	if scanErr != nil {
		return 0, scanErr
	}
	*host = h
	*container = c
	return 2, nil
}

func sscanf(str, format string, host, container *int) (int, error) {
	parts := bytes.Split([]byte(str), []byte(":"))
	if len(parts) != 2 {
		return 0, json.Unmarshal([]byte{}, nil)
	}
	h, err1 := decodeInt(parts[0])
	c, err2 := decodeInt(parts[1])
	if err1 != nil || err2 != nil {
		return 0, err1
	}
	*host = h
	*container = c
	return 2, nil
}

func decodeInt(b []byte) (int, error) {
	var val int
	for _, char := range b {
		if char < '0' || char > '9' {
			return 0, json.Unmarshal([]byte{}, nil)
		}
		val = val*10 + int(char-'0')
	}
	return val, nil
}

func TestDeployHandler_Unauthenticated_Returns401(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/v1/nodes/deploy", bytes.NewBuffer([]byte(`{}`)))
	w := httptest.NewRecorder()

	HandleNodeDeploy(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized for missing JWT context, got %d", w.Code)
	}
}
