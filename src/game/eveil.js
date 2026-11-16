// Éveil des singes légendaires et mythiques : fonctions pures, sans base de données.
// Règles dans src/data/eveil.json ; améliorations des compétences dans src/data/competences.json (champ "eveil").
// Un singe commence au niveau d'éveil 1 ; chaque niveau au-dessus donne `bonusParNiveauPct` % de PV, ATK et DEF
// (de ses stats de base, comme les perks).
import fs from "node:fs";
import { RARETES } from "../constants/game.js";
import { COMPETENCES, competenceDe, niveauxAmelioration } from "./competences.js";
import { estRessourceJoueur } from "./ressources.js";

export const EVEIL = JSON.parse(fs.readFileSync(new URL("../data/eveil.json", import.meta.url), "utf8"));

// Vérifie le JSON au chargement (le serveur refuse de démarrer sur des règles incohérentes).
export function validerEveil(regles, competences = COMPETENCES) {
  if (!Number.isInteger(regles.niveauMax) || regles.niveauMax < 2) throw new Error("niveauMax d'éveil invalide");
  if (!Array.isArray(regles.couts) || regles.couts.length !== regles.niveauMax - 1) {
    throw new Error(`il faut ${regles.niveauMax - 1} coûts d'éveil (un par montée de niveau)`);
  }
  if (!regles.couts.every((c) => Number.isInteger(c) && c > 0)) throw new Error("coût d'éveil invalide");
  const raretes = RARETES.map((r) => r.nom);
  if (Object.keys(regles.raretes ?? {}).length === 0) throw new Error("aucune rareté ne peut s'éveiller");
  for (const [rarete, mult] of Object.entries(regles.raretes)) {
    if (!raretes.includes(rarete)) throw new Error(`rareté d'éveil inconnue "${rarete}"`);
    if (!(typeof mult === "number" && mult > 0)) throw new Error(`multiplicateur d'éveil invalide pour ${rarete}`);
  }
  if (!(typeof regles.bonusParNiveauPct === "number" && regles.bonusParNiveauPct >= 0)) throw new Error("bonus d'éveil invalide");
  if (!estRessourceJoueur(regles.ressource)) throw new Error(`ressource d'éveil inconnue "${regles.ressource}"`);
  for (const [id, c] of Object.entries(competences)) {
    for (const niveau of niveauxAmelioration(c)) {
      if (niveau > regles.niveauMax) throw new Error(`la compétence ${id} s'améliore au niveau ${niveau}, au-delà du maximum`);
    }
  }
}

validerEveil(EVEIL);

export function peutEveiller(rarete, regles = EVEIL) {
  return typeof rarete === "string" && Object.hasOwn(regles.raretes, rarete);
}

// Coût de la montée du niveau `niveau` au suivant (arrondi), ou null (rareté non éveillable, niveau maximal).
export function coutEveil(rarete, niveau, regles = EVEIL) {
  if (!peutEveiller(rarete, regles) || !Number.isInteger(niveau) || niveau < 1 || niveau >= regles.niveauMax) return null;
  return Math.round(regles.couts[niveau - 1] * regles.raretes[rarete]);
}

// Bonus de PV, ATK et DEF (en %) au niveau d'éveil donné : 0 au niveau 1.
export function bonusEveilPct(niveau, regles = EVEIL) {
  const n = Math.min(Math.max(1, niveau ?? 1), regles.niveauMax);
  return (n - 1) * regles.bonusParNiveauPct;
}

// Stat ajoutée par l'éveil (pourcentage de la stat de base, arrondi).
export function bonusEveil(stat, pct) {
  return Math.round((stat * pct) / 100);
}

// Détail des niveaux d'éveil d'une espèce, pour la fiche du Monkeydex : pour chaque niveau, le bonus de stats total,
// le coût pour l'atteindre depuis le précédent (null au niveau 1) et la compétence avec ses réglages à ce niveau :
// au niveau 1 (compétence de base) et aux niveaux qui l'améliorent, null ailleurs (ou si le singe n'en a pas).
export function paliersEveil(espece, regles = EVEIL, competences = COMPETENCES) {
  if (!peutEveiller(espece?.rarete, regles)) return [];
  return Array.from({ length: regles.niveauMax }, (_, i) => {
    const niveau = i + 1;
    return {
      niveau,
      bonusPct: bonusEveilPct(niveau, regles),
      cout: niveau === 1 ? null : coutEveil(espece.rarete, niveau - 1, regles),
      competence: niveau === 1 || ameliorationCompetence(espece, niveau, competences)
        ? competenceDe(espece, niveau, competences) : null,
    };
  });
}

// Le niveau d'éveil `niveau` améliore-t-il la compétence de cette espèce ?
export function ameliorationCompetence(espece, niveau, competences = COMPETENCES) {
  const c = espece?.competence ? competences[espece.competence] : null;
  return !!c?.actif && niveauxAmelioration(c).includes(niveau);
}
