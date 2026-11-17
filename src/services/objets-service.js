// Objets portés par les singes (armes, équipements) : loterie payée en ressource de donjon. Chaque tirage donne
// un exemplaire unique, sans niveau ; le joueur garde ou démantèle chacun (ressource rendue selon le tier).
// Un même objet peut équiper plusieurs singes, et un singe peut porter plusieurs fois le même équipement.
// Un seul code pour tous les types.
import { pool, transaction } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";
import {
  CATALOGUES, effetObjet, nbTiersObjet, objetExiste, remboursementDemantelement, tirerObjet, valeursObjet,
} from "../game/objets.js";
import { infoRecompense } from "../game/ressources.js";
import { lireCollection } from "./collection-service.js";
import { progresserQuete } from "./quetes-service.js";
import { ajouterRessource, depenserRessource, lireRessources } from "./ressources-joueur-service.js";

function catalogueDe(type) {
  if (!Object.hasOwn(CATALOGUES, type)) throw new ErreurJeu("type d'objet inconnu");
  return CATALOGUES[type];
}

// Exemplaires du joueur : par objet, du meilleur tier au plus faible, puis du plus récent au plus ancien.
async function lireObjets(userId, type, db = pool) {
  const { rows } = await db.query(
    `SELECT id, objet, tier, espece, slot FROM objets_obtenus
     WHERE user_id = $1 AND type = $2 ORDER BY objet, tier DESC, id DESC`,
    [userId, type]
  );
  return rows;
}

// Objets portés par les singes du joueur, tous types confondus : { espece: [effet, ...] } (pour le combat).
// Un objet retiré du catalogue est ignoré.
export async function objetsDesSinges(userId, db = pool) {
  const { rows } = await db.query(
    "SELECT type, objet, tier, espece FROM objets_obtenus WHERE user_id = $1 AND espece IS NOT NULL ORDER BY type, slot",
    [userId]
  );
  const parSinge = {};
  for (const r of rows) {
    const c = CATALOGUES[r.type];
    const effet = c ? effetObjet(c, r.objet, r.tier) : null;
    if (effet) (parSinge[r.espece] ??= []).push(effet);
  }
  return parSinge;
}

// Catalogue envoyé au client : nom, icône et valeurs de chaque tier.
function catalogueClient(c) {
  return Object.fromEntries(Object.entries(c.objets).map(([id, o]) => [id, { nom: o.nom, icone: o.icone, tiers: o.tiers }]));
}

// Ce qu'affiche la page d'un type d'objet : prix et ressource, stock, catalogue, et exemplaires obtenus
// (valeurs de leur tier, porteur, ressource rendue s'ils sont démantelés).
export async function getObjets(userId, type) {
  const c = catalogueDe(type);
  const [obtenus, ressources] = await Promise.all([lireObjets(userId, type), lireRessources(userId)]);
  return {
    type,
    prix: c.prix,
    ressource: infoRecompense(c.ressource),
    stock: ressources[c.ressource] ?? 0,
    slots: c.slots,
    nbTiers: nbTiersObjet(c),
    catalogue: catalogueClient(c),
    obtenus: obtenus
      .filter((o) => objetExiste(c, o.objet, o.tier))
      .map((o) => ({
        ...o,
        id: Number(o.id),
        valeurs: valeursObjet(c, o.objet, o.tier),
        rembourse: remboursementDemantelement(c, o.tier),
      })),
  };
}

// Un objet tiré au hasard dans le catalogue `type` et donné au joueur (dans la transaction `db`), sans rien payer :
// toujours un nouvel exemplaire. Sert à la loterie et aux objets offerts.
export async function obtenirObjet(userId, type, db) {
  const c = catalogueDe(type);
  const { objet, tier } = tirerObjet(c);
  const { rows } = await db.query(
    "INSERT INTO objets_obtenus (user_id, type, objet, tier) VALUES ($1, $2, $3, $4) RETURNING id",
    [userId, type, objet, tier]
  );
  return { id: Number(rows[0].id), objet, tier };
}

// Tirage de la loterie, dans une transaction. La ressource est retirée en une requête (deux tirages simultanés
// ne peuvent pas dépenser le même stock). Fait avancer la quête du jour de ce type d'objet.
export async function tirerLoterieObjet(userId, type) {
  const c = catalogueDe(type);
  const tirage = await transaction(async (db) => {
    if ((await depenserRessource(userId, c.ressource, c.prix, db)) === null) {
      throw new ErreurJeu(`il faut ${c.prix} ${infoRecompense(c.ressource).nom} pour tirer`);
    }
    const resultat = await obtenirObjet(userId, type, db);
    await progresserQuete(userId, type, 1, db);
    return resultat;
  });
  return { tirage, ...(await getObjets(userId, type)) };
}

// Exemplaire `id` du joueur (verrouillé, dans la transaction `db`), ou erreur s'il n'existe pas ou n'est pas à lui.
async function verrouillerExemplaire(userId, type, id, db) {
  if (!Number.isSafeInteger(id) || id < 1) throw new ErreurJeu("objet inconnu");
  const { rows } = await db.query(
    "SELECT id, objet, tier, espece FROM objets_obtenus WHERE id = $1 AND user_id = $2 AND type = $3 FOR UPDATE",
    [id, userId, type]
  );
  if (rows.length === 0) throw new ErreurJeu("objet non obtenu");
  return rows[0];
}

// Équipe l'exemplaire `id` sur un singe possédé (`espece`, emplacement `slot`), ou le retire (`espece` null).
// L'objet qui occupait cet emplacement sur ce singe est retiré ; un exemplaire n'est porté que par un singe à la fois,
// mais rien n'empêche de porter plusieurs exemplaires du même objet (y compris sur un même singe).
export async function equiperObjet(userId, type, id, espece, slot = 1) {
  const c = catalogueDe(type);
  if (espece !== null && typeof espece !== "string") throw new ErreurJeu("singe invalide");
  if (espece !== null && !(Number.isInteger(slot) && slot >= 1 && slot <= c.slots)) throw new ErreurJeu("emplacement invalide");
  if (espece !== null) {
    const collection = await lireCollection(userId);
    if (!Object.hasOwn(collection.singes, espece)) throw new ErreurJeu("singe non possédé");
  }

  await transaction(async (db) => {
    const exemplaire = await verrouillerExemplaire(userId, type, id, db);
    if (!objetExiste(c, exemplaire.objet, exemplaire.tier)) throw new ErreurJeu("objet inconnu");
    if (espece !== null) {
      await db.query(
        "UPDATE objets_obtenus SET espece = NULL, slot = NULL WHERE user_id = $1 AND type = $2 AND espece = $3 AND slot = $4 AND id <> $5",
        [userId, type, espece, slot, id]
      );
    }
    await db.query("UPDATE objets_obtenus SET espece = $2, slot = $3 WHERE id = $1", [id, espece, espece === null ? null : slot]);
  });

  return getObjets(userId, type);
}

// Démantèle l'exemplaire `id` (non équipé), dans une transaction : il disparaît et rend de la ressource
// selon son tier. Renvoie ce qu'il a rapporté et l'état à jour de la page.
export async function demantelerObjet(userId, type, id) {
  const c = catalogueDe(type);
  const resultat = await transaction(async (db) => {
    const exemplaire = await verrouillerExemplaire(userId, type, id, db);
    if (exemplaire.espece) throw new ErreurJeu("retire d'abord cet objet du singe qui le porte");
    const rembourse = remboursementDemantelement(c, exemplaire.tier);
    await db.query("DELETE FROM objets_obtenus WHERE id = $1", [id]);
    if (rembourse > 0) await ajouterRessource(userId, c.ressource, rembourse, db);
    return { objet: exemplaire.objet, tier: exemplaire.tier, rembourse };
  });
  return { demantelement: resultat, ...(await getObjets(userId, type)) };
}
