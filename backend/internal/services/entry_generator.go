package services

import (
	"database/sql"
	"log"
	"math"
	"time"

	"github.com/olivera/timetracker/internal/models"
)

type captureRow struct {
	id        int64
	matterID  int64
	timestamp time.Time
}

// GenerateEntries groups unlinked captures by matter + 5-min proximity into draft time entries.
func GenerateEntries(db *sql.DB, userID int64, date string, tzOffsetHours int) ([]models.TimeEntry, error) {
	// Convert local date to UTC range using timezone offset
	t, _ := time.Parse("2006-01-02", date)
	utcStart := t.Add(time.Duration(-tzOffsetHours) * time.Hour)
	utcEnd := utcStart.Add(24 * time.Hour)

	log.Printf("GenerateEntries: user=%d date=%s tz=%d utcStart=%s utcEnd=%s",
		userID, date, tzOffsetHours,
		utcStart.UTC().Format("2006-01-02T15:04:05Z"),
		utcEnd.UTC().Format("2006-01-02T15:04:05Z"))

	rows, err := db.Query(`
		SELECT c.id, c.matter_id, c.timestamp
		FROM captures c
		LEFT JOIN capture_entries ce ON ce.capture_id = c.id
		WHERE c.user_id = ?
		  AND c.timestamp >= ? AND c.timestamp < ?
		  AND c.matter_id IS NOT NULL
		  AND ce.entry_id IS NULL
		ORDER BY c.matter_id, c.timestamp
	`, userID, utcStart.UTC().Format("2006-01-02 15:04:05+00:00"), utcEnd.UTC().Format("2006-01-02 15:04:05+00:00"))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var captures []captureRow
	for rows.Next() {
		var cr captureRow
		if err := rows.Scan(&cr.id, &cr.matterID, &cr.timestamp); err != nil {
			return nil, err
		}
		captures = append(captures, cr)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	log.Printf("GenerateEntries: found %d unlinked captures with matter", len(captures))
	if len(captures) == 0 {
		return []models.TimeEntry{}, nil
	}

	// Group into blocks: same matter + gap <= 5 min
	type group struct {
		matterID int64
		captures []captureRow
	}
	var groups []group
	cur := group{matterID: captures[0].matterID, captures: []captureRow{captures[0]}}
	for _, c := range captures[1:] {
		prev := cur.captures[len(cur.captures)-1]
		gap := c.timestamp.Sub(prev.timestamp)
		if c.matterID == cur.matterID && gap <= 5*time.Minute {
			cur.captures = append(cur.captures, c)
		} else {
			groups = append(groups, cur)
			cur = group{matterID: c.matterID, captures: []captureRow{c}}
		}
	}
	groups = append(groups, cur)

	var entries []models.TimeEntry
	for _, g := range groups {
		first := g.captures[0]
		last := g.captures[len(g.captures)-1]
		spanSec := last.timestamp.Sub(first.timestamp).Seconds()
		totalSec := spanSec + 30 // add one capture interval
		mins := int(math.Ceil(totalSec / 60.0))
		if mins < 1 {
			mins = 1
		}

		res, err := db.Exec(`
			INSERT INTO time_entries (user_id, matter_id, date, duration_minutes, status)
			VALUES (?, ?, ?, ?, 'DRAFT')
		`, userID, g.matterID, date, mins)
		if err != nil {
			return nil, err
		}
		entryID, err := res.LastInsertId()
		if err != nil {
			return nil, err
		}

		for _, c := range g.captures {
			if _, err := db.Exec(`INSERT INTO capture_entries (capture_id, entry_id) VALUES (?, ?)`,
				c.id, entryID); err != nil {
				return nil, err
			}
		}

		var entry models.TimeEntry
		err = db.QueryRow(`
			SELECT id, user_id, matter_id, date, duration_minutes, description, status, created_at, updated_at
			FROM time_entries WHERE id = ?
		`, entryID).Scan(
			&entry.ID, &entry.UserID, &entry.MatterID, &entry.Date, &entry.DurationMinutes,
			nullStringScan(&entry.Description), &entry.Status, &entry.CreatedAt, &entry.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}

	return entries, nil
}

// nullStringScan returns a *string scan target that sets the pointer on valid.
func nullStringScan(dst **string) *nullableString {
	return &nullableString{dst: dst}
}

type nullableString struct {
	dst **string
}

func (n *nullableString) Scan(src any) error {
	ns := sql.NullString{}
	if err := ns.Scan(src); err != nil {
		return err
	}
	if ns.Valid {
		*n.dst = &ns.String
	}
	return nil
}
