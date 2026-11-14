import { pool, transaction } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";
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
    throw new ErreurJeu("6 emplacements attendus");
  }

  const choisis = especes.filter((e) => e !== null);
  if (new Set(choisis).size !== choisis.length) throw new ErreurJeu("singe en double");

  const possedes = await lireCollection(userId);
  for (const e of choisis) {
    // hasOwn : "constructor" ou "__proto__" ne doivent pas passer pour des singes possédés
    if (typeof e !== "string" || !Object.hasOwn(possedes.singes, e)) throw new ErreurJeu(`singe non possédé : ${e}`);
  }

  await transaction(async (db) => {
    await db.query("DELETE FROM equipe WHERE user_id = $1", [userId]);
    for (let i = 0; i < especes.length; i++) {
      if (especes[i] === null) continue;
      await db.query(
        "INSERT INTO equipe (user_id, slot, espece) VALUES ($1, $2, $3)",
        [userId, i + 1, especes[i]]
      );
    }
  });

  return getEquipe(userId);
}
