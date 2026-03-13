# Legal TimeTracker v2 — Design Spec

## Problem
Lawyers forget what they worked on and struggle to assign time to the right matters. Manual tracking is tedious and error-prone.

## Solution
Passive screen capture agent + AI-powered categorization that learns from lawyer corrections. Lightweight agent on each machine, web dashboard for review/management.

## MVP Scope (Beta with Laura Chalar)
- Tauri capture agent (macOS + Windows)
- OCR pipeline via GLM-OCR 0.9B on RunPod (→ Mac Mini M4 post-beta)
- Go backend running directly on Synology NAS (no Docker)
- Gemini API for categorization (free via Google Workspace)
- React SPA dashboard with 4 view options to A/B test
- Matter/client CRUD
- Approval workflow (DRAFT → REVIEWED → APPROVED)
- CSV export

## Out of Scope (V1)
- AI narrative generation
- Billing system integrations (Clio, LEAP)
- Bulk operations
- Scheduler/automation (manual sync OK)

---

## Architecture

```
[Lawyer's Machine]                    [Synology NAS]
┌─────────────────┐                  ┌──────────────────────┐
│  Tauri Agent     │                  │  Go Binary (service) │
│  - Screenshot    │───HTTP/REST───▶  │  - REST API          │
│  - Window title  │  (Tailscale)     │  - Static file server│
│  - Pause/Resume  │                  │  - SQLite DB         │
│  - Tray icon     │                  │  - Gemini client     │
└─────────────────┘                  │  - RunPod client     │
                                     └──────────┬───────────┘
[Browser on any device]                         │
┌─────────────────┐                             │
│  React SPA       │◀──static files─────────────┘
│  (Vite + Tailwind)                             │
└─────────────────┘              ┌───────────────┴──────┐
                                 │                      │
                           [RunPod]              [Gemini API]
                           GLM-OCR 0.9B          Categorization
                           (beta → Mac Mini)     + Learning
```

- Go binary runs directly on Synology, serves API + static SPA files
- SQLite in WAL mode with busy_timeout for concurrent writes (~40 writes/min at scale)
- Tauri agents connect via LAN or Tailscale
- Anthropic team tier available, reserved for premium tasks if needed

---

## Authentication

### Beta (Laura)
- Agent authenticates via static API key (configured in agent + backend)
- Dashboard uses simple session cookie (email + password login)
- All data visible to all users (single user for beta)

### Production
- Per-agent API keys provisioned by admin
- User model gets `role` field (lawyer | admin)
- Admin can see all users' data, lawyers see only their own
- API key rotation support

---

## Data Model

### Client
- id, name, code, created_at

### Matter
- id, client_id (FK), name, matter_number, description, is_active, created_at

### Capture
- id, user_id, timestamp
- app_name, window_title
- screenshot_path (nullable, temp file on disk)
- ocr_text (permanent, from GLM-OCR)
- ocr_status (PENDING | PROCESSING | COMPLETED | FAILED)
- matter_id (FK, nullable — set by AI or manual)
- ai_confidence (float 0-1)
- created_at

### TimeEntry
- id, user_id, matter_id (FK)
- date, duration_minutes
- description (text, lawyer-written summary of work done)
- status (DRAFT | REVIEWED | APPROVED)
- captures[] (relation)
- created_at, updated_at

### User
- id, name, email, role (lawyer | admin), created_at

### Settings
- capture_interval_seconds (default 30)
- screenshot_retention_hours (default 72)
- ocr_enabled (default true)
- categorization_confidence_threshold (default 0.7)

---

## Capture Agent (Tauri)

### Features
- System tray icon with pause/resume toggle
- Captures screenshot + active window info every 30s (configurable)
- Compresses screenshot (JPEG, ~50-100KB) before sending
- `POST /api/captures` with image + metadata
- macOS: CGWindowList APIs
- Windows: Win32 UI Automation APIs
- Offline buffer: queues captures if Synology unreachable, syncs on reconnect

### Does NOT do
- No OCR (backend handles it)
- No UI besides tray menu
- No categorization logic

### Tray Menu
- Status indicator (capturing / paused / disconnected)
- Pause / Resume
- Open Dashboard (opens browser)
- Quit

---

## Go Backend

### API Endpoints

```
POST /api/captures            — receive screenshot + metadata
GET  /api/captures            — list captures (date, user, matter)
PUT  /api/captures/:id        — reassign matter (correction → feeds learning)

GET  /api/entries             — list time entries (date, user, status)
POST /api/entries             — create entry from grouped captures
PUT  /api/entries/:id         — edit entry
PUT  /api/entries/:id/status  — change status (DRAFT→REVIEWED→APPROVED)
GET  /api/entries/export      — CSV export (date range, status=APPROVED)

POST /api/clients             — create client
GET  /api/clients             — list clients
PUT  /api/clients/:id         — update client

POST /api/matters             — create matter
GET  /api/matters             — list matters
PUT  /api/matters/:id         — update matter
DELETE /api/matters/:id       — soft delete

GET  /api/users               — list users
POST /api/users               — create user

GET  /api/settings            — get settings
PUT  /api/settings            — update settings

GET  /api/health              — health check (status, version)
DELETE /api/clients/:id       — soft delete client

POST /api/entries/generate    — trigger time entry generation from captures
```

### Background Goroutines
- **OCR worker**: picks up captures with `ocr_status=PENDING` → sends to RunPod → stores text, sets `ocr_status=COMPLETED`. Retry with exponential backoff (3 attempts: 5s/15s/45s). Failed captures set to `ocr_status=FAILED` for manual retry.
- **Categorizer**: batches captures with `ocr_status=COMPLETED` and no matter → Gemini with matter list + correction history
- **Cleanup**: purges screenshots older than retention period

### Time Entry Generation
Captures are grouped into time entries automatically:
1. Group captures by matter + contiguous time blocks (captures within 5 min of each other on same matter = one entry)
2. Calculate duration from first to last capture in group + one capture interval (minimum 1 min)
3. Create TimeEntry with status=DRAFT, link captures
4. Unassigned captures (no matter) shown separately on dashboard for manual assignment before entry creation
5. Lawyer can also manually select captures and create an entry

### Tech
- `net/http` or `chi` router, no heavy frameworks
- Cross-compiled Go binary for Synology (linux/amd64)
- Serves React SPA build at `/`

---

## React Dashboard

### Stack
Vite + React + Tailwind + shadcn/ui + TanStack Query

### Pages

**Today** (default) — 4 view options for A/B testing with Laura:
1. Timeline: chronological feed, color-coded by matter
2. Matter-grouped: hours per matter, expandable activity details
3. Calendar blocks: Google Calendar-style day view
4. Toggle: timeline + matter summary side by side

**Review** — approval workflow
- List entries by status (DRAFT / REVIEWED / APPROVED)
- Inline edit, reassign matter, change status
- Filter by date range, user

**Matters** — CRUD
- Client / matter management
- Active/inactive toggle

**Export** — CSV download
- Date range picker, status filter (approved only by default)

**Settings** — capture interval, retention period, OCR toggle, confidence threshold

---

## AI Categorization + Learning Loop

### Flow
1. New capture arrives with OCR text
2. Backend sends to Gemini: OCR text + app name + window title + active matters list + user correction history
3. Gemini responds with matter_id + confidence
4. Confidence ≥ 0.7 → auto-assign
5. Confidence < 0.7 → leave unassigned for manual review
6. Lawyer reassigns → correction stored as training signal
7. Future categorizations include corrections as in-context examples

### Learning Mechanism
No fine-tuning. In-context learning via accumulated corrections:
- "When user was in Word editing 'Smith Contract Draft v3', they assigned it to Matter #42"
- Gemini gets better over time at matching patterns per lawyer

### Confidence Threshold
Configurable in settings (default 0.7). Laura tunes during beta.

---

## Screenshot Lifecycle
1. Agent captures → sends to backend
2. Backend saves to disk (not SQLite)
3. Backend sends to RunPod OCR → extracted text stored in SQLite
4. Screenshot retained 72h (configurable) for OCR accuracy review
5. Cleanup goroutine purges expired screenshots
6. Extracted text is the permanent asset, not the screenshot

---

## Infrastructure

### Beta (Laura)
- Go binary on Synology NAS (direct, no Docker)
- RunPod serverless for GLM-OCR 0.9B
- Gemini 3.1 Flash-Lite API via Google Workspace (free tier)
- Tailscale for remote access

### Production (post-validation)
- Mac Mini M4 replaces RunPod (same model, point backend to localhost)
- Scale to 20 lawyers
- Same Go binary, same SQLite, same everything

---

## Key Design Decisions
1. **No Docker** — Go binary runs directly on Synology, faster
2. **SQLite over Postgres** — zero config, single file, sufficient for 20 users
3. **Gemini over Claude for categorization** — free via Google Workspace
4. **RunPod for beta OCR** — validate before buying Mac Mini M4
5. **Screenshots as temp files** — OCR text is the permanent record
6. **In-context learning over fine-tuning** — simpler, corrections as prompt examples
7. **Thin agent, fat server** — all logic centralized in Go backend
8. **4 view options** — let Laura pick what works, don't assume

---

## Scale Considerations
- 20 lawyers × 30s intervals × 8h/day = ~19,200 captures/day (~5M/year)
- SQLite indexes needed: user_id, timestamp, matter_id, ocr_status
- SQLite WAL mode + busy_timeout handles ~40 writes/min
- Settings are global for MVP. Per-user settings if needed post-beta.
- Bulk review operations deferred to post-MVP (known V1 limitation)
