package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/cuddebtj/last-light-armory/scoring/internal/baseline"
)

// Querier is the slice of pgxpool.Pool the Store needs. Abstracting it lets
// unit tests inject failures (via pgxmock) into paths a live database can't
// realistically produce: scan errors, mid-iteration failures, and similar
// — mirrors last-light-armory-ingest's internal/db.Querier.
type Querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// Store implements this job's repositories over the shared database. All
// methods are safe for concurrent use.
type Store struct {
	pool Querier
}

// NewStore wraps a connection pool (or any Querier) in a Store.
func NewStore(pool Querier) *Store { return &Store{pool: pool} }

// UpsertArchetypeScores writes the base layer: one row per (weapon_type,
// frame) pair with sheet-derived data. Idempotent and safe to rerun
// whenever the source sheets are re-extracted (see scoring/data/README.md)
// — it always fully overwrites, never merges with a prior value.
func (s *Store) UpsertArchetypeScores(ctx context.Context, rows []baseline.ArchetypeScore) error {
	if len(rows) == 0 {
		return nil
	}
	weaponTypes := make([]string, len(rows))
	frames := make([]string, len(rows))
	pveScores := make([]*float64, len(rows))
	pvpScores := make([]*float64, len(rows))
	sources := make([]string, len(rows))
	for i, r := range rows {
		weaponTypes[i] = r.WeaponType
		frames[i] = r.Frame
		pveScores[i] = r.PVEScore
		pvpScores[i] = r.PVPScore
		sources[i] = r.Source
	}

	_, err := s.pool.Exec(ctx, `
		INSERT INTO archetype_score (weapon_type, frame, pve_score, pvp_score, source, updated_at)
		SELECT *, now() FROM unnest($1::text[], $2::text[], $3::numeric[], $4::numeric[], $5::text[])
		ON CONFLICT (weapon_type, frame) DO UPDATE SET
			pve_score  = excluded.pve_score,
			pvp_score  = excluded.pvp_score,
			source     = excluded.source,
			updated_at = now()`,
		weaponTypes, frames, pveScores, pvpScores, sources)
	if err != nil {
		return fmt.Errorf("db: upserting archetype scores: %w", err)
	}
	return nil
}

// PerkNames returns every perk's id and name — the join key back to the
// sheet-derived baselines, which key by name (the sheets don't distinguish
// enhanced from base variants, so both share whatever value their shared
// name resolves to).
func (s *Store) PerkNames(ctx context.Context) (map[int64]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, name FROM perk`)
	if err != nil {
		return nil, fmt.Errorf("db: loading perk names: %w", err)
	}
	defer rows.Close()

	out := map[int64]string{}
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, fmt.Errorf("db: scanning perk: %w", err)
		}
		out[id] = name
	}
	return out, rows.Err()
}

// UpdatePerkScores writes perk.pve_score/pvp_score for every given perk id.
// Callers are expected to have already resolved every perk to a score
// (sheet-derived or the neutral placeholder — see baseline.MergePerkScores)
// so this never leaves a row untouched.
func (s *Store) UpdatePerkScores(ctx context.Context, scores map[int64]baseline.PerkScore) error {
	if len(scores) == 0 {
		return nil
	}
	ids := make([]int64, 0, len(scores))
	pve := make([]int32, 0, len(scores))
	pvp := make([]int32, 0, len(scores))
	for id, sc := range scores {
		ids = append(ids, id)
		pve = append(pve, int32(sc.PVE))
		pvp = append(pvp, int32(sc.PVP))
	}

	_, err := s.pool.Exec(ctx, `
		UPDATE perk SET
			pve_score  = data.pve_score,
			pvp_score  = data.pvp_score,
			updated_at = now()
		FROM unnest($1::bigint[], $2::int[], $3::int[]) AS data(id, pve_score, pvp_score)
		WHERE perk.id = data.id`,
		ids, pve, pvp)
	if err != nil {
		return fmt.Errorf("db: updating perk scores: %w", err)
	}
	return nil
}
