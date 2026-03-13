# Legal TimeTracker v2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build AI-powered time tracker for lawyers — passive capture agent + OCR + AI categorization + web dashboard for review/approval.

**Architecture:** Tauri capture agent → Go REST backend on Synology → React SPA dashboard. OCR via RunPod (GLM-OCR 0.9B), categorization via Gemini API. SQLite storage.

**Tech Stack:** Go (chi router), SQLite (WAL mode), React (Vite + Tailwind + shadcn/ui + TanStack Query), Tauri v2 (Rust + TypeScript)

**Spec:** `docs/superpowers/specs/2026-03-13-legal-timetracker-design.md`

---

## Chunk 1: Go Backend — Database + Models + Health

### File Structure
```
backend/
├── cmd/server/main.go          — entrypoint, wires everything, graceful shutdown
├── internal/
│   ├── db/db.go                — SQLite connection, migrations
│   ├── db/migrations.go        — SQL schema
│   ├── models/models.go        — structs for all entities
│   ├── handlers/health.go      — GET /api/health
│   ├── handlers/response.go    — writeJSON/writeError helpers
│   ├── handlers/auth.go        — POST /api/login, session cookie
│   └── middleware/auth.go      — API key + session cookie middleware
├── go.mod
├── go.sum
└── Makefile
```

### Task 1: Go module + SQLite schema

- [ ] **Step 1: Init Go module**

```bash
cd backend && go mod init github.com/olivera/timetracker
```

- [ ] **Step 2: Write migration SQL**

Create `internal/db/migrations.go`:

```go
package db

const schema = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'lawyer' CHECK(role IN ('lawyer','admin')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS matters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    name TEXT NOT NULL,
    matter_number TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS captures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    timestamp DATETIME NOT NULL,
    app_name TEXT NOT NULL,
    window_title TEXT NOT NULL,
    screenshot_path TEXT,
    ocr_text TEXT,
    ocr_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(ocr_status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),
    matter_id INTEGER REFERENCES matters(id),
    ai_confidence REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    matter_id INTEGER NOT NULL REFERENCES matters(id),
    date DATE NOT NULL,
    duration_minutes INTEGER NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','REVIEWED','APPROVED')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS capture_entries (
    capture_id INTEGER NOT NULL REFERENCES captures(id),
    entry_id INTEGER NOT NULL REFERENCES time_entries(id),
    PRIMARY KEY (capture_id, entry_id)
);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    capture_interval_seconds INTEGER NOT NULL DEFAULT 30,
    screenshot_retention_hours INTEGER NOT NULL DEFAULT 72,
    ocr_enabled INTEGER NOT NULL DEFAULT 1,
    categorization_confidence_threshold REAL NOT NULL DEFAULT 0.7
);

CREATE TABLE IF NOT EXISTS corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    capture_id INTEGER NOT NULL REFERENCES captures(id),
    from_matter_id INTEGER REFERENCES matters(id),
    to_matter_id INTEGER NOT NULL REFERENCES matters(id),
    app_name TEXT NOT NULL,
    window_title TEXT NOT NULL,
    ocr_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_captures_user_timestamp ON captures(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_captures_matter ON captures(matter_id);
CREATE INDEX IF NOT EXISTS idx_captures_ocr_status ON captures(ocr_status);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_date ON time_entries(user_id, date);
CREATE INDEX IF NOT EXISTS idx_time_entries_status ON time_entries(status);
CREATE INDEX IF NOT EXISTS idx_corrections_user ON corrections(user_id);

INSERT OR IGNORE INTO settings(id) VALUES(1);
`
```

- [ ] **Step 3: Write DB connection**

Create `internal/db/db.go`:

```go
package db

import (
    "database/sql"
    _ "github.com/mattn/go-sqlite3"
)

func Open(path string) (*sql.DB, error) {
    db, err := sql.Open("sqlite3", path+"?_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=ON")
    if err != nil {
        return nil, err
    }
    if _, err := db.Exec(schema); err != nil {
        return nil, err
    }
    return db, nil
}
```

- [ ] **Step 4: Write models**

Create `internal/models/models.go`:

```go
package models

import "time"

type User struct {
    ID        int64     `json:"id"`
    Name      string    `json:"name"`
    Email     string    `json:"email"`
    Role      string    `json:"role"`
    CreatedAt time.Time `json:"created_at"`
}

type Client struct {
    ID        int64     `json:"id"`
    Name      string    `json:"name"`
    Code      string    `json:"code"`
    IsActive  bool      `json:"is_active"`
    CreatedAt time.Time `json:"created_at"`
}

type Matter struct {
    ID           int64     `json:"id"`
    ClientID     int64     `json:"client_id"`
    Name         string    `json:"name"`
    MatterNumber string    `json:"matter_number"`
    Description  string    `json:"description,omitempty"`
    IsActive     bool      `json:"is_active"`
    CreatedAt    time.Time `json:"created_at"`
}

type Capture struct {
    ID             int64     `json:"id"`
    UserID         int64     `json:"user_id"`
    Timestamp      time.Time `json:"timestamp"`
    AppName        string    `json:"app_name"`
    WindowTitle    string    `json:"window_title"`
    ScreenshotPath *string   `json:"screenshot_path,omitempty"`
    OCRText        *string   `json:"ocr_text,omitempty"`
    OCRStatus      string    `json:"ocr_status"`
    MatterID       *int64    `json:"matter_id,omitempty"`
    AIConfidence   *float64  `json:"ai_confidence,omitempty"`
    CreatedAt      time.Time `json:"created_at"`
}

type TimeEntry struct {
    ID              int64     `json:"id"`
    UserID          int64     `json:"user_id"`
    MatterID        int64     `json:"matter_id"`
    Date            string    `json:"date"`
    DurationMinutes int       `json:"duration_minutes"`
    Description     *string   `json:"description,omitempty"`
    Status          string    `json:"status"`
    CreatedAt       time.Time `json:"created_at"`
    UpdatedAt       time.Time `json:"updated_at"`
}

type Settings struct {
    CaptureIntervalSeconds             int     `json:"capture_interval_seconds"`
    ScreenshotRetentionHours           int     `json:"screenshot_retention_hours"`
    OCREnabled                         bool    `json:"ocr_enabled"`
    CategorizationConfidenceThreshold  float64 `json:"categorization_confidence_threshold"`
}

type Correction struct {
    ID           int64     `json:"id"`
    UserID       int64     `json:"user_id"`
    CaptureID    int64     `json:"capture_id"`
    FromMatterID *int64    `json:"from_matter_id,omitempty"`
    ToMatterID   int64     `json:"to_matter_id"`
    AppName      string    `json:"app_name"`
    WindowTitle  string    `json:"window_title"`
    OCRText      *string   `json:"ocr_text,omitempty"`
    CreatedAt    time.Time `json:"created_at"`
}
```

- [ ] **Step 5: Write JSON response helpers**

Create `internal/handlers/response.go`:

```go
package handlers

import (
    "encoding/json"
    "net/http"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
    writeJSON(w, status, map[string]string{"error": msg})
}
```

All handlers use `writeJSON`/`writeError` instead of raw `json.NewEncoder`.

- [ ] **Step 6: Write health handler**

Create `internal/handlers/health.go`:

```go
package handlers

import "net/http"

var Version = "0.1.0"

func Health(w http.ResponseWriter, r *http.Request) {
    writeJSON(w, http.StatusOK, map[string]string{
        "status":  "ok",
        "version": Version,
    })
}
```

- [ ] **Step 7: Write auth middleware**

Create `internal/middleware/auth.go`:

```go
package middleware

import "net/http"

// APIKey authenticates Tauri agent requests via X-API-Key header
func APIKey(key string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            if k := r.Header.Get("X-API-Key"); k != key {
                http.Error(w, "unauthorized", http.StatusUnauthorized)
                return
            }
            next.ServeHTTP(w, r)
        })
    }
}

// Session authenticates dashboard requests via session cookie
func Session(db *sql.DB) func(http.Handler) http.Handler {
    // Check for valid session cookie, set user context
    // Falls through to APIKey check if no cookie (agent requests)
}
```

- [ ] **Step 8: Write login handler**

Create `internal/handlers/auth.go`:
- `Login(db) http.HandlerFunc` — `POST /api/login` with `{email, password}`
- Validates credentials against `password_hash` (bcrypt)
- Sets session cookie (secure, httponly, 24h expiry)
- Returns user JSON
- `Logout() http.HandlerFunc` — `POST /api/logout`, clears cookie

- [ ] **Step 9: Write main.go**

Create `cmd/server/main.go`:

```go
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
    // Cancel context for workers (passed to workers in subsequent tasks)
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
```

Workers (Tasks 6-8) receive the `ctx` context and exit gracefully on cancellation.

- [ ] **Step 8: Write Makefile**

Create `backend/Makefile`:

```makefile
.PHONY: run build test

run:
	go run ./cmd/server

build:
	CGO_ENABLED=1 go build -o bin/server ./cmd/server

build-synology: # requires: brew install FiloSottile/musl-cross/musl-cross
	GOOS=linux GOARCH=amd64 CGO_ENABLED=1 CC=x86_64-linux-musl-gcc go build -o bin/server-linux ./cmd/server

test:
	go test ./... -v
```

- [ ] **Step 9: Install deps + verify**

```bash
cd backend && go get github.com/go-chi/chi/v5 github.com/mattn/go-sqlite3 && go build ./...
```

- [ ] **Step 10: Commit**

```bash
git add backend/ && git commit -m "feat: go backend scaffold — db, models, health, auth middleware"
```

---

### Task 2: Client + Matter CRUD handlers

**Files:**
- Create: `backend/internal/handlers/clients.go`
- Create: `backend/internal/handlers/matters.go`
- Modify: `backend/cmd/server/main.go` — register routes

- [ ] **Step 1: Write clients handler**

Create `internal/handlers/clients.go` with:
- `ListClients(db) http.HandlerFunc` — `GET /api/clients`
- `CreateClient(db) http.HandlerFunc` — `POST /api/clients` (accepts `{name, code}`)
- `UpdateClient(db) http.HandlerFunc` — `PUT /api/clients/{id}`
- `DeleteClient(db) http.HandlerFunc` — `DELETE /api/clients/{id}` (sets `is_active=0`)

Each handler takes `*sql.DB` and returns `http.HandlerFunc`. JSON in/out. Standard error handling (400/404/500).

- [ ] **Step 2: Write matters handler**

Create `internal/handlers/matters.go` with:
- `ListMatters(db) http.HandlerFunc` — `GET /api/matters` (joins client name)
- `CreateMatter(db) http.HandlerFunc` — `POST /api/matters`
- `UpdateMatter(db) http.HandlerFunc` — `PUT /api/matters/{id}`
- `DeleteMatter(db) http.HandlerFunc` — `DELETE /api/matters/{id}` (sets `is_active=0`)

- [ ] **Step 3: Register routes in main.go**

Add to the authenticated group:
```go
r.Get("/api/clients", handlers.ListClients(database))
r.Post("/api/clients", handlers.CreateClient(database))
r.Put("/api/clients/{id}", handlers.UpdateClient(database))
r.Delete("/api/clients/{id}", handlers.DeleteClient(database))

r.Get("/api/matters", handlers.ListMatters(database))
r.Post("/api/matters", handlers.CreateMatter(database))
r.Put("/api/matters/{id}", handlers.UpdateMatter(database))
r.Delete("/api/matters/{id}", handlers.DeleteMatter(database))
```

- [ ] **Step 4: Test with curl**

```bash
# start server
API_KEY=test go run ./cmd/server &
# create client
curl -X POST localhost:8080/api/clients -H "X-API-Key: test" -d '{"name":"Smith Corp","code":"SMITH"}'
# list
curl localhost:8080/api/clients -H "X-API-Key: test"
# kill server
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add backend/ && git commit -m "feat: client + matter CRUD endpoints"
```

---

### Task 3: Users + Settings handlers

**Files:**
- Create: `backend/internal/handlers/users.go`
- Create: `backend/internal/handlers/settings.go`
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Write users handler**

`ListUsers(db)` and `CreateUser(db)` — accepts `{name, email, role}`.

- [ ] **Step 2: Write settings handler**

`GetSettings(db)` and `UpdateSettings(db)` — single row (id=1), partial updates.

- [ ] **Step 3: Register routes, test, commit**

```bash
git add backend/ && git commit -m "feat: users + settings endpoints"
```

---

### Task 4: Captures endpoint (receive + list + reassign)

**Files:**
- Create: `backend/internal/handlers/captures.go`
- Create: `backend/internal/storage/screenshots.go` — save/delete screenshot files
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Write screenshot storage**

Create `internal/storage/screenshots.go`:
- `SaveScreenshot(dir string, captureID int64, data []byte) (string, error)` — saves JPEG to `{dir}/{captureID}.jpg`, returns path
- `DeleteScreenshot(path string) error`

- [ ] **Step 2: Write captures handler**

`CreateCapture(db, screenshotDir)`:
- Accepts multipart: `image` file + `app_name`, `window_title`, `user_id`, `timestamp` fields
- Saves screenshot to disk via storage
- Inserts capture row with `ocr_status=PENDING`
- Returns capture JSON

`ListCaptures(db)`:
- Query params: `date`, `user_id`, `matter_id`, `ocr_status`
- Returns JSON array

`ReassignCapture(db)`:
- `PUT /api/captures/{id}` with `{matter_id}`
- Records correction in `corrections` table (old matter → new matter + context)
- Updates capture's `matter_id`

- [ ] **Step 3: Register routes, test with curl, commit**

```bash
git add backend/ && git commit -m "feat: captures endpoint — receive, list, reassign with corrections"
```

---

### Task 5: Time entries + generation + export

**Files:**
- Create: `backend/internal/handlers/entries.go`
- Create: `backend/internal/services/entry_generator.go`
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Write entry generator service**

Create `internal/services/entry_generator.go`:
- `GenerateEntries(db, userID, date) ([]TimeEntry, error)`
- Groups captures by matter where `matter_id IS NOT NULL` and not already linked to an entry
- Contiguous captures within 5 min on same matter = one entry
- Duration = first to last timestamp + capture interval (min 1 min)
- Creates entries with `status=DRAFT`
- Links captures via `capture_entries` join table

- [ ] **Step 2: Write entries handler**

- `ListEntries(db)` — filter by date, user_id, status
- `CreateEntry(db)` — manual creation from selected capture IDs
- `UpdateEntry(db)` — edit description, matter_id
- `UpdateEntryStatus(db)` — `PUT /api/entries/{id}/status` with `{status}`, validates transitions
- `GenerateEntries(db)` — `POST /api/entries/generate` with `{user_id, date}`, calls entry_generator
- `ExportEntries(db)` — `GET /api/entries/export?from=&to=&status=APPROVED`, returns CSV

- [ ] **Step 3: Register routes, test, commit**

```bash
git add backend/ && git commit -m "feat: time entries — CRUD, generation, approval workflow, CSV export"
```

---

### Task 6: OCR worker (RunPod integration)

**Files:**
- Create: `backend/internal/services/ocr.go` — RunPod client interface
- Create: `backend/internal/workers/ocr_worker.go` — background goroutine

- [ ] **Step 1: Write OCR client interface**

Create `internal/services/ocr.go`:
```go
type OCRClient interface {
    Extract(imageData []byte) (string, error)
}

type RunPodOCR struct {
    Endpoint string
    APIKey   string
}

func (r *RunPodOCR) Extract(imageData []byte) (string, error) {
    // POST image to RunPod serverless endpoint
    // Parse GLM-OCR response, return extracted text
}
```

- [ ] **Step 2: Write OCR worker**

Create `internal/workers/ocr_worker.go`:
- On startup: reset any `ocr_status=PROCESSING` back to `PENDING` (handles restarts)
- Polls for captures with `ocr_status=PENDING` every 5s
- Sets `ocr_status=PROCESSING`
- Reads screenshot from disk, calls OCRClient.Extract
- On success: stores `ocr_text`, sets `ocr_status=COMPLETED`
- On failure: retry with backoff (5s/15s/45s), then `ocr_status=FAILED`
- Runs as goroutine started from main.go

- [ ] **Step 3: Wire into main.go, commit**

```bash
git add backend/ && git commit -m "feat: OCR worker — RunPod integration with retry/backoff"
```

---

### Task 7: Categorizer worker (Gemini integration)

**Files:**
- Create: `backend/internal/services/categorizer.go` — Gemini client
- Create: `backend/internal/workers/categorizer_worker.go`

- [ ] **Step 1: Write Gemini categorizer**

Create `internal/services/categorizer.go`:
```go
type Categorizer interface {
    Categorize(captures []Capture, matters []Matter, corrections []Correction) ([]CategorizeResult, error)
}

type CategorizeResult struct {
    CaptureID  int64
    MatterID   *int64
    Confidence float64
}

type GeminiCategorizer struct {
    APIKey string
}
```

Builds prompt with: capture OCR text + app/window context + matter list + correction history. Parses JSON response.

- [ ] **Step 2: Write categorizer worker**

Create `internal/workers/categorizer_worker.go`:
- Polls for captures with `ocr_status=COMPLETED` and `matter_id IS NULL` every 30s
- Batches up to 20 captures per Gemini call
- Loads active matters + user corrections for context
- Applies results: sets `matter_id` and `ai_confidence` where confidence ≥ threshold
- Runs as goroutine from main.go

- [ ] **Step 3: Wire into main.go, commit**

```bash
git add backend/ && git commit -m "feat: categorizer worker — Gemini integration with learning loop"
```

---

### Task 8: Screenshot cleanup worker

**Files:**
- Create: `backend/internal/workers/cleanup_worker.go`

- [ ] **Step 1: Write cleanup worker**

- Runs every hour
- Reads `screenshot_retention_hours` from settings
- Queries captures where `created_at < NOW - retention` and `screenshot_path IS NOT NULL`
- Deletes files from disk
- Sets `screenshot_path = NULL` in DB

- [ ] **Step 2: Wire into main.go, commit**

```bash
git add backend/ && git commit -m "feat: screenshot cleanup worker"
```

---

### Task 9: Static file serving + CORS

**Files:**
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Add static file serving**

Serve React SPA build from `./static` directory with SPA fallback:
```go
// Serve static files, fallback to index.html for client-side routes
fs := http.FileServer(http.Dir("./static"))
r.Handle("/*", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    // If file exists, serve it; otherwise serve index.html for SPA routing
    path := "./static" + r.URL.Path
    if _, err := os.Stat(path); os.IsNotExist(err) && !strings.HasPrefix(r.URL.Path, "/api") {
        http.ServeFile(w, r, "./static/index.html")
        return
    }
    fs.ServeHTTP(w, r)
}))
```

- [ ] **Step 2: Add CORS middleware for dev**

Allow `localhost:5173` (Vite dev server) in dev mode.

- [ ] **Step 3: Commit**

```bash
git add backend/ && git commit -m "feat: static file serving + CORS for dev"
```

---

## Chunk 2: React Dashboard

> **Note:** All pages should handle loading, error, and empty states using TanStack Query's `isLoading`/`isError` flags and shadcn Skeleton components. Use `hugeicons-react` for all icons (NOT lucide-react).

### File Structure
```
frontend/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .gitignore
├── src/
│   ├── main.tsx
│   ├── App.tsx                    — router + QueryClientProvider
│   ├── api/client.ts              — fetch wrapper with API key + session cookie
│   ├── types.ts                   — TypeScript interfaces matching Go models
│   ├── hooks/
│   │   ├── useCaptures.ts
│   │   ├── useEntries.ts
│   │   ├── useClients.ts
│   │   ├── useMatters.ts
│   │   └── useSettings.ts
│   ├── pages/
│   │   ├── TodayPage.tsx          — 4 view options
│   │   ├── ReviewPage.tsx         — approval workflow
│   │   ├── MattersPage.tsx        — client/matter CRUD
│   │   ├── ExportPage.tsx         — CSV download
│   │   └── SettingsPage.tsx
│   ├── components/
│   │   ├── Layout.tsx             — nav sidebar (hugeicons-react)
│   │   ├── LoginPage.tsx          — email/password login
│   │   ├── views/
│   │   │   ├── TimelineView.tsx
│   │   │   ├── MatterGroupedView.tsx
│   │   │   ├── CalendarView.tsx
│   │   │   └── ComboView.tsx
│   │   ├── EntryCard.tsx
│   │   ├── CaptureCard.tsx
│   │   ├── MatterSelect.tsx
│   │   ├── StatusBadge.tsx
│   │   └── DatePicker.tsx
│   └── lib/utils.ts
```

### Task 10: Scaffold React app

- [ ] **Step 1: Create Vite + React + TypeScript project**

```bash
cd /Users/anibalin/Sites/2026/olivera_new_timetracker
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @tanstack/react-query react-router-dom date-fns hugeicons-react tailwindcss @tailwindcss/vite
npx shadcn@latest init
```

- [ ] **Step 3: Configure Vite proxy**

In `vite.config.ts`, proxy `/api` to `localhost:8080` for dev.

- [ ] **Step 4: Set up API client**

Create `src/api/client.ts`:
```typescript
const API_KEY = import.meta.env.VITE_API_KEY || 'changeme'
const BASE = '/api'

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
            ...options?.headers,
        },
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
}
```

- [ ] **Step 5: Create TypeScript types**

Create `src/types.ts` with interfaces matching Go models: `User`, `Client`, `Matter`, `Capture`, `TimeEntry`, `Settings`, `Correction`. These are used by all hooks and components.

- [ ] **Step 6: Set up router + layout + QueryClientProvider**

Create `App.tsx`:
- Wrap in `QueryClientProvider` with configured `QueryClient`
- Routes: `/login`, `/` (Today), `/review`, `/matters`, `/export`, `/settings`
- Protected routes redirect to `/login` if no session

Create `Layout.tsx` with sidebar nav using hugeicons-react icons.

Create `LoginPage.tsx`:
- Email + password form
- Calls `POST /api/login`, stores session cookie
- Redirects to `/` on success

- [ ] **Step 7: Commit**

```bash
git add frontend/ && git commit -m "feat: react SPA scaffold — vite, tailwind, shadcn, router, api client"
```

---

### Task 11: TanStack Query hooks

- [ ] **Step 1: Create all hooks**

One file per resource, each exports query + mutation hooks:

- `useCaptures.ts` — `useCaptures(filters)`, `useReassignCapture()`
- `useEntries.ts` — `useEntries(filters)`, `useCreateEntry()`, `useUpdateEntry()`, `useUpdateEntryStatus()`, `useGenerateEntries()`
- `useClients.ts` — `useClients()`, `useCreateClient()`, `useUpdateClient()`, `useDeleteClient()`
- `useMatters.ts` — `useMatters()`, `useCreateMatter()`, `useUpdateMatter()`, `useDeleteMatter()`
- `useSettings.ts` — `useSettings()`, `useUpdateSettings()`

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/ && git commit -m "feat: TanStack Query hooks for all resources"
```

---

### Task 12: Matters page (client/matter CRUD)

- [ ] **Step 1: Build MattersPage**

- List clients as collapsible sections
- Each client shows its matters
- Add client form (name, code)
- Add matter form (name, number, description, client selector)
- Edit/deactivate toggles
- Use shadcn Dialog, Input, Button, Select components

- [ ] **Step 2: Commit**

```bash
git add frontend/ && git commit -m "feat: matters page — client/matter CRUD"
```

---

### Task 13: Today page — 4 view options

- [ ] **Step 1: Build TimelineView**

Chronological list of captures for selected date. Color-coded by matter (consistent color from matter ID). Shows app icon, window title, time, matter badge. Unassigned captures highlighted with prominent MatterSelect dropdown for reassignment.

- [ ] **Step 2: Build MatterGroupedView**

Cards per matter showing total hours. Expandable to show individual captures with MatterSelect for reassignment. Unassigned captures in separate "Uncategorized" section.

- [ ] **Step 3: Build CalendarView**

Day view (6am-10pm), captures as blocks positioned by time, width = duration, color = matter. Drag to reassign (stretch goal).

- [ ] **Step 4: Build ComboView**

Split layout: timeline on left, matter summary on right.

- [ ] **Step 5: Build TodayPage**

Date picker (prev/next day), view selector (tabs for 4 views), "Generate Entries" button that calls `POST /api/entries/generate`. Shows both captures and generated entries. Capture multi-select mode + "Create Entry from Selected" button for manual entry creation with matter dropdown.

- [ ] **Step 6: Commit**

```bash
git add frontend/ && git commit -m "feat: today page with 4 A/B test views"
```

---

### Task 14: Review page (approval workflow)

- [ ] **Step 1: Build ReviewPage**

- Filter tabs: DRAFT | REVIEWED | APPROVED
- Date range filter + user filter dropdown
- Entry cards with: matter name, date, duration, description (editable), status
- MatterSelect dropdown for reassignment
- Status transition buttons: Draft→Reviewed, Reviewed→Approved
- Inline description editing (click to edit, save on blur)

- [ ] **Step 2: Commit**

```bash
git add frontend/ && git commit -m "feat: review page — approval workflow with inline editing"
```

---

### Task 15: Export + Settings pages

- [ ] **Step 1: Build ExportPage**

- Date range picker (from/to)
- Status filter (default: APPROVED only)
- Preview table of entries to export
- "Download CSV" button — calls `GET /api/entries/export` and triggers download

- [ ] **Step 2: Build SettingsPage**

- Form with: capture interval, retention hours, OCR toggle, confidence threshold
- Save button calls `PUT /api/settings`
- Show current OCR queue stats (pending/processing/failed counts)

- [ ] **Step 3: Commit**

```bash
git add frontend/ && git commit -m "feat: export + settings pages"
```

---

## Chunk 3: Tauri Capture Agent

### File Structure
```
agent/
├── src-tauri/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs              — Tauri app setup
│   │   ├── capture.rs           — screenshot + window info
│   │   ├── uploader.rs          — POST to backend
│   │   ├── buffer.rs            — offline queue
│   │   └── tray.rs              — system tray menu
│   └── tauri.conf.json
├── src/                          — minimal UI (empty window, tray only)
│   └── main.ts
├── package.json
└── index.html
```

### Task 16: Scaffold Tauri app

- [ ] **Step 1: Create Tauri v2 project**

```bash
cd /Users/anibalin/Sites/2026/olivera_new_timetracker
npm create tauri-app@latest agent -- --template vanilla-ts
```

- [ ] **Step 2: Configure tauri.conf.json**

Set `windows: []` (no window, tray only). Enable system tray. Add permissions for screenshots.

- [ ] **Step 3: Commit**

```bash
git add agent/ && git commit -m "feat: tauri agent scaffold"
```

---

### Task 17: Screen capture (macOS + Windows)

- [ ] **Step 1: Write capture.rs**

macOS: Use `core-graphics` crate — `CGDisplay::screenshot()` for full screen capture. Get active window info via `NSWorkspace` (app name, window title).

Windows: Use `windows` crate — `BitBlt` for screenshot. `GetForegroundWindow` + `GetWindowText` for active window info.

Platform-specific code behind `#[cfg(target_os)]`.

Returns: `CaptureResult { image: Vec<u8>, app_name: String, window_title: String, timestamp: DateTime }`.

Compress to JPEG before returning.

- [ ] **Step 2: Test capture on current platform**

- [ ] **Step 3: Commit**

```bash
git add agent/ && git commit -m "feat: cross-platform screen capture — macOS + Windows"
```

---

### Task 18: Uploader + offline buffer

- [ ] **Step 1: Write uploader.rs**

- `POST /api/captures` as multipart form data
- Configurable server URL + API key
- Returns `Result<CaptureResponse, Error>`

- [ ] **Step 2: Write buffer.rs**

- SQLite local buffer (separate from server DB)
- On capture: try upload → if fails, queue in local SQLite
- Background task: retry queued captures every 30s
- On success: remove from queue

- [ ] **Step 3: Commit**

```bash
git add agent/ && git commit -m "feat: capture uploader with offline buffer"
```

---

### Task 19: System tray + capture loop

- [ ] **Step 1: Write tray.rs**

System tray with menu:
- Status line: "Capturing" / "Paused" / "Disconnected"
- Pause / Resume toggle
- Open Dashboard (opens default browser to configured URL)
- Quit

- [ ] **Step 2: Write capture loop in main.rs**

- Tauri setup: init tray, start capture loop as async task
- Capture every N seconds (read from config file or default 30s)
- On pause: stop loop. On resume: restart.
- Config file: `~/.timetracker/config.json` with `server_url`, `api_key`, `capture_interval`
- On first launch: create default config.json with example values if it doesn't exist. Log the config path on startup.

- [ ] **Step 3: Test end-to-end**

Start Go backend + Tauri agent. Verify captures appear in DB.

- [ ] **Step 4: Commit**

```bash
git add agent/ && git commit -m "feat: system tray + capture loop with pause/resume"
```

---

## Chunk 4: Integration + Polish

### Task 20: End-to-end integration test

- [ ] **Step 1: Manual E2E test**

1. Start Go backend: `cd backend && API_KEY=test go run ./cmd/server`
2. Start Tauri agent (configured to point to backend)
3. Work normally for 2 minutes — switch between apps
4. Open dashboard in browser
5. Verify: captures appear, OCR text populated, matters can be assigned
6. Generate entries, review, approve, export CSV

- [ ] **Step 2: Fix any integration issues**

- [ ] **Step 3: Commit fixes**

---

### Task 21: Build + deployment scripts

- [ ] **Step 1: Add root Makefile**

```makefile
.PHONY: dev build deploy

dev:
	cd backend && go run ./cmd/server &
	cd frontend && npm run dev

build-frontend:
	cd frontend && npm run build
	rm -rf backend/static && cp -r frontend/dist backend/static

build-backend:
	cd backend && CGO_ENABLED=1 go build -o bin/server ./cmd/server

build: build-frontend build-backend

build-agent-mac:
	cd agent && npm run tauri build

build-agent-win:
	cd agent && npm run tauri build -- --target x86_64-pc-windows-msvc
```

- [ ] **Step 2: Add .gitignore files**

Root `.gitignore`: `node_modules/`, `dist/`, `bin/`, `*.db`, `.env`, `target/`, `static/`
Frontend: `node_modules/`, `dist/`
Agent: `node_modules/`, `src-tauri/target/`

- [ ] **Step 3: Add .env.example files**

Backend: `DB_PATH`, `API_KEY`, `ADDR`, `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT`, `GEMINI_API_KEY`, `SCREENSHOT_DIR`
Agent: `SERVER_URL`, `API_KEY`, `CAPTURE_INTERVAL`

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "feat: build scripts, .gitignore, env examples"
```

---

## Unresolved Questions

1. **Synology arch** — is the Synology x86_64 or ARM? Affects Go cross-compilation target.
2. **RunPod endpoint** — what's the exact API format for GLM-OCR on RunPod serverless? Need to test deployment first.
3. **Gemini model** — which Gemini model to use for categorization? (gemini-pro, gemini-flash?)
4. **Screenshot resolution** — full screen or active window only? Full screen is simpler but larger files.
5. **Laura's first matters** — do we pre-seed some client/matter data for her beta, or does she enter manually?
