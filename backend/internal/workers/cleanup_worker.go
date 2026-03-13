package workers

import (
	"context"
	"database/sql"
	"log"
	"os"
	"time"
)

func StartCleanupWorker(ctx context.Context, db *sql.DB) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	// Run once on startup too
	cleanupScreenshots(ctx, db)

	for {
		select {
		case <-ctx.Done():
			log.Println("cleanup worker: shutting down")
			return
		case <-ticker.C:
			cleanupScreenshots(ctx, db)
		}
	}
}

func cleanupScreenshots(ctx context.Context, db *sql.DB) {
	var retentionHours int
	db.QueryRow("SELECT screenshot_retention_hours FROM settings WHERE id = 1").Scan(&retentionHours)
	if retentionHours == 0 {
		retentionHours = 72
	}

	cutoff := time.Now().Add(-time.Duration(retentionHours) * time.Hour)

	rows, err := db.QueryContext(ctx, `
		SELECT id, screenshot_path FROM captures
		WHERE screenshot_path IS NOT NULL AND created_at < ?`, cutoff)
	if err != nil {
		log.Printf("cleanup worker: query error: %v", err)
		return
	}
	defer rows.Close()

	var cleaned int
	for rows.Next() {
		var id int64
		var path string
		rows.Scan(&id, &path)

		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			log.Printf("cleanup worker: failed to delete %s: %v", path, err)
		}

		db.Exec("UPDATE captures SET screenshot_path = NULL WHERE id = ?", id)
		cleaned++
	}

	if cleaned > 0 {
		log.Printf("cleanup worker: cleaned %d screenshots", cleaned)
	}
}
