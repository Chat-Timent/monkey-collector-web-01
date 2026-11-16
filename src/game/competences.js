// Compétences des singes : effets passifs propres à une espèce (champ "competence" de monkeys.json).
// Données dans src/data/competences.json ; une compétence dont "actif" vaut false est ignorée en combat.
import fs from "node:fs";

export const COMPETENCES = JSON.parse(fs.readFileSync(new URL("../data/competences.json", import.meta.url), "utf8"));

// Compétence active d'une espèce, prête pour le moteur de combat ({ id, nom, icone, ...réglages }), ou null.
export function competenceDe(espece, donnees = COMPETENCES) {
  const id = espece?.competence;
  const c = id ? donnees[id] : null;
  if (!c || !c.actif) return null;
  const { actif, ...reglages } = c;
  return { id, ...reglages };
}
