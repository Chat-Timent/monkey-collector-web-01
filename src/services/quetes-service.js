// Progression des quêtes du jour, appelée par les actions qui les font avancer (tirage, loterie, PVP…).
// À part du reste du quotidien (quotidien-service.js) pour que ces services n'en dépendent pas.
import { pool } from "../config/database.js";
import { quetesDuJour } from "../game/quotidien.js";
import { jourParis } from "../game/ressources.js";

// Ajoute `n` à la quête `type` du joueur (dans la transaction `db`), si elle fait partie des quêtes du jour.
// Le compteur peut dépasser l'objectif : l'affichage le plafonne.
export async function progresserQuete(userId, type, n = 1, db = pool) {
  const jour = jourParis();
  if (!quetesDuJour(jour).includes(type)) return;
  await db.query(
    `INSERT INTO quetes_jour (user_id, jour, quete, progres) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, jour, quete) DO UPDATE SET progres = quetes_jour.progres + EXCLUDED.progres`,
    [userId, jour, type, n]
  );
}
