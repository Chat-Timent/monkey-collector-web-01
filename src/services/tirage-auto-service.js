import { pool, transaction } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";
import { getEspece } from "../game/monkeys.js";
import { instantsDus, passeFiltre, reglageAutoValide } from "../game/tirage-auto.js";
import { getStarter } from "./starter-service.js";
import { effectuerTirage, getQuota } from "./tirage-service.js";

// Auto-tirage : le joueur choisit un rythme et une rareté visée ; le serveur fait les tirages dus
// à chaque passage (page Tirage ouverte toutes les secondes, /profil sur les autres pages),
// comme la recharge des tirages. Il s'arrête au premier singe de la rareté visée ou mieux,
// quand le stock est vide, ou sur demande.

// Joueurs dont les tirages auto sont en cours de traitement : un seul passage à la fois par joueur
// (le serveur tourne en un seul processus). Un passage simultané renvoie l'état sans tirer.
const enCours = new Set();

function etatPublic(ligne) {
  if (!ligne) return { actif: false, rythme: 1, rareteMin: "rare", nbFaits: 0, arret: null };
  return {
    actif: ligne.actif,
    rythme: ligne.rythme,
    rareteMin: ligne.rarete_min,
    nbFaits: ligne.nb_faits,
    arret: ligne.actif || !ligne.raison_arret ? null : {
      raison: ligne.raison_arret,
      espece: ligne.espece_arret && getEspece(ligne.espece_arret) ? ligne.espece_arret : null,
      date: ligne.arret_at,
    },
  };
}

async function lireLigne(userId, db = pool) {
  const { rows } = await db.query("SELECT * FROM tirage_auto WHERE user_id = $1", [userId]);
  return rows[0] ?? null;
}

export async function lancerAuto(userId, rythme, rarete) {
  if (!reglageAutoValide(rythme, rarete)) throw new ErreurJeu("réglage d'auto-tirage invalide");
  if (!(await getStarter(userId))) throw new ErreurJeu("aucun starter, choisis-en un d'abord");
  const quota = await getQuota(userId);
  if (quota.restants <= 0) throw new ErreurJeu("plus de tirages disponibles, attends la recharge", 429, { quota });
  await pool.query(
    `INSERT INTO tirage_auto (user_id, actif, rythme, rarete_min, dernier_passage, nb_faits)
     VALUES ($1, true, $2, $3, now(), 0)
     ON CONFLICT (user_id) DO UPDATE SET actif = true, rythme = $2, rarete_min = $3, dernier_passage = now(),
       nb_faits = 0, raison_arret = NULL, espece_arret = NULL, arret_at = NULL`,
    [userId, rythme, rarete]
  );
  return etatPublic(await lireLigne(userId));
}

export async function arreterAuto(userId) {
  await pool.query(
    `UPDATE tirage_auto SET actif = false, raison_arret = 'manuel', espece_arret = NULL, arret_at = now()
     WHERE user_id = $1 AND actif`,
    [userId]
  );
  return etatPublic(await lireLigne(userId));
}

// Réserve les tirages dus : `dernier_passage` avance d'autant, dans une transaction courte.
async function reserverTirages(userId) {
  return transaction(async (db) => {
    const { rows } = await db.query("SELECT * FROM tirage_auto WHERE user_id = $1 FOR UPDATE", [userId]);
    const ligne = rows[0];
    if (!ligne?.actif) return { ligne, instants: [] };
    const instants = instantsDus(new Date(ligne.dernier_passage).getTime(), Date.now(), ligne.rythme);
    if (instants.length > 0) {
      await db.query("UPDATE tirage_auto SET dernier_passage = $2 WHERE user_id = $1",
        [userId, new Date(instants.at(-1))]);
    }
    return { ligne, instants };
  });
}

// Fait les tirages auto dus depuis le dernier passage. Renvoie l'état et les tirages faits
// (réponses de effectuerTirage, dans l'ordre), vides si l'auto-tirage ne tourne pas.
export async function avancerAuto(userId) {
  if (enCours.has(userId)) return { auto: etatPublic(await lireLigne(userId)), tirages: [] };
  enCours.add(userId);
  try {
    const { ligne, instants } = await reserverTirages(userId);
    if (instants.length === 0) return { auto: etatPublic(ligne), tirages: [] };

    const tirages = [];
    let arret = null;
    for (const instant of instants) {
      try {
        const tirage = await effectuerTirage(userId, { maintenant: instant });
        tirages.push(tirage);
        if (passeFiltre(tirage.espece.rarete, ligne.rarete_min)) {
          arret = { raison: "filtre", espece: tirage.id, instant };
          break;
        }
      } catch (err) {
        // Stock vide à l'heure de ce tirage : l'auto-tirage s'arrête (choix du joueur : pas d'attente)
        if (!(err instanceof ErreurJeu && err.statut === 429)) throw err;
        arret = { raison: "stock", espece: null, instant };
        break;
      }
    }

    const { rows } = await pool.query(
      `UPDATE tirage_auto SET nb_faits = nb_faits + $2,
         actif = CASE WHEN $3::text IS NULL THEN actif ELSE false END,
         raison_arret = COALESCE($3, raison_arret),
         espece_arret = CASE WHEN $3::text IS NULL THEN espece_arret ELSE $4 END,
         arret_at = CASE WHEN $3::text IS NULL THEN arret_at ELSE $5 END
       WHERE user_id = $1 RETURNING *`,
      [userId, tirages.length, arret?.raison ?? null, arret?.espece ?? null, arret ? new Date(arret.instant) : null]
    );
    return { auto: etatPublic(rows[0]), tirages };
  } finally {
    enCours.delete(userId);
  }
}

// Passage de la page Tirage : tirages dus, puis état complet pour la page (stock à jour).
export async function passageAuto(userId) {
  const { auto, tirages } = await avancerAuto(userId);
  const dernier = tirages.at(-1);
  return {
    auto,
    // Seuls les derniers comptent pour l'historique et la fiche ; inutile de tout renvoyer
    tirages: tirages.slice(-24).map(({ id, espece, image, amount, niveau, stats, gains }) =>
      ({ id, espece, image, amount, niveau, stats, gains })),
    quota: await getQuota(userId),
    starter: dernier?.starter ?? null,
    pointsArbre: dernier?.pointsArbre ?? null,
  };
}
