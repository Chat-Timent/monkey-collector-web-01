-- Objets empilables : chaque exemplaire d'arme ou d'équipement devient une ligne à part (identifiant `id`),
-- au lieu d'une seule ligne par (joueur, type, objet, tier). Les doublons ne fusionnent plus tout seuls :
-- le joueur décide de démanteler un exemplaire.
-- Migration NON additive (la clé primaire change), sans perte de données : les objets existants gardent
-- leur niveau, leurs doublons et leur porteur. Relançable.
-- À lancer AVANT de déployer le code qui lit `id`.
-- Sur le Raspberry, après sauvegarde : psql "$DATABASE_URL" -f scripts/migrations/2026-11-18-objets-empilables.sql
ALTER TABLE objets_obtenus ADD COLUMN IF NOT EXISTS id bigserial;
ALTER TABLE objets_obtenus DROP CONSTRAINT IF EXISTS objets_obtenus_pkey;
ALTER TABLE objets_obtenus ADD PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS objets_obtenus_joueur ON objets_obtenus (user_id, type);
