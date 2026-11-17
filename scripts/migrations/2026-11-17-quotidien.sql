-- Série de connexion et quêtes quotidiennes (cadeau 🎁 et parchemin 📜 du footer).
-- Migration additive : deux nouvelles tables, aucune donnée touchée.
-- À lancer AVANT de déployer le code qui lit ces tables.
-- Sur le Raspberry, après sauvegarde : psql "$DATABASE_URL" -f scripts/migrations/2026-11-17-quotidien.sql

-- Série de connexion : dernier jour de la série récupéré (1 à 7, 0 = jamais) et sa date (heure de Paris).
CREATE TABLE IF NOT EXISTS serie_connexion (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  jour         integer NOT NULL DEFAULT 0,
  dernier_jour date
);

-- Quêtes du jour : progression et récompense récupérée, par joueur, jour (heure de Paris) et quête.
-- La quête 'bonus' note le bonus des trois quêtes.
CREATE TABLE IF NOT EXISTS quetes_jour (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jour     date NOT NULL,
  quete    text NOT NULL,
  progres  integer NOT NULL DEFAULT 0,
  reclamee boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, jour, quete)
);
