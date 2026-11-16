// Compétences des singes : effets passifs propres à une espèce (champ "competence" de monkeys.json).
// Données dans src/data/competences.json ; une compétence dont "actif" vaut false est ignorée en combat.
// Champ "eveil" : réglages remplacés à partir d'un niveau d'éveil ({ "3": { "critMult": 2.8 }, "6": {...} }),
// cumulés dans l'ordre des niveaux.
import fs from "node:fs";

export const COMPETENCES = JSON.parse(fs.readFileSync(new URL("../data/competences.json", import.meta.url), "utf8"));

// Niveaux d'éveil qui améliorent une compétence, dans l'ordre (ex. [3, 6]).
export function niveauxAmelioration(c) {
  return Object.keys(c?.eveil ?? {}).map(Number).sort((a, b) => a - b);
}

// Vérifie le JSON au chargement : un réglage d'éveil doit remplacer un réglage numérique existant.
export function validerCompetences(donnees) {
  for (const [id, c] of Object.entries(donnees)) {
    if (typeof c.nom !== "string" || typeof c.icone !== "string") throw new Error(`nom ou icône manquant dans la compétence ${id}`);
    if (typeof c.actif !== "boolean") throw new Error(`interrupteur "actif" manquant dans la compétence ${id}`);
    for (const [niveau, reglages] of Object.entries(c.eveil ?? {})) {
      if (!/^\d+$/.test(niveau) || Number(niveau) < 2) throw new Error(`niveau d'éveil invalide "${niveau}" dans la compétence ${id}`);
      for (const [cle, valeur] of Object.entries(reglages)) {
        if (typeof c[cle] !== "number") throw new Error(`réglage d'éveil inconnu "${cle}" dans la compétence ${id}`);
        if (!Number.isFinite(valeur)) throw new Error(`valeur d'éveil invalide pour "${cle}" dans la compétence ${id}`);
      }
    }
  }
}

validerCompetences(COMPETENCES);

// Compétence active d'une espèce, prête pour le moteur de combat ({ id, nom, icone, ...réglages }), ou null.
// `niveauEveil` : les améliorations des niveaux atteints remplacent les réglages de base.
export function competenceDe(espece, niveauEveil = 1, donnees = COMPETENCES) {
  const id = espece?.competence;
  const c = id ? donnees[id] : null;
  if (!c || !c.actif) return null;
  const { actif, eveil, ...reglages } = c;
  for (const niveau of niveauxAmelioration(c)) {
    if (niveau <= niveauEveil) Object.assign(reglages, eveil[niveau]);
  }
  return { id, ...reglages };
}
