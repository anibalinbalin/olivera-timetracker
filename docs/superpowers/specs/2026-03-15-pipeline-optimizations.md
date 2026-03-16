# Pipeline Optimizations Spec

## Goal
Reduce unnecessary OCR calls, categorization calls, bandwidth, and idle CPU usage in the capture→OCR→categorization pipeline.

## Optimizations

### 1. Server-side image hash dedup (skip OCR for already-seen screenshots)

**Problem:** Agent dedup only compares to LAST hash. Alt-tabbing between 2 windows uploads both repeatedly. Backend OCRs every single one.

**Solution:**
- Add `image_hash TEXT` column to `captures` table
- Agent computes a **full FNV-1a hash** over all JPEG bytes (NOT `simple_hash` which samples every 64th byte — too collision-prone for corpus-wide dedup). The existing `simple_hash` stays for agent-side consecutive-frame dedup only.
- Hash is computed on the **downscaled JPEG bytes** (the final uploaded image). Existing captures in DB will have NULL `image_hash` and simply won't match — no migration issue.
- Agent sends hash as form field `image_hash` (hex string) in multipart upload
- `CreateCapture` handler: before saving, query `SELECT id, ocr_text, ocr_status, matter_id, ai_confidence FROM captures WHERE image_hash = ? AND ocr_status = 'COMPLETED' AND user_id = ? LIMIT 1`
- If match found: insert new capture with `ocr_text` copied, `ocr_status = 'COMPLETED'`, `matter_id` + `ai_confidence` copied. Skip saving screenshot file entirely. Return correct `ocr_status` in response (not hardcoded PENDING).
- If no match: proceed as normal, store `image_hash`
- Add index: `CREATE INDEX idx_captures_image_hash ON captures(image_hash)`

**Agent changes:**
- New `full_hash(data: &[u8]) -> u64` function using FNV-1a over ALL bytes
- `uploader.rs`: accept hash param, add `image_hash` field to multipart form
- `lib.rs`: compute full hash on final JPEG bytes, pass to uploader

**Files:**
- `backend/internal/handlers/captures.go` — hash lookup + copy logic + correct response status
- `backend/internal/db/migrations.go` — add `RunMigrations(db)` function (see Schema Changes)
- `agent/src-tauri/src/uploader.rs` — send `image_hash` field
- `agent/src-tauri/src/lib.rs` — add `full_hash()`, pass to uploader

### 2. OCR text dedup (skip re-categorization for identical text)

**Problem:** Lawyer stares at same doc for 30 min = 30 captures with identical OCR text, all sent to Gemini separately.

**Solution:**
- Add `ocr_text_hash TEXT` column to `captures` table
- After OCR completes in `processOCRBatch`, compute hash of `ocr_text` (Go `fnv.New64a()`)
- Extend `processOCRBatch` SELECT to also fetch `user_id` (currently only fetches `id, screenshot_path`)
- Query with direct user_id (no subquery): `SELECT matter_id, ai_confidence FROM captures WHERE ocr_text_hash = ? AND matter_id IS NOT NULL AND user_id = ? LIMIT 1`
- If match with assigned matter: copy `matter_id` + `ai_confidence`, set `ocr_text_hash`, mark as categorized
- If no match: store `ocr_text_hash`, leave for categorizer worker as normal
- Add index: `CREATE INDEX idx_captures_ocr_text_hash ON captures(ocr_text_hash)`

**Files:**
- `backend/internal/workers/ocr_worker.go` — add user_id to SELECT, compute text hash, check for prior match
- `backend/internal/db/migrations.go` — add `ocr_text_hash` column + index in `RunMigrations`

### 3. Screenshot downscale before upload

**Problem:** Full 1920x1080 JPEG at quality 50 = ~100-200KB per capture. OCR doesn't need full resolution.

**Solution:**
- In `capture.rs`, after capturing raw image, resize to 50% (960x540) before JPEG encoding
- Use `image` crate's `resize` with `FilterType::Triangle` (fast bilinear)
- Reduces file size ~4x, bandwidth ~4x, disk usage ~4x
- OCR accuracy unaffected — text is still legible at 960x540

**Files:**
- `agent/src-tauri/src/capture.rs` — add resize step before `encode_jpeg`

### 4. Worker idle backoff

**Problem:** OCR worker polls every 5s, categorizer every 30s, even when zero captures exist (nights/weekends). Wastes Synology CPU/IO.

**Solution:**
- Track consecutive empty polls
- Backoff schedule: 5s → 10s → 30s → 60s (OCR), 30s → 60s → 120s (categorizer)
- Reset to base interval when work is found
- Implementation: replace `time.NewTicker` with `time.After` in a loop, adjusting delay based on empty count

**Files:**
- `backend/internal/workers/ocr_worker.go` — adaptive interval
- `backend/internal/workers/categorizer_worker.go` — adaptive interval

## Schema Changes

```sql
ALTER TABLE captures ADD COLUMN image_hash TEXT;
ALTER TABLE captures ADD COLUMN ocr_text_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_captures_image_hash ON captures(image_hash);
CREATE INDEX IF NOT EXISTS idx_captures_ocr_text_hash ON captures(ocr_text_hash);
```

**Migration approach:** The existing `migrations.go` only has a `const schema` string with `CREATE TABLE IF NOT EXISTS`. Add a `RunMigrations(db *sql.DB)` function that runs `ALTER TABLE` statements with error suppression for "duplicate column name". Call it from server startup after `db.Exec(schema)`. This keeps the schema const as the source of truth for new installs while supporting incremental changes.

## Implementation Order

**Optimization 3 (downscale) MUST come before Optimization 1 (hash dedup)** because the image hash is computed on the final downscaled JPEG bytes. If hash is deployed first on full-res images and then downscale changes the bytes, all existing hashes become orphaned.

1. Schema migration — add `RunMigrations()` with both new columns + indexes
2. Agent: screenshot downscale in `capture.rs`
3. Agent: `full_hash()` + send `image_hash` in upload (computed on downscaled JPEG)
4. Backend: image hash dedup in capture handler
5. Backend: OCR text hash dedup in OCR worker
6. Backend: worker idle backoff
