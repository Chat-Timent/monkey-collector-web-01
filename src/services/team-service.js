import { pool, transaction } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";
import { NB_DECKS, NOM_DECK_MAX } from "../constants/game.js";
import { lireCollection } from "./collection-service.js";
import { effetsDuJoueur, nbSlots } from "./arbre-service.js";

// Numéro de deck venu du client : entier de 1 à NB_DECKS
export function validerDeck(deck) {
  const n = Number(deck);
  if (!Number.isInteger(n) || n < 1 || n > NB_DECKS) throw new ErreurJeu("deck inconnu");
  return n;
}

export async function getDeckActif(userId, db = pool) {
  const { rows } = await db.query("SELECT deck_actif FROM users WHERE id = $1", [userId]);
  return rows[0]?.deck_actif ?? 1;
}

// `deck` : null = le deck actif (celui des combats)
export async function getEquipe(userId, db = pool, deck = null) {
  const { rows } = await db.query(
    `SELECT slot, espece FROM equipe
     WHERE user_id = $1 AND deck = COALESCE($2, (SELECT deck_actif FROM users WHERE id = $1))
     ORDER BY slot`,
    [userId, deck]
  );
  return rows;
}

// Les NB_DECKS decks du joueur : numéro, nom (null = nom par défaut côté client) et nombre de singes
export async function getDecks(userId) {
  const { rows } = await pool.query(
    `SELECT d.deck, n.nom, (SELECT count(*)::int FROM equipe e WHERE e.user_id = $1 AND e.deck = d.deck) AS nb
     FROM generate_series(1, $2::int) AS d(deck)
     LEFT JOIN decks n ON n.user_id = $1 AND n.deck = d.deck
     ORDER BY d.deck`,
    [userId, NB_DECKS]
  );
  return rows;
}

export async function nbSlotsDuJoueur(userId) {
  return nbSlots(await effetsDuJoueur(userId));
}

// `especes` : une entrée par emplacement (null = vide). Un client qui envoie moins
// d'emplacements que son maximum (6 de base, plus le bonus de l'arbre) reste accepté.
export async function definirEquipe(userId, especes, deck) {
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
    await db.query("DELETE FROM equipe WHERE user_id = $1 AND deck = $2", [userId, deck]);
    for (let i = 0; i < especes.length; i++) {
      if (especes[i] === null) continue;
      await db.query(
        "INSERT INTO equipe (user_id, deck, slot, espece) VALUES ($1, $2, $3, $4)",
        [userId, deck, i + 1, especes[i]]
      );
    }
  });

  return getEquipe(userId, pool, deck);
}

// Un deck vide ne peut pas devenir actif : les combats le refuseraient
export async function activerDeck(userId, deck) {
  const { rowCount } = await pool.query(
    `UPDATE users SET deck_actif = $2 WHERE id = $1
     AND EXISTS (SELECT 1 FROM equipe WHERE user_id = $1 AND deck = $2)`,
    [userId, deck]
  );
  if (rowCount === 0) throw new ErreurJeu("ce deck est vide");
}

// Nom vide = retour au nom par défaut
export async function renommerDeck(userId, deck, nom) {
  if (typeof nom !== "string") throw new ErreurJeu("nom requis");
  const propre = nom.trim().replace(/\s+/g, " ");
  if (propre.length > NOM_DECK_MAX) throw new ErreurJeu(`${NOM_DECK_MAX} caractères maximum`);
  if (propre === "") {
    await pool.query("DELETE FROM decks WHERE user_id = $1 AND deck = $2", [userId, deck]);
  } else {
    await pool.query(
      `INSERT INTO decks (user_id, deck, nom) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, deck) DO UPDATE SET nom = EXCLUDED.nom`,
      [userId, deck, propre]
    );
  }
}
