// Traits et résonances d'équipe : fonctions pures, sans base de données. Données dans src/data/resonances.json.
// Chaque singe porte 1 à 3 traits (champ "traits" de monkeys.json). Plus l'équipe compte de porteurs d'un même trait
// (tous les emplacements comptent, renfort et réserve compris ; un singe à 2 traits compte pour les deux),
// plus l'effet du trait est fort : un palier à 2, un à 4 et un à 6 porteurs. Plusieurs traits peuvent être actifs ensemble.
// Renforcement agit sur les stats avant le combat (appliquerResonances) ; les autres traits sont des mécaniques
// de combat que le moteur (combat-engine.js) lit dans `s.effetsTraits` de chaque porteur.
// Les ennemis (PVE) n'ont pas de traits : ils n'en déclenchent aucun.
import fs from "node:fs";
import { SINGES } from "./monkeys.js";

export const RESONANCES = JSON.parse(fs.readFileSync(new URL("../data/resonances.json", import.meta.url), "utf8"));

// Réglages attendus pour chaque trait (le moteur ne connaît que ceux-là).
export const REGLAGES_TRAITS = {
  rempart: ["reductionBase", "reductionBonus"],
  sacrifice: ["partStats"],
  euphorie: ["atkParTour", "atkPlafond"],
  chaos: ["chance", "partDegats"],
  tueurs_de_geant: ["pvMaxPct", "plafondAtkPct"],
  devouement: ["soinPct"],
  malediction: ["parTour", "plafond"],
  renforcement: ["statsPct"],
};

// Un singe porte au plus ce nombre de traits.
export const TRAITS_MAX_PAR_SINGE = 3;

// Vérifie le JSON des traits au chargement : le serveur ne démarre pas sur des données incohérentes.
export function validerResonances(donnees) {
  const { paliers, traits } = donnees ?? {};
  if (!Array.isArray(paliers) || paliers.length === 0) throw new Error("paliers de résonance manquants");
  paliers.forEach((p, i) => {
    if (!Number.isInteger(p) || p < 1 || (i > 0 && p <= paliers[i - 1])) throw new Error(`palier de résonance invalide : ${p}`);
  });
  if (!traits || typeof traits !== "object") throw new Error("traits manquants");
  for (const id of Object.keys(REGLAGES_TRAITS)) if (!traits[id]) throw new Error(`trait manquant : ${id}`);
  for (const [id, t] of Object.entries(traits)) {
    const cles = REGLAGES_TRAITS[id];
    if (!cles) throw new Error(`trait inconnu : ${id}`);
    for (const champ of ["nom", "icone", "couleur", "role"]) {
      if (typeof t[champ] !== "string" || t[champ] === "") throw new Error(`${champ} manquant dans le trait ${id}`);
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(t.couleur)) throw new Error(`couleur invalide dans le trait ${id}`);
    if (!Array.isArray(t.paliers) || t.paliers.length !== paliers.length) throw new Error(`le trait ${id} doit avoir ${paliers.length} paliers`);
    for (const valeurs of t.paliers) {
      const recues = Object.keys(valeurs ?? {}).sort();
      if (recues.join() !== [...cles].sort().join()) throw new Error(`réglages du trait ${id} : attendus ${cles.join(", ")}, reçus ${recues.join(", ")}`);
      for (const [cle, v] of Object.entries(valeurs)) {
        if (!Number.isFinite(v) || v < 0) throw new Error(`valeur invalide pour ${cle} dans le trait ${id}`);
        if (cle === "chance" && v > 100) throw new Error(`chance au-dessus de 100 % dans le trait ${id}`);
      }
    }
  }
}

// Vérifie les traits portés par les singes du catalogue : 1 à 3, connus, sans doublon.
export function validerTraitsSinges(singes, donnees = RESONANCES) {
  for (const [id, s] of Object.entries(singes)) {
    const t = s.traits;
    if (!Array.isArray(t) || t.length < 1 || t.length > TRAITS_MAX_PAR_SINGE) throw new Error(`${id} : 1 à ${TRAITS_MAX_PAR_SINGE} traits attendus`);
    for (const trait of t) if (!donnees.traits[trait]) throw new Error(`${id} : trait inconnu ${trait}`);
    if (new Set(t).size !== t.length) throw new Error(`${id} : trait en double`);
  }
}

validerResonances(RESONANCES);
validerTraitsSinges(SINGES);

// Index (0 = aucun) du plus haut palier atteint avec `nb` singes.
export function indexPalier(nb, donnees = RESONANCES) {
  let index = 0;
  donnees.paliers.forEach((seuil, i) => { if (nb >= seuil) index = i + 1; });
  return index;
}

// Nombre de porteurs de chaque trait dans une équipe (tableau d'emplacements, null = vide), tous slots confondus.
export function compterTraits(equipe) {
  const compte = {};
  for (const s of equipe) {
    for (const trait of new Set(s?.traits ?? [])) compte[trait] = (compte[trait] ?? 0) + 1;
  }
  return compte;
}

// Résonances actives d'une équipe : [{ trait, nb, palier, valeurs }], une par trait ayant atteint un palier,
// dans l'ordre du catalogue (ordre stable, quel que soit l'ordre des singes).
export function resonancesActives(equipe, donnees = RESONANCES) {
  const compte = compterTraits(equipe);
  const actives = [];
  for (const [trait, t] of Object.entries(donnees.traits)) {
    const nb = compte[trait] ?? 0;
    const index = indexPalier(nb, donnees);
    if (index > 0) actives.push({ trait, nb, palier: donnees.paliers[index - 1], valeurs: t.paliers[index - 1] });
  }
  return actives;
}

// Données des traits avec toutes les valeurs de chaque palier augmentées de `pct` (Harmonie, Chœur) :
// taux, plafonds et chances, arrondis au dixième ; une chance ne dépasse jamais 100 %.
export function resonancesAvecBonus(pct = 0, donnees = RESONANCES) {
  if (!pct) return donnees;
  const augmenter = (valeurs) => Object.fromEntries(Object.entries(valeurs).map(([cle, v]) => {
    const augmentee = Math.round(v * (1 + pct) * 10 + 1e-9) / 10;
    return [cle, cle === "chance" ? Math.min(100, augmentee) : augmentee];
  }));
  const traits = Object.fromEntries(Object.entries(donnees.traits).map(([id, t]) => [id, { ...t, paliers: t.paliers.map(augmenter) }]));
  return { ...donnees, traits };
}

// Équipe prête pour le combat : Renforcement appliqué aux PV, ATK et DEF de ses porteurs, et chaque porteur
// reçoit `effetsTraits` ({ rempart: { reductionBase, reductionBonus }, … }), les valeurs de ses traits actifs.
// Renvoie { equipe, resonances } ; l'équipe d'origine n'est pas modifiée, les singes sans trait actif sont repris tels quels.
export function appliquerResonances(equipe, donnees = RESONANCES) {
  const resonances = resonancesActives(equipe, donnees);
  const parTrait = Object.fromEntries(resonances.map((r) => [r.trait, r.valeurs]));
  const resultat = equipe.map((s) => {
    const actifs = (s?.traits ?? []).filter((t) => parTrait[t]);
    if (actifs.length === 0) return s;
    const effetsTraits = Object.fromEntries(actifs.map((t) => [t, parTrait[t]]));
    const r = effetsTraits.renforcement;
    if (!r) return { ...s, effetsTraits };
    const plus = (valeur) => Math.round(valeur * (1 + r.statsPct / 100));
    return { ...s, hp: plus(s.hp), atk: plus(s.atk), def: plus(s.def), effetsTraits };
  });
  return { equipe: resultat, resonances };
}
