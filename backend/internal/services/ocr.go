package services

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type OCRClient interface {
	Extract(imageData []byte) (string, error)
}

type RunPodOCR struct {
	Endpoint string // RunPod serverless endpoint URL
	APIKey   string
}

func (r *RunPodOCR) Extract(imageData []byte) (string, error) {
	b64 := base64.StdEncoding.EncodeToString(imageData)

	payload := map[string]any{
		"input": map[string]any{
			"image": b64,
		},
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", r.Endpoint+"/runsync", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+r.APIKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("runpod returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Output struct {
			Text string `json:"text"`
		} `json:"output"`
		Status string `json:"status"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	return result.Output.Text, nil
}

// NoopOCR is a stub for development/testing
type NoopOCR struct{}

func (n *NoopOCR) Extract(imageData []byte) (string, error) {
	return "[OCR not configured]", nil
}
