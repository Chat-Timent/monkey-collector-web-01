-- Tickets d'arme et d'équipement : l'acier et l'étoffe restants des joueurs sont convertis
-- à raison de 10 pour 1 ticket, arrondi au supérieur (7 acier → 1 ticket d'arme, 15 → 2, 20 → 2).
--   acier  → ticket_arme
--   etoffe → ticket_equipement
-- Les lignes 'acier' et 'etoffe' sont ensuite supprimées. Relancer le script ne change plus rien.
-- À lancer JUSTE APRÈS le déploiement du code des tickets (l'ancien code ne lit pas les tickets,
-- le nouveau ne lit plus l'acier ni l'étoffe).
-- Sur le Raspberry, après sauvegarde : psql "$DATABASE_URL" -f scripts/migrations/2026-11-19-tickets-objets.sql
--
-- Aperçu avant de lancer (ne modifie rien) :
--   SELECT user_id, ressource, quantite, CEIL(quantite / 10.0)::integer AS tickets
--   FROM ressources_joueur WHERE ressource IN ('acier', 'etoffe') ORDER BY user_id, ressource;
BEGIN;

INSERT INTO ressources_joueur (user_id, ressource, quantite)
SELECT user_id,
       CASE ressource WHEN 'acier' THEN 'ticket_arme' ELSE 'ticket_equipement' END,
       CEIL(quantite / 10.0)::integer
FROM ressources_joueur
WHERE ressource IN ('acier', 'etoffe') AND quantite > 0
ON CONFLICT (user_id, ressource) DO UPDATE SET quantite = ressources_joueur.quantite + EXCLUDED.quantite;

DELETE FROM ressources_joueur WHERE ressource IN ('acier', 'etoffe');

COMMIT;

-- Vérification : plus aucune ligne d'acier ou d'étoffe, et les tickets de chacun
SELECT ressource, COUNT(*) AS joueurs, SUM(quantite) AS total
FROM ressources_joueur
WHERE ressource IN ('acier', 'etoffe', 'ticket_arme', 'ticket_equipement')
GROUP BY ressource ORDER BY ressource;
