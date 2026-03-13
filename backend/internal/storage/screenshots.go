package storage

import (
	"fmt"
	"os"
	"path/filepath"
)

func SaveScreenshot(dir string, captureID int64, data []byte) (string, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, fmt.Sprintf("%d.jpg", captureID))
	if err := os.WriteFile(path, data, 0644); err != nil {
		return "", err
	}
	return path, nil
}

func DeleteScreenshot(path string) error {
	return os.Remove(path)
}
