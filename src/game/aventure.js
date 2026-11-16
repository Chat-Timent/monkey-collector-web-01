// Aventure (donjon endless) : fonctions pures, sans base de données.
// Les règles sont dans src/data/donjons.json.
import fs from "node:fs";
import { RARETES } from "../constants/game.js";
import { SINGES, getImageUrl, statsFinales } from "./monkeys.js";
import { competenceDe } from "./competences.js";

export const DONJONS = JSON.parse(fs.readFileSync(new URL("../data/donjons.json", import.meta.url), "utf8"));
const AVENTURE = DONJONS.aventure;

const ORDRE_RARETES = RARETES.map((r) => r.nom); // common → mythic

// Générateur pseudo-aléatoire déterministe (mulberry32) : un même étage donne toujours les mêmes ennemis.
function generateur(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function palierDe(etage, donjon = AVENTURE) {
  let palier = donjon.paliers[0];
  for (const p of donjon.paliers) if (etage >= p.des) palier = p;
  return palier;
}

// Ennemis d'un étage, au format attendu par le moteur de combat (6 emplacements, null = vide).
// - nombre et rareté maximale : selon le palier ; chaque ennemi a une chance sur deux
//   d'être de la rareté maximale, sinon de la rareté juste en dessous
// - niveau : 1 au début du palier, +1 par étage
// - force : les premiers étages sont affaiblis (PV, ATK et DEF multipliés)
// `graine` : distingue les donjons (mêmes règles, ennemis différents).
export function ennemisEtage(etage, catalogue = SINGES, donjon = AVENTURE, graine = 0) {
  const hasard = generateur(etage * 7919 + 17 + graine * 104729);
  const palier = palierDe(etage, donjon);
  const niveau = 1 + etage - palier.des;
  const force = Math.min(1, donjon.force.depart + donjon.force.parEtage * (etage - 1));
  const iMax = ORDRE_RARETES.indexOf(palier.rarete);

  const parRarete = {};
  for (const [id, s] of Object.entries(catalogue)) (parRarete[s.rarete] ??= []).push(id);
  for (const ids of Object.values(parRarete)) ids.sort();

  const slots = Array(6).fill(null);
  for (let i = 0; i < Math.min(palier.nombre, 6); i++) {
    let rarete = hasard() < 0.5 || iMax === 0 ? palier.rarete : ORDRE_RARETES[iMax - 1];
    if (!parRarete[rarete]?.length) rarete = palier.rarete;
    const ids = parRarete[rarete];
    const id = ids[Math.floor(hasard() * ids.length)];
    const espece = catalogue[id];
    const s = statsFinales(espece, niveau);
    slots[i] = {
      id,
      nom: espece.nom,
      image: getImageUrl(id),
      rarete: espece.rarete,
      niveau,
      hp: Math.max(1, Math.round(s.hp * force)),
      atk: Math.max(1, Math.round(s.atk * force)),
      def: Math.round(s.def * force),
      spd: s.spd, prec: s.prec, esq: s.esq, crit: s.crit, critdmg: s.critdmg,
      perk: null,
      competence: competenceDe(espece),
    };
  }
  return slots;
}

// Récompenses d'un étage battu (le singe bonus est tiré à part, au moment du combat).
export function recompensesEtage(etage, donjon = AVENTURE) {
  const r = donjon.recompenses;
  return {
    xp: r.xp.base + r.xp.parEtage * etage,
    coins: r.coins.base + r.coins.parEtage * etage,
    tirages: etage % r.tirages.tousLes === 0 ? r.tirages.quantite : 0,
  };
}

// Explorateur : XP et coins d'un étage augmentés de `aventure_pct` (arrondis). Les tirages ne changent pas.
export function recompensesAvecBonus(recompenses, effets) {
  const mult = 1 + (effets?.aventure_pct ?? 0);
  return { ...recompenses, xp: Math.round(recompenses.xp * mult), coins: Math.round(recompenses.coins * mult) };
}

// Singe bonus : avec la chance prévue, une copie d'un des ennemis battus (id), sinon null.
export function singeBonus(ennemis, hasard = Math.random, donjon = AVENTURE) {
  if (hasard() >= donjon.recompenses.singe.chance) return null;
  const presents = ennemis.filter(Boolean);
  return presents[Math.floor(hasard() * presents.length)].id;
}
