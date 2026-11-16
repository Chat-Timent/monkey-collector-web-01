// Objets portés par les singes (armes, équipements) : loterie payée en ressource de donjon,
// doublons convertis en niveaux d'objet, équipement sur un singe possédé. Un seul code pour tous les types.
import { pool, transaction } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";
import {
  CATALOGUES, apresDoublon, doublonsRequis, effetObjet, nbTiersObjet, niveauMaxObjet, objetExiste, tirerObjet, valeursObjet,
} from "../game/objets.js";
import { infoRecompense } from "../game/ressources.js";
import { lireCollection } from "./collection-service.js";
import { ajouterRessource, depenserRessource, lireRessources } from "./ressources-joueur-service.js";

function catalogueDe(type) {
  if (!Object.hasOwn(CATALOGUES, type)) throw new ErreurJeu("type d'objet inconnu");
  return CATALOGUES[type];
}

async function lireObjets(userId, type, db = pool) {
  const { rows } = await db.query(
    `SELECT objet, tier, niveau, doublons, espece, slot FROM objets_obtenus
     WHERE user_id = $1 AND type = $2 ORDER BY objet, tier`,
    [userId, type]
  );
  return rows;
}

// Objets portés par les singes du joueur, tous types confondus : { espece: [effet, ...] } (pour le combat).
// Un objet retiré du catalogue est ignoré.
export async function objetsDesSinges(userId, db = pool) {
  const { rows } = await db.query(
    "SELECT type, objet, tier, niveau, espece FROM objets_obtenus WHERE user_id = $1 AND espece IS NOT NULL ORDER BY type, slot",
    [userId]
  );
  const parSinge = {};
  for (const r of rows) {
    const c = CATALOGUES[r.type];
    const effet = c ? effetObjet(c, r.objet, r.tier, r.niveau) : null;
    if (effet) (parSinge[r.espece] ??= []).push(effet);
  }
  return parSinge;
}

// Catalogue envoyé au client : nom, icône et valeurs de base de chaque tier.
function catalogueClient(c) {
  return Object.fromEntries(Object.entries(c.objets).map(([id, o]) => [id, { nom: o.nom, icone: o.icone, tiers: o.tiers }]));
}

// Ce qu'affiche la page d'un type d'objet : prix et ressource, stock, catalogue, règle des niveaux, objets obtenus
// (avec leurs valeurs à leur niveau et les doublons requis pour le suivant).
export async function getObjets(userId, type) {
  const c = catalogueDe(type);
  const [obtenus, ressources] = await Promise.all([lireObjets(userId, type), lireRessources(userId)]);
  return {
    type,
    prix: c.prix,
    ressource: infoRecompense(c.ressource),
    stock: ressources[c.ressource] ?? 0,
    slots: c.slots,
    uneSorteParSinge: !!c.uneSorteParSinge,
    nbTiers: nbTiersObjet(c),
    niveauMax: niveauMaxObjet(c),
    bonusParNiveauPct: c.niveaux.bonusParNiveauPct,
    catalogue: catalogueClient(c),
    obtenus: obtenus
      .filter((o) => objetExiste(c, o.objet, o.tier))
      .map((o) => ({ ...o, valeurs: valeursObjet(c, o.objet, o.tier, o.niveau), doublonsRequis: doublonsRequis(c, o.niveau) })),
  };
}

// Tirage de la loterie, dans une transaction. La ressource est retirée en une requête (deux tirages simultanés
// ne peuvent pas dépenser le même stock) ; un objet déjà possédé (même objet, même tier) est un doublon :
// il fait progresser son niveau, ou rend de la ressource s'il est déjà au niveau maximal.
export async function tirerLoterieObjet(userId, type) {
  const c = catalogueDe(type);
  const tirage = await transaction(async (db) => {
    if ((await depenserRessource(userId, c.ressource, c.prix, db)) === null) {
      throw new ErreurJeu(`il faut ${c.prix} ${infoRecompense(c.ressource).nom} pour tirer`);
    }
    const { objet, tier } = tirerObjet(c);
    const { rowCount } = await db.query(
      `INSERT INTO objets_obtenus (user_id, type, objet, tier) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, type, objet, tier) DO NOTHING`,
      [userId, type, objet, tier]
    );
    if (rowCount === 1) return { objet, tier, doublon: false, niveau: 1, monte: false, rembourse: 0 };

    const { rows } = await db.query(
      "SELECT niveau, doublons FROM objets_obtenus WHERE user_id = $1 AND type = $2 AND objet = $3 AND tier = $4 FOR UPDATE",
      [userId, type, objet, tier]
    );
    const apres = apresDoublon(c, rows[0]);
    await db.query(
      "UPDATE objets_obtenus SET niveau = $5, doublons = $6 WHERE user_id = $1 AND type = $2 AND objet = $3 AND tier = $4",
      [userId, type, objet, tier, apres.niveau, apres.doublons]
    );
    if (apres.rembourse > 0) await ajouterRessource(userId, c.ressource, apres.rembourse, db);
    return { objet, tier, doublon: true, niveau: apres.niveau, monte: apres.monte, rembourse: apres.rembourse };
  });
  return { tirage, ...(await getObjets(userId, type)) };
}

// Équipe un objet obtenu sur un singe possédé (`espece`, emplacement `slot`), ou le retire (`espece` null).
// L'objet qui occupait cet emplacement sur ce singe est retiré ; un objet n'est porté que par un singe à la fois.
// Avec "uneSorteParSinge", un singe ne peut pas porter deux objets de la même sorte (dans deux emplacements).
export async function equiperObjet(userId, type, objet, tier, espece, slot = 1) {
  const c = catalogueDe(type);
  if (!objetExiste(c, objet, tier)) throw new ErreurJeu("objet inconnu");
  if (espece !== null && typeof espece !== "string") throw new ErreurJeu("singe invalide");
  if (espece !== null && !(Number.isInteger(slot) && slot >= 1 && slot <= c.slots)) throw new ErreurJeu("emplacement invalide");
  if (espece !== null) {
    const collection = await lireCollection(userId);
    if (!Object.hasOwn(collection.singes, espece)) throw new ErreurJeu("singe non possédé");
  }

  await transaction(async (db) => {
    const { rows } = await db.query(
      "SELECT 1 FROM objets_obtenus WHERE user_id = $1 AND type = $2 AND objet = $3 AND tier = $4 FOR UPDATE",
      [userId, type, objet, tier]
    );
    if (rows.length === 0) throw new ErreurJeu("objet non obtenu");
    if (espece !== null && c.uneSorteParSinge) {
      const { rows: memeSorte } = await db.query(
        `SELECT 1 FROM objets_obtenus
         WHERE user_id = $1 AND type = $2 AND espece = $3 AND objet = $4 AND tier <> $5 AND slot <> $6`,
        [userId, type, espece, objet, tier, slot]
      );
      if (memeSorte.length > 0) throw new ErreurJeu(`ce singe porte déjà : ${c.objets[objet].nom}`);
    }
    if (espece !== null) {
      await db.query(
        `UPDATE objets_obtenus SET espece = NULL, slot = NULL
         WHERE user_id = $1 AND type = $2 AND espece = $3 AND slot = $4 AND NOT (objet = $5 AND tier = $6)`,
        [userId, type, espece, slot, objet, tier]
      );
    }
    await db.query(
      "UPDATE objets_obtenus SET espece = $5, slot = $6 WHERE user_id = $1 AND type = $2 AND objet = $3 AND tier = $4",
      [userId, type, objet, tier, espece, espece === null ? null : slot]
    );
  });

  return getObjets(userId, type);
}
