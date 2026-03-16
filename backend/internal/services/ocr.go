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
	Endpoint string // e.g. https://api.runpod.ai/v2/ENDPOINT_ID
	APIKey   string
}

func (r *RunPodOCR) Extract(imageData []byte) (string, error) {
	b64 := base64.StdEncoding.EncodeToString(imageData)
	dataURL := "data:image/jpeg;base64," + b64

	// DeepSeek-OCR via RunPod Serverless (vLLM worker)
	// The worker accepts OpenAI-compatible input wrapped in RunPod's format
	payload := map[string]any{
		"input": map[string]any{
			"openai_route":  "/v1/chat/completions",
			"openai_input": map[string]any{
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
			},
		},
	}
	body, _ := json.Marshal(payload)

	client := &http.Client{Timeout: 300 * time.Second}
	req, err := http.NewRequest("POST", r.Endpoint+"/runsync", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+r.APIKey)

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("ocr returned %d: %s", resp.StatusCode, string(respBody)[:min(200, len(respBody))])
	}

	// RunPod wraps the vLLM response in { "output": { ...openai response... } }
	var runpodResp struct {
		Status string `json:"status"`
		Output struct {
			Choices []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			} `json:"choices"`
		} `json:"output"`
	}
	if err := json.Unmarshal(respBody, &runpodResp); err != nil {
		return "", fmt.Errorf("parse response: %w", err)
	}

	if runpodResp.Status == "FAILED" {
		return "", fmt.Errorf("runpod job failed: %s", string(respBody)[:min(200, len(respBody))])
	}

	if len(runpodResp.Output.Choices) == 0 {
		return "", fmt.Errorf("no choices in response")
	}
	return runpodResp.Output.Choices[0].Message.Content, nil
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
