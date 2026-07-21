-- CI-only stand-in for the tables ingest owns (weapon, perk, roll, ...).
-- Scoring's own migrations are NOT self-contained: perk_synergy and
-- roll_variant carry foreign keys against perk(id) and roll(id), so
-- db.Migrate() fails outright on a bare Postgres unless something
-- satisfies those references first. This is deliberately NOT a copy of
-- ingest's real migrations (that schema is owned and versioned in a
-- separate repo) -- it's the minimal shape needed for the FK constraints
-- to resolve, the same shadow-table trick internal/db/integration_test.go
-- already uses per-test (see TestPerkScoresIntegration), applied once
-- here for the whole CI job.
CREATE TABLE IF NOT EXISTS perk (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    pve_score  SMALLINT,
    pvp_score  SMALLINT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roll (
    id            BIGSERIAL PRIMARY KEY,
    pve_score     NUMERIC(5,2),
    pvp_score     NUMERIC(5,2),
    overall_score NUMERIC(5,2)
);

-- TestMigrateUpAndDown skips its FK-resolution check when public.perk is
-- empty (it can't tell "resolves correctly" from "trivially empty") --
-- seed one row so that check actually runs in CI instead of skipping.
INSERT INTO perk (name) VALUES ('ci-stub-perk') ON CONFLICT DO NOTHING;
