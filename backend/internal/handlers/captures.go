package handlers

import (
	"database/sql"
	"encoding/json"
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

		file, _, err := r.FormFile("image")
		if err != nil {
			WriteError(w, http.StatusBadRequest, "missing image field")
			return
		}
		defer file.Close()

		imgData, err := io.ReadAll(file)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "failed to read image")
			return
		}

		// Insert capture row first (no screenshot_path yet)
		res, err := db.ExecContext(r.Context(),
			`INSERT INTO captures (user_id, timestamp, app_name, window_title, ocr_status)
			 VALUES (?, ?, ?, ?, 'PENDING')`,
			userID, ts, appName, windowTitle,
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

		// Save screenshot
		path, err := storage.SaveScreenshot(screenshotDir, captureID, imgData)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "failed to save screenshot")
			return
		}

		// Update screenshot_path
		if _, err := db.ExecContext(r.Context(),
			`UPDATE captures SET screenshot_path = ? WHERE id = ?`, path, captureID,
		); err != nil {
			WriteError(w, http.StatusInternalServerError, "failed to update screenshot_path")
			return
		}

		c := models.Capture{
			ID:             captureID,
			UserID:         userID,
			Timestamp:      ts,
			AppName:        appName,
			WindowTitle:    windowTitle,
			ScreenshotPath: &path,
			OCRStatus:      "PENDING",
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
			query += " AND DATE(timestamp) = ?"
			args = append(args, dateParam)
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
