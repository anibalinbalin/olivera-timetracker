package workers

import (
	"context"
	"database/sql"
	"log"
	"time"

	"github.com/olivera/timetracker/internal/services"
)

func StartCategorizerWorker(ctx context.Context, db *sql.DB, cat services.Categorizer) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("categorizer worker: shutting down")
			return
		case <-ticker.C:
			processCategorizationBatch(ctx, db, cat)
		}
	}
}

func processCategorizationBatch(ctx context.Context, db *sql.DB, cat services.Categorizer) {
	var threshold float64
	db.QueryRow("SELECT categorization_confidence_threshold FROM settings WHERE id = 1").Scan(&threshold)
	if threshold == 0 {
		threshold = 0.7
	}

	rows, err := db.QueryContext(ctx, `
		SELECT id, app_name, window_title, COALESCE(ocr_text, '')
		FROM captures
		WHERE ocr_status = 'COMPLETED' AND matter_id IS NULL AND ai_confidence IS NULL
		LIMIT 20`)
	if err != nil {
		log.Printf("categorizer: query error: %v", err)
		return
	}
	defer rows.Close()

	var captures []services.CaptureContext
	for rows.Next() {
		var c services.CaptureContext
		rows.Scan(&c.ID, &c.AppName, &c.WindowTitle, &c.OCRText)
		captures = append(captures, c)
	}
	log.Printf("categorizer: found %d uncategorized captures", len(captures))
	if len(captures) == 0 {
		return
	}

	mRows, err := db.QueryContext(ctx, `
		SELECT m.id, m.name, m.matter_number, c.name, COALESCE(m.description, '')
		FROM matters m JOIN clients c ON m.client_id = c.id
		WHERE m.is_active = 1`)
	if err != nil {
		return
	}
	defer mRows.Close()

	var matters []services.MatterContext
	for mRows.Next() {
		var m services.MatterContext
		mRows.Scan(&m.ID, &m.Name, &m.MatterNumber, &m.ClientName, &m.Description)
		matters = append(matters, m)
	}
	if len(matters) == 0 {
		return
	}

	cRows, err := db.QueryContext(ctx, `
		SELECT co.app_name, co.window_title, COALESCE(co.ocr_text, ''), m.name
		FROM corrections co JOIN matters m ON co.to_matter_id = m.id
		ORDER BY co.created_at DESC LIMIT 50`)
	if err != nil {
		return
	}
	defer cRows.Close()

	var corrections []services.CorrectionContext
	for cRows.Next() {
		var c services.CorrectionContext
		cRows.Scan(&c.AppName, &c.WindowTitle, &c.OCRText, &c.MatterName)
		corrections = append(corrections, c)
	}

	results, err := cat.Categorize(captures, matters, corrections)
	if err != nil {
		log.Printf("categorizer worker: %v", err)
		return
	}

	for _, r := range results {
		if r.MatterID != nil && *r.MatterID > 0 && r.Confidence >= threshold {
			db.Exec("UPDATE captures SET matter_id = ?, ai_confidence = ? WHERE id = ?",
				*r.MatterID, r.Confidence, r.CaptureID)
			log.Printf("categorizer: capture %d -> matter %d (%.2f)", r.CaptureID, *r.MatterID, r.Confidence)
		} else {
			// Mark as attempted so we skip next cycle
			db.Exec("UPDATE captures SET ai_confidence = ? WHERE id = ? AND ai_confidence IS NULL",
				r.Confidence, r.CaptureID)
		}
	}
}
