import { pool } from "../config/database.js";
import { lireCollection } from "./collection-service.js";

export async function getEquipe(userId) {
  const { rows } = await pool.query(
    "SELECT slot, espece FROM equipe WHERE user_id = $1 ORDER BY slot",
    [userId]
  );
  return rows;
}

export async function definirEquipe(userId, especes) {
  if (!Array.isArray(especes) || especes.length !== 6) {
    throw new Error("6 emplacements attendus");
  }

  const choisis = especes.filter((e) => e !== null);
  if (new Set(choisis).size !== choisis.length) throw new Error("singe en double");

  const possedes = await lireCollection(userId);
  for (const e of choisis) {
    if (!possedes.singes[e]) throw new Error(`singe non possédé : ${e}`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM equipe WHERE user_id = $1", [userId]);
    for (let i = 0; i < especes.length; i++) {
      if (especes[i] === null) continue;
      await client.query(
        "INSERT INTO equipe (user_id, slot, espece) VALUES ($1, $2, $3)",
        [userId, i + 1, especes[i]]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return getEquipe(userId);
}
