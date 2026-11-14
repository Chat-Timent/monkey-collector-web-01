import { pool, transaction } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";
import { lireCollection } from "./collection-service.js";
import { effetsDuJoueur, nbSlots } from "./arbre-service.js";

export async function getEquipe(userId, db = pool) {
  const { rows } = await db.query(
    "SELECT slot, espece FROM equipe WHERE user_id = $1 ORDER BY slot",
    [userId]
  );
  return rows;
}

export async function nbSlotsDuJoueur(userId) {
  return nbSlots(await effetsDuJoueur(userId));
}

// `especes` : une entrée par emplacement (null = vide). Un client qui envoie moins
// d'emplacements que son maximum (6 de base, plus le bonus de l'arbre) reste accepté.
export async function definirEquipe(userId, especes) {
  const max = await nbSlotsDuJoueur(userId);
  if (!Array.isArray(especes) || especes.length < 6 || especes.length > max) {
    throw new ErreurJeu(`entre 6 et ${max} emplacements attendus`);
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
