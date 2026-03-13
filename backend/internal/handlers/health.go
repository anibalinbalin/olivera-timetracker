package handlers

import "net/http"

var Version = "0.1.0"

func Health(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"version": Version,
	})
}
