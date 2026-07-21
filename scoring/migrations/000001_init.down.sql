-- 000001_init.down.sql
BEGIN;

DROP TABLE IF EXISTS roll_variant;
DROP TABLE IF EXISTS tier_cutoff;
DROP TABLE IF EXISTS perk_synergy;
DROP TABLE IF EXISTS archetype_score;
DROP TABLE IF EXISTS scoring_config;

COMMIT;
