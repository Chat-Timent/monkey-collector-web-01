import fs from "node:fs";

export const ARBRE = JSON.parse(fs.readFileSync(new URL("../data/skills.json", import.meta.url), "utf8"));

// Valeur neutre de chaque effet : sert de base à l'agrégation
// et permet de détecter les effets inconnus.
const DEFAUT = {
  xp_pct: 0,
  coins_pct: 0,
  valeur_or_pct: 0,
  reset_bonus: 0,
  copie_bonus: 0,
  atk_pct: 0,
  prec_flat: 0,
  esq_flat: 0,
  crit_flat: 0,
  critdmg_flat: 0,
  slots_bonus: 0,
  lottery_coins: false,
};

// Plafonds appliqués après agrégation
const CAPS = {
  slots_bonus: 3,
};

export const BRANCHES = ["pvp", "farm"];
const MODES = ["tous", "au_moins_un"];

// Vérification au chargement : une erreur dans le JSON (effet mal écrit, prérequis
// inexistant…) plante tout de suite, au lieu de passer silencieusement en jeu.
for (const [id, noeud] of Object.entries(ARBRE)) {
  if (!BRANCHES.includes(noeud.branche)) throw new Error(`branche inconnue "${noeud.branche}" dans le nœud ${id}`);
  if (!MODES.includes(noeud.mode)) throw new Error(`mode inconnu "${noeud.mode}" dans le nœud ${id}`);
  if (!Number.isInteger(noeud.cout) || noeud.cout < 1) throw new Error(`coût invalide dans le nœud ${id}`);
  for (const p of noeud.prerequis) {
    if (!ARBRE[p]) throw new Error(`prérequis inconnu "${p}" dans le nœud ${id}`);
  }
  for (const cle of Object.keys(noeud.effet)) {
    if (!(cle in DEFAUT)) throw new Error(`effet inconnu "${cle}" dans le nœud ${id}`);
  }
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

// Un nœud est prenable si : il existe, n'est pas déjà pris, a assez de points,
// et ses prérequis sont satisfaits selon son mode.
export function peutPrendre(id, pris, points, arbre = ARBRE) {
  const noeud = arbre[id];
  if (!noeud) return { ok: false, raison: "nœud inconnu" };
  if (pris.has(id)) return { ok: false, raison: "déjà pris" };
  if (points < noeud.cout) return { ok: false, raison: "points insuffisants" };

  if (noeud.prerequis.length > 0) {
    const satisfait = noeud.mode === "au_moins_un"
      ? noeud.prerequis.some((p) => pris.has(p))
      : noeud.prerequis.every((p) => pris.has(p));
    if (!satisfait) return { ok: false, raison: "prérequis manquants" };
  }

  return { ok: true };
}

// Vue complète de l'arbre d'un joueur, pour l'affichage :
// chaque nœud avec son état (pris / disponible / verrouillé), les points et les effets cumulés.
export function etatArbre(niveau, prisListe, arbre = ARBRE) {
  const pris = new Set(prisListe.filter((id) => arbre[id]));
  const points = pointsDisponibles(niveau, pointsDepenses(pris, arbre));
  const noeuds = Object.entries(arbre).map(([id, n]) => {
    const verdict = peutPrendre(id, pris, points, arbre);
    return {
      id, branche: n.branche, nom: n.nom, cout: n.cout,
      prerequis: n.prerequis, mode: n.mode, effet: n.effet,
      etat: pris.has(id) ? "pris" : verdict.ok ? "disponible" : "verrouille",
      raison: pris.has(id) || verdict.ok ? null : verdict.raison,
    };
  });
  return { points, noeuds, effets: agregerEffets(pris, arbre) };
}
