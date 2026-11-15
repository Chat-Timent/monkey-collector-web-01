import { pool, transaction } from "../config/database.js";
import { ETINCELLE_SEUIL, LOTERIE_CHANCE_BASE, NB_SLOTS_BASE } from "../constants/game.js";
import { ErreurJeu } from "../erreurs.js";
import { agregerEffets, ARBRE, etatArbre, noeudsPris, peutPrendre, pointsDepenses, pointsDisponibles } from "../game/starter-arbre.js";
import { RESSOURCES, jourParis, ticketsApresCadeau } from "../game/ressources.js";
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
  return { niveau: starter.niveau, chanceLoterie: LOTERIE_CHANCE_BASE, seuilEtincelle: ETINCELLE_SEUIL, ...etatArbre(starter.niveau, pris) };
}

export async function getPointsArbre(userId, niveau) {
  return pointsDisponibles(niveau, pointsDepenses(await lireNoeudsPris(userId)));
}

// Clé de donjon : `nombre` tickets offerts tout de suite dans chaque donjon de ressources
// (dans la transaction `db`). `effetsAvant` : effets du joueur avant le déblocage.
async function offrirTicketsDonjons(userId, nombre, effetsAvant, db) {
  const aujourdhui = jourParis();
  for (const donjon of Object.keys(RESSOURCES.donjons)) {
    const { rows } = await db.query(
      "SELECT tickets, jour::text AS jour FROM donjons_progression WHERE user_id = $1 AND donjon = $2 FOR UPDATE",
      [userId, donjon]
    );
    const tickets = ticketsApresCadeau(rows[0] ?? null, aujourdhui, nombre, effetsAvant);
    await db.query(
      `INSERT INTO donjons_progression (user_id, donjon, tickets, jour) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, donjon) DO UPDATE SET tickets = EXCLUDED.tickets, jour = EXCLUDED.jour`,
      [userId, donjon, tickets, aujourdhui]
    );
  }
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

    const ticketsBonus = ARBRE[noeud].effet.tickets_donjon ?? 0;
    if (ticketsBonus > 0) await offrirTicketsDonjons(userId, ticketsBonus, agregerEffets(pris), db);
  });

  return getArbre(userId);
}
