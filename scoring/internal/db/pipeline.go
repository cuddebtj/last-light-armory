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

// PerkSynergyExport is one curated perk_synergy row resolved to Bungie
// hashes — the join key the website's static JSON understands, unlike
// PerkSynergies' internal perk ids (which only make sense against this
// database's own roll_perk rows).
type PerkSynergyExport struct {
	PerkAHash int64
	PerkBHash int64
	PVEBonus  float64
	PVPBonus  float64
}

// PerkSynergiesByHash reads every curated perk_synergy row for export to
// the website, resolving both perk ids to their Bungie hash the same way
// ingest's own AllWeaponPerks/AllRollPerks resolve weapon/perk ids.
func (s *Store) PerkSynergiesByHash(ctx context.Context) ([]PerkSynergyExport, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT pa.hash, pb.hash, ps.pve_bonus, ps.pvp_bonus
		FROM perk_synergy ps
		JOIN perk pa ON pa.id = ps.perk_a_id
		JOIN perk pb ON pb.id = ps.perk_b_id
		ORDER BY pa.hash, pb.hash`)
	if err != nil {
		return nil, fmt.Errorf("db: loading perk synergies by hash: %w", err)
	}
	defer rows.Close()

	var out []PerkSynergyExport
	for rows.Next() {
		var e PerkSynergyExport
		if err := rows.Scan(&e.PerkAHash, &e.PerkBHash, &e.PVEBonus, &e.PVPBonus); err != nil {
			return nil, fmt.Errorf("db: scanning perk synergy by hash: %w", err)
		}
		out = append(out, e)
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

// WeaponPerkColumn is one weapon_perk row limited to the barrel/magazine
// columns (0 and 1) — the pool roll_variant expands top-N rolls across.
type WeaponPerkColumn struct {
	ColumnIndex int
	PerkID      int64
	Name        string
}

// BarrelsAndMagazines reads every weapon's raw barrel (column_index 0) and
// magazine (column_index 1) perk options, keyed by weapon id, columns
// combined — callers split by ColumnIndex and dedupe by Name (see
// scoring.DedupeByName) before expanding, since the manifest sometimes
// defines the same perk under multiple hashes.
func (s *Store) BarrelsAndMagazines(ctx context.Context) (map[int64][]WeaponPerkColumn, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT wp.weapon_id, wp.column_index, wp.perk_id, p.name
		FROM weapon_perk wp
		JOIN perk p ON p.id = wp.perk_id
		WHERE wp.column_index IN (0, 1)
		ORDER BY wp.weapon_id, wp.column_index, wp.perk_id`)
	if err != nil {
		return nil, fmt.Errorf("db: loading barrel/magazine perks: %w", err)
	}
	defer rows.Close()

	out := map[int64][]WeaponPerkColumn{}
	for rows.Next() {
		var weaponID int64
		var c WeaponPerkColumn
		if err := rows.Scan(&weaponID, &c.ColumnIndex, &c.PerkID, &c.Name); err != nil {
			return nil, fmt.Errorf("db: scanning barrel/magazine perk: %w", err)
		}
		out[weaponID] = append(out[weaponID], c)
	}
	return out, rows.Err()
}

// RollVariantInsert is one scored roll_variant row, ready to write.
type RollVariantInsert struct {
	RollID            int64
	BarrelPerkID      *int64
	MagazinePerkID    *int64
	PVE, PVP, Overall float64
}

// WriteRollVariants replaces the ENTIRE roll_variant table with a fresh
// set, in one transaction. cmd/score always recomputes every weapon's
// top-N rolls every run (no partial/incremental runs — see CLAUDE.md's
// "no version-check gate" design), so roll_variant's correct end state is
// always "exactly this run's expansion, nothing else": a roll that
// dropped out of some weapon's top N since the last run must not leave
// its old variants behind, which a delete scoped to only the currently-
// selected rolls would miss. The transaction avoids a window where the
// table is empty if the process dies between clearing and inserting.
func (s *Store) WriteRollVariants(ctx context.Context, variants []RollVariantInsert) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("db: beginning roll_variant transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after a successful Commit

	if _, err := tx.Exec(ctx, `DELETE FROM roll_variant`); err != nil {
		return fmt.Errorf("db: clearing roll variants: %w", err)
	}

	if len(variants) > 0 {
		ids := make([]int64, len(variants))
		barrels := make([]*int64, len(variants))
		mags := make([]*int64, len(variants))
		pve := make([]float64, len(variants))
		pvp := make([]float64, len(variants))
		overall := make([]float64, len(variants))
		for i, v := range variants {
			ids[i] = v.RollID
			barrels[i] = v.BarrelPerkID
			mags[i] = v.MagazinePerkID
			pve[i] = v.PVE
			pvp[i] = v.PVP
			overall[i] = v.Overall
		}

		_, err := tx.Exec(ctx, `
			INSERT INTO roll_variant (roll_id, barrel_perk_id, magazine_perk_id, pve_score, pvp_score, overall_score)
			SELECT * FROM unnest($1::bigint[], $2::bigint[], $3::bigint[], $4::numeric[], $5::numeric[], $6::numeric[])`,
			ids, barrels, mags, pve, pvp, overall)
		if err != nil {
			return fmt.Errorf("db: writing roll variants: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("db: committing roll variants: %w", err)
	}
	return nil
}
