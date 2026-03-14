package services

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type OCRClient interface {
	Extract(imageData []byte) (string, error)
}

type RunPodOCR struct {
	Endpoint string // e.g. https://POD_ID-8000.proxy.runpod.net
	APIKey   string // not needed for pod proxy, kept for future serverless
}

func (r *RunPodOCR) Extract(imageData []byte) (string, error) {
	b64 := base64.StdEncoding.EncodeToString(imageData)
	dataURL := "data:image/jpeg;base64," + b64

	// DeepSeek-OCR via vLLM OpenAI-compatible API
	// 10x compression at 97% accuracy vs GLM-OCR
	payload := map[string]any{
		"model": "deepseek-ai/DeepSeek-OCR",
		"messages": []map[string]any{
			{
				"role": "user",
				"content": []map[string]any{
					{"type": "image_url", "image_url": map[string]string{"url": dataURL}},
					{"type": "text", "text": "Free OCR."},
				},
			},
		},
		"max_tokens":  2048,
		"temperature": 0.0,
	}
	body, _ := json.Marshal(payload)

	client := &http.Client{Timeout: 120 * time.Second}
	req, err := http.NewRequest("POST", r.Endpoint+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if r.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+r.APIKey)
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("ocr returned %d: %s", resp.StatusCode, string(respBody)[:min(200, len(respBody))])
	}

	var chatResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return "", fmt.Errorf("parse response: %w", err)
	}

	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("no choices in response")
	}
	return chatResp.Choices[0].Message.Content, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// NoopOCR is a stub for development/testing
type NoopOCR struct{}

func (n *NoopOCR) Extract(imageData []byte) (string, error) {
	return "[OCR not configured]", nil
}
