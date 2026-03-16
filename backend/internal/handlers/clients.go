package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/olivera/timetracker/internal/models"
)

func ListClients(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.QueryContext(r.Context(),
			`SELECT id, name, code, is_active, created_at FROM clients WHERE is_active = 1 ORDER BY name`)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		clients := []models.Client{}
		for rows.Next() {
			var c models.Client
			if err := rows.Scan(&c.ID, &c.Name, &c.Code, &c.IsActive, &c.CreatedAt); err != nil {
				WriteError(w, http.StatusInternalServerError, "scan failed")
				return
			}
			clients = append(clients, c)
		}
		WriteJSON(w, http.StatusOK, clients)
	}
}

func CreateClient(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Name string `json:"name"`
			Code string `json:"code"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if body.Name == "" {
			WriteError(w, http.StatusBadRequest, "name required")
			return
		}
		if body.Code == "" {
			body.Code = strings.ToUpper(body.Name[:min(3, len(body.Name))])
		}

		res, err := db.ExecContext(r.Context(),
			`INSERT INTO clients (name, code) VALUES (?, ?)`, body.Name, body.Code)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "insert failed")
			return
		}
		id, _ := res.LastInsertId()

		var c models.Client
		err = db.QueryRowContext(r.Context(),
			`SELECT id, name, code, is_active, created_at FROM clients WHERE id = ?`, id).
			Scan(&c.ID, &c.Name, &c.Code, &c.IsActive, &c.CreatedAt)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "fetch failed")
			return
		}
		WriteJSON(w, http.StatusCreated, c)
	}
}

func UpdateClient(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid id")
			return
		}

		var body struct {
			Name string `json:"name"`
			Code string `json:"code"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if body.Name == "" {
			WriteError(w, http.StatusBadRequest, "name required")
			return
		}
		if body.Code == "" {
			body.Code = strings.ToUpper(body.Name[:min(3, len(body.Name))])
		}

		_, err = db.ExecContext(r.Context(),
			`UPDATE clients SET name = ?, code = ? WHERE id = ? AND is_active = 1`,
			body.Name, body.Code, id)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "update failed")
			return
		}

		var c models.Client
		err = db.QueryRowContext(r.Context(),
			`SELECT id, name, code, is_active, created_at FROM clients WHERE id = ?`, id).
			Scan(&c.ID, &c.Name, &c.Code, &c.IsActive, &c.CreatedAt)
		if err != nil {
			WriteError(w, http.StatusNotFound, "not found")
			return
		}
		WriteJSON(w, http.StatusOK, c)
	}
}

func DeleteClient(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid id")
			return
		}

		_, err = db.ExecContext(r.Context(),
			`UPDATE clients SET is_active = 0 WHERE id = ? AND is_active = 1`, id)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "delete failed")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
