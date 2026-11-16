// Ressources gagnées dans les donjons (table ressources_joueur) : essence d'éveil…
import { pool } from "../config/database.js";

// Stock du joueur : { essence: 120, ... } (0 pour une ressource jamais gagnée).
export async function lireRessources(userId, db = pool) {
  const { rows } = await db.query("SELECT ressource, quantite FROM ressources_joueur WHERE user_id = $1", [userId]);
  return Object.fromEntries(rows.map((r) => [r.ressource, r.quantite]));
}

// Ajoute `quantite` au stock (dans la transaction `db`) ; renvoie le nouveau stock.
export async function ajouterRessource(userId, ressource, quantite, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO ressources_joueur (user_id, ressource, quantite) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, ressource) DO UPDATE SET quantite = ressources_joueur.quantite + EXCLUDED.quantite
     RETURNING quantite`,
    [userId, ressource, quantite]
  );
  return rows[0].quantite;
}

// Retire `quantite` du stock en une seule requête (deux dépenses simultanées ne peuvent pas passer sous 0).
// Renvoie le nouveau stock, ou null si le stock ne suffit pas (rien n'est retiré).
export async function depenserRessource(userId, ressource, quantite, db = pool) {
  const { rows } = await db.query(
    `UPDATE ressources_joueur SET quantite = quantite - $3
     WHERE user_id = $1 AND ressource = $2 AND quantite >= $3
     RETURNING quantite`,
    [userId, ressource, quantite]
  );
  return rows[0]?.quantite ?? null;
}
