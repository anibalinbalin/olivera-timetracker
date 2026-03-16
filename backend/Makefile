.PHONY: run build test

run:
	go run ./cmd/server

build:
	CGO_ENABLED=1 go build -o bin/server ./cmd/server

build-synology: # requires: brew install FiloSottile/musl-cross/musl-cross
	GOOS=linux GOARCH=amd64 CGO_ENABLED=1 CC=x86_64-linux-musl-gcc go build -o bin/server-linux ./cmd/server

build-windows: # requires: brew install mingw-w64
	GOOS=windows GOARCH=amd64 CGO_ENABLED=1 CC=x86_64-w64-mingw32-gcc go build -o bin/server-windows.exe ./cmd/server

test:
	go test ./... -v
