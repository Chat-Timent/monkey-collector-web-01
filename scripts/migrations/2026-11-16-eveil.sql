-- Éveil : ressources des donjons (essence d'éveil, puis acier et étoffe) et niveau d'éveil des singes.
-- Migration additive, sans effet sur les données existantes (aucune ressource, tous les singes au niveau d'éveil 1).
-- À lancer AVANT de déployer le code qui lit ces tables.
-- Sur le Raspberry, après sauvegarde : psql "$DATABASE_URL" -f scripts/migrations/2026-11-16-eveil.sql
CREATE TABLE IF NOT EXISTS ressources_joueur (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ressource text NOT NULL,                 -- 'essence' (donjon d'éveil)
  quantite  integer NOT NULL DEFAULT 0 CHECK (quantite >= 0),
  PRIMARY KEY (user_id, ressource)
);

-- Niveau d'éveil (1 à 6, maximum fixé par src/data/eveil.json) ; seuls les légendaires et mythiques montent.
ALTER TABLE collections ADD COLUMN IF NOT EXISTS eveil integer NOT NULL DEFAULT 1 CHECK (eveil >= 1);
