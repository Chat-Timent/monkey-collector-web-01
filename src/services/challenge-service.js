import { pool } from "../config/database.js";
import { DUREE_DEFI_SEC, SEUIL_EN_LIGNE_SEC } from "../constants/game.js";

async function expirerDefis() {
  await pool.query(
    "UPDATE defis SET statut = 'expire' WHERE statut = 'en_attente' AND expires_at <= now()"
  );
}

export async function marquerPresence(userId) {
  await pool.query(
    `INSERT INTO presence (user_id, last_seen) VALUES ($1, now())
     ON CONFLICT (user_id) DO UPDATE SET last_seen = now()`,
    [userId]
  );
}

export async function listerJoueurs(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.pseudo,
            COALESCE(p.last_seen > now() - make_interval(secs => $2), false) AS en_ligne
     FROM users u
     LEFT JOIN presence p ON p.user_id = u.id
     WHERE u.id <> $1
     ORDER BY en_ligne DESC, u.pseudo`,
    [userId, SEUIL_EN_LIGNE_SEC]
  );
  return rows;
}

export async function envoyerDefi(deUser, versUser) {
  await expirerDefis();
  if (deUser === versUser) throw new Error("tu ne peux pas te défier toi-même");

  const { rows: cible } = await pool.query(
    "SELECT 1 FROM presence WHERE user_id = $1 AND last_seen > now() - make_interval(secs => $2)",
    [versUser, SEUIL_EN_LIGNE_SEC]
  );
  if (cible.length === 0) throw new Error("ce joueur n'est pas en ligne");

  try {
    const { rows } = await pool.query(
      `INSERT INTO defis (de_user, vers_user, expires_at)
       VALUES ($1, $2, now() + make_interval(secs => $3))
       RETURNING id`,
      [deUser, versUser, DUREE_DEFI_SEC]
    );
    return rows[0].id;
  } catch (err) {
    if (err.code === "23505") throw new Error("un défi est déjà en attente pour ce joueur");
    throw err;
  }
}

export async function defisDuJoueur(userId) {
  await expirerDefis();
  const { rows } = await pool.query(
    `SELECT d.id, d.de_user, d.vers_user, u1.pseudo AS de_pseudo, u2.pseudo AS vers_pseudo,
            GREATEST(0, CEIL(EXTRACT(EPOCH FROM (d.expires_at - now())))) AS secondes_restantes
     FROM defis d
     JOIN users u1 ON u1.id = d.de_user
     JOIN users u2 ON u2.id = d.vers_user
     WHERE d.statut = 'en_attente' AND (d.de_user = $1 OR d.vers_user = $1)`,
    [userId]
  );
  return {
    envoyes: rows.filter((d) => d.de_user === userId),
    recus: rows.filter((d) => d.vers_user === userId),
  };
}

export async function getDefiEnAttentePourReponse(userId, defiId) {
  await expirerDefis();
  const { rows } = await pool.query(
    "SELECT id, de_user, vers_user FROM defis WHERE id = $1 AND vers_user = $2 AND statut = 'en_attente'",
    [defiId, userId]
  );
  if (rows.length === 0) throw new Error("défi introuvable, expiré ou déjà traité");
  return rows[0];
}

export async function repondreAuDefi(defiId, accepter) {
  await pool.query("UPDATE defis SET statut = $2 WHERE id = $1", [
    defiId,
    accepter ? "accepte" : "refuse",
  ]);
}
