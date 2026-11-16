-- Objets : armes (et plus tard équipements) obtenus par les joueurs, niveau d'objet et singe qui les porte.
-- Migration additive, sans effet sur les données existantes. L'acier est stocké dans ressources_joueur
-- (migration 2026-11-16-eveil.sql, à lancer avant celle-ci).
-- À lancer AVANT de déployer le code qui lit cette table.
-- Sur le Raspberry, après sauvegarde : psql "$DATABASE_URL" -f scripts/migrations/2026-11-17-objets.sql
CREATE TABLE IF NOT EXISTS objets_obtenus (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type      text NOT NULL CHECK (type IN ('arme', 'equipement')),
  objet     text NOT NULL,                 -- identifiant dans src/data/armes.json (ou equipements.json)
  tier      integer NOT NULL,
  niveau    integer NOT NULL DEFAULT 1,    -- niveau d'objet, monté par les doublons
  doublons  integer NOT NULL DEFAULT 0,    -- doublons accumulés vers le niveau suivant
  espece    text,                          -- singe qui le porte (null = non équipé)
  slot      integer,                       -- emplacement sur ce singe (1 pour une arme)
  obtenu_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, type, objet, tier),
  UNIQUE (user_id, type, espece, slot),    -- un seul objet par emplacement et par singe
  CHECK ((espece IS NULL) = (slot IS NULL))
);
