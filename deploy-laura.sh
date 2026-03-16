#!/bin/bash
set -e

HOST="usuario@100.84.34.81"
PASS="temp"
REMOTE_DIR="C:/olivera-timetracker"

echo "==> Building backend for Windows..."
cd backend && make build-windows && cd ..

echo "==> Building frontend..."
cd frontend && npm run build && cd ..

echo "==> Stopping remote server..."
sshpass -p "$PASS" ssh "$HOST" "taskkill /f /im server.exe" 2>/dev/null || true

echo "==> Uploading backend..."
sshpass -p "$PASS" scp backend/bin/server-windows.exe "$HOST:$REMOTE_DIR/server.exe"

echo "==> Uploading frontend..."
sshpass -p "$PASS" scp -r frontend/dist/* "$HOST:$REMOTE_DIR/static/"

echo "==> Starting remote server..."
sshpass -p "$PASS" ssh "$HOST" "start /b $REMOTE_DIR\\start.bat"

echo "==> Done! Waiting for server..."
sleep 3
curl -s -m 5 http://100.84.34.81:8080/api/health && echo "" || echo "Server may need manual start (double-click start.bat)"
