package main

import (
	"bytes"
	"embed"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

// The demo embeds the exact browser asset under test. Stenella does not need
// this server; it serves vini.js as part of the parent application.
//
//go:embed vini.js templates/index.html static/demo.js static/style.css
var assets embed.FS

const (
	defaultHost = "127.0.0.1"
	defaultPort = "8088"
)

func main() {
	server := &http.Server{
		Addr:              listenAddress(),
		Handler:           newHandler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("vini browser demo listening on http://%s", server.Addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func newHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		serveAsset("templates/index.html", "text/html; charset=utf-8")(w, r)
	})
	mux.HandleFunc("/vini.js", serveAsset("vini.js", "text/javascript; charset=utf-8"))
	mux.HandleFunc("/demo.js", serveAsset("static/demo.js", "text/javascript; charset=utf-8"))
	mux.HandleFunc("/style.css", serveAsset("static/style.css", "text/css; charset=utf-8"))
	return securityHeaders(mux)
}

func serveAsset(name, contentType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		data, err := fs.ReadFile(assets, name)
		if err != nil {
			http.Error(w, "asset unavailable", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", contentType)
		if name == "vini.js" {
			w.Header().Set("Cache-Control", "public, max-age=300")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(data))
	}
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := w.Header()
		header.Set("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
		header.Set("Cross-Origin-Opener-Policy", "same-origin")
		header.Set("Cross-Origin-Resource-Policy", "same-origin")
		header.Set("Permissions-Policy", "camera=(), geolocation=(), microphone=()")
		header.Set("Referrer-Policy", "no-referrer")
		header.Set("X-Content-Type-Options", "nosniff")
		header.Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}

func listenAddress() string {
	host := strings.TrimSpace(os.Getenv("VINI_HOST"))
	if host == "" {
		host = defaultHost
	}
	port := strings.TrimSpace(os.Getenv("VINI_PORT"))
	if port == "" {
		port = defaultPort
	}
	return net.JoinHostPort(host, port)
}
