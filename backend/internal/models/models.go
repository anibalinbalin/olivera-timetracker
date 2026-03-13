package models

import "time"

type User struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
}

type Client struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Code      string    `json:"code"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
}

type Matter struct {
	ID           int64     `json:"id"`
	ClientID     int64     `json:"client_id"`
	Name         string    `json:"name"`
	MatterNumber string    `json:"matter_number"`
	Description  string    `json:"description,omitempty"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
}

type Capture struct {
	ID             int64     `json:"id"`
	UserID         int64     `json:"user_id"`
	Timestamp      time.Time `json:"timestamp"`
	AppName        string    `json:"app_name"`
	WindowTitle    string    `json:"window_title"`
	ScreenshotPath *string   `json:"screenshot_path,omitempty"`
	OCRText        *string   `json:"ocr_text,omitempty"`
	OCRStatus      string    `json:"ocr_status"`
	MatterID       *int64    `json:"matter_id,omitempty"`
	AIConfidence   *float64  `json:"ai_confidence,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

type TimeEntry struct {
	ID              int64     `json:"id"`
	UserID          int64     `json:"user_id"`
	MatterID        int64     `json:"matter_id"`
	Date            string    `json:"date"`
	DurationMinutes int       `json:"duration_minutes"`
	Description     *string   `json:"description,omitempty"`
	Status          string    `json:"status"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type Settings struct {
	CaptureIntervalSeconds            int     `json:"capture_interval_seconds"`
	ScreenshotRetentionHours          int     `json:"screenshot_retention_hours"`
	OCREnabled                        bool    `json:"ocr_enabled"`
	CategorizationConfidenceThreshold float64 `json:"categorization_confidence_threshold"`
}

type Correction struct {
	ID           int64     `json:"id"`
	UserID       int64     `json:"user_id"`
	CaptureID    int64     `json:"capture_id"`
	FromMatterID *int64    `json:"from_matter_id,omitempty"`
	ToMatterID   int64     `json:"to_matter_id"`
	AppName      string    `json:"app_name"`
	WindowTitle  string    `json:"window_title"`
	OCRText      *string   `json:"ocr_text,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}
