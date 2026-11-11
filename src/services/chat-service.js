import { pool } from "../config/database.js";

export async function lireChatGlobal(userId, apres = 0) {
  const { rows } = await pool.query(
    `SELECT m.id, m.texte, m.created_at, u.pseudo, (m.user_id = $2) AS moi
     FROM chat_global m
     JOIN users u ON u.id = m.user_id
     WHERE m.id > $1
     ORDER BY m.id
     LIMIT 50`,
    [apres, userId]
  );
  const { rows: borne } = await pool.query(
    `SELECT COALESCE(MIN(id), 0)::bigint AS plus_ancien
     FROM (SELECT id FROM chat_global ORDER BY id DESC LIMIT 50) t`
  );
  return {
    messages: rows,
    plusAncienId: Number(borne[0].plus_ancien),
  };
}

export async function envoyerChatGlobal(userId, texte) {
  const propre = String(texte ?? "").trim();
  if (propre.length === 0) throw new Error("message vide");
  if (propre.length > 200) throw new Error("message trop long (200 caractères max)");

  await pool.query(
    "INSERT INTO chat_global (user_id, texte) VALUES ($1, $2)",
    [userId, propre]
  );
  return true;
}
