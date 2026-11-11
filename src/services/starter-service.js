import { pool } from "../config/database.js";
import { RECOMPENSES, STARTERS } from "../constants/game.js";

export async function getStarter(userId) {
  const { rows } = await pool.query(
    "SELECT nom, niveau, xp, coins FROM starter WHERE user_id = $1",
    [userId]
  );
  return rows[0] ?? null;
}

export async function choisirStarter(userId, choix) {
  if (!STARTERS[choix]) throw new Error("starter inconnu");
  await pool.query(
    `INSERT INTO starter (user_id, nom) VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, STARTERS[choix].nom]
  );
  return getStarter(userId);
}

export async function gagnerRecompense(userId, rarete, starterDejaLu) {
  const gains = RECOMPENSES[rarete];
  if (!gains) return null;

  const starter = starterDejaLu ?? await getStarter(userId);
  if (!starter) return null;

  let niveau = starter.niveau;
  let xp = starter.xp + gains.xp;
  let coins = starter.coins + gains.coins;
  let niveauxGagnes = 0;
  while (xp >= niveau * 100) {
    xp -= niveau * 100;
    niveau += 1;
    niveauxGagnes += 1;
  }

  await pool.query(
    "UPDATE starter SET niveau = $2, xp = $3, coins = $4 WHERE user_id = $1",
    [userId, niveau, xp, coins]
  );

  return { nom: starter.nom, niveau, xp, coins, niveauxGagnes };
}
