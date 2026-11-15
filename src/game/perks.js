// Perks : fonctions pures, sans base de données. Données dans src/data/perks.json.
// Un perk sans tier (ex. taunt) est enregistré avec le tier 1.
import fs from "node:fs";

export const PERKS = JSON.parse(fs.readFileSync(new URL("../data/perks.json", import.meta.url), "utf8"));

// Nombre de tiers d'un perk (0 pour un perk sans tier).
export function nbTiers(perk, donnees = PERKS) {
  return donnees.perks[perk]?.tiers?.length ?? 0;
}

export function perkExiste(perk, tier, donnees = PERKS) {
  if (typeof perk !== "string" || !Object.hasOwn(donnees.perks, perk)) return false;
  const n = nbTiers(perk, donnees);
  return Number.isInteger(tier) && tier >= 1 && tier <= Math.max(1, n);
}

// Choisit un élément selon des poids (`hasard` renvoie un nombre dans [0, 1[).
function tirerPondere(poids, hasard) {
  const total = poids.reduce((t, p) => t + p, 0);
  let r = hasard() * total;
  for (let i = 0; i < poids.length; i++) {
    r -= poids[i];
    if (r < 0) return i;
  }
  return poids.length - 1;
}

// Tirage de la loterie : un perk au hasard (chances égales), puis son tier ;
// plus le tier est élevé, plus il est rare (poids de `chancesTiers`, sinon chances égales).
export function tirerPerk(hasard = Math.random, donnees = PERKS) {
  const ids = Object.keys(donnees.perks);
  const perk = ids[Math.floor(hasard() * ids.length)];
  const n = nbTiers(perk, donnees);
  if (n === 0) return { perk, tier: 1 };
  const poids = donnees.chancesTiers[n] ?? Array(n).fill(1);
  return { perk, tier: tirerPondere(poids, hasard) + 1 };
}

// XP du starter gagnée quand un perk tiré est déjà possédé (même perk, même tier).
export function xpDoublon(perk, tier, donnees = PERKS) {
  const cle = nbTiers(perk, donnees) === 0 ? "unique" : String(tier);
  return donnees.xpDoublon[cle] ?? 0;
}

// Perk tel qu'il est porté en combat : identité, affichage et valeurs du tier.
export function effetPerk(perk, tier, donnees = PERKS) {
  const p = donnees.perks[perk];
  if (!p) return null;
  return { id: perk, tier, nom: p.nom, icone: p.icone, ...(p.tiers?.[tier - 1] ?? {}) };
}
