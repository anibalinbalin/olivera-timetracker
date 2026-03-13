package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/olivera/timetracker/internal/db"
	"github.com/olivera/timetracker/internal/handlers"
	"github.com/olivera/timetracker/internal/middleware"
)

func main() {
	dbPath := envOr("DB_PATH", "timetracker.db")
	apiKey := envOr("API_KEY", "")
	addr := envOr("ADDR", ":8080")

	if apiKey == "" {
		log.Fatal("API_KEY env var required")
	}

	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()

	r := chi.NewRouter()

	// Public
	r.Get("/api/health", handlers.Health)
	r.Post("/api/login", handlers.Login(database))
	r.Post("/api/logout", handlers.Logout())

	// Authenticated (API key for agents, session cookie for dashboard)
	r.Group(func(r chi.Router) {
		r.Use(middleware.APIKeyOrSession(apiKey, database))
		// endpoints added in subsequent tasks
	})

	// Graceful shutdown
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	srv := &http.Server{Addr: addr, Handler: r}
	go func() {
		log.Printf("listening on %s", addr)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(shutdownCtx)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
