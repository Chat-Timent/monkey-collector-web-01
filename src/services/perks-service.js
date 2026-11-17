import { pool, transaction } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";
import { PERKS, effetPerk, nbTiers, perkExiste, tirerPerk, xpDoublon } from "../game/perks.js";
import { pointsDepenses, pointsDisponibles } from "../game/starter-arbre.js";
import { lireNoeudsPris } from "./arbre-service.js";
import { lireCollection } from "./collection-service.js";
import { progresserQuete } from "./quetes-service.js";
import { gagnerRecompense, getStarter } from "./starter-service.js";

async function lirePerks(userId, db = pool) {
  const { rows } = await db.query(
    "SELECT perk, tier, espece FROM perks_obtenus WHERE user_id = $1 ORDER BY perk, tier",
    [userId]
  );
  return rows;
}

// Perks portés par les singes du joueur : { espece: effet du perk } (pour le combat).
export async function perksDesSinges(userId, db = pool) {
  const perks = {};
  for (const r of await lirePerks(userId, db)) {
    if (r.espece) perks[r.espece] = effetPerk(r.perk, r.tier);
  }
  return perks;
}

// Catalogue envoyé au client : nom, icône et valeurs de chaque tier (un seul pour un perk sans tier).
function catalogue() {
  return Object.fromEntries(Object.entries(PERKS.perks).map(([id, p]) => [id, {
    nom: p.nom, icone: p.icone, nbTiers: nbTiers(id), tiers: p.tiers ?? [p.valeurs ?? {}],
  }]));
}

// Ce qu'affiche la page Perks : prix, coins du joueur, catalogue et perks obtenus.
export async function getPerks(userId) {
  const [starter, obtenus] = await Promise.all([getStarter(userId), lirePerks(userId)]);
  return { prix: PERKS.prix, coins: starter?.coins ?? 0, catalogue: catalogue(), obtenus };
}

// Tirage de la loterie, dans une transaction (ligne du starter verrouillée : deux tirages
// simultanés ne peuvent pas dépenser les mêmes coins). Un perk déjà possédé (même perk,
// même tier) est converti en XP du starter.
export async function tirerLoterie(userId) {
  return transaction(async (db) => {
    const starter = await getStarter(userId, db, { verrouiller: true });
    if (!starter) throw new ErreurJeu("aucun starter, choisis-en un d'abord");
    if (starter.coins < PERKS.prix) throw new ErreurJeu(`il faut ${PERKS.prix} coins pour tirer un perk`);

    const { perk, tier } = tirerPerk();
    const { rowCount } = await db.query(
      `INSERT INTO perks_obtenus (user_id, perk, tier) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, perk, tier) DO NOTHING`,
      [userId, perk, tier]
    );
    const doublon = rowCount === 0;
    const xp = doublon ? xpDoublon(perk, tier) : 0;
    const apres = await gagnerRecompense(userId, { xp, coins: -PERKS.prix }, starter, db);
    await progresserQuete(userId, "perk", 1, db);
    const pris = await lireNoeudsPris(userId, db);

    return {
      perk, tier, doublon, xp,
      starter: apres,
      pointsArbre: pointsDisponibles(apres.niveau, pointsDepenses(pris)),
    };
  });
}

// Équipe un perk obtenu sur un singe possédé (`espece`), ou le retire (`espece` null).
// Le singe ne peut porter qu'un perk : celui qu'il portait est retiré.
export async function equiperPerk(userId, perk, tier, espece) {
  if (!perkExiste(perk, tier)) throw new ErreurJeu("perk inconnu");
  if (espece !== null && typeof espece !== "string") throw new ErreurJeu("singe invalide");
  if (espece !== null) {
    const collection = await lireCollection(userId);
    if (!Object.hasOwn(collection.singes, espece)) throw new ErreurJeu("singe non possédé");
  }

  await transaction(async (db) => {
    const { rows } = await db.query(
      "SELECT espece FROM perks_obtenus WHERE user_id = $1 AND perk = $2 AND tier = $3 FOR UPDATE",
      [userId, perk, tier]
    );
    if (rows.length === 0) throw new ErreurJeu("perk non obtenu");
    if (espece !== null) {
      await db.query(
        "UPDATE perks_obtenus SET espece = NULL WHERE user_id = $1 AND espece = $2 AND NOT (perk = $3 AND tier = $4)",
        [userId, espece, perk, tier]
      );
    }
    await db.query(
      "UPDATE perks_obtenus SET espece = $4 WHERE user_id = $1 AND perk = $2 AND tier = $3",
      [userId, perk, tier, espece]
    );
  });

  return getPerks(userId);
}
