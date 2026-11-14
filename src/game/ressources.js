// Donjons de ressources : fonctions pures, sans base de données.
// Règles dans src/data/donjons.json (clé "ressources").
import { DONJONS, ennemisEtage } from "./aventure.js";
import { SINGES } from "./monkeys.js";

export const RESSOURCES = DONJONS.ressources;

export function donjonExiste(donjon) {
  return typeof donjon === "string" && Object.hasOwn(RESSOURCES.donjons, donjon);
}

// Un palier de donjon a la difficulté d'un étage d'Aventure plus élevé :
// la difficulté progresse `multiplicateur` fois plus vite.
export function etageEquivalent(palier, regles = RESSOURCES) {
  return regles.difficulte.multiplicateur * palier + regles.difficulte.decalage;
}

// Ennemis d'un palier : générés comme en Aventure, mais propres à chaque donjon.
export function ennemisDonjon(donjon, palier, regles = RESSOURCES) {
  return ennemisEtage(etageEquivalent(palier, regles), SINGES, undefined, regles.donjons[donjon].graine);
}

// Quantité de la ressource du donjon gagnée en battant ce palier.
export function gainDonjon(donjon, palier, regles = RESSOURCES) {
  const g = regles.donjons[donjon].gain;
  return g.base + g.parPalier * (palier - 1);
}

// Jour courant à Paris ("AAAA-MM-JJ") : les tickets reviennent à minuit, heure de Paris,
// quel que soit le fuseau du serveur.
export function jourParis(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(date);
}

// Tickets disponibles : pleins si la ligne date d'un jour passé (ou n'existe pas).
export function ticketsDisponibles(ligne, aujourdhui, regles = RESSOURCES) {
  if (!ligne || ligne.jour < aujourdhui) return regles.ticketsParJour;
  return ligne.tickets;
}
