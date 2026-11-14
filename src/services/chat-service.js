import { pool } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";

const TAILLE_FENETRE = 50;

// Renvoie au plus les 50 messages les plus récents postérieurs à `apres`, du plus ancien au plus récent.
// (Prendre les 50 plus anciens obligeait le client à plusieurs rafraîchissements
// avant d'atteindre les messages récents.)
export async function lireChatGlobal(userId, apres = 0) {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT m.id, m.texte, m.created_at, u.pseudo, (m.user_id = $2) AS moi
       FROM chat_global m
       JOIN users u ON u.id = m.user_id
       WHERE m.id > $1
       ORDER BY m.id DESC
       LIMIT $3
     ) recents
     ORDER BY id`,
    [apres, userId, TAILLE_FENETRE]
  );
  const { rows: borne } = await pool.query(
    `SELECT COALESCE(MIN(id), 0)::bigint AS plus_ancien
     FROM (SELECT id FROM chat_global ORDER BY id DESC LIMIT $1) t`,
    [TAILLE_FENETRE]
  );
  return {
    messages: rows,
    plusAncienId: Number(borne[0].plus_ancien),
  };
}

export async function envoyerChatGlobal(userId, texte) {
  const propre = String(texte ?? "").trim();
  if (propre.length === 0) throw new ErreurJeu("message vide");
  if (propre.length > 200) throw new ErreurJeu("message trop long (200 caractères max)");

  await pool.query(
    "INSERT INTO chat_global (user_id, texte) VALUES ($1, $2)",
    [userId, propre]
  );
  return true;
}
