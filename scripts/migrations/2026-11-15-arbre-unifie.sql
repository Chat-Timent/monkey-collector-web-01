-- Arbre unifié : nouveaux coûts, nouvelles liaisons. Tous les nœuds pris sont supprimés :
-- les points sont recalculés depuis le niveau du starter, donc chaque joueur est remboursé
-- et redistribue ses points dans le nouvel arbre.
-- Migration NON additive (voulue) : faire une sauvegarde avant.
-- Sur le Raspberry : bash scripts/backup.sh, puis psql "$DATABASE_URL" -f scripts/migrations/2026-11-15-arbre-unifie.sql
DELETE FROM starter_noeuds;
