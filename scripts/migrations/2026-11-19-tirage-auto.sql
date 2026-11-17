-- Auto-tirage de la page Tirage : réglage et état de l'auto-tirage de chaque joueur.
-- Les tirages dus sont calculés à la demande (comme la recharge), à partir de `dernier_passage`.
-- Migration additive : nouvelle table, aucune donnée existante touchée.
-- À lancer AVANT de déployer le code qui lit cette table.
-- Sur le Raspberry, après sauvegarde : psql "$DATABASE_URL" -f scripts/migrations/2026-11-19-tirage-auto.sql
CREATE TABLE IF NOT EXISTS tirage_auto (
  user_id         uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  actif           boolean NOT NULL DEFAULT false,
  rythme          integer NOT NULL DEFAULT 1,      -- tirages par seconde
  rarete_min      text NOT NULL DEFAULT 'rare',    -- s'arrête sur cette rareté ou mieux
  dernier_passage timestamptz NOT NULL DEFAULT now(), -- instant du dernier tirage auto effectué
  nb_faits        integer NOT NULL DEFAULT 0,      -- tirages faits depuis le lancement
  raison_arret    text,                            -- 'filtre', 'stock' ou 'manuel'
  espece_arret    text,                            -- singe qui a déclenché l'arrêt (raison 'filtre')
  arret_at        timestamptz
);
