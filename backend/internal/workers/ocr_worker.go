package workers

import (
	"context"
	"database/sql"
	"log"
	"os"
	"time"

	"github.com/olivera/timetracker/internal/services"
)

func StartOCRWorker(ctx context.Context, db *sql.DB, ocr services.OCRClient) {
	// On startup: reset stuck PROCESSING back to PENDING
	db.Exec("UPDATE captures SET ocr_status = 'PENDING' WHERE ocr_status = 'PROCESSING'")

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("ocr worker: shutting down")
			return
		case <-ticker.C:
			processOCRBatch(ctx, db, ocr)
		}
	}
}

func processOCRBatch(ctx context.Context, db *sql.DB, ocr services.OCRClient) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, screenshot_path FROM captures
		WHERE ocr_status = 'PENDING' AND screenshot_path IS NOT NULL
		LIMIT 5`)
	if err != nil {
		log.Printf("ocr worker: query error: %v", err)
		return
	}
	defer rows.Close()

	type pending struct {
		ID   int64
		Path string
	}
	var items []pending
	for rows.Next() {
		var p pending
		rows.Scan(&p.ID, &p.Path)
		items = append(items, p)
	}

	for _, item := range items {
		select {
		case <-ctx.Done():
			return
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

		db.Exec("UPDATE captures SET ocr_text = ?, ocr_status = 'COMPLETED' WHERE id = ?", text, item.ID)
		log.Printf("ocr worker: capture %d completed", item.ID)
	}
}
