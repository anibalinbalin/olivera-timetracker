package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
			"responseSchema": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"capture_id": map[string]string{"type": "integer"},
						"matter_id":  map[string]string{"type": "integer"},
						"confidence": map[string]string{"type": "number"},
					},
				},
			},
		},
	}

	body, _ := json.Marshal(reqBody)
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("gemini returned %d: %s", resp.StatusCode, string(respBody))
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

	var rawResults []struct {
		CaptureID  int64   `json:"capture_id"`
		MatterID   int64   `json:"matter_id"`
		Confidence float64 `json:"confidence"`
	}
	json.Unmarshal([]byte(geminiResp.Candidates[0].Content.Parts[0].Text), &rawResults)

	var results []CategorizeResult
	for _, r := range rawResults {
		mid := r.MatterID
		results = append(results, CategorizeResult{
			CaptureID:  r.CaptureID,
			MatterID:   &mid,
			Confidence: r.Confidence,
		})
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

	b.WriteString("\n## Instructions\n")
	b.WriteString("Return JSON array. Each object: {capture_id, matter_id, confidence}.\n")
	b.WriteString("confidence: 0.0-1.0. If unsure, set matter_id to 0 and low confidence.\n")
	b.WriteString("Prefer returning 0 matter_id over a wrong match.\n")

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
