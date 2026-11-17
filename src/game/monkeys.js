import { PALIERS, RARETES } from "../constants/game.js";
import fs from "node:fs";
import { avecVersion } from "../version.js";

// Catalogue des espèces, indexé par identifiant (ex. "basic_monkey").
export const SINGES = JSON.parse(fs.readFileSync(new URL("../data/monkeys.json", import.meta.url), "utf8"));

function tirerPondere(items, hasard = Math.random) {
  const total = items.reduce((somme, it) => somme + it.poids, 0);
  let r = hasard() * total;
  for (const it of items) {
    r -= it.poids;
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

// Raretés concernées par Flair et Étincelle
const RARES = ["rare", "epic", "legendary", "mythic"];
export function estRare(rarete) {
  return RARES.includes(rarete);
}

// Raretés assez rares pour être annoncées à tout le monde dans le flux de la page Tirage.
const NOTABLES = ["legendary", "mythic"];
export function estNotable(rarete) {
  return NOTABLES.includes(rarete);
}

// Poids des raretés pour un tirage, effets de l'arbre compris :
// - Flair (`rarete_pct`) multiplie le poids des raretés rare, épique, légendaire et mythique ;
// - `forcerRare` (Étincelle) ne garde que ces raretés, dans leurs proportions ;
// - `rareteMin` (singe offert, ex. "legendary") ne garde que cette rareté et les suivantes, dans leurs proportions.
export function poidsRaretes(effets = null, { forcerRare = false, rareteMin = null } = {}) {
  const mult = 1 + (effets?.rarete_pct ?? 0);
  const iMin = rareteMin === null ? 0 : RARETES.findIndex((r) => r.nom === rareteMin);
  if (iMin < 0) throw new Error(`rareté inconnue : ${rareteMin}`);
  return RARETES
    .filter((r, i) => i >= iMin && (!forcerRare || estRare(r.nom)))
    .map((r) => ({ ...r, poids: estRare(r.nom) ? r.poids * mult : r.poids }));
}

// Chance de chaque rareté sur un tirage, en part de 1 (les poids rapportés à leur total).
// Sert à afficher le tableau des probabilités : avec `effets`, Flair est déjà compris.
export function chancesRaretes(effets = null) {
  const poids = poidsRaretes(effets);
  const total = poids.reduce((somme, r) => somme + r.poids, 0);
  return poids.map((r) => ({ rarete: r.nom, chance: r.poids / total }));
}

// Rareté d'un tirage (`hasard` injectable pour les tests).
export function tirerRarete(effets = null, { forcerRare = false, rareteMin = null, hasard = Math.random } = {}) {
  return tirerPondere(poidsRaretes(effets, { forcerRare, rareteMin }), hasard).nom;
}

export function tirer(effets = null, { forcerRare = false, rareteMin = null } = {}) {
  const rarete = tirerRarete(effets, { forcerRare, rareteMin });
  const candidats = Object.entries(SINGES).filter(([, s]) => s.rarete === rarete);
  if (candidats.length === 0) return null;
  const [espece] = candidats[Math.floor(Math.random() * candidats.length)];
  return espece;
}

export function getEspece(id) {
  return SINGES[id] ?? null;
}

export function getImageUrl(id) {
  return avecVersion(`/images/MonkeysIcons/${id}.png`);
}

export function getNiveau(rarete, amount) {
  const palier = PALIERS[rarete];
  let niveau = 1;
  let restant = amount;
  let prochain = palier + 1;

  while (restant >= prochain) {
    restant -= prochain;
    niveau += 1;
    prochain = palier * niveau + 1;
  }

  return { niveau, progression: restant, prochain };
}

export function statsFinales(espece, niveau) {
  const n = niveau - 1;
  const s = {};
  for (const k of Object.keys(espece.base)) {
    s[k] = espece.base[k] + (espece.croissance[k] ?? 0) * n;
  }
  return s;
}
