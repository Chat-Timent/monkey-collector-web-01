-- Annonces : messages publiés par l'admin (compte « Noam ») dans la mailbox du footer.
-- Migration additive : une nouvelle table et une colonne avec valeur par défaut, aucune donnée touchée.
-- À lancer AVANT de déployer le code qui lit cette table.
-- Sur le Raspberry, après sauvegarde : psql "$DATABASE_URL" -f scripts/migrations/2026-11-17-annonces.sql
CREATE TABLE IF NOT EXISTS annonces (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  texte      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT annonces_texte_max CHECK (char_length(texte) <= 500),
  CONSTRAINT annonces_texte_non_vide CHECK (char_length(btrim(texte)) > 0)
);

-- Dernière annonce lue par chaque joueur (0 = aucune) : allume la pastille de la mailbox.
ALTER TABLE users ADD COLUMN IF NOT EXISTS annonces_lues bigint NOT NULL DEFAULT 0;
