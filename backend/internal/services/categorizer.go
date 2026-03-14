package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

type Categorizer interface {
	Categorize(captures []CaptureContext, matters []MatterContext, corrections []CorrectionContext) ([]CategorizeResult, error)
}

type CaptureContext struct {
	ID          int64
	AppName     string
	WindowTitle string
	OCRText     string
}

type MatterContext struct {
	ID           int64
	Name         string
	MatterNumber string
	ClientName   string
	Description  string
}

type CorrectionContext struct {
	AppName     string
	WindowTitle string
	OCRText     string
	MatterName  string
}

type CategorizeResult struct {
	CaptureID  int64
	MatterID   *int64
	Confidence float64
}

type GeminiCategorizer struct {
	APIKey string
	Model  string // "gemini-3.1-flash-lite"
}

func (g *GeminiCategorizer) Categorize(captures []CaptureContext, matters []MatterContext, corrections []CorrectionContext) ([]CategorizeResult, error) {
	prompt := buildCategorizationPrompt(captures, matters, corrections)

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", g.Model, g.APIKey)

	reqBody := map[string]any{
		"contents": []map[string]any{
			{"parts": []map[string]string{{"text": prompt}}},
		},
		"generationConfig": map[string]any{
			"responseMimeType": "application/json",
		},
	}

	body, _ := json.Marshal(reqBody)
	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	log.Printf("categorizer: gemini responded with status %d", resp.StatusCode)
	if resp.StatusCode != 200 {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("gemini returned %d: %s", resp.StatusCode, string(respBody)[:min(300, len(respBody))])
	}

	var geminiResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	json.NewDecoder(resp.Body).Decode(&geminiResp)

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("empty gemini response")
	}

	// Gemini may return IDs as strings or numbers, use json.Number
	responseText := geminiResp.Candidates[0].Content.Parts[0].Text
	log.Printf("categorizer: gemini response: %s", responseText[:min(300, len(responseText))])

	var rawResults []map[string]json.Number
	if err := json.Unmarshal([]byte(responseText), &rawResults); err != nil {
		return nil, fmt.Errorf("parse results: %w (text: %s)", err, responseText[:min(200, len(responseText))])
	}

	log.Printf("categorizer: parsed %d results", len(rawResults))
	var results []CategorizeResult
	for _, r := range rawResults {
		captureID, _ := r["capture_id"].Int64()
		matterID, _ := r["matter_id"].Int64()
		confidence, _ := r["confidence"].Float64()
		log.Printf("categorizer: raw result capture=%d matter=%d conf=%.2f", captureID, matterID, confidence)
		if captureID > 0 {
			mid := matterID
			results = append(results, CategorizeResult{
				CaptureID:  captureID,
				MatterID:   &mid,
				Confidence: confidence,
			})
		}
	}
	return results, nil
}

func buildCategorizationPrompt(captures []CaptureContext, matters []MatterContext, corrections []CorrectionContext) string {
	var b bytes.Buffer
	b.WriteString("You are categorizing lawyer work activities to legal matters.\n\n")

	b.WriteString("## Available Matters\n")
	for _, m := range matters {
		fmt.Fprintf(&b, "- ID:%d | %s (%s) | Client: %s | %s\n", m.ID, m.Name, m.MatterNumber, m.ClientName, m.Description)
	}

	if len(corrections) > 0 {
		b.WriteString("\n## Past Corrections (learn from these)\n")
		for _, c := range corrections {
			fmt.Fprintf(&b, "- App: %s, Window: %s → Assigned to: %s\n", c.AppName, c.WindowTitle, c.MatterName)
			if c.OCRText != "" {
				fmt.Fprintf(&b, "  OCR: %s\n", truncate(c.OCRText, 200))
			}
		}
	}

	b.WriteString("\n## Activities to Categorize\n")
	for _, c := range captures {
		fmt.Fprintf(&b, "- ID:%d | App: %s | Window: %s\n", c.ID, c.AppName, c.WindowTitle)
		if c.OCRText != "" {
			fmt.Fprintf(&b, "  OCR: %s\n", truncate(c.OCRText, 300))
		}
	}

	b.WriteString("\n## How to Match\n")
	b.WriteString("Use ALL available signals to match activities to matters:\n")
	b.WriteString("1. WINDOW TITLE is the strongest signal - it often contains the matter number (e.g. 'BN-2026-001') or client name\n")
	b.WriteString("2. OCR TEXT from the document/screen content - look for client names, matter numbers, case references, legal terms\n")
	b.WriteString("3. APP NAME - Word/Chrome/etc gives context about the type of work\n")
	b.WriteString("4. Google searches about specific legal topics often relate to a specific matter\n\n")
	b.WriteString("## Instructions\n")
	b.WriteString("Return a JSON array. Each object has: {\"capture_id\": number, \"matter_id\": number, \"confidence\": number}.\n")
	b.WriteString("confidence: 0.0-1.0. Be GENEROUS with confidence when window title contains a matter number or client name.\n")
	b.WriteString("If you truly cannot determine the matter, set matter_id to 0.\n")
	b.WriteString("Most activities WILL match a matter - lawyers work on specific cases. Default to matching, not to 0.\n")

	return b.String()
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// NoopCategorizer for when Gemini is not configured
type NoopCategorizer struct{}

func (n *NoopCategorizer) Categorize(captures []CaptureContext, matters []MatterContext, corrections []CorrectionContext) ([]CategorizeResult, error) {
	return nil, nil
}
