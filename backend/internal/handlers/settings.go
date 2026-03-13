package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/olivera/timetracker/internal/models"
)

func GetSettings(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var s models.Settings
		err := db.QueryRowContext(r.Context(),
			`SELECT capture_interval_seconds, screenshot_retention_hours, ocr_enabled, categorization_confidence_threshold FROM settings WHERE id = 1`).
			Scan(&s.CaptureIntervalSeconds, &s.ScreenshotRetentionHours, &s.OCREnabled, &s.CategorizationConfidenceThreshold)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "query failed")
			return
		}
		WriteJSON(w, http.StatusOK, s)
	}
}

func UpdateSettings(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type UpdateSettingsRequest struct {
			CaptureIntervalSeconds            *int     `json:"capture_interval_seconds"`
			ScreenshotRetentionHours          *int     `json:"screenshot_retention_hours"`
			OCREnabled                        *bool    `json:"ocr_enabled"`
			CategorizationConfidenceThreshold *float64 `json:"categorization_confidence_threshold"`
		}

		var body UpdateSettingsRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid JSON")
			return
		}

		if body.CaptureIntervalSeconds != nil {
			if _, err := db.ExecContext(r.Context(),
				`UPDATE settings SET capture_interval_seconds = ? WHERE id = 1`, *body.CaptureIntervalSeconds); err != nil {
				WriteError(w, http.StatusInternalServerError, "update failed")
				return
			}
		}
		if body.ScreenshotRetentionHours != nil {
			if _, err := db.ExecContext(r.Context(),
				`UPDATE settings SET screenshot_retention_hours = ? WHERE id = 1`, *body.ScreenshotRetentionHours); err != nil {
				WriteError(w, http.StatusInternalServerError, "update failed")
				return
			}
		}
		if body.OCREnabled != nil {
			if _, err := db.ExecContext(r.Context(),
				`UPDATE settings SET ocr_enabled = ? WHERE id = 1`, *body.OCREnabled); err != nil {
				WriteError(w, http.StatusInternalServerError, "update failed")
				return
			}
		}
		if body.CategorizationConfidenceThreshold != nil {
			if _, err := db.ExecContext(r.Context(),
				`UPDATE settings SET categorization_confidence_threshold = ? WHERE id = 1`, *body.CategorizationConfidenceThreshold); err != nil {
				WriteError(w, http.StatusInternalServerError, "update failed")
				return
			}
		}

		var s models.Settings
		err := db.QueryRowContext(r.Context(),
			`SELECT capture_interval_seconds, screenshot_retention_hours, ocr_enabled, categorization_confidence_threshold FROM settings WHERE id = 1`).
			Scan(&s.CaptureIntervalSeconds, &s.ScreenshotRetentionHours, &s.OCREnabled, &s.CategorizationConfidenceThreshold)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "fetch failed")
			return
		}
		WriteJSON(w, http.StatusOK, s)
	}
}
