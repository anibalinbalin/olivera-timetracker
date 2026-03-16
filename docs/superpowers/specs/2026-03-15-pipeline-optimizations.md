# Pipeline Optimizations Spec

## Goal
Reduce unnecessary OCR calls, categorization calls, bandwidth, and idle CPU usage in the capture→OCR→categorization pipeline.

## Optimizations

### 1. Server-side image hash dedup (skip OCR for already-seen screenshots)

**Problem:** Agent dedup only compares to LAST hash. Alt-tabbing between 2 windows uploads both repeatedly. Backend OCRs every single one.

**Solution:**
- Add `image_hash TEXT` column to `captures` table
- Agent sends image hash (already computed via `simple_hash()`) as form field `image_hash` in upload
- `CreateCapture` handler: before saving, query `SELECT id, ocr_text, ocr_status, matter_id, ai_confidence FROM captures WHERE image_hash = ? AND ocr_status = 'COMPLETED' AND user_id = ? LIMIT 1`
- If match found: insert new capture with `ocr_text` copied, `ocr_status = 'COMPLETED'`, `matter_id` + `ai_confidence` copied. Skip saving screenshot file entirely.
- If no match: proceed as normal, store `image_hash`
- Add index: `CREATE INDEX idx_captures_image_hash ON captures(image_hash)`

**Agent change:** Send hash as string in multipart form. In `uploader.rs`, add `image_hash` field with the u64 hash formatted as hex string.

**Files:**
- `backend/internal/handlers/captures.go` — hash lookup + copy logic
- `backend/internal/db/migrations.go` — add `image_hash` column + index
- `agent/src-tauri/src/uploader.rs` — send `image_hash` field
- `agent/src-tauri/src/lib.rs` — pass hash to uploader

### 2. OCR text dedup (skip re-categorization for identical text)

**Problem:** Lawyer stares at same doc for 30 min = 30 captures with identical OCR text, all sent to Gemini separately.

**Solution:**
- Add `ocr_text_hash TEXT` column to `captures` table
- After OCR completes in `processOCRBatch`, compute hash of `ocr_text` (Go `fnv.New64a()`)
- Query: `SELECT matter_id, ai_confidence FROM captures WHERE ocr_text_hash = ? AND matter_id IS NOT NULL AND user_id = (SELECT user_id FROM captures WHERE id = ?) LIMIT 1`
- If match with assigned matter: copy `matter_id` + `ai_confidence`, mark as categorized
- If no match: leave for categorizer worker as normal
- Add index: `CREATE INDEX idx_captures_ocr_text_hash ON captures(ocr_text_hash)`

**Files:**
- `backend/internal/workers/ocr_worker.go` — compute text hash, check for prior match
- `backend/internal/db/migrations.go` — add `ocr_text_hash` column + index

### 3. Screenshot downscale before upload

**Problem:** Full 1920x1080 JPEG at quality 50 = ~100-200KB per capture. OCR doesn't need full resolution.

**Solution:**
- In `capture.rs`, after capturing raw image, resize to 50% (960x540) before JPEG encoding
- Use `image` crate's `resize` with `FilterType::Triangle` (fast bilinear)
- Reduces file size ~4x, bandwidth ~4x, disk usage ~4x
- OCR accuracy unaffected — text is still legible at 960x540

**Files:**
- `agent/src-tauri/src/capture.rs` — add resize step in `encode_jpeg` or before it

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
-- New columns
ALTER TABLE captures ADD COLUMN image_hash TEXT;
ALTER TABLE captures ADD COLUMN ocr_text_hash TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_captures_image_hash ON captures(image_hash);
CREATE INDEX IF NOT EXISTS idx_captures_ocr_text_hash ON captures(ocr_text_hash);
```

Since SQLite doesn't support `ALTER TABLE ADD COLUMN IF NOT EXISTS`, use Go migration pattern: attempt ALTER, ignore "duplicate column" error.

## Implementation Order

1. Schema migration (image_hash + ocr_text_hash columns)
2. Agent: send image_hash + screenshot downscale
3. Backend: image hash dedup in capture handler
4. Backend: OCR text hash dedup in OCR worker
5. Backend: worker idle backoff

## Unresolved Questions
None — all 4 optimizations are independent and low-risk.
