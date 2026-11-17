// Objets portés par les singes (armes, équipements) : loterie payée en ressource de donjon, un exemplaire par tirage
// (empilables), démantèlement au choix du joueur (doublon pour un autre exemplaire, sinon ressource rendue),
// équipement d'un exemplaire sur un singe possédé. Un seul code pour tous les types.
import { pool, transaction } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";
import {
  CATALOGUES, doublonsRequis, effetObjet, nbTiersObjet, niveauMaxObjet, objetExiste, resultatDemantelement, tirerObjet, valeursObjet,
} from "../game/objets.js";
import { infoRecompense } from "../game/ressources.js";
import { lireCollection } from "./collection-service.js";
import { progresserQuete } from "./quetes-service.js";
import { ajouterRessource, depenserRessource, lireRessources } from "./ressources-joueur-service.js";

function catalogueDe(type) {
  if (!Object.hasOwn(CATALOGUES, type)) throw new ErreurJeu("type d'objet inconnu");
  return CATALOGUES[type];
}

async function lireObjets(userId, type, db = pool) {
  const { rows } = await db.query(
    `SELECT id, objet, tier, niveau, doublons, espece, slot FROM objets_obtenus
     WHERE user_id = $1 AND type = $2 ORDER BY objet, tier, niveau DESC, doublons DESC, id`,
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

// Ce qu'affiche la page d'un type d'objet : prix et ressource, stock, catalogue, règle des niveaux, exemplaires obtenus
// (avec leurs valeurs à leur niveau, les doublons requis pour le suivant et ce que rapporterait leur démantèlement).
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
      .map((o, _, tous) => {
        const d = resultatDemantelement(c, o, tous);
        return {
          ...o,
          id: Number(o.id),
          valeurs: valeursObjet(c, o.objet, o.tier, o.niveau),
          doublonsRequis: doublonsRequis(c, o.niveau),
          // Ce que donnerait son démantèlement : un doublon pour l'exemplaire `vers`, sinon `rembourse` de la ressource
          demantelement: d.cible ? { vers: Number(d.cible.id), niveauVers: d.cible.niveau } : { rembourse: d.rembourse },
        };
      }),
  };
}

// Un objet tiré au hasard dans le catalogue `type` et donné au joueur (dans la transaction `db`), sans rien payer :
// toujours un nouvel exemplaire, au niveau 1. Sert à la loterie et aux objets offerts.
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
    "SELECT id, objet, tier, niveau, doublons, espece FROM objets_obtenus WHERE id = $1 AND user_id = $2 AND type = $3 FOR UPDATE",
    [id, userId, type]
  );
  if (rows.length === 0) throw new ErreurJeu("objet non obtenu");
  return rows[0];
}

// Équipe l'exemplaire `id` sur un singe possédé (`espece`, emplacement `slot`), ou le retire (`espece` null).
// L'objet qui occupait cet emplacement sur ce singe est retiré ; un exemplaire n'est porté que par un singe à la fois.
// Avec "uneSorteParSinge", un singe ne peut pas porter deux objets de la même sorte (dans deux emplacements).
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
    if (espece !== null && c.uneSorteParSinge) {
      const { rows: memeSorte } = await db.query(
        `SELECT 1 FROM objets_obtenus
         WHERE user_id = $1 AND type = $2 AND espece = $3 AND objet = $4 AND id <> $5 AND slot <> $6`,
        [userId, type, espece, exemplaire.objet, id, slot]
      );
      if (memeSorte.length > 0) throw new ErreurJeu(`ce singe porte déjà : ${c.objets[exemplaire.objet].nom}`);
    }
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

// Démantèle l'exemplaire `id` (non équipé), dans une transaction : il donne un doublon à un autre exemplaire
// du même objet et du même tier (niveau suivant dès que le compte est atteint), sinon il rend de la ressource.
// Tous les exemplaires du même objet et du même tier sont verrouillés dans l'ordre de leur id (toujours le même ordre :
// deux démantèlements simultanés s'attendent au lieu de s'interbloquer), puis l'exemplaire est revérifié.
// Renvoie ce qu'il a rapporté et l'état à jour de la page.
export async function demantelerObjet(userId, type, id) {
  const c = catalogueDe(type);
  if (!Number.isSafeInteger(id) || id < 1) throw new ErreurJeu("objet inconnu");
  const resultat = await transaction(async (db) => {
    const { rows: trouve } = await db.query(
      "SELECT objet, tier FROM objets_obtenus WHERE id = $1 AND user_id = $2 AND type = $3",
      [id, userId, type]
    );
    if (trouve.length === 0) throw new ErreurJeu("objet non obtenu");
    const { rows: memes } = await db.query(
      `SELECT id, objet, tier, niveau, doublons, espece FROM objets_obtenus
       WHERE user_id = $1 AND type = $2 AND objet = $3 AND tier = $4 ORDER BY id FOR UPDATE`,
      [userId, type, trouve[0].objet, trouve[0].tier]
    );
    // Démantelé entre-temps par une autre requête : plus là
    const source = memes.find((e) => Number(e.id) === id);
    if (!source) throw new ErreurJeu("objet non obtenu");
    if (source.espece) throw new ErreurJeu("retire d'abord cet objet du singe qui le porte");
    const r = resultatDemantelement(c, source, memes);
    await db.query("DELETE FROM objets_obtenus WHERE id = $1", [id]);
    if (r.cible) {
      await db.query("UPDATE objets_obtenus SET niveau = $2, doublons = $3 WHERE id = $1", [r.cible.id, r.niveau, r.doublons]);
      return { objet: source.objet, tier: source.tier, vers: Number(r.cible.id), niveau: r.niveau, monte: r.monte, rembourse: 0 };
    }
    if (r.rembourse > 0) await ajouterRessource(userId, c.ressource, r.rembourse, db);
    return { objet: source.objet, tier: source.tier, vers: null, rembourse: r.rembourse };
  });
  return { demantelement: resultat, ...(await getObjets(userId, type)) };
}
