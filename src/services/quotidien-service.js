// Série de connexion (cadeau du footer) et quêtes quotidiennes (parchemin) : état affiché et récupération
// des récompenses. Règles dans src/data/quotidien.json, logique pure dans src/game/quotidien.js ;
// la progression des quêtes est dans quetes-service.js.
import { pool, transaction } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";
import { estNotable, getEspece, getImageUrl, tirer } from "../game/monkeys.js";
import { CATALOGUES } from "../game/objets.js";
import { QUETE_BONUS, QUOTIDIEN, etatQuetes, etatSerie, pastilles, quetesDuJour } from "../game/quotidien.js";
import { RESSOURCES_JOUEUR, jourParis } from "../game/ressources.js";
import { getPointsArbre } from "./arbre-service.js";
import { ajouterCopie } from "./collection-service.js";
import { enregistrerTirageNotable } from "./loterie-service.js";
import { obtenirObjet } from "./objets-service.js";
import { ajouterRessource, lireRessources } from "./ressources-joueur-service.js";
import { gagnerRecompense, getStarter } from "./starter-service.js";
import { ajouterTirages, getQuota } from "./tirage-service.js";

async function lireSerie(userId, db = pool) {
  const { rows } = await db.query(
    "SELECT jour, dernier_jour::text AS dernier_jour FROM serie_connexion WHERE user_id = $1",
    [userId]
  );
  return rows[0] ?? null;
}

async function lireQuetes(userId, jour, db = pool) {
  const { rows } = await db.query(
    "SELECT quete, progres, reclamee FROM quetes_jour WHERE user_id = $1 AND jour = $2",
    [userId, jour]
  );
  return rows;
}

// Ce qu'affichent le cadeau et le parchemin du footer : la série, les quêtes du jour et les pastilles.
export async function getQuotidien(userId) {
  const jour = jourParis();
  const [ligne, lignes] = await Promise.all([lireSerie(userId), lireQuetes(userId, jour)]);
  const serie = etatSerie(ligne, jour);
  const quetes = etatQuetes(jour, lignes);
  return { serie, quetes, pastilles: pastilles(serie, quetes) };
}

// Donne une récompense (dans la transaction `db`). Renvoie ce qui a été tiré au hasard, pour l'afficher :
// le singe offert et les objets offerts ({ texte, image | icone, rarete? }). Les quantités se voient dans la barre.
// Ordre des verrous : starter puis stock de tirages, comme un tirage (pas d'interblocage).
async function donnerRecompense(userId, r, db) {
  const obtenus = [];
  if (r.xp || r.coins) {
    const starter = await getStarter(userId, db, { verrouiller: true });
    if (starter) await gagnerRecompense(userId, { xp: r.xp ?? 0, coins: r.coins ?? 0 }, starter, db);
  }
  if (r.tirages) await ajouterTirages(userId, r.tirages, db);
  for (const id of Object.keys(RESSOURCES_JOUEUR)) {
    if (r[id]) await ajouterRessource(userId, id, r[id], db);
  }
  if (r.singe) {
    const id = tirer(null, { rareteMin: r.singe });
    const espece = getEspece(id);
    if (!espece) throw new Error(`singe offert impossible : aucune espèce ${r.singe} ou mieux`);
    await ajouterCopie(userId, id, db);
    // Comme un tirage : un légendaire ou un mythique part dans le flux public de la page Tirage
    if (estNotable(espece.rarete)) await enregistrerTirageNotable(userId, id, espece.rarete, db);
    obtenus.push({ texte: espece.nom, image: getImageUrl(id), rarete: espece.rarete });
  }
  for (let i = 0; i < (r.objets ?? 0); i++) {
    const type = Math.random() < 0.5 ? "arme" : "equipement";
    const o = await obtenirObjet(userId, type, db);
    const def = CATALOGUES[type].objets[o.objet];
    const suite = !o.doublon ? "" : o.monte ? ` · niv. ${o.niveau}` : " · doublon";
    obtenus.push({ texte: `${def.nom} T${o.tier}${suite}`, icone: def.icone });
  }
  return obtenus;
}

// Réponse d'une récupération : ce qui a été tiré, l'état du quotidien, et de quoi mettre la barre du haut à jour.
async function apresRecompense(userId, obtenus) {
  const [quotidien, starter, quota, ressources] = await Promise.all([
    getQuotidien(userId), getStarter(userId), getQuota(userId), lireRessources(userId),
  ]);
  const pointsArbre = starter ? await getPointsArbre(userId, starter.niveau) : 0;
  return { obtenus, ...quotidien, starter, quota, ressources, pointsArbre };
}

// Cadeau du jour de la série. La ligne du starter est verrouillée en premier, puis celle de la série :
// deux clics simultanés ne peuvent pas récupérer deux fois.
export async function reclamerSerie(userId) {
  const obtenus = await transaction(async (db) => {
    await getStarter(userId, db, { verrouiller: true });
    await db.query("INSERT INTO serie_connexion (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
    const { rows } = await db.query(
      "SELECT jour, dernier_jour::text AS dernier_jour FROM serie_connexion WHERE user_id = $1 FOR UPDATE",
      [userId]
    );
    const aujourdhui = jourParis();
    const etat = etatSerie(rows[0], aujourdhui);
    if (etat.recuperee) throw new ErreurJeu("cadeau déjà récupéré aujourd'hui, reviens demain");

    const obtenus = await donnerRecompense(userId, QUOTIDIEN.serie[etat.courant - 1], db);
    await db.query(
      "UPDATE serie_connexion SET jour = $2, dernier_jour = $3 WHERE user_id = $1",
      [userId, etat.courant, aujourdhui]
    );
    return obtenus;
  });
  return apresRecompense(userId, obtenus);
}

// Récompense de la quête du jour de rang `rang` (1 à 3), une fois son objectif atteint.
// Starter verrouillé en premier, comme un tirage (qui verrouille ensuite la ligne de sa quête).
export async function reclamerQuete(userId, rang) {
  const obtenus = await transaction(async (db) => {
    await getStarter(userId, db, { verrouiller: true });
    const jour = jourParis();
    const ids = quetesDuJour(jour);
    if (!Number.isInteger(rang) || rang < 1 || rang > ids.length) throw new ErreurJeu("quête inconnue");
    const id = ids[rang - 1];

    const { rows } = await db.query(
      "SELECT progres, reclamee FROM quetes_jour WHERE user_id = $1 AND jour = $2 AND quete = $3 FOR UPDATE",
      [userId, jour, id]
    );
    if (!rows[0] || rows[0].progres < QUOTIDIEN.quetes.catalogue[id].objectif) throw new ErreurJeu("quête pas encore terminée");
    if (rows[0].reclamee) throw new ErreurJeu("récompense déjà récupérée");

    const obtenus = await donnerRecompense(userId, QUOTIDIEN.quetes.recompenses[rang - 1], db);
    await db.query(
      "UPDATE quetes_jour SET reclamee = true WHERE user_id = $1 AND jour = $2 AND quete = $3",
      [userId, jour, id]
    );
    return obtenus;
  });
  return apresRecompense(userId, obtenus);
}

// Bonus du jour, une fois toutes les quêtes du jour terminées.
export async function reclamerBonus(userId) {
  const obtenus = await transaction(async (db) => {
    await getStarter(userId, db, { verrouiller: true });
    const jour = jourParis();
    await db.query(
      "INSERT INTO quetes_jour (user_id, jour, quete) VALUES ($1, $2, $3) ON CONFLICT (user_id, jour, quete) DO NOTHING",
      [userId, jour, QUETE_BONUS]
    );
    const { rows } = await db.query(
      "SELECT reclamee FROM quetes_jour WHERE user_id = $1 AND jour = $2 AND quete = $3 FOR UPDATE",
      [userId, jour, QUETE_BONUS]
    );
    if (rows[0].reclamee) throw new ErreurJeu("bonus déjà récupéré aujourd'hui");
    if (!etatQuetes(jour, await lireQuetes(userId, jour, db)).bonus.disponible) {
      throw new ErreurJeu("termine d'abord les quêtes du jour");
    }

    const obtenus = await donnerRecompense(userId, QUOTIDIEN.quetes.bonus, db);
    await db.query(
      "UPDATE quetes_jour SET reclamee = true WHERE user_id = $1 AND jour = $2 AND quete = $3",
      [userId, jour, QUETE_BONUS]
    );
    return obtenus;
  });
  return apresRecompense(userId, obtenus);
}
