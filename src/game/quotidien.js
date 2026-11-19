// Série de connexion (cadeau du footer) et quêtes quotidiennes (parchemin) : fonctions pures, sans base de données.
// Règles dans src/data/quotidien.json :
// - "serie" : récompense de chaque jour de la série (J1 à J7). Après J7 la série recommence à J1,
//   et un jour sans récupérer la fait aussi repartir de J1.
// - "quetes" : "parJour" quêtes tirées chaque jour dans "catalogue" (les mêmes pour tous les joueurs),
//   la récompense de chaque rang ("recompenses") et le bonus quand toutes sont terminées.
// Une récompense est un objet dont chaque clé est une quantité (tirages, coins, xp, acier, etoffe, essence,
// objets = objets offerts, arme ou équipement au hasard) ou "singe" (rareté minimale du singe offert).
// Les jours sont ceux de Paris ("AAAA-MM-JJ", voir jourParis) : tout repart à minuit, heure de Paris.
import fs from "node:fs";
import { RARETES } from "../constants/game.js";
import { generateur } from "./aventure.js";
import { RESSOURCES_JOUEUR, infoRecompense } from "./ressources.js";

export const QUOTIDIEN = JSON.parse(fs.readFileSync(new URL("../data/quotidien.json", import.meta.url), "utf8"));
// Ligne de quetes_jour qui note le bonus des quêtes (ce nom ne peut pas être une quête)
export const QUETE_BONUS = "bonus";
// Quêtes que le serveur sait suivre (voir progresserQuete) : une quête du catalogue doit en faire partie
export const TYPES_QUETES = ["tirages", "pvp", "arme", "equipement", "perk"];

const QUANTITES = ["tirages", "coins", "xp", ...Object.keys(RESSOURCES_JOUEUR), "objets"];
const NOMS_RARETES = {
  common: "Commun", uncommon: "Peu commun", rare: "Rare", epic: "Épique", legendary: "Légendaire", mythic: "Mythique",
  prismatic: "Prismatique",
};

function validerRecompense(r, ou) {
  if (!r || typeof r !== "object" || Object.keys(r).length === 0) throw new Error(`récompense vide (${ou})`);
  for (const [cle, v] of Object.entries(r)) {
    if (cle === "singe") {
      if (!RARETES.some((x) => x.nom === v)) throw new Error(`rareté inconnue "${v}" (${ou})`);
    } else if (!QUANTITES.includes(cle)) {
      throw new Error(`récompense inconnue "${cle}" (${ou})`);
    } else if (!(Number.isInteger(v) && v > 0)) {
      throw new Error(`quantité invalide pour ${cle} (${ou})`);
    }
  }
}

// Vérifie les règles au chargement (le serveur refuse de démarrer sur des données incohérentes).
export function validerQuotidien(q) {
  if (!Array.isArray(q.serie) || q.serie.length === 0) throw new Error("série de connexion vide");
  q.serie.forEach((r, i) => validerRecompense(r, `série J${i + 1}`));
  const quetes = q.quetes ?? {};
  const ids = Object.keys(quetes.catalogue ?? {});
  if (!Number.isInteger(quetes.parJour) || quetes.parJour < 1 || quetes.parJour > ids.length) {
    throw new Error("nombre de quêtes par jour invalide");
  }
  if (!Array.isArray(quetes.recompenses) || quetes.recompenses.length !== quetes.parJour) {
    throw new Error("il faut une récompense par quête du jour");
  }
  quetes.recompenses.forEach((r, i) => validerRecompense(r, `quête ${i + 1}`));
  validerRecompense(quetes.bonus, "bonus des quêtes");
  for (const [id, d] of Object.entries(quetes.catalogue)) {
    if (!TYPES_QUETES.includes(id)) throw new Error(`quête inconnue "${id}" (le serveur ne sait pas la suivre)`);
    if (typeof d.texte !== "string" || typeof d.icone !== "string") throw new Error(`texte ou icône manquant pour la quête ${id}`);
    if (!(Number.isInteger(d.objectif) && d.objectif >= 1)) throw new Error(`objectif invalide pour la quête ${id}`);
  }
}

validerQuotidien(QUOTIDIEN);

// Récompense telle que l'interface l'affiche : une ligne par élément, { icone, valeur, nom }
// (une case affiche l'icône et la valeur ; le nom complet sert d'info-bulle).
export function decrireRecompense(r) {
  return Object.entries(r).map(([cle, v]) => {
    if (cle === "singe") {
      const plus = v === RARETES.at(-1).nom ? "" : "+";
      return { icone: "🐒", valeur: `${NOMS_RARETES[v]}${plus}`, nom: `singe ${NOMS_RARETES[v].toLowerCase()}${plus ? " ou mieux" : ""}` };
    }
    if (cle === "objets") return { icone: "🎲", valeur: `${v} objets`, nom: "objets offerts (arme ou équipement)" };
    const info = infoRecompense(cle);
    return { icone: info.icone, valeur: v.toLocaleString("fr-FR"), nom: info.nom };
  });
}

// Veille d'un jour "AAAA-MM-JJ" (calcul à midi UTC : pas d'effet de changement d'heure).
export function veille(jour) {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// État de la série à partir de la ligne serie_connexion du joueur ({ jour, dernier_jour }, null si absente) :
// - courant : jour de la série (1 à 7) à récupérer aujourd'hui, ou déjà récupéré aujourd'hui (recuperee)
// - jours : chaque jour de la série avec sa récompense et son état ("recu", "dispo" ou "avenir")
export function etatSerie(ligne, aujourdhui, serie = QUOTIDIEN.serie) {
  let courant = 1;
  let recuperee = false;
  if (ligne && ligne.jour >= 1 && ligne.dernier_jour === aujourdhui) {
    courant = Math.min(ligne.jour, serie.length);
    recuperee = true;
  } else if (ligne && ligne.jour >= 1 && ligne.dernier_jour === veille(aujourdhui)) {
    courant = (ligne.jour % serie.length) + 1;
  }
  return {
    courant,
    recuperee,
    jours: serie.map((recompense, i) => {
      const jour = i + 1;
      const etat = jour < courant || (jour === courant && recuperee) ? "recu" : jour === courant ? "dispo" : "avenir";
      return { jour, etat, recompense: decrireRecompense(recompense) };
    }),
  };
}

// Quêtes du jour : `parJour` quêtes distinctes du catalogue, tirées à partir de la date.
// Les mêmes pour tous les joueurs, dans le même ordre (le rang donne la récompense).
export function quetesDuJour(jour, quetes = QUOTIDIEN.quetes) {
  const hasard = generateur(Math.imul(Number(jour.replaceAll("-", "")), 2654435761));
  const ids = Object.keys(quetes.catalogue).sort();
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, quetes.parJour);
}

// État des quêtes du jour à partir des lignes quetes_jour du joueur pour ce jour ({ quete, progres, reclamee }).
// Le bonus est disponible quand toutes les quêtes sont terminées, récompenses récupérées ou non.
export function etatQuetes(jour, lignes, quetes = QUOTIDIEN.quetes) {
  const parQuete = Object.fromEntries(lignes.map((l) => [l.quete, l]));
  const liste = quetesDuJour(jour, quetes).map((id, i) => {
    const d = quetes.catalogue[id];
    const progres = Math.min(d.objectif, parQuete[id]?.progres ?? 0);
    return {
      rang: i + 1,
      id,
      texte: d.texte,
      icone: d.icone,
      objectif: d.objectif,
      progres,
      terminee: progres >= d.objectif,
      reclamee: Boolean(parQuete[id]?.reclamee),
      recompense: decrireRecompense(quetes.recompenses[i]),
    };
  });
  return {
    quetes: liste,
    bonus: {
      recompense: decrireRecompense(quetes.bonus),
      disponible: liste.every((q) => q.terminee),
      reclame: Boolean(parQuete[QUETE_BONUS]?.reclamee),
    },
  };
}

// Pastilles du footer : une récompense attend d'être récupérée.
export function pastilles(serie, quetes) {
  return {
    serie: !serie.recuperee,
    quetes: quetes.quetes.some((q) => q.terminee && !q.reclamee) || (quetes.bonus.disponible && !quetes.bonus.reclame),
  };
}
