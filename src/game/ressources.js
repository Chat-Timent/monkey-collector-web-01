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

// Tickets par jour de chaque donjon, bonus de l'arbre compris (Clé de donjon).
export function ticketsParJour(effets, regles = RESSOURCES) {
  return regles.ticketsParJour + (effets?.tickets_donjon ?? 0);
}

// Tickets disponibles : pleins si la ligne date d'un jour passé (ou n'existe pas).
// Un bonus débloqué en cours de journée compte donc à partir du lendemain si les tickets du jour sont entamés.
export function ticketsDisponibles(ligne, aujourdhui, regles = RESSOURCES, effets = null) {
  if (!ligne || ligne.jour < aujourdhui) return ticketsParJour(effets, regles);
  return ligne.tickets;
}
