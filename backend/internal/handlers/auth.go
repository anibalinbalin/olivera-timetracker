package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/olivera/timetracker/internal/middleware"
	"github.com/olivera/timetracker/internal/models"
	"golang.org/x/crypto/bcrypt"
)

func Login(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid request")
			return
		}
		var user models.User
		var hash string
		err := db.QueryRow("SELECT id, name, email, password_hash, role FROM users WHERE email = ?", req.Email).
			Scan(&user.ID, &user.Name, &user.Email, &hash, &user.Role)
		if err != nil {
			WriteError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
			WriteError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		token := middleware.CreateSession(user.ID)
		http.SetCookie(w, &http.Cookie{
			Name:     "tt_session",
			Value:    token,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			Expires:  time.Now().Add(24 * time.Hour),
		})
		WriteJSON(w, http.StatusOK, user)
	}
}

func Logout() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("tt_session")
		if err == nil {
			middleware.DeleteSession(cookie.Value)
		}
		http.SetCookie(w, &http.Cookie{
			Name:     "tt_session",
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			MaxAge:   -1,
		})
		WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
