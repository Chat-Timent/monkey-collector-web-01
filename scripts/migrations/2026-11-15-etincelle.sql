-- Étincelle : compteur de tirages d'affilée sans rare ou mieux.
-- Migration additive, sans effet sur les données existantes (compteur à 0 pour tous).
-- À lancer AVANT de déployer le code qui lit cette colonne.
-- Sur le Raspberry, après sauvegarde : psql "$DATABASE_URL" -f scripts/migrations/2026-11-15-etincelle.sql
ALTER TABLE tirages_etat ADD COLUMN IF NOT EXISTS tirages_sans_rare integer NOT NULL DEFAULT 0;
