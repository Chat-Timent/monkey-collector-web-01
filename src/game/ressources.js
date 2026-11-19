// Donjons de ressources et donjon d'éveil : fonctions pures, sans base de données.
// Règles dans src/data/donjons.json : clé "ressources" (page Ressources) et clé "eveil" (page Éveil),
// de même forme ; chaque fonction prend en paramètre les règles du groupe de donjons voulu.
// Chaque donjon nomme sa récompense ("recompense") : tirages, coins, XP, ou une ressource
// de src/data/ressources-joueur.json (stockée dans ressources_joueur). "balayage": true autorise le balayage.
// Une icône est un émoji ou le chemin d'une image ("/images/…").
import fs from "node:fs";
import { DONJONS, ennemisEtage } from "./aventure.js";
import { SINGES } from "./monkeys.js";

export const RESSOURCES = DONJONS.ressources;
export const DONJON_EVEIL = DONJONS.eveil;
// Ressources stockées dans ressources_joueur : nom affiché et icône
export const RESSOURCES_JOUEUR = JSON.parse(fs.readFileSync(new URL("../data/ressources-joueur.json", import.meta.url), "utf8"));
// Récompenses qui ne sont pas des ressources stockées : elles ont leur propre traitement
export const RECOMPENSES_SPECIALES = {
  tirages: { nom: "tirages", icone: "/images/Tickets/ticket_tirages.png" },
  coins: { nom: "coins", icone: "💰" },
  xp: { nom: "XP", icone: "⭐" },
};

const entierPositif = (v) => Number.isInteger(v) && v >= 0;

export function validerRessourcesJoueur(catalogue) {
  for (const [id, r] of Object.entries(catalogue)) {
    if (Object.hasOwn(RECOMPENSES_SPECIALES, id)) throw new Error(`la ressource "${id}" porte le nom d'une récompense spéciale`);
    if (typeof r.nom !== "string" || typeof r.icone !== "string") throw new Error(`nom ou icône manquant pour la ressource ${id}`);
  }
}

validerRessourcesJoueur(RESSOURCES_JOUEUR);

export function estRessourceJoueur(id, catalogue = RESSOURCES_JOUEUR) {
  return typeof id === "string" && Object.hasOwn(catalogue, id);
}

// Nom et icône d'une récompense de donjon ({ id, nom, icone }), ou null si elle est inconnue.
export function infoRecompense(id, catalogue = RESSOURCES_JOUEUR) {
  if (typeof id !== "string") return null;
  const r = Object.hasOwn(RECOMPENSES_SPECIALES, id) ? RECOMPENSES_SPECIALES[id] : catalogue[id];
  return r && Object.hasOwn(r, "nom") ? { id, nom: r.nom, icone: r.icone } : null;
}

// Vérifie un groupe de donjons au chargement (récompense connue, gains entiers, balayage booléen…).
export function validerDonjons(regles, nomGroupe, catalogue = RESSOURCES_JOUEUR) {
  if (!regles) throw new Error(`groupe de donjons "${nomGroupe}" absent de donjons.json`);
  if (!Number.isInteger(regles.ticketsParJour) || regles.ticketsParJour < 1) throw new Error(`ticketsParJour invalide (${nomGroupe})`);
  if (!Number.isFinite(regles.difficulte?.multiplicateur) || !Number.isFinite(regles.difficulte?.decalage)) {
    throw new Error(`difficulté invalide (${nomGroupe})`);
  }
  const donjons = Object.entries(regles.donjons ?? {});
  if (donjons.length === 0) throw new Error(`aucun donjon dans "${nomGroupe}"`);
  for (const [id, d] of donjons) {
    if (typeof d.nom !== "string" || typeof d.icone !== "string") throw new Error(`nom ou icône manquant dans le donjon ${id}`);
    if (!entierPositif(d.gain?.base) || !entierPositif(d.gain?.parPalier)) throw new Error(`gain invalide dans le donjon ${id}`);
    if (d.gain.tousLes !== undefined && !(Number.isInteger(d.gain.tousLes) && d.gain.tousLes >= 1)) {
      throw new Error(`gain.tousLes invalide dans le donjon ${id}`);
    }
    if (!Number.isInteger(d.graine)) throw new Error(`graine invalide dans le donjon ${id}`);
    if (!infoRecompense(d.recompense, catalogue)) throw new Error(`récompense inconnue "${d.recompense}" dans le donjon ${id}`);
    if (d.balayage !== undefined && typeof d.balayage !== "boolean") throw new Error(`balayage invalide dans le donjon ${id}`);
  }
}

validerDonjons(RESSOURCES, "ressources");
validerDonjons(DONJON_EVEIL, "eveil");
for (const id of Object.keys(DONJON_EVEIL.donjons)) {
  if (Object.hasOwn(RESSOURCES.donjons, id)) throw new Error(`le donjon "${id}" existe dans "ressources" et dans "eveil"`);
}

export function donjonExiste(donjon, regles = RESSOURCES) {
  return typeof donjon === "string" && Object.hasOwn(regles.donjons, donjon);
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

// Quantité de la ressource du donjon gagnée en battant ce palier : `base` au palier 1, puis `parPalier` de plus
// à chaque palier, ou, avec `tousLes`, tous les `tousLes` paliers (tousLes 10 : paliers 1-9, puis 10-19…).
export function gainDonjon(donjon, palier, regles = RESSOURCES) {
  const g = regles.donjons[donjon].gain;
  const crans = g.tousLes ? Math.floor(palier / g.tousLes) : palier - 1;
  return g.base + g.parPalier * crans;
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

// Tickets après un cadeau (déblocage de Clé de donjon) : le stock actuel, calculé avec les effets
// d'avant le déblocage, plus `nombre`. Le cadeau est immédiat, sans attendre le prochain jour.
export function ticketsApresCadeau(ligne, aujourdhui, nombre, effetsAvant, regles = RESSOURCES) {
  return ticketsDisponibles(ligne, aujourdhui, regles, effetsAvant) + nombre;
}

// Tickets disponibles : pleins si la ligne date d'un jour passé (ou n'existe pas).
// Un bonus débloqué en cours de journée compte donc à partir du lendemain si les tickets du jour sont entamés.
export function ticketsDisponibles(ligne, aujourdhui, regles = RESSOURCES, effets = null) {
  if (!ligne || ligne.jour < aujourdhui) return ticketsParJour(effets, regles);
  return ligne.tickets;
}
