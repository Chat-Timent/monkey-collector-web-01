-- Multideck : 3 équipes par joueur, dont une active pour les combats (PVP, Aventure, donjons).
-- Aucune donnée perdue : l'équipe actuelle de chaque joueur devient son deck 1, actif par défaut.
-- Seules les clés de la table equipe changent (l'unicité devient « par deck »).
-- À lancer AVANT de déployer le code qui lit ces colonnes.
-- Sur le Raspberry, après sauvegarde : psql "$DATABASE_URL" -f scripts/migrations/2026-11-19-multideck.sql
BEGIN;

ALTER TABLE equipe ADD COLUMN IF NOT EXISTS deck integer NOT NULL DEFAULT 1 CHECK (deck >= 1 AND deck <= 3);
ALTER TABLE equipe DROP CONSTRAINT IF EXISTS equipe_pkey;
ALTER TABLE equipe ADD CONSTRAINT equipe_pkey PRIMARY KEY (user_id, deck, slot);
ALTER TABLE equipe DROP CONSTRAINT IF EXISTS equipe_user_id_espece_key;
ALTER TABLE equipe DROP CONSTRAINT IF EXISTS equipe_deck_espece_key;
ALTER TABLE equipe ADD CONSTRAINT equipe_deck_espece_key UNIQUE (user_id, deck, espece);

-- Deck utilisé en combat
ALTER TABLE users ADD COLUMN IF NOT EXISTS deck_actif integer NOT NULL DEFAULT 1 CHECK (deck_actif >= 1 AND deck_actif <= 3);

-- Noms donnés par les joueurs (une ligne seulement pour un deck renommé)
CREATE TABLE IF NOT EXISTS decks (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck    integer NOT NULL CHECK (deck >= 1 AND deck <= 3),
  nom     text NOT NULL CHECK (char_length(nom) >= 1 AND char_length(nom) <= 20),
  PRIMARY KEY (user_id, deck)
);

COMMIT;
