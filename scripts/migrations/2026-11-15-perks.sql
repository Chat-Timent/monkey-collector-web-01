-- Perks : perks obtenus par les joueurs et singe qui les porte.
-- Migration additive, sans effet sur les données existantes.
-- Sur le Raspberry, après sauvegarde : psql "$DATABASE_URL" -f scripts/migrations/2026-11-15-perks.sql
CREATE TABLE IF NOT EXISTS perks_obtenus (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  perk      text NOT NULL,
  tier      integer NOT NULL,             -- 1 pour un perk sans tier
  espece    text,                         -- singe qui le porte (null = non équipé)
  obtenu_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, perk, tier),
  UNIQUE (user_id, espece)                -- un seul perk par singe
);
