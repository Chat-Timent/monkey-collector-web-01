-- Flux des tirages notables : les légendaires et mythiques tirés par les joueurs,
-- affichés en bas de la page Tirage.
-- Migration additive : nouvelle table, aucune donnée existante touchée. Le flux démarre vide,
-- il se remplit aux prochains tirages.
-- À lancer AVANT de déployer le code qui écrit dans cette table.
-- Sur le Raspberry, après sauvegarde : psql "$DATABASE_URL" -f scripts/migrations/2026-11-17-tirages-notables.sql
CREATE TABLE IF NOT EXISTS tirages_notables (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  espece     text NOT NULL,
  rarete     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Le flux ne lit que les plus récents : l'index évite de parcourir toute la table.
CREATE INDEX IF NOT EXISTS tirages_notables_recents_idx ON tirages_notables (created_at DESC, id DESC);
