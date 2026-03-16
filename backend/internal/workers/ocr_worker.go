package workers

import (
	"context"
	"database/sql"
	"fmt"
	"hash/fnv"
	"log"
	"os"
	"time"

	"github.com/olivera/timetracker/internal/services"
)

func StartOCRWorker(ctx context.Context, db *sql.DB, ocr services.OCRClient) {
	// On startup: reset stuck PROCESSING back to PENDING
	db.Exec("UPDATE captures SET ocr_status = 'PENDING' WHERE ocr_status = 'PROCESSING'")

	baseInterval := 5 * time.Second
	maxInterval := 60 * time.Second
	currentInterval := baseInterval

	for {
		select {
		case <-ctx.Done():
			log.Println("ocr worker: shutting down")
			return
		case <-time.After(currentInterval):
			found := processOCRBatch(ctx, db, ocr)
			if found {
				currentInterval = baseInterval
			} else if currentInterval < maxInterval {
				currentInterval = currentInterval * 2
				if currentInterval > maxInterval {
					currentInterval = maxInterval
				}
			}
		}
	}
}

func processOCRBatch(ctx context.Context, db *sql.DB, ocr services.OCRClient) bool {
	rows, err := db.QueryContext(ctx, `
		SELECT id, screenshot_path, user_id FROM captures
		WHERE ocr_status = 'PENDING' AND screenshot_path IS NOT NULL
		LIMIT 5`)
	if err != nil {
		log.Printf("ocr worker: query error: %v", err)
		return false
	}
	defer rows.Close()

	type pending struct {
		ID     int64
		Path   string
		UserID int64
	}
	var items []pending
	for rows.Next() {
		var p pending
		rows.Scan(&p.ID, &p.Path, &p.UserID)
		items = append(items, p)
	}

	for _, item := range items {
		select {
		case <-ctx.Done():
			return len(items) > 0
		default:
		}

		db.Exec("UPDATE captures SET ocr_status = 'PROCESSING' WHERE id = ?", item.ID)

		imgData, err := os.ReadFile(item.Path)
		if err != nil {
			log.Printf("ocr worker: read screenshot %d: %v", item.ID, err)
			db.Exec("UPDATE captures SET ocr_status = 'FAILED' WHERE id = ?", item.ID)
			continue
		}

		// Retry with backoff: 5s, 15s, 45s
		var text string
		var ocrErr error
		backoffs := []time.Duration{5 * time.Second, 15 * time.Second, 45 * time.Second}

		for attempt, backoff := range backoffs {
			text, ocrErr = ocr.Extract(imgData)
			if ocrErr == nil {
				break
			}
			log.Printf("ocr worker: attempt %d for capture %d failed: %v", attempt+1, item.ID, ocrErr)
			if attempt < len(backoffs)-1 {
				time.Sleep(backoff)
			}
		}

		if ocrErr != nil {
			log.Printf("ocr worker: capture %d failed after 3 attempts", item.ID)
			db.Exec("UPDATE captures SET ocr_status = 'FAILED' WHERE id = ?", item.ID)
			continue
		}

		// Compute FNV-1a hash of OCR text
		h := fnv.New64a()
		h.Write([]byte(text))
		textHash := fmt.Sprintf("%x", h.Sum64())

		db.Exec("UPDATE captures SET ocr_text = ?, ocr_status = 'COMPLETED', ocr_text_hash = ? WHERE id = ?", text, textHash, item.ID)
		log.Printf("ocr worker: capture %d completed", item.ID)

		// Check for prior capture with same text hash and assigned matter
		var matchMatterID int64
		var matchConfidence float64
		err = db.QueryRow(
			`SELECT matter_id, ai_confidence FROM captures
			 WHERE ocr_text_hash = ? AND matter_id IS NOT NULL AND user_id = ? AND id != ? LIMIT 1`,
			textHash, item.UserID, item.ID,
		).Scan(&matchMatterID, &matchConfidence)
		if err == nil {
			db.Exec("UPDATE captures SET matter_id = ?, ai_confidence = ? WHERE id = ?",
				matchMatterID, matchConfidence, item.ID)
			log.Printf("ocr worker: capture %d deduped -> matter %d (%.2f)", item.ID, matchMatterID, matchConfidence)
		}
	}

	return len(items) > 0
}
