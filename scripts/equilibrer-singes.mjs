// Équilibre les stats de src/data/monkeys.json : tous les singes d'une même rareté ont la même puissance
// (voir src/game/puissance.js), au niveau 1 comme au niveau 10, quelle que soit leur répartition PV / ATK / DEF.
// Les proportions de chaque singe (sa base et sa croissance) sont conservées ; seule leur échelle change.
// Les stats secondaires (spd, prec, esq, crit, critdmg) ne sont pas touchées.
//
// Usage : node scripts/equilibrer-singes.mjs          (réécrit le fichier)
//         node scripts/equilibrer-singes.mjs --verifier (n'écrit rien, signale les écarts)
// À relancer après l'ajout d'un singe : renseigner sa rareté et des stats de la forme voulue,
// le script les met à l'échelle de sa rareté.
import fs from "node:fs";
import { puissance, puissanceCible } from "../src/game/puissance.js";

const FICHIER = new URL("../src/data/monkeys.json", import.meta.url);
const CORE = ["hp", "atk", "def"];

function noyau(stats, k = 1) {
  return { hp: stats.hp * k, atk: stats.atk * k, def: stats.def * k };
}

// Cherche par dichotomie le coefficient qui amène `f(k)` à `cible` (f croissante).
function resoudre(f, cible) {
  let bas = 0.001, haut = 1000;
  for (let i = 0; i < 80; i++) {
    const mid = (bas + haut) / 2;
    if (f(mid) < cible) bas = mid; else haut = mid;
  }
  return (bas + haut) / 2;
}

export function equilibrer(singe) {
  const { base, croissance, rarete } = singe;
  const k = resoudre((x) => puissance(noyau(base, x), rarete), puissanceCible(rarete, 1));
  const nouvelleBase = { ...base };
  for (const s of CORE) nouvelleBase[s] = Math.max(1, Math.round(base[s] * k));

  const nouvelleCroissance = { ...croissance };
  if (CORE.some((s) => croissance[s] > 0)) {
    const cible10 = puissanceCible(rarete, 10);
    const c = resoudre(
      (x) => puissance({
        hp: nouvelleBase.hp + 9 * x * croissance.hp,
        atk: nouvelleBase.atk + 9 * x * croissance.atk,
        def: nouvelleBase.def + 9 * x * croissance.def,
      }, rarete, 10),
      cible10
    );
    for (const s of CORE) nouvelleCroissance[s] = Math.round(croissance[s] * c);
  }
  return { base: nouvelleBase, croissance: nouvelleCroissance };
}

const STATS = ["hp", "atk", "def", "spd", "prec", "esq", "crit", "critdmg"];
const ligne = (nom, o, fin) => `    "${nom}": { ${STATS.map((s) => `"${s}": ${o[s]}`).join(", ")} }${fin}`;

// Réécrit les seules lignes "base" et "croissance" du fichier : la mise en forme du reste est conservée.
export function ecrireStats(donnees, texte) {
  const sortie = [];
  let id = null;
  for (const l of texte.split("\n")) {
    const m = l.match(/^  "(\w+)": \{\s*$/);
    if (m) id = m[1];
    if (id && /^\s+"base":/.test(l)) sortie.push(ligne("base", donnees[id].base, l.trimEnd().endsWith(",") ? "," : ""));
    else if (id && /^\s+"croissance":/.test(l)) sortie.push(ligne("croissance", donnees[id].croissance, l.trimEnd().endsWith(",") ? "," : ""));
    else sortie.push(l);
  }
  return sortie.join("\n");
}

if (import.meta.url === new URL(process.argv[1], "file:///").href || process.argv[1]?.endsWith("equilibrer-singes.mjs")) {
  const texte = fs.readFileSync(FICHIER, "utf8");
  const donnees = JSON.parse(texte);
  let ecarts = 0;
  for (const [id, s] of Object.entries(donnees)) {
    const e = equilibrer(s);
    const avant = puissance(noyau(s.base), s.rarete);
    if (Math.abs(avant - puissanceCible(s.rarete, 1)) / avant > 0.01) ecarts++;
    donnees[id] = { ...s, ...e };
  }
  if (process.argv.includes("--verifier")) {
    console.log(ecarts === 0 ? "tous les singes sont équilibrés" : `${ecarts} singe(s) hors de leur puissance cible`);
    process.exit(ecarts === 0 ? 0 : 1);
  }
  fs.writeFileSync(FICHIER, ecrireStats(donnees, texte));
  console.log(`${Object.keys(donnees).length} singes équilibrés (${ecarts} modifiés de plus de 1 %)`);
}
