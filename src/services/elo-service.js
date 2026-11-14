import { pool } from "../config/database.js";
import { ELO_COMBATS_PAR_JOUR } from "../constants/game.js";
import { calculerElo } from "../game/elo.js";

export async function getElo(userId) {
  const { rows } = await pool.query("SELECT elo FROM users WHERE id = $1", [userId]);
  return rows[0]?.elo ?? null;
}

export async function classementElo(userId) {
  const { rows } = await pool.query("SELECT id, pseudo, elo FROM users ORDER BY elo DESC, pseudo LIMIT 10");
  return rows.map((r) => ({ pseudo: r.pseudo, elo: r.elo, moi: r.id === userId }));
}

// Calcule et applique les variations d'elo d'un combat PVP, dans la transaction `db`.
// Les deux joueurs sont verrouillés (toujours dans le même ordre, pour éviter un interblocage) :
// deux combats simultanés d'un même joueur ne peuvent pas écraser son elo.
// Anti-farm : contre un même adversaire, seuls ELO_COMBATS_PAR_JOUR combats sur 24 h glissantes comptent.
// Renvoie { A, B, compte } à enregistrer avec le combat.
export async function appliquerElo(db, userA, userB, vainqueur) {
  const { rows } = await db.query(
    "SELECT id, elo FROM users WHERE id = ANY($1) ORDER BY id FOR UPDATE",
    [[userA, userB]]
  );
  const elo = Object.fromEntries(rows.map((r) => [r.id, r.elo]));

  const { rows: recents } = await db.query(
    `SELECT count(*)::int AS n FROM combats
     WHERE ((user_a = $1 AND user_b = $2) OR (user_a = $2 AND user_b = $1))
       AND created_at > now() - interval '24 hours'
       AND (resultat->'elo'->>'compte')::boolean`,
    [userA, userB]
  );
  if (recents[0].n >= ELO_COMBATS_PAR_JOUR) return { A: 0, B: 0, compte: false };

  const delta = calculerElo(elo[userA], elo[userB], vainqueur);
  await db.query("UPDATE users SET elo = elo + $2 WHERE id = $1", [userA, delta.A]);
  await db.query("UPDATE users SET elo = elo + $2 WHERE id = $1", [userB, delta.B]);
  return { ...delta, compte: true };
}
