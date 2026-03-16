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
	"github.com/go-chi/cors"
	"github.com/olivera/timetracker/internal/db"
	"github.com/olivera/timetracker/internal/handlers"
	"github.com/olivera/timetracker/internal/middleware"
	"github.com/olivera/timetracker/internal/services"
	"github.com/olivera/timetracker/internal/workers"
)

func main() {
	dbPath := envOr("DB_PATH", "timetracker.db")
	apiKey := envOr("API_KEY", "")
	addr := envOr("ADDR", ":8080")
	screenshotDir := envOr("SCREENSHOT_DIR", "./screenshots")

	if apiKey == "" {
		log.Fatal("API_KEY env var required")
	}

	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()

	r := chi.NewRouter()

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-API-Key"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Public
	r.Get("/api/health", handlers.Health)
	r.Post("/api/login", handlers.Login(database))
	r.Post("/api/logout", handlers.Logout())

	// Authenticated (API key for agents, session cookie for dashboard)
	r.Group(func(r chi.Router) {
		r.Use(middleware.APIKeyOrSession(apiKey, database))

		r.Get("/api/clients", handlers.ListClients(database))
		r.Post("/api/clients", handlers.CreateClient(database))
		r.Put("/api/clients/{id}", handlers.UpdateClient(database))
		r.Delete("/api/clients/{id}", handlers.DeleteClient(database))

		r.Get("/api/matters", handlers.ListMatters(database))
		r.Post("/api/matters", handlers.CreateMatter(database))
		r.Put("/api/matters/{id}", handlers.UpdateMatter(database))
		r.Delete("/api/matters/{id}", handlers.DeleteMatter(database))

		r.Get("/api/users", handlers.ListUsers(database))
		r.Post("/api/users", handlers.CreateUser(database))

		r.Get("/api/settings", handlers.GetSettings(database))
		r.Put("/api/settings", handlers.UpdateSettings(database))

		r.Post("/api/captures", handlers.CreateCapture(database, screenshotDir))
		r.Get("/api/captures", handlers.ListCaptures(database))
		r.Put("/api/captures/{id}", handlers.ReassignCapture(database))

		r.Get("/api/entries", handlers.ListEntries(database))
		r.Post("/api/entries", handlers.CreateEntry(database))
		r.Post("/api/entries/generate", handlers.GenerateEntriesHandler(database))
		r.Get("/api/entries/export", handlers.ExportEntries(database))
		r.Put("/api/entries/{id}", handlers.UpdateEntry(database))
		r.Put("/api/entries/{id}/status", handlers.UpdateEntryStatus(database))
	})

	// Serve frontend static files with SPA fallback
	staticDir := envOr("STATIC_DIR", "./static")
	fileServer := http.FileServer(http.Dir(staticDir))
	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		path := staticDir + req.URL.Path
		if _, err := os.Stat(path); err == nil {
			fileServer.ServeHTTP(w, req)
			return
		}
		http.ServeFile(w, req, staticDir+"/index.html")
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

	// OCR worker
	ocrEndpoint := envOr("RUNPOD_ENDPOINT", "")
	ocrAPIKey := envOr("RUNPOD_API_KEY", "")
	var ocrClient services.OCRClient
	if ocrEndpoint != "" {
		ocrClient = &services.RunPodOCR{Endpoint: ocrEndpoint, APIKey: ocrAPIKey}
	} else {
		log.Println("RUNPOD_ENDPOINT not set, OCR disabled")
		ocrClient = &services.NoopOCR{}
	}
	workerCtx, workerCancel := context.WithCancel(context.Background())
	go workers.StartOCRWorker(workerCtx, database, ocrClient)
	go workers.StartCleanupWorker(workerCtx, database)

	// Categorizer worker
	geminiKey := envOr("GEMINI_API_KEY", "")
	var categorizer services.Categorizer
	if geminiKey != "" {
		categorizer = &services.GeminiCategorizer{APIKey: geminiKey, Model: "gemini-2.5-flash-lite"}
	} else {
		log.Println("GEMINI_API_KEY not set, categorization disabled")
		categorizer = &services.NoopCategorizer{}
	}
	go workers.StartCategorizerWorker(workerCtx, database, categorizer)

	<-ctx.Done()
	workerCancel()
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
