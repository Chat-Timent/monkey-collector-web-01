// Objets portés par les singes (armes, équipements) : fonctions pures, sans base de données.
// Un catalogue par type (src/data/armes.json…), de même forme : prix et ressource de la loterie, chances des tiers,
// règle des niveaux d'objet, et valeurs de chaque tier.
// "uneSorteParSinge": true : un singe ne porte qu'un objet de chaque sorte (pas deux casques), quel que soit le tier.
// Effets possibles : hpPct, atkPct, defPct (pourcentage des stats de base, comme les perks)
// et crit, critdmg (points, ces stats étant déjà des pourcentages).
import fs from "node:fs";
import { estRessourceJoueur } from "./ressources.js";

export const EFFETS_OBJETS = ["hpPct", "atkPct", "defPct", "crit", "critdmg"];
// Effets en points (les autres sont des pourcentages des stats de base)
const POINTS = ["crit", "critdmg"];
const TYPES = ["arme", "equipement"];

// Vérifie un catalogue au chargement (le serveur refuse de démarrer sur des données incohérentes).
export function validerCatalogue(c, nom = "catalogue") {
  if (!TYPES.includes(c.type)) throw new Error(`type d'objet inconnu "${c.type}" (${nom})`);
  if (!Number.isInteger(c.slots) || c.slots < 1) throw new Error(`nombre d'emplacements invalide (${nom})`);
  if (!Number.isInteger(c.prix) || c.prix < 1) throw new Error(`prix invalide (${nom})`);
  if (c.uneSorteParSinge !== undefined && typeof c.uneSorteParSinge !== "boolean") throw new Error(`uneSorteParSinge invalide (${nom})`);
  if (!estRessourceJoueur(c.ressource)) throw new Error(`ressource inconnue "${c.ressource}" (${nom})`);
  const nbTiers = c.chancesTiers?.length ?? 0;
  if (nbTiers === 0 || !c.chancesTiers.every((p) => typeof p === "number" && p > 0)) throw new Error(`chances des tiers invalides (${nom})`);
  const n = c.niveaux ?? {};
  if (!Array.isArray(n.doublons) || !n.doublons.every((d) => Number.isInteger(d) && d >= 1)) throw new Error(`doublons par niveau invalides (${nom})`);
  if (!(typeof n.bonusParNiveauPct === "number" && n.bonusParNiveauPct >= 0)) throw new Error(`bonus par niveau invalide (${nom})`);
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

export function niveauMaxObjet(c) {
  return c.niveaux.doublons.length + 1;
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

// Doublons à réunir pour passer du niveau `niveau` au suivant (null au niveau maximal).
export function doublonsRequis(c, niveau) {
  return niveau >= niveauMaxObjet(c) ? null : c.niveaux.doublons[niveau - 1];
}

// Effet d'un doublon sur un objet possédé ({ niveau, doublons }) : un doublon de plus, et le niveau monte
// dès que le compte est atteint. Au niveau maximal, rien ne change (un exemplaire au maximum n'en reçoit plus).
export function apresDoublon(c, { niveau, doublons }) {
  const requis = doublonsRequis(c, niveau);
  if (requis === null) return { niveau, doublons, monte: false };
  if (doublons + 1 >= requis) return { niveau: niveau + 1, doublons: 0, monte: true };
  return { niveau, doublons: doublons + 1, monte: false };
}

// Démantèlement d'un exemplaire `source` ({ id, objet, tier }) parmi les exemplaires du joueur (`exemplaires`) :
// il donne un doublon à un autre exemplaire du même objet et du même tier qui n'est pas au niveau maximal
// (celui du niveau le plus élevé, puis le plus avancé, puis le plus ancien), sinon il rend de la ressource
// selon son tier (`demantelement`). Renvoie { cible, ...apresDoublon } ou { cible: null, rembourse }.
export function resultatDemantelement(c, source, exemplaires) {
  const max = niveauMaxObjet(c);
  const candidats = exemplaires
    .filter((e) => e.id !== source.id && e.objet === source.objet && e.tier === source.tier && e.niveau < max)
    .sort((a, b) => b.niveau - a.niveau || b.doublons - a.doublons || Number(a.id) - Number(b.id));
  const cible = candidats[0];
  if (!cible) return { cible: null, rembourse: c.demantelement[source.tier - 1] };
  return { cible, ...apresDoublon(c, cible) };
}

// Valeurs d'un objet à son niveau : celles du tier, augmentées de `bonusParNiveauPct` % par niveau au-dessus de 1,
// arrondies au dixième pour les pourcentages et à l'unité pour les points (crit, critdmg).
export function valeursObjet(c, objet, tier, niveau = 1) {
  const mult = 1 + (c.niveaux.bonusParNiveauPct * (Math.min(niveau, niveauMaxObjet(c)) - 1)) / 100;
  const valeurs = {};
  // (+1e-9 : arrondi au dixième supérieur malgré les flottants)
  for (const [cle, v] of Object.entries(c.objets[objet].tiers[tier - 1])) {
    valeurs[cle] = POINTS.includes(cle) ? Math.round(v * mult + 1e-9) : Math.round(v * mult * 10 + 1e-9) / 10;
  }
  return valeurs;
}

// Objet tel qu'il est porté en combat : identité, affichage et valeurs à son niveau.
export function effetObjet(c, objet, tier, niveau = 1) {
  const o = c.objets[objet];
  if (!o || !objetExiste(c, objet, tier)) return null;
  return { type: c.type, id: objet, tier, niveau, nom: o.nom, icone: o.icone, ...valeursObjet(c, objet, tier, niveau) };
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
