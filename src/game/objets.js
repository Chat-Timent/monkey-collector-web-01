// Objets portés par les singes (armes, équipements) : fonctions pures, sans base de données.
// Un catalogue par type (src/data/armes.json…), de même forme : prix et ressource de la loterie, chances des tiers,
// ressource rendue au démantèlement selon le tier, et valeurs de chaque tier.
// Chaque objet tiré est un exemplaire unique, sans niveau : ses valeurs sont celles de son tier.
// Un même objet peut être porté plusieurs fois (par plusieurs singes, ou plusieurs fois par un singe pour les équipements).
// Effets possibles : hpPct, atkPct, defPct (pourcentage des stats de base, comme les perks)
// et crit, critdmg (points, ces stats étant déjà des pourcentages).
import fs from "node:fs";
import { estRessourceJoueur } from "./ressources.js";

export const EFFETS_OBJETS = ["hpPct", "atkPct", "defPct", "crit", "critdmg"];
const TYPES = ["arme", "equipement"];

// Vérifie un catalogue au chargement (le serveur refuse de démarrer sur des données incohérentes).
export function validerCatalogue(c, nom = "catalogue") {
  if (!TYPES.includes(c.type)) throw new Error(`type d'objet inconnu "${c.type}" (${nom})`);
  if (!Number.isInteger(c.slots) || c.slots < 1) throw new Error(`nombre d'emplacements invalide (${nom})`);
  if (!Number.isInteger(c.prix) || c.prix < 1) throw new Error(`prix invalide (${nom})`);
  if (!estRessourceJoueur(c.ressource)) throw new Error(`ressource inconnue "${c.ressource}" (${nom})`);
  const nbTiers = c.chancesTiers?.length ?? 0;
  if (nbTiers === 0 || !c.chancesTiers.every((p) => typeof p === "number" && p > 0)) throw new Error(`chances des tiers invalides (${nom})`);
  if (!Array.isArray(c.demantelement) || c.demantelement.length !== nbTiers || !c.demantelement.every((v) => Number.isInteger(v) && v >= 0)) {
    throw new Error(`il faut ${nbTiers} valeurs de démantèlement entières (${nom})`);
  }
  const objets = Object.entries(c.objets ?? {});
  if (objets.length === 0) throw new Error(`aucun objet (${nom})`);
  for (const [id, o] of objets) {
    if (typeof o.nom !== "string" || typeof o.icone !== "string") throw new Error(`nom ou icône manquant pour ${id} (${nom})`);
    if (!Array.isArray(o.tiers) || o.tiers.length !== nbTiers) throw new Error(`${id} doit avoir ${nbTiers} tiers (${nom})`);
    for (const valeurs of o.tiers) {
      if (Object.keys(valeurs).length === 0) throw new Error(`tier sans effet pour ${id} (${nom})`);
      for (const [cle, v] of Object.entries(valeurs)) {
        if (!EFFETS_OBJETS.includes(cle)) throw new Error(`effet inconnu "${cle}" pour ${id} (${nom})`);
        if (!(typeof v === "number" && v > 0)) throw new Error(`valeur invalide pour ${cle} de ${id} (${nom})`);
      }
    }
  }
}

export function chargerCatalogue(fichier) {
  const c = JSON.parse(fs.readFileSync(new URL(`../data/${fichier}`, import.meta.url), "utf8"));
  validerCatalogue(c, fichier);
  return c;
}

export const ARMES = chargerCatalogue("armes.json");
export const EQUIPEMENTS = chargerCatalogue("equipements.json");
// Catalogues par type
export const CATALOGUES = { arme: ARMES, equipement: EQUIPEMENTS };
for (const [type, c] of Object.entries(CATALOGUES)) {
  if (c.type !== type) throw new Error(`le catalogue du type "${type}" déclare le type "${c.type}"`);
}

export function nbTiersObjet(c) {
  return c.chancesTiers.length;
}

export function objetExiste(c, objet, tier) {
  return typeof objet === "string" && Object.hasOwn(c.objets, objet)
    && Number.isInteger(tier) && tier >= 1 && tier <= nbTiersObjet(c);
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

// Tirage de la loterie : un objet au hasard (chances égales), puis son tier selon `chancesTiers`.
export function tirerObjet(c, hasard = Math.random) {
  const ids = Object.keys(c.objets);
  const objet = ids[Math.floor(hasard() * ids.length)];
  return { objet, tier: tirerPondere(c.chancesTiers, hasard) + 1 };
}

// Ressource rendue en démantelant un exemplaire de ce tier.
export function remboursementDemantelement(c, tier) {
  return c.demantelement[tier - 1] ?? 0;
}

// Valeurs d'un objet : celles de son tier.
export function valeursObjet(c, objet, tier) {
  return { ...c.objets[objet].tiers[tier - 1] };
}

// Objet tel qu'il est porté en combat : identité, affichage et valeurs de son tier.
export function effetObjet(c, objet, tier) {
  const o = c.objets[objet];
  if (!o || !objetExiste(c, objet, tier)) return null;
  return { type: c.type, id: objet, tier, nom: o.nom, icone: o.icone, ...valeursObjet(c, objet, tier) };
}

// Stats ajoutées par les objets portés par un singe, à partir de ses stats de base `s` (sans l'arbre) :
// les pourcentages de tous les objets sont additionnés avant l'arrondi ; crit et critdmg en points arrondis.
export function bonusObjets(objets, s) {
  const somme = Object.fromEntries(EFFETS_OBJETS.map((k) => [k, 0]));
  for (const o of objets ?? []) for (const k of EFFETS_OBJETS) somme[k] += o?.[k] ?? 0;
  return {
    hp: Math.round((s.hp * somme.hpPct) / 100),
    atk: Math.round((s.atk * somme.atkPct) / 100),
    def: Math.round((s.def * somme.defPct) / 100),
    crit: Math.round(somme.crit),
    critdmg: Math.round(somme.critdmg),
  };
}
