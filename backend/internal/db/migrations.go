package db

const schema = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'lawyer' CHECK(role IN ('lawyer','admin')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS matters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    name TEXT NOT NULL,
    matter_number TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS captures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    timestamp DATETIME NOT NULL,
    app_name TEXT NOT NULL,
    window_title TEXT NOT NULL,
    screenshot_path TEXT,
    ocr_text TEXT,
    ocr_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(ocr_status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),
    matter_id INTEGER REFERENCES matters(id),
    ai_confidence REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    matter_id INTEGER NOT NULL REFERENCES matters(id),
    date DATE NOT NULL,
    duration_minutes INTEGER NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','REVIEWED','APPROVED')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS capture_entries (
    capture_id INTEGER NOT NULL REFERENCES captures(id),
    entry_id INTEGER NOT NULL REFERENCES time_entries(id),
    PRIMARY KEY (capture_id, entry_id)
);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    capture_interval_seconds INTEGER NOT NULL DEFAULT 30,
    screenshot_retention_hours INTEGER NOT NULL DEFAULT 72,
    ocr_enabled INTEGER NOT NULL DEFAULT 1,
    categorization_confidence_threshold REAL NOT NULL DEFAULT 0.7
);

CREATE TABLE IF NOT EXISTS corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    capture_id INTEGER NOT NULL REFERENCES captures(id),
    from_matter_id INTEGER REFERENCES matters(id),
    to_matter_id INTEGER NOT NULL REFERENCES matters(id),
    app_name TEXT NOT NULL,
    window_title TEXT NOT NULL,
    ocr_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_captures_user_timestamp ON captures(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_captures_matter ON captures(matter_id);
CREATE INDEX IF NOT EXISTS idx_captures_ocr_status ON captures(ocr_status);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_date ON time_entries(user_id, date);
CREATE INDEX IF NOT EXISTS idx_time_entries_status ON time_entries(status);
CREATE INDEX IF NOT EXISTS idx_corrections_user ON corrections(user_id);

INSERT OR IGNORE INTO settings(id) VALUES(1);
`
