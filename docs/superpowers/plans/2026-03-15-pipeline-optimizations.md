# Pipeline Optimizations Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan.

**Goal:** Reduce unnecessary OCR/categorization calls via hash dedup, cut bandwidth via downscale, reduce idle CPU via worker backoff.

**Architecture:** 4 independent optimizations touching agent (Rust) and backend (Go). Downscale must land before image hash since hash is computed on final JPEG bytes.

**Tech Stack:** Rust (image crate resize), Go (hash/fnv, database/sql), SQLite

---

## Task 1: Schema migration — RunMigrations function

**Files:**
- Modify: `backend/internal/db/migrations.go`
- Modify: `backend/cmd/server/main.go` (or wherever db.Open is called)

- [ ] Add `RunMigrations(db *sql.DB)` after schema const
- [ ] Call it from server startup after `db.Exec(schema)`
- [ ] Commit

## Task 2: Agent screenshot downscale

**Files:**
- Modify: `agent/src-tauri/src/capture.rs`

- [ ] Add resize to 50% before encode_jpeg in both macOS and Windows capture functions
- [ ] Verify compilation
- [ ] Commit

## Task 3: Agent full hash + send in upload

**Files:**
- Modify: `agent/src-tauri/src/lib.rs` — add `full_hash()`
- Modify: `agent/src-tauri/src/uploader.rs` — accept + send `image_hash`

- [ ] Add `full_hash()` FNV-1a over all bytes
- [ ] Update uploader to accept and send image_hash
- [ ] Update capture_loop to compute full_hash and pass to uploader
- [ ] Verify compilation
- [ ] Commit

## Task 4: Backend image hash dedup in capture handler

**Files:**
- Modify: `backend/internal/handlers/captures.go`

- [ ] Accept `image_hash` form field
- [ ] Before saving, check for existing capture with same hash + user_id
- [ ] If match: copy ocr_text/status/matter_id/ai_confidence, skip screenshot save
- [ ] If no match: proceed as normal, store image_hash
- [ ] Return correct ocr_status in response
- [ ] Commit

## Task 5: Backend OCR text hash dedup

**Files:**
- Modify: `backend/internal/workers/ocr_worker.go`

- [ ] Add user_id to batch SELECT
- [ ] After OCR, compute FNV-1a of ocr_text, store as ocr_text_hash
- [ ] Check for prior capture with same text hash + user_id + assigned matter
- [ ] If match: copy matter_id + ai_confidence
- [ ] Commit

## Task 6: Worker idle backoff

**Files:**
- Modify: `backend/internal/workers/ocr_worker.go`
- Modify: `backend/internal/workers/categorizer_worker.go`

- [ ] Replace time.NewTicker with time.After loop
- [ ] Backoff: base → 2x → 4x → max. Reset on work found.
- [ ] Commit
