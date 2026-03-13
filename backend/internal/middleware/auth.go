package middleware

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"net/http"
	"sync"
	"time"
)

type Session struct {
	UserID    int64
	ExpiresAt time.Time
}

var (
	sessions = make(map[string]*Session)
	mu       sync.RWMutex
)

type contextKey string

const UserIDKey contextKey = "user_id"

func CreateSession(userID int64) string {
	b := make([]byte, 32)
	rand.Read(b)
	token := hex.EncodeToString(b)

	mu.Lock()
	sessions[token] = &Session{
		UserID:    userID,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	mu.Unlock()

	return token
}

func DeleteSession(token string) {
	mu.Lock()
	delete(sessions, token)
	mu.Unlock()
}

func APIKey(key string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if k := r.Header.Get("X-API-Key"); k == key {
				next.ServeHTTP(w, r)
				return
			}
			http.Error(w, "unauthorized", http.StatusUnauthorized)
		})
	}
}

func APIKeyOrSession(apiKey string, db *sql.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Check X-API-Key header first
			if k := r.Header.Get("X-API-Key"); k == apiKey {
				next.ServeHTTP(w, r)
				return
			}
			// Check session cookie
			cookie, err := r.Cookie("tt_session")
			if err != nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			mu.RLock()
			sess, ok := sessions[cookie.Value]
			mu.RUnlock()
			if !ok || sess.ExpiresAt.Before(time.Now()) {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			ctx := context.WithValue(r.Context(), UserIDKey, sess.UserID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
