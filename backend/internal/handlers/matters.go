package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/olivera/timetracker/internal/models"
)

type MatterWithClient struct {
	models.Matter
	ClientName string `json:"client_name"`
}

func ListMatters(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.QueryContext(r.Context(), `
			SELECT m.id, m.client_id, m.name, m.matter_number, COALESCE(m.description, ''),
			       m.is_active, m.created_at, c.name
			FROM matters m
			JOIN clients c ON c.id = m.client_id
			WHERE m.is_active = 1
			ORDER BY c.name, m.name`)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		matters := []MatterWithClient{}
		for rows.Next() {
			var m MatterWithClient
			if err := rows.Scan(&m.ID, &m.ClientID, &m.Name, &m.MatterNumber,
				&m.Description, &m.IsActive, &m.CreatedAt, &m.ClientName); err != nil {
				WriteError(w, http.StatusInternalServerError, "scan failed")
				return
			}
			matters = append(matters, m)
		}
		WriteJSON(w, http.StatusOK, matters)
	}
}

func CreateMatter(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			ClientID     int64  `json:"client_id"`
			Name         string `json:"name"`
			MatterNumber string `json:"matter_number"`
			Description  string `json:"description"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if body.ClientID == 0 || body.Name == "" || body.MatterNumber == "" {
			WriteError(w, http.StatusBadRequest, "client_id, name, and matter_number required")
			return
		}

		res, err := db.ExecContext(r.Context(),
			`INSERT INTO matters (client_id, name, matter_number, description) VALUES (?, ?, ?, ?)`,
			body.ClientID, body.Name, body.MatterNumber, body.Description)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "insert failed")
			return
		}
		id, _ := res.LastInsertId()

		var m models.Matter
		err = db.QueryRowContext(r.Context(),
			`SELECT id, client_id, name, matter_number, COALESCE(description, ''), is_active, created_at
			 FROM matters WHERE id = ?`, id).
			Scan(&m.ID, &m.ClientID, &m.Name, &m.MatterNumber, &m.Description, &m.IsActive, &m.CreatedAt)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "fetch failed")
			return
		}
		WriteJSON(w, http.StatusCreated, m)
	}
}

func UpdateMatter(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid id")
			return
		}

		var body struct {
			Name         string `json:"name"`
			MatterNumber string `json:"matter_number"`
			Description  string `json:"description"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if body.Name == "" || body.MatterNumber == "" {
			WriteError(w, http.StatusBadRequest, "name and matter_number required")
			return
		}

		_, err = db.ExecContext(r.Context(),
			`UPDATE matters SET name = ?, matter_number = ?, description = ? WHERE id = ? AND is_active = 1`,
			body.Name, body.MatterNumber, body.Description, id)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "update failed")
			return
		}

		var m models.Matter
		err = db.QueryRowContext(r.Context(),
			`SELECT id, client_id, name, matter_number, COALESCE(description, ''), is_active, created_at
			 FROM matters WHERE id = ?`, id).
			Scan(&m.ID, &m.ClientID, &m.Name, &m.MatterNumber, &m.Description, &m.IsActive, &m.CreatedAt)
		if err != nil {
			WriteError(w, http.StatusNotFound, "not found")
			return
		}
		WriteJSON(w, http.StatusOK, m)
	}
}

func DeleteMatter(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid id")
			return
		}

		_, err = db.ExecContext(r.Context(),
			`UPDATE matters SET is_active = 0 WHERE id = ? AND is_active = 1`, id)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "delete failed")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
