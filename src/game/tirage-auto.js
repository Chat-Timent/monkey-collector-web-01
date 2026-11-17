import { RARETES } from "../constants/game.js";

// Rythmes proposés (tirages par seconde) et raretés qu'on peut viser : viser « commun ou mieux »
// arrêterait l'auto-tirage dès le premier singe.
export const RYTHMES_AUTO = [1, 2, 5];
export const RARETES_AUTO = RARETES.map((r) => r.nom).filter((nom) => nom !== "common");
// Tirages faits au plus par passage : ménage le serveur au retour d'une longue absence.
// Le reste est fait aux passages suivants (rien n'est perdu, `dernier_passage` n'avance que d'autant).
export const LOT_AUTO_MAX = 30;

export function reglageAutoValide(rythme, rarete) {
  return RYTHMES_AUTO.includes(rythme) && RARETES_AUTO.includes(rarete);
}

// Le filtre veut dire « cette rareté ou mieux ».
export function passeFiltre(rarete, rareteMin) {
  const rang = (nom) => RARETES.findIndex((r) => r.nom === nom);
  return rang(rarete) >= rang(rareteMin);
}

// Instants (ms) des tirages dus entre `dernierPassage` (exclu) et `maintenant` (inclus),
// au rythme de `rythme` par seconde, `max` au plus.
export function instantsDus(dernierPassage, maintenant, rythme, max = LOT_AUTO_MAX) {
  const pas = 1000 / rythme;
  const nombre = Math.min(max, Math.max(0, Math.floor((maintenant - dernierPassage) / pas)));
  return Array.from({ length: nombre }, (_, i) => dernierPassage + (i + 1) * pas);
}
