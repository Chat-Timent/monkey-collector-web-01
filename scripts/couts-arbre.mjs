// Affiche le coût de chaque nœud de l'arbre (src/data/skills.json) à côté du coût attendu
// d'après sa profondeur, ainsi que le total en points, en XP et en heures de tirages.
// À lancer après avoir ajouté ou déplacé un nœud : node scripts/couts-arbre.mjs
// Code de sortie 1 si un coût ne suit pas la courbe.
import { ARBRE, COURBE_COUTS, coutAttendu, estGratuit, profondeurs } from "../src/game/starter-arbre.js";

const XP_PAR_HEURE = 3300; // environ 2 tirages par minute à ~27 XP
const prof = profondeurs();
let total = 0;
let ecarts = 0;
const lignes = [];

for (const [id, n] of Object.entries(ARBRE)) {
  if (estGratuit(n)) continue;
  const attendu = coutAttendu(id, ARBRE, prof);
  const ok = attendu === n.cout;
  if (!ok) ecarts++;
  total += n.cout;
  lignes.push({
    noeud: `${n.nom} (${id})`,
    profondeur: prof[id],
    mult: n.multiplicateur ?? 1,
    cout: n.cout,
    attendu: attendu ?? "hors courbe",
    "": ok ? "" : "⚠",
  });
}

lignes.sort((a, b) => a.profondeur - b.profondeur || a.noeud.localeCompare(b.noeud));
console.table(lignes);
// Niveau L : 50·L·(L−1) XP au total ; il faut total + 1 niveaux pour dépenser `total` points
const xp = 50 * (total + 1) * total;
console.log(`Courbe : ${COURBE_COUTS.join(", ")}`);
console.log(`Total : ${total} points, niveau ${total + 1}, ${xp.toLocaleString("fr-FR")} XP, ${Math.round(xp / XP_PAR_HEURE)} h de tirages continus`);
if (ecarts > 0) {
  console.log(`${ecarts} nœud(s) dont le coût ne suit pas la courbe (⚠)`);
  process.exitCode = 1;
}
