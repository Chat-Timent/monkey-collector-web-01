import fs from "node:fs";

// Arbre de compétences du starter : un seul graphe non orienté (champ `liens`, déclaré d'un seul
// côté ou des deux), avec un centre et trois bras. Coordonnées x, y pour l'affichage.
export const ARBRE = JSON.parse(fs.readFileSync(new URL("../data/skills.json", import.meta.url), "utf8"));

// Nœud de départ du graphe
export const ORIGINE = "centre";
export const BRANCHES = ["centre", "farm", "pvp", "strat"];

// Coût d'un nœud selon sa profondeur (1 = premier nœud payant d'un bras), avant multiplicateur.
// Le coût écrit dans skills.json doit valoir arrondi(COURBE_COUTS[profondeur - 1] × multiplicateur) :
// vérifié par les tests et affiché par scripts/couts-arbre.mjs.
export const COURBE_COUTS = [1, 1, 2, 3, 5, 7, 9, 12];

// Valeur neutre de chaque effet : sert de base à l'agrégation
// et permet de détecter les effets inconnus.
const DEFAUT = {
  xp_pct: 0,
  coins_pct: 0,
  valeur_or_pct: 0,
  tirages_max: 0,
  recharge_sec: 0,
  copie_bonus: 0,
  atk_pct: 0,
  hp_pct: 0,
  def_pct: 0,
  prec_flat: 0,
  esq_flat: 0,
  crit_flat: 0,
  critdmg_flat: 0,
  slots_bonus: 0,
  tickets_donjon: 0,
  rarete_pct: 0,
  elo_combats_bonus: 0,
  aventure_pct: 0,
  resonance_pct: 0,
  perk_pct: 0,
  lottery_coins: false,
  etincelle: false,
};

// Plafonds appliqués après agrégation
const CAPS = {
  slots_bonus: 3,
  crit_flat: 15,
};

// Voisins de chaque nœud (liens rendus réciproques), calculés une fois par arbre.
const cacheVoisins = new WeakMap();
export function voisins(arbre = ARBRE) {
  let v = cacheVoisins.get(arbre);
  if (v) return v;
  v = Object.fromEntries(Object.keys(arbre).map((id) => [id, new Set()]));
  for (const [id, noeud] of Object.entries(arbre)) {
    for (const autre of noeud.liens ?? []) {
      if (!v[autre]) continue; // signalé par validerArbre
      v[id].add(autre);
      v[autre].add(id);
    }
  }
  cacheVoisins.set(arbre, v);
  return v;
}

export function estGratuit(noeud) {
  return noeud.cout === 0;
}

// Profondeur de chaque nœud : nombre minimal de nœuds payants sur un chemin depuis l'origine,
// le nœud compris (0 pour l'origine et les nœuds gratuits qui la touchent). Parcours 0-1.
export function profondeurs(arbre = ARBRE) {
  const v = voisins(arbre);
  const prof = { [ORIGINE]: 0 };
  const file = [ORIGINE];
  while (file.length > 0) {
    const id = file.shift();
    for (const autre of v[id]) {
      const p = prof[id] + (estGratuit(arbre[autre]) ? 0 : 1);
      if (prof[autre] === undefined || p < prof[autre]) {
        prof[autre] = p;
        if (estGratuit(arbre[autre])) file.unshift(autre);
        else file.push(autre);
      }
    }
  }
  return prof;
}

// Coût attendu d'un nœud d'après sa profondeur et son multiplicateur (null au-delà de la courbe).
export function coutAttendu(id, arbre = ARBRE, prof = profondeurs(arbre)) {
  const noeud = arbre[id];
  if (estGratuit(noeud)) return 0;
  const base = COURBE_COUTS[prof[id] - 1];
  if (base === undefined) return null;
  return Math.round(base * (noeud.multiplicateur ?? 1));
}

// Vérification au chargement : une erreur dans le JSON (effet mal écrit, lien inexistant…)
// plante tout de suite, au lieu de passer silencieusement en jeu.
export function validerArbre(arbre) {
  if (!arbre[ORIGINE]) throw new Error(`nœud d'origine "${ORIGINE}" absent`);
  for (const [id, noeud] of Object.entries(arbre)) {
    if (!BRANCHES.includes(noeud.branche)) throw new Error(`branche inconnue "${noeud.branche}" dans le nœud ${id}`);
    if (!Number.isInteger(noeud.cout) || noeud.cout < 0) throw new Error(`coût invalide dans le nœud ${id}`);
    if (!Number.isFinite(noeud.x) || !Number.isFinite(noeud.y)) throw new Error(`coordonnées invalides dans le nœud ${id}`);
    if (noeud.multiplicateur !== undefined && !(noeud.multiplicateur >= 1)) throw new Error(`multiplicateur invalide dans le nœud ${id}`);
    if (!Array.isArray(noeud.liens)) throw new Error(`liens manquants dans le nœud ${id}`);
    for (const autre of noeud.liens) {
      if (!arbre[autre]) throw new Error(`lien inconnu "${autre}" dans le nœud ${id}`);
      if (autre === id) throw new Error(`le nœud ${id} est relié à lui-même`);
    }
    for (const cle of Object.keys(noeud.effet)) {
      if (!(cle in DEFAUT)) throw new Error(`effet inconnu "${cle}" dans le nœud ${id}`);
    }
    if (estGratuit(noeud) && Object.keys(noeud.effet).length > 0) {
      throw new Error(`le nœud ${id} a un effet : il ne peut pas être gratuit`);
    }
  }
  const prof = profondeurs(arbre);
  for (const id of Object.keys(arbre)) {
    if (prof[id] === undefined) throw new Error(`le nœud ${id} n'est relié à aucun chemin depuis "${ORIGINE}"`);
  }
}

validerArbre(ARBRE);

// Nœuds pris d'un joueur : ceux enregistrés en base (encore présents dans le JSON)
// plus les nœuds gratuits, pris d'office.
export function noeudsPris(prisListe, arbre = ARBRE) {
  const pris = new Set(prisListe.filter((id) => arbre[id]));
  for (const [id, noeud] of Object.entries(arbre)) if (estGratuit(noeud)) pris.add(id);
  return pris;
}

// Agrège les effets des nœuds pris en un seul contexte.
// - nombres : sommés (les % s'additionnent)
// - booléens : OU logique
// - plafonds appliqués à la fin
export function agregerEffets(noeudsPris, arbre = ARBRE) {
  const ctx = { ...DEFAUT };

  for (const id of noeudsPris) {
    const noeud = arbre[id];
    if (!noeud) continue; // nœud retiré du JSON : ignoré, pas de crash

    for (const [cle, valeur] of Object.entries(noeud.effet)) {
      if (typeof DEFAUT[cle] === "boolean") {
        ctx[cle] = ctx[cle] || valeur;
      } else {
        ctx[cle] += valeur;
      }
    }
  }

  for (const [cle, max] of Object.entries(CAPS)) {
    ctx[cle] = Math.min(ctx[cle], max);
  }

  return ctx;
}

// Points dépensés : somme des coûts des nœuds pris (un nœud retiré du JSON est remboursé)
export function pointsDepenses(pris, arbre = ARBRE) {
  let total = 0;
  for (const id of pris) total += arbre[id]?.cout ?? 0;
  return total;
}

// Points disponibles : 1 point par niveau au-delà du premier, moins les points dépensés
export function pointsDisponibles(niveau, depenses) {
  return Math.max(0, niveau - 1 - depenses);
}

// Un nœud est prenable s'il existe, n'est pas déjà pris, est relié à au moins un nœud pris
// (les nœuds gratuits comptent comme pris) et si le joueur a assez de points.
// `pris` doit contenir les nœuds gratuits (voir noeudsPris).
export function peutPrendre(id, pris, points, arbre = ARBRE) {
  const noeud = arbre[id];
  if (!noeud) return { ok: false, raison: "nœud inconnu" };
  if (pris.has(id)) return { ok: false, raison: "déjà pris" };
  if (![...voisins(arbre)[id]].some((v) => pris.has(v))) return { ok: false, raison: "aucun nœud relié" };
  if (points < noeud.cout) return { ok: false, raison: "points insuffisants" };
  return { ok: true };
}

// Vue complète de l'arbre d'un joueur, pour l'affichage :
// chaque nœud avec sa position, ses liens, son état (pris / disponible / verrouillé),
// les points et les effets cumulés.
export function etatArbre(niveau, prisListe, arbre = ARBRE) {
  const pris = noeudsPris(prisListe, arbre);
  const points = pointsDisponibles(niveau, pointsDepenses(pris, arbre));
  const v = voisins(arbre);
  const noeuds = Object.entries(arbre).map(([id, n]) => {
    const verdict = peutPrendre(id, pris, points, arbre);
    return {
      id, branche: n.branche, nom: n.nom, cout: n.cout, x: n.x, y: n.y,
      liens: [...v[id]], effet: n.effet,
      etat: pris.has(id) ? "pris" : verdict.ok ? "disponible" : "verrouille",
      raison: pris.has(id) || verdict.ok ? null : verdict.raison,
    };
  });
  return { points, noeuds, effets: agregerEffets(pris, arbre) };
}
