// Résonances d'équipe : fonctions pures, sans base de données. Données dans src/data/resonances.json.
// Chaque singe appartient à une catégorie. Plus l'équipe compte de singes d'une même catégorie
// (tous les emplacements comptent, y compris ceux hors de la rotation active), plus ces singes
// reçoivent un bonus de PV, d'ATK et de DEF : un palier à 2, un à 4 et un à 6 singes.
import fs from "node:fs";

export const RESONANCES = JSON.parse(fs.readFileSync(new URL("../data/resonances.json", import.meta.url), "utf8"));

// Index (0 = aucun) du plus haut palier atteint avec `nb` singes.
export function indexPalier(nb, donnees = RESONANCES) {
  let index = 0;
  donnees.paliers.forEach((seuil, i) => { if (nb >= seuil) index = i + 1; });
  return index;
}

// Résonances actives d'une équipe (tableau d'emplacements, null = vide) :
// [{ categorie, nb, palier, bonus: { hp, atk, def } }], une par catégorie ayant atteint un palier.
export function resonancesActives(equipe, donnees = RESONANCES) {
  const compte = {};
  for (const s of equipe) if (s?.categorie) compte[s.categorie] = (compte[s.categorie] ?? 0) + 1;

  const actives = [];
  for (const [categorie, nb] of Object.entries(compte)) {
    const index = indexPalier(nb, donnees);
    const bonus = donnees.categories[categorie]?.bonus[index - 1];
    if (index > 0 && bonus) actives.push({ categorie, nb, palier: donnees.paliers[index - 1], bonus });
  }
  return actives;
}

// Équipe avec les bonus appliqués aux singes de chaque catégorie en résonance.
// Renvoie { equipe, resonances } ; l'équipe d'origine n'est pas modifiée.
export function appliquerResonances(equipe, donnees = RESONANCES) {
  const resonances = resonancesActives(equipe, donnees);
  const parCategorie = Object.fromEntries(resonances.map((r) => [r.categorie, r.bonus]));
  const resultat = equipe.map((s) => {
    const b = s && parCategorie[s.categorie];
    if (!b) return s;
    const plus = (valeur, pct) => Math.round(valeur * (1 + pct / 100));
    return { ...s, hp: plus(s.hp, b.hp), atk: plus(s.atk, b.atk), def: plus(s.def, b.def) };
  });
  return { equipe: resultat, resonances };
}
