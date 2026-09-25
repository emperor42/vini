package main

import (
	"bytes"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHomeHandler(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	newHandler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("GET / status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if got := recorder.Header().Get("Content-Type"); got != "text/html; charset=utf-8" {
		t.Errorf("GET / Content-Type = %q, want text/html; charset=utf-8", got)
	}
	body := recorder.Body.String()
	for _, expected := range []string{`src="/vini.js"`, `src="/demo.js"`, `href="/style.css"`} {
		if !strings.Contains(body, expected) {
			t.Errorf("GET / body does not contain %q", expected)
		}
	}
}

func TestViniAssetIsServedUnchanged(t *testing.T) {
	expected, err := fs.ReadFile(assets, "vini.js")
	if err != nil {
		t.Fatalf("read embedded vini.js: %v", err)
	}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/vini.js", nil)
	newHandler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("GET /vini.js status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if got := recorder.Header().Get("Content-Type"); got != "text/javascript; charset=utf-8" {
		t.Errorf("GET /vini.js Content-Type = %q, want text/javascript; charset=utf-8", got)
	}
	if !bytes.Equal(recorder.Body.Bytes(), expected) {
		t.Error("GET /vini.js did not serve the exact embedded browser asset")
	}
	if got := recorder.Header().Get("Cache-Control"); got != "public, max-age=300" {
		t.Errorf("GET /vini.js Cache-Control = %q, want public, max-age=300", got)
	}
}

func TestSecurityHeaders(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	newHandler().ServeHTTP(recorder, request)

	checks := map[string]string{
		"Content-Security-Policy":    "default-src 'none'",
		"Cross-Origin-Opener-Policy": "same-origin",
		"Referrer-Policy":            "no-referrer",
		"X-Content-Type-Options":     "nosniff",
		"X-Frame-Options":            "DENY",
	}
	for name, expected := range checks {
		if got := recorder.Header().Get(name); !strings.Contains(got, expected) {
			t.Errorf("%s = %q, want it to contain %q", name, got, expected)
		}
	}
}

func TestHeadAndMethodHandling(t *testing.T) {
	handler := newHandler()

	head := httptest.NewRecorder()
	handler.ServeHTTP(head, httptest.NewRequest(http.MethodHead, "/vini.js", nil))
	if head.Code != http.StatusOK {
		t.Errorf("HEAD /vini.js status = %d, want %d", head.Code, http.StatusOK)
	}
	if head.Body.Len() != 0 {
		t.Errorf("HEAD /vini.js returned %d body bytes, want 0", head.Body.Len())
	}

	post := httptest.NewRecorder()
	handler.ServeHTTP(post, httptest.NewRequest(http.MethodPost, "/vini.js", nil))
	if post.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST /vini.js status = %d, want %d", post.Code, http.StatusMethodNotAllowed)
	}
	if got := post.Header().Get("Allow"); got != "GET, HEAD" {
		t.Errorf("POST /vini.js Allow = %q, want GET, HEAD", got)
	}
}

func TestUnknownPath(t *testing.T) {
	recorder := httptest.NewRecorder()
	newHandler().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/missing", nil))
	if recorder.Code != http.StatusNotFound {
		t.Errorf("GET /missing status = %d, want %d", recorder.Code, http.StatusNotFound)
	}
}

func TestListenAddress(t *testing.T) {
	t.Setenv("VINI_HOST", " 0.0.0.0 ")
	t.Setenv("VINI_PORT", " 9090 ")
	if got := listenAddress(); got != "0.0.0.0:9090" {
		t.Fatalf("listenAddress() = %q, want 0.0.0.0:9090", got)
	}

	t.Setenv("VINI_HOST", "")
	t.Setenv("VINI_PORT", "")
	if got := listenAddress(); got != "127.0.0.1:8088" {
		t.Fatalf("default listenAddress() = %q, want 127.0.0.1:8088", got)
	}
}
