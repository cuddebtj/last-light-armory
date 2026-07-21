-- 000001_init.up.sql
-- Tables owned by this repo (last-light-armory's scoring job), per
-- CLAUDE.md's "New tables" section. Migrations run against the same
-- shared last_light_armory Postgres database ingest uses, tracked in a
-- distinct migrations table (see internal/db.Migrate) so golang-migrate
-- doesn't collide with ingest's own schema_migrations bookkeeping.
--
-- column1..column5 weights correspond to weapon_perk.column_index 0..4:
-- 0=barrel, 1=magazine, 2=trait 1, 3=trait 2, 4=origin trait — confirmed
-- against real exported weapon data (e.g. Fatebringer: columns 2,3 used
-- in roll_perk; Truthteller: columns 2,3,4, with column 4 "Field-Tested"
-- being a single-option origin trait). Column weights are heaviest on the
-- two trait columns (0.30 each), matching community god-roll consensus
-- that traits matter most, origin trait somewhat (0.20), and barrel/
-- magazine least (0.10 each, applied only at roll_variant expansion,
-- never in the base roll score since weapon_perk's barrel/magazine perks
-- never appear in roll_perk at all).

BEGIN;

CREATE TABLE scoring_config (
    id             SMALLINT PRIMARY KEY DEFAULT 1,
    column1_weight NUMERIC(4,3) NOT NULL DEFAULT 0.10,
    column2_weight NUMERIC(4,3) NOT NULL DEFAULT 0.10,
    column3_weight NUMERIC(4,3) NOT NULL DEFAULT 0.30,
    column4_weight NUMERIC(4,3) NOT NULL DEFAULT 0.30,
    column5_weight NUMERIC(4,3) NOT NULL DEFAULT 0.20,
    -- Hybrid scoring (decided 2026-07-20): a roll's score blends the
    -- archetype-intrinsic base (archetype_score) with the column-weighted
    -- perk layer. base_blend is the base's share; the perk layer gets
    -- (1 - base_blend). Tunable via UPDATE like every other knob here.
    base_blend     NUMERIC(4,3) NOT NULL DEFAULT 0.50,
    top_n_variants SMALLINT NOT NULL DEFAULT 15,  -- trait+origin rolls/weapon expanded into barrel/mag variants
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (id = 1)
);

INSERT INTO scoring_config (id) VALUES (1);

-- Measured archetype-intrinsic base scores (hybrid scoring, 2026-07-20).
-- The community's measured data (boss-DPS and PvP-TTK sheets) is keyed by
-- archetype — the (weapon_type, frame) pair ingest already stores — not by
-- perk. This table is the base layer of every roll score: real numbers
-- with full-roster reach, while the perk layer starts near-neutral and
-- sharpens over time. Weapons whose (weapon_type, frame) miss this table
-- (many Exotics carry unique intrinsic frame names) fall back to a
-- neutral base at scoring time. Populated by the sheet importer; 0-100.
CREATE TABLE archetype_score (
    weapon_type TEXT NOT NULL,
    frame       TEXT NOT NULL,
    pve_score   NUMERIC(5,2),
    pvp_score   NUMERIC(5,2),
    source      TEXT,           -- which sheet/measurement the values came from
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (weapon_type, frame)
);

-- Hand-curated pairwise synergy bonuses (e.g. Rewind Rounds + Feeding
-- Frenzy). Empty until curated; a roll with no matching pair gets no bonus.
CREATE TABLE perk_synergy (
    perk_a_id BIGINT NOT NULL REFERENCES perk(id),
    perk_b_id BIGINT NOT NULL REFERENCES perk(id),
    pve_bonus NUMERIC(5,2) NOT NULL DEFAULT 0,
    pvp_bonus NUMERIC(5,2) NOT NULL DEFAULT 0,
    note      TEXT,
    PRIMARY KEY (perk_a_id, perk_b_id),
    CHECK (perk_a_id < perk_b_id)
);

-- Editable tier boundaries on the 0-100 overall_score scale, matching
-- roll.overall_score / weapon_ranking.overall_score's NUMERIC(5,2) range.
CREATE TABLE tier_cutoff (
    tier      TEXT PRIMARY KEY,
    min_score NUMERIC(5,2) NOT NULL
);

INSERT INTO tier_cutoff (tier, min_score) VALUES
    ('S+', 98),
    ('S',  93),
    ('A+', 88),
    ('A',  82),
    ('B',  75);

-- Barrel/magazine-expanded variants of the top-scoring trait+origin rolls.
-- Generated after roll.overall_score exists (expansion needs scores to
-- know which rolls are worth expanding). This table is the entire
-- universe of what community voting can select from later.
CREATE TABLE roll_variant (
    id               BIGSERIAL PRIMARY KEY,
    roll_id          BIGINT NOT NULL REFERENCES roll(id) ON DELETE CASCADE,
    barrel_perk_id   BIGINT REFERENCES perk(id),   -- NULL if weapon has no barrel column
    magazine_perk_id BIGINT REFERENCES perk(id),   -- NULL if weapon has no magazine column
    pve_score        NUMERIC(5,2),
    pvp_score        NUMERIC(5,2),
    overall_score    NUMERIC(5,2),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (roll_id, barrel_perk_id, magazine_perk_id)
);

COMMIT;
