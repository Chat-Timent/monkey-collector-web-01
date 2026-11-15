// Puissance d'un singe : fonction pure servant à équilibrer les stats entre raretés et profils.
//
// Deux singes de même rareté doivent avoir la même puissance, quelle que soit leur répartition
// PV / attaque / défense (tank, canon, équilibré…). Une simple somme des stats ne le garantit pas :
// l'attaque agit deux fois (dégâts infligés et défense adverse réduite en proportion).
// On mesure donc la puissance contre un adversaire de référence, avec la formule de dégâts du moteur :
//   puissance = racine cubique de ( PV × dégâts infligés × dégâts évités )
import { RARETES } from "../constants/game.js";

// Adversaire de référence : un commun moyen. Pour une rareté supérieure, ses stats sont multipliées
// par le même facteur que la puissance visée (un singe se mesure à un adversaire de son rang et de son niveau).
export const REFERENCE = { atk: 340, def: 275 };
// Puissance d'un singe commun (niveau 1). Les autres raretés en découlent.
export const PUISSANCE_COMMUN = 596;
// Écart de puissance entre deux raretés voisines, en fraction de la puissance d'un commun.
export const PALIER_RARETE = 0.15;
// Croissance par niveau, en fraction de la puissance de base.
export const CROISSANCE_PAR_NIVEAU = 0.055;

function facteurRarete(rarete) {
  const rang = RARETES.findIndex((r) => r.nom === rarete);
  return 1 + PALIER_RARETE * Math.max(0, rang);
}

export function puissance({ hp, atk, def }, rarete = "common", niveau = 1) {
  const f = facteurRarete(rarete) * (1 + CROISSANCE_PAR_NIVEAU * (niveau - 1));
  const refAtk = REFERENCE.atk * f;
  const refDef = REFERENCE.def * f;
  const infliges = (atk * atk) / (atk + refDef);
  const pvEffectifs = hp * (refAtk + def); // proportionnel à PV / dégâts reçus (refAtk² en facteur commun)
  return Math.cbrt(pvEffectifs * infliges);
}

// Puissance visée pour une rareté, au niveau donné.
export function puissanceCible(rarete, niveau = 1) {
  const base = PUISSANCE_COMMUN * facteurRarete(rarete);
  return base * (1 + CROISSANCE_PAR_NIVEAU * (niveau - 1));
}

// Stats d'un singe au niveau donné (base + croissance × (niveau - 1)).
export function statsAuNiveau(espece, niveau) {
  const n = niveau - 1;
  const s = {};
  for (const k of Object.keys(espece.base)) s[k] = espece.base[k] + (espece.croissance[k] ?? 0) * n;
  return s;
}
