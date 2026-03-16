package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/olivera/timetracker/internal/models"
	"github.com/olivera/timetracker/internal/storage"
)

func CreateCapture(db *sql.DB, screenshotDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid multipart form")
			return
		}

		userIDStr := r.FormValue("user_id")
		userID, err := strconv.ParseInt(userIDStr, 10, 64)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid user_id")
			return
		}

		timestampStr := r.FormValue("timestamp")
		ts, err := time.Parse(time.RFC3339, timestampStr)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid timestamp; use RFC3339")
			return
		}

		appName := r.FormValue("app_name")
		windowTitle := r.FormValue("window_title")

		// Image is optional (allows metadata-only captures for testing)
		var imgData []byte
		file, _, err := r.FormFile("image")
		if err == nil {
			defer file.Close()
			imgData, err = io.ReadAll(file)
			if err != nil {
				WriteError(w, http.StatusInternalServerError, "failed to read image")
				return
			}
		}

		imageHash := r.FormValue("image_hash")

		// Dedup: if image_hash matches a prior completed capture, copy OCR results
		if imageHash != "" && len(imgData) > 0 {
			var matchID int64
			var matchOCRText sql.NullString
			var matchOCRStatus string
			var matchMatterID sql.NullInt64
			var matchConfidence sql.NullFloat64
			err := db.QueryRowContext(r.Context(),
				`SELECT id, ocr_text, ocr_status, matter_id, ai_confidence FROM captures
				 WHERE image_hash = ? AND ocr_status = 'COMPLETED' AND user_id = ? LIMIT 1`,
				imageHash, userID,
			).Scan(&matchID, &matchOCRText, &matchOCRStatus, &matchMatterID, &matchConfidence)
			if err == nil {
				// Found a match — insert with copied OCR data, skip screenshot save
				var ocrTextArg, matterArg, confArg any
				if matchOCRText.Valid {
					ocrTextArg = matchOCRText.String
				}
				if matchMatterID.Valid {
					matterArg = matchMatterID.Int64
				}
				if matchConfidence.Valid {
					confArg = matchConfidence.Float64
				}

				res, err := db.ExecContext(r.Context(),
					`INSERT INTO captures (user_id, timestamp, app_name, window_title, ocr_text, ocr_status, matter_id, ai_confidence, image_hash)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					userID, ts, appName, windowTitle, ocrTextArg, "COMPLETED", matterArg, confArg, imageHash,
				)
				if err != nil {
					WriteError(w, http.StatusInternalServerError, "db insert failed")
					return
				}
				captureID, _ := res.LastInsertId()

				c := models.Capture{
					ID:          captureID,
					UserID:      userID,
					Timestamp:   ts,
					AppName:     appName,
					WindowTitle: windowTitle,
					OCRStatus:   "COMPLETED",
				}
				if matchOCRText.Valid {
					c.OCRText = &matchOCRText.String
				}
				if matchMatterID.Valid {
					c.MatterID = &matchMatterID.Int64
				}
				if matchConfidence.Valid {
					c.AIConfidence = &matchConfidence.Float64
				}
				WriteJSON(w, http.StatusCreated, c)
				return
			}
		}

		// Insert capture row first (no screenshot_path yet)
		ocrStatus := "PENDING"
		if len(imgData) == 0 {
			ocrStatus = "COMPLETED" // no image = skip OCR
		}
		res, err := db.ExecContext(r.Context(),
			`INSERT INTO captures (user_id, timestamp, app_name, window_title, ocr_status, image_hash)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			userID, ts, appName, windowTitle, ocrStatus, sql.NullString{String: imageHash, Valid: imageHash != ""},
		)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "db insert failed")
			return
		}

		captureID, err := res.LastInsertId()
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "failed to get capture id")
			return
		}

		// Save screenshot (if image provided)
		var screenshotPath *string
		if len(imgData) > 0 {
			path, err := storage.SaveScreenshot(screenshotDir, captureID, imgData)
			if err != nil {
				WriteError(w, http.StatusInternalServerError, "failed to save screenshot")
				return
			}
			screenshotPath = &path
			if _, err := db.ExecContext(r.Context(),
				`UPDATE captures SET screenshot_path = ? WHERE id = ?`, path, captureID,
			); err != nil {
				WriteError(w, http.StatusInternalServerError, "failed to update screenshot_path")
				return
			}
		}

		c := models.Capture{
			ID:             captureID,
			UserID:         userID,
			Timestamp:      ts,
			AppName:        appName,
			WindowTitle:    windowTitle,
			ScreenshotPath: screenshotPath,
			OCRStatus:      ocrStatus,
		}
		WriteJSON(w, http.StatusCreated, c)
	}
}

func ListCaptures(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		dateParam := q.Get("date")
		userIDParam := q.Get("user_id")
		matterIDParam := q.Get("matter_id")
		ocrStatusParam := q.Get("ocr_status")

		query := `SELECT id, user_id, timestamp, app_name, window_title,
		          screenshot_path, ocr_text, ocr_status, matter_id, ai_confidence, created_at
		          FROM captures WHERE 1=1`
		var args []any

		if dateParam != "" {
			// Support timezone offset: ?date=2026-03-13&tz=-3
			tzParam := q.Get("tz")
			tzOffset := 0
			if tzParam != "" {
				fmt.Sscanf(tzParam, "%d", &tzOffset)
			}
			// Convert local date to UTC range
			// e.g. date=2026-03-13, tz=-3 means 2026-03-13T03:00:00Z to 2026-03-14T03:00:00Z
			query += " AND timestamp >= ? AND timestamp < ?"
			dayStart := dateParam + "T00:00:00Z"
			t, _ := time.Parse("2006-01-02T15:04:05Z", dayStart)
			utcStart := t.Add(time.Duration(-tzOffset) * time.Hour)
			utcEnd := utcStart.Add(24 * time.Hour)
			args = append(args, utcStart.UTC().Format("2006-01-02 15:04:05+00:00"), utcEnd.UTC().Format("2006-01-02 15:04:05+00:00"))
		}
		if userIDParam != "" {
			query += " AND user_id = ?"
			args = append(args, userIDParam)
		}
		if matterIDParam != "" {
			query += " AND matter_id = ?"
			args = append(args, matterIDParam)
		}
		if ocrStatusParam != "" {
			query += " AND ocr_status = ?"
			args = append(args, ocrStatusParam)
		}
		query += " ORDER BY timestamp DESC"

		rows, err := db.QueryContext(r.Context(), query, args...)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "db query failed")
			return
		}
		defer rows.Close()

		captures := []models.Capture{}
		for rows.Next() {
			var c models.Capture
			var screenshotPath, ocrText sql.NullString
			var matterID sql.NullInt64
			var aiConfidence sql.NullFloat64

			if err := rows.Scan(
				&c.ID, &c.UserID, &c.Timestamp, &c.AppName, &c.WindowTitle,
				&screenshotPath, &ocrText, &c.OCRStatus, &matterID, &aiConfidence, &c.CreatedAt,
			); err != nil {
				WriteError(w, http.StatusInternalServerError, "scan failed")
				return
			}

			if screenshotPath.Valid {
				c.ScreenshotPath = &screenshotPath.String
			}
			if ocrText.Valid {
				c.OCRText = &ocrText.String
			}
			if matterID.Valid {
				c.MatterID = &matterID.Int64
			}
			if aiConfidence.Valid {
				c.AIConfidence = &aiConfidence.Float64
			}

			captures = append(captures, c)
		}
		if err := rows.Err(); err != nil {
			WriteError(w, http.StatusInternalServerError, "rows error")
			return
		}

		WriteJSON(w, http.StatusOK, captures)
	}
}

func ReassignCapture(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idStr := chi.URLParam(r, "id")
		captureID, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid id")
			return
		}

		var body struct {
			MatterID int64 `json:"matter_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid JSON")
			return
		}

		// Read current capture
		var c models.Capture
		var screenshotPath, ocrText sql.NullString
		var fromMatterID sql.NullInt64
		var aiConfidence sql.NullFloat64

		err = db.QueryRowContext(r.Context(),
			`SELECT id, user_id, timestamp, app_name, window_title,
			 screenshot_path, ocr_text, ocr_status, matter_id, ai_confidence, created_at
			 FROM captures WHERE id = ?`, captureID,
		).Scan(
			&c.ID, &c.UserID, &c.Timestamp, &c.AppName, &c.WindowTitle,
			&screenshotPath, &ocrText, &c.OCRStatus, &fromMatterID, &aiConfidence, &c.CreatedAt,
		)
		if err == sql.ErrNoRows {
			WriteError(w, http.StatusNotFound, "capture not found")
			return
		}
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "db query failed")
			return
		}

		if screenshotPath.Valid {
			c.ScreenshotPath = &screenshotPath.String
		}
		if ocrText.Valid {
			c.OCRText = &ocrText.String
		}
		if fromMatterID.Valid {
			c.MatterID = &fromMatterID.Int64
		}
		if aiConfidence.Valid {
			c.AIConfidence = &aiConfidence.Float64
		}

		// Build correction insert args — handle nullable from_matter_id and ocr_text
		var fromMatterArg any
		if fromMatterID.Valid {
			fromMatterArg = fromMatterID.Int64
		}
		var ocrTextArg any
		if ocrText.Valid {
			ocrTextArg = ocrText.String
		}

		// Normalize empty strings to nil for app_name/window_title (always non-null)
		appName := strings.TrimSpace(c.AppName)
		windowTitle := strings.TrimSpace(c.WindowTitle)

		_, err = db.ExecContext(r.Context(),
			`INSERT INTO corrections (user_id, capture_id, from_matter_id, to_matter_id, app_name, window_title, ocr_text)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			c.UserID, c.ID, fromMatterArg, body.MatterID, appName, windowTitle, ocrTextArg,
		)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "failed to insert correction")
			return
		}

		// Update capture
		if _, err := db.ExecContext(r.Context(),
			`UPDATE captures SET matter_id = ? WHERE id = ?`, body.MatterID, captureID,
		); err != nil {
			WriteError(w, http.StatusInternalServerError, "failed to update capture")
			return
		}

		c.MatterID = &body.MatterID
		WriteJSON(w, http.StatusOK, c)
	}
}
