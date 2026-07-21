package db

import (
	"context"
	"fmt"

	"github.com/cuddebtj/last-light-armory/scoring/internal/baseline"
	"github.com/cuddebtj/last-light-armory/scoring/internal/scoring"
)

// WeaponRow is the identity data cmd/score needs per weapon: enough to
// join against archetype_score once Frame has gone through
// scoring.NormalizeFrame.
type WeaponRow struct {
	ID         int64
	WeaponType string
	Frame      string // "" when the DB value is NULL
}

// Weapons reads every weapon's identity fields, keyed by id.
func (s *Store) Weapons(ctx context.Context) (map[int64]WeaponRow, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, weapon_type, coalesce(frame, '') FROM weapon`)
	if err != nil {
		return nil, fmt.Errorf("db: loading weapons: %w", err)
	}
	defer rows.Close()

	out := map[int64]WeaponRow{}
	for rows.Next() {
		var w WeaponRow
		if err := rows.Scan(&w.ID, &w.WeaponType, &w.Frame); err != nil {
			return nil, fmt.Errorf("db: scanning weapon: %w", err)
		}
		out[w.ID] = w
	}
	return out, rows.Err()
}

// PerkScores reads every perk's baseline pve/pvp scores, keyed by id.
// Coalesces a NULL to the neutral midpoint defensively — cmd/score can run
// before import-baseline ever has, in which case ingest's NULL-only writes
// are all there is, and that should behave exactly as if import-baseline
// had run and found no match for every perk.
func (s *Store) PerkScores(ctx context.Context) (map[int64]baseline.PerkScore, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, coalesce(pve_score, $1), coalesce(pvp_score, $1) FROM perk`,
		baseline.NeutralPerkScore)
	if err != nil {
		return nil, fmt.Errorf("db: loading perk scores: %w", err)
	}
	defer rows.Close()

	out := map[int64]baseline.PerkScore{}
	for rows.Next() {
		var id int64
		var sc baseline.PerkScore
		if err := rows.Scan(&id, &sc.PVE, &sc.PVP); err != nil {
			return nil, fmt.Errorf("db: scanning perk score: %w", err)
		}
		out[id] = sc
	}
	return out, rows.Err()
}

// ArchetypeScores reads every archetype_score row, keyed by
// (weapon_type, frame) in the sheets' own vocabulary — callers must run a
// weapon's DB frame through scoring.NormalizeFrame before looking it up.
func (s *Store) ArchetypeScores(ctx context.Context) (map[scoring.ArchetypeKey]scoring.ArchetypeBase, error) {
	rows, err := s.pool.Query(ctx, `SELECT weapon_type, frame, pve_score, pvp_score FROM archetype_score`)
	if err != nil {
		return nil, fmt.Errorf("db: loading archetype scores: %w", err)
	}
	defer rows.Close()

	out := map[scoring.ArchetypeKey]scoring.ArchetypeBase{}
	for rows.Next() {
		var key scoring.ArchetypeKey
		var base scoring.ArchetypeBase
		if err := rows.Scan(&key.WeaponType, &key.Frame, &base.PVE, &base.PVP); err != nil {
			return nil, fmt.Errorf("db: scanning archetype score: %w", err)
		}
		out[key] = base
	}
	return out, rows.Err()
}

// PerkSynergies reads every curated perk_synergy row, keyed the same way
// scoring.SynergyContribution looks them up.
func (s *Store) PerkSynergies(ctx context.Context) (map[scoring.SynergyKey]scoring.SynergyBonus, error) {
	rows, err := s.pool.Query(ctx, `SELECT perk_a_id, perk_b_id, pve_bonus, pvp_bonus FROM perk_synergy`)
	if err != nil {
		return nil, fmt.Errorf("db: loading perk synergies: %w", err)
	}
	defer rows.Close()

	out := map[scoring.SynergyKey]scoring.SynergyBonus{}
	for rows.Next() {
		var a, b int64
		var bonus scoring.SynergyBonus
		if err := rows.Scan(&a, &b, &bonus.PVE, &bonus.PVP); err != nil {
			return nil, fmt.Errorf("db: scanning perk synergy: %w", err)
		}
		out[scoring.NewSynergyKey(a, b)] = bonus
	}
	return out, rows.Err()
}

// ScoringConfig reads the singleton scoring_config row.
func (s *Store) ScoringConfig(ctx context.Context) (weights scoring.Weights, topNVariants int, err error) {
	err = s.pool.QueryRow(ctx, `
		SELECT column1_weight, column2_weight, column3_weight, column4_weight, column5_weight,
		       base_blend, top_n_variants
		FROM scoring_config WHERE id = 1`,
	).Scan(
		&weights.Column[0], &weights.Column[1], &weights.Column[2], &weights.Column[3], &weights.Column[4],
		&weights.BaseBlend, &topNVariants,
	)
	if err != nil {
		return scoring.Weights{}, 0, fmt.Errorf("db: loading scoring config: %w", err)
	}
	return weights, topNVariants, nil
}

// RollRow is one roll's identity: which weapon it belongs to.
type RollRow struct {
	ID       int64
	WeaponID int64
}

// Rolls reads every roll's id and weapon id.
func (s *Store) Rolls(ctx context.Context) ([]RollRow, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, weapon_id FROM roll`)
	if err != nil {
		return nil, fmt.Errorf("db: loading rolls: %w", err)
	}
	defer rows.Close()

	var out []RollRow
	for rows.Next() {
		var r RollRow
		if err := rows.Scan(&r.ID, &r.WeaponID); err != nil {
			return nil, fmt.Errorf("db: scanning roll: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// RollPerkRow is one perk within one roll.
type RollPerkRow struct {
	ColumnIndex int
	PerkID      int64
}

// RollPerks reads every roll_perk row, grouped by roll id — the shape
// cmd/score needs to build each roll's []scoring.PerkContribution.
func (s *Store) RollPerks(ctx context.Context) (map[int64][]RollPerkRow, error) {
	rows, err := s.pool.Query(ctx, `SELECT roll_id, column_index, perk_id FROM roll_perk`)
	if err != nil {
		return nil, fmt.Errorf("db: loading roll perks: %w", err)
	}
	defer rows.Close()

	out := map[int64][]RollPerkRow{}
	for rows.Next() {
		var rollID int64
		var rp RollPerkRow
		if err := rows.Scan(&rollID, &rp.ColumnIndex, &rp.PerkID); err != nil {
			return nil, fmt.Errorf("db: scanning roll perk: %w", err)
		}
		out[rollID] = append(out[rollID], rp)
	}
	return out, rows.Err()
}

// RollScoreUpdate is one roll's freshly computed scores, ready to write.
type RollScoreUpdate struct {
	RollID            int64
	PVE, PVP, Overall float64
}

// WriteRollScores bulk-writes roll.pve_score/pvp_score/overall_score.
// Unconditional overwrite, matching this job's "always recompute, no
// version-check gate" design (see CLAUDE.md) — there's no cheap way to
// detect "did this roll's score actually change" that's worth the
// complexity when the whole computation is already a cheap, local,
// unconditional pass every run.
func (s *Store) WriteRollScores(ctx context.Context, updates []RollScoreUpdate) error {
	if len(updates) == 0 {
		return nil
	}
	ids := make([]int64, len(updates))
	pve := make([]float64, len(updates))
	pvp := make([]float64, len(updates))
	overall := make([]float64, len(updates))
	for i, u := range updates {
		ids[i] = u.RollID
		pve[i] = u.PVE
		pvp[i] = u.PVP
		overall[i] = u.Overall
	}

	_, err := s.pool.Exec(ctx, `
		UPDATE roll SET
			pve_score     = data.pve,
			pvp_score     = data.pvp,
			overall_score = data.overall
		FROM unnest($1::bigint[], $2::numeric[], $3::numeric[], $4::numeric[]) AS data(id, pve, pvp, overall)
		WHERE roll.id = data.id`,
		ids, pve, pvp, overall)
	if err != nil {
		return fmt.Errorf("db: writing roll scores: %w", err)
	}
	return nil
}

// WeaponRankingUpdate is one weapon's ranking, derived from its best roll.
type WeaponRankingUpdate struct {
	WeaponID          int64
	PVE, PVP, Overall float64
}

// WriteWeaponRankings upserts weapon_ranking from each weapon's best roll
// (the "best single roll represents the weapon" trade-off, see CLAUDE.md).
// popularity_score is deliberately never touched here — it belongs to the
// not-yet-built Phase 6 voting pipeline, and this must not clobber it once
// that exists.
func (s *Store) WriteWeaponRankings(ctx context.Context, updates []WeaponRankingUpdate) error {
	if len(updates) == 0 {
		return nil
	}
	weaponIDs := make([]int64, len(updates))
	pve := make([]float64, len(updates))
	pvp := make([]float64, len(updates))
	overall := make([]float64, len(updates))
	for i, u := range updates {
		weaponIDs[i] = u.WeaponID
		pve[i] = u.PVE
		pvp[i] = u.PVP
		overall[i] = u.Overall
	}

	_, err := s.pool.Exec(ctx, `
		INSERT INTO weapon_ranking (weapon_id, overall_score, pve_score, pvp_score, updated_at)
		SELECT id, overall, pve, pvp, now()
		FROM unnest($1::bigint[], $2::numeric[], $3::numeric[], $4::numeric[]) AS data(id, overall, pve, pvp)
		ON CONFLICT (weapon_id) DO UPDATE SET
			overall_score = excluded.overall_score,
			pve_score     = excluded.pve_score,
			pvp_score     = excluded.pvp_score,
			updated_at    = now()`,
		weaponIDs, overall, pve, pvp)
	if err != nil {
		return fmt.Errorf("db: writing weapon rankings: %w", err)
	}
	return nil
}
