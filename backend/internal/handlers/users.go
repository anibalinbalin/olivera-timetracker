package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/olivera/timetracker/internal/models"
	"golang.org/x/crypto/bcrypt"
)

func ListUsers(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.QueryContext(r.Context(),
			`SELECT id, name, email, password_hash, role, created_at FROM users ORDER BY name`)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		users := []models.User{}
		for rows.Next() {
			var u models.User
			if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.CreatedAt); err != nil {
				WriteError(w, http.StatusInternalServerError, "scan failed")
				return
			}
			users = append(users, u)
		}
		WriteJSON(w, http.StatusOK, users)
	}
}

func CreateUser(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Name     string `json:"name"`
			Email    string `json:"email"`
			Password string `json:"password"`
			Role     string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if body.Name == "" || body.Email == "" || body.Password == "" {
			WriteError(w, http.StatusBadRequest, "name, email, and password required")
			return
		}
		if body.Role == "" {
			body.Role = "lawyer"
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "hash failed")
			return
		}

		res, err := db.ExecContext(r.Context(),
			`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
			body.Name, body.Email, string(hash), body.Role)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "insert failed")
			return
		}
		id, _ := res.LastInsertId()

		var u models.User
		err = db.QueryRowContext(r.Context(),
			`SELECT id, name, email, password_hash, role, created_at FROM users WHERE id = ?`, id).
			Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.CreatedAt)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "fetch failed")
			return
		}
		WriteJSON(w, http.StatusCreated, u)
	}
}
