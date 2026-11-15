import { pool, transaction } from "../config/database.js";
import { calculerElo, limiteCombatsElo } from "../game/elo.js";
import { effetsDuJoueur } from "./arbre-service.js";

// Fin du replay d'un combat (même règle que pour les combats « en cours »)
const FIN_COMBAT = "created_at + (COALESCE((resultat->>'dureeMs')::int, 0) * interval '1 millisecond')";

// Applique l'elo des combats PVP terminés qui ne l'ont pas encore été.
// L'elo d'un combat n'est publié qu'une fois son replay fini : pendant le combat,
// le classement ne dévoile pas le vainqueur. Appelé avant chaque lecture de l'elo.
// Chaque combat est verrouillé (SKIP LOCKED : deux appels simultanés ne l'appliquent pas deux fois),
// puis les joueurs sont mis à jour dans l'ordre de leur id, pour éviter un interblocage.
export async function reglerEloTermines() {
  const { rows: enAttente } = await pool.query(
    `SELECT 1 FROM combats
     WHERE mode = 'pvp' AND resultat->'elo'->>'applique' = 'false' AND ${FIN_COMBAT} <= now()
     LIMIT 1`
  );
  if (enAttente.length === 0) return;

  await transaction(async (db) => {
    const { rows } = await db.query(
      `UPDATE combats SET resultat = jsonb_set(resultat, '{elo,applique}', 'true')
       WHERE id IN (
         SELECT id FROM combats
         WHERE mode = 'pvp' AND resultat->'elo'->>'applique' = 'false' AND ${FIN_COMBAT} <= now()
         FOR UPDATE SKIP LOCKED
       )
       RETURNING user_a, user_b, (resultat->'elo'->>'A')::int AS a, (resultat->'elo'->>'B')::int AS b`
    );
    const deltas = new Map();
    for (const r of rows) {
      deltas.set(r.user_a, (deltas.get(r.user_a) ?? 0) + r.a);
      deltas.set(r.user_b, (deltas.get(r.user_b) ?? 0) + r.b);
    }
    for (const id of [...deltas.keys()].sort()) {
      await db.query("UPDATE users SET elo = elo + $2 WHERE id = $1", [id, deltas.get(id)]);
    }
  });
}

export async function getElo(userId) {
  await reglerEloTermines();
  const { rows } = await pool.query("SELECT elo FROM users WHERE id = $1", [userId]);
  return rows[0]?.elo ?? null;
}

export async function classementElo(userId) {
  await reglerEloTermines();
  const { rows } = await pool.query("SELECT id, pseudo, elo FROM users ORDER BY elo DESC, pseudo LIMIT 10");
  return rows.map((r) => ({ pseudo: r.pseudo, elo: r.elo, moi: r.id === userId }));
}

// Variations d'elo d'un combat PVP, calculées au lancement depuis l'elo actuel des deux joueurs
// (dans la transaction `db`). Elles ne sont appliquées qu'à la fin du combat (reglerEloTermines).
// Anti-farm : contre un même adversaire, seuls ELO_COMBATS_PAR_JOUR combats sur 24 h glissantes comptent
// (un de plus si l'un des deux joueurs a Duelliste, voir limiteCombatsElo).
// Renvoie { A, B, compte, applique } à enregistrer avec le combat.
export async function eloDuCombat(db, userA, userB, vainqueur) {
  const { rows } = await db.query("SELECT id, elo FROM users WHERE id = ANY($1)", [[userA, userB]]);
  const elo = Object.fromEntries(rows.map((r) => [r.id, r.elo]));

  const { rows: recents } = await db.query(
    `SELECT count(*)::int AS n FROM combats
     WHERE ((user_a = $1 AND user_b = $2) OR (user_a = $2 AND user_b = $1))
       AND created_at > now() - interval '24 hours'
       AND (resultat->'elo'->>'compte')::boolean`,
    [userA, userB]
  );
  const limite = limiteCombatsElo(await effetsDuJoueur(userA, db), await effetsDuJoueur(userB, db));
  if (recents[0].n >= limite) return { A: 0, B: 0, compte: false };

  return { ...calculerElo(elo[userA], elo[userB], vainqueur), compte: true, applique: false };
}
