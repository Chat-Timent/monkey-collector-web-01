import { pool } from "../config/database.js";
import { RECOMPENSES, STARTERS } from "../constants/game.js";
import { ErreurJeu } from "../erreurs.js";
import { appliquerGains } from "../game/progression.js";

// `verrouiller` : dans une transaction, bloque la ligne jusqu'au COMMIT
// pour que deux tirages simultanés ne s'écrasent pas leurs gains.
export async function getStarter(userId, db = pool, { verrouiller = false } = {}) {
  const { rows } = await db.query(
    `SELECT nom, niveau, xp, coins FROM starter WHERE user_id = $1${verrouiller ? " FOR UPDATE" : ""}`,
    [userId]
  );
  return rows[0] ?? null;
}

export async function choisirStarter(userId, choix) {
  if (!STARTERS[choix]) throw new ErreurJeu("starter inconnu");
  await pool.query(
    `INSERT INTO starter (user_id, nom) VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, STARTERS[choix].nom]
  );
  return getStarter(userId);
}

// `starterDejaLu` doit avoir été lu avec `verrouiller` dans la même transaction `db`
// si des appels concurrents sont possibles.
export async function gagnerRecompense(userId, rarete, starterDejaLu, db = pool) {
  const gains = RECOMPENSES[rarete];
  if (!gains) return null;

  const starter = starterDejaLu ?? await getStarter(userId, db);
  if (!starter) return null;

  const { niveau, xp, coins, niveauxGagnes } = appliquerGains(starter, gains);

  await db.query(
    "UPDATE starter SET niveau = $2, xp = $3, coins = $4 WHERE user_id = $1",
    [userId, niveau, xp, coins]
  );

  return { nom: starter.nom, niveau, xp, coins, niveauxGagnes };
}
