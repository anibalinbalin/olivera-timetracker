package handlers

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/olivera/timetracker/internal/models"
	"github.com/olivera/timetracker/internal/services"
)

type EntryWithMatter struct {
	models.TimeEntry
	MatterName   string `json:"matter_name"`
	MatterNumber string `json:"matter_number"`
	ClientName   string `json:"client_name"`
}

func ListEntries(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		dateParam := q.Get("date")
		userIDParam := q.Get("user_id")
		statusParam := q.Get("status")

		query := `
			SELECT te.id, te.user_id, te.matter_id, te.date, te.duration_minutes,
			       te.description, te.status, te.created_at, te.updated_at,
			       m.name, m.matter_number, cl.name
			FROM time_entries te
			JOIN matters m ON m.id = te.matter_id
			JOIN clients cl ON cl.id = m.client_id
			WHERE 1=1`
		var args []any

		if dateParam != "" {
			query += " AND te.date = ?"
			args = append(args, dateParam)
		}
		if userIDParam != "" {
			query += " AND te.user_id = ?"
			args = append(args, userIDParam)
		}
		if statusParam != "" {
			query += " AND te.status = ?"
			args = append(args, statusParam)
		}
		query += " ORDER BY te.date DESC, te.id DESC"

		rows, err := db.QueryContext(r.Context(), query, args...)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "db query failed")
			return
		}
		defer rows.Close()

		entries := []EntryWithMatter{}
		for rows.Next() {
			var e EntryWithMatter
			var desc sql.NullString
			if err := rows.Scan(
				&e.ID, &e.UserID, &e.MatterID, &e.Date, &e.DurationMinutes,
				&desc, &e.Status, &e.CreatedAt, &e.UpdatedAt,
				&e.MatterName, &e.MatterNumber, &e.ClientName,
			); err != nil {
				WriteError(w, http.StatusInternalServerError, "scan failed")
				return
			}
			if desc.Valid {
				e.Description = &desc.String
			}
			entries = append(entries, e)
		}
		if err := rows.Err(); err != nil {
			WriteError(w, http.StatusInternalServerError, "rows error")
			return
		}

		WriteJSON(w, http.StatusOK, entries)
	}
}

func CreateEntry(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			UserID          int64   `json:"user_id"`
			MatterID        int64   `json:"matter_id"`
			Date            string  `json:"date"`
			DurationMinutes int     `json:"duration_minutes"`
			Description     *string `json:"description"`
			CaptureIDs      []int64 `json:"capture_ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if body.UserID == 0 || body.MatterID == 0 || body.Date == "" || body.DurationMinutes == 0 {
			WriteError(w, http.StatusBadRequest, "user_id, matter_id, date, duration_minutes required")
			return
		}

		res, err := db.ExecContext(r.Context(), `
			INSERT INTO time_entries (user_id, matter_id, date, duration_minutes, description, status)
			VALUES (?, ?, ?, ?, ?, 'DRAFT')
		`, body.UserID, body.MatterID, body.Date, body.DurationMinutes, body.Description)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "db insert failed")
			return
		}
		entryID, err := res.LastInsertId()
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "failed to get entry id")
			return
		}

		for _, cid := range body.CaptureIDs {
			if _, err := db.ExecContext(r.Context(),
				`INSERT INTO capture_entries (capture_id, entry_id) VALUES (?, ?)`, cid, entryID,
			); err != nil {
				WriteError(w, http.StatusInternalServerError, "failed to link capture")
				return
			}
		}

		entry, err := fetchEntryWithMatter(r, db, entryID)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "failed to fetch entry")
			return
		}
		WriteJSON(w, http.StatusCreated, entry)
	}
}

func UpdateEntry(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idStr := chi.URLParam(r, "id")
		entryID, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid id")
			return
		}

		var body struct {
			Description     *string `json:"description"`
			MatterID        *int64  `json:"matter_id"`
			DurationMinutes *int    `json:"duration_minutes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid JSON")
			return
		}

		setClauses := "updated_at = CURRENT_TIMESTAMP"
		var args []any
		if body.Description != nil {
			setClauses += ", description = ?"
			args = append(args, *body.Description)
		}
		if body.MatterID != nil {
			setClauses += ", matter_id = ?"
			args = append(args, *body.MatterID)
		}
		if body.DurationMinutes != nil {
			setClauses += ", duration_minutes = ?"
			args = append(args, *body.DurationMinutes)
		}
		args = append(args, entryID)

		res, err := db.ExecContext(r.Context(),
			"UPDATE time_entries SET "+setClauses+" WHERE id = ?", args...)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "db update failed")
			return
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			WriteError(w, http.StatusNotFound, "entry not found")
			return
		}

		entry, err := fetchEntryWithMatter(r, db, entryID)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "failed to fetch entry")
			return
		}
		WriteJSON(w, http.StatusOK, entry)
	}
}

func UpdateEntryStatus(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idStr := chi.URLParam(r, "id")
		entryID, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid id")
			return
		}

		var body struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid JSON")
			return
		}

		var currentStatus string
		err = db.QueryRowContext(r.Context(),
			`SELECT status FROM time_entries WHERE id = ?`, entryID,
		).Scan(&currentStatus)
		if err == sql.ErrNoRows {
			WriteError(w, http.StatusNotFound, "entry not found")
			return
		}
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "db query failed")
			return
		}

		// Validate transition: DRAFT→REVIEWED→APPROVED only
		validTransitions := map[string]string{
			"DRAFT":    "REVIEWED",
			"REVIEWED": "APPROVED",
		}
		allowed, ok := validTransitions[currentStatus]
		if !ok || allowed != body.Status {
			WriteError(w, http.StatusBadRequest,
				fmt.Sprintf("invalid transition: %s → %s", currentStatus, body.Status))
			return
		}

		if _, err := db.ExecContext(r.Context(),
			`UPDATE time_entries SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
			body.Status, entryID,
		); err != nil {
			WriteError(w, http.StatusInternalServerError, "db update failed")
			return
		}

		entry, err := fetchEntryWithMatter(r, db, entryID)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "failed to fetch entry")
			return
		}
		WriteJSON(w, http.StatusOK, entry)
	}
}

func GenerateEntriesHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			UserID int64  `json:"user_id"`
			Date   string `json:"date"`
			TZ     int    `json:"tz"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if body.UserID == 0 || body.Date == "" {
			WriteError(w, http.StatusBadRequest, "user_id and date required")
			return
		}

		entries, err := services.GenerateEntries(db, body.UserID, body.Date, body.TZ)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "generation failed")
			return
		}
		WriteJSON(w, http.StatusCreated, entries)
	}
}

func ExportEntries(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		from := q.Get("from")
		to := q.Get("to")
		status := q.Get("status")
		if status == "" {
			status = "APPROVED"
		}

		query := `
			SELECT te.date, m.matter_number, m.name, cl.name,
			       te.duration_minutes, COALESCE(te.description, ''), te.status
			FROM time_entries te
			JOIN matters m ON m.id = te.matter_id
			JOIN clients cl ON cl.id = m.client_id
			WHERE te.status = ?`
		args := []any{status}

		if from != "" {
			query += " AND te.date >= ?"
			args = append(args, from)
		}
		if to != "" {
			query += " AND te.date <= ?"
			args = append(args, to)
		}
		query += " ORDER BY te.date, m.matter_number"

		rows, err := db.QueryContext(r.Context(), query, args...)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "db query failed")
			return
		}
		defer rows.Close()

		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=\"time_entries.csv\"")

		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"date", "matter_number", "matter_name", "client_name", "duration_hours", "description", "status"})

		for rows.Next() {
			var date, matterNumber, matterName, clientName, desc, st string
			var durationMinutes int
			if err := rows.Scan(&date, &matterNumber, &matterName, &clientName, &durationMinutes, &desc, &st); err != nil {
				return
			}
			hours := fmt.Sprintf("%.2f", float64(durationMinutes)/60.0)
			_ = cw.Write([]string{date, matterNumber, matterName, clientName, hours, desc, st})
		}
		cw.Flush()
	}
}

// fetchEntryWithMatter reads a single entry joined with matter/client info.
func fetchEntryWithMatter(r *http.Request, db *sql.DB, id int64) (*EntryWithMatter, error) {
	var e EntryWithMatter
	var desc sql.NullString
	err := db.QueryRowContext(r.Context(), `
		SELECT te.id, te.user_id, te.matter_id, te.date, te.duration_minutes,
		       te.description, te.status, te.created_at, te.updated_at,
		       m.name, m.matter_number, cl.name
		FROM time_entries te
		JOIN matters m ON m.id = te.matter_id
		JOIN clients cl ON cl.id = m.client_id
		WHERE te.id = ?
	`, id).Scan(
		&e.ID, &e.UserID, &e.MatterID, &e.Date, &e.DurationMinutes,
		&desc, &e.Status, &e.CreatedAt, &e.UpdatedAt,
		&e.MatterName, &e.MatterNumber, &e.ClientName,
	)
	if err != nil {
		return nil, err
	}
	if desc.Valid {
		e.Description = &desc.String
	}
	return &e, nil
}
