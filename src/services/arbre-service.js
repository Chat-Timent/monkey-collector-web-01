import { pool, transaction } from "../config/database.js";
import { LOTERIE_CHANCE_BASE, NB_SLOTS_BASE } from "../constants/game.js";
import { ErreurJeu } from "../erreurs.js";
import { agregerEffets, ARBRE, etatArbre, noeudsPris, peutPrendre, pointsDepenses, pointsDisponibles } from "../game/starter-arbre.js";
import { getStarter } from "./starter-service.js";

export async function lireNoeudsPris(userId, db = pool) {
  const { rows } = await db.query("SELECT noeud FROM starter_noeuds WHERE user_id = $1", [userId]);
  return rows.map((r) => r.noeud);
}

// Effets cumulés des nœuds pris par le joueur (valeurs neutres s'il n'en a aucun).
export async function effetsDuJoueur(userId, db = pool) {
  return agregerEffets(await lireNoeudsPris(userId, db));
}

// Emplacements d'équipe : 6 de base, plus le bonus de l'arbre (rangs de renfort, d'élite…).
export function nbSlots(effets) {
  return NB_SLOTS_BASE + effets.slots_bonus;
}

export async function getArbre(userId) {
  const [starter, pris] = await Promise.all([getStarter(userId), lireNoeudsPris(userId)]);
  if (!starter) throw new ErreurJeu("aucun starter, choisis-en un d'abord");
  return { niveau: starter.niveau, chanceLoterie: LOTERIE_CHANCE_BASE, ...etatArbre(starter.niveau, pris) };
}

export async function getPointsArbre(userId, niveau) {
  return pointsDisponibles(niveau, pointsDepenses(await lireNoeudsPris(userId)));
}

// Débloque un nœud (les nœuds gratuits sont pris d'office et jamais enregistrés).
// La ligne du starter est verrouillée : deux déblocages simultanés ne peuvent pas dépenser le même point.
export async function prendreNoeud(userId, noeud) {
  if (typeof noeud !== "string" || !Object.hasOwn(ARBRE, noeud)) throw new ErreurJeu("nœud inconnu");

  await transaction(async (db) => {
    const starter = await getStarter(userId, db, { verrouiller: true });
    if (!starter) throw new ErreurJeu("aucun starter, choisis-en un d'abord");

    const pris = noeudsPris(await lireNoeudsPris(userId, db));
    const points = pointsDisponibles(starter.niveau, pointsDepenses(pris));
    const verdict = peutPrendre(noeud, pris, points);
    if (!verdict.ok) throw new ErreurJeu(`impossible de débloquer ce nœud : ${verdict.raison}`);

    await db.query("INSERT INTO starter_noeuds (user_id, noeud) VALUES ($1, $2)", [userId, noeud]);
  });

  return getArbre(userId);
}
