// Calibrage des traits par simulation de vrais combats (voir src/game/resonances.js, src/data/resonances.json).
//
// Pour chaque trait et chaque palier (2, 4, 6 porteurs dans une équipe de 6), on mesure sa « puissance équivalente » :
// l'équipe avec le trait affronte la même équipe sans trait, dont les PV, l'ATK et la DEF de tous les singes sont
// multipliés par (1 + k). On cherche par dichotomie le k qui donne 50 % de victoires : c'est ce que vaut le trait,
// en % de stats sur toute l'équipe. Renforcement (+x % de stats aux porteurs) sert de référence : un trait bien calibré
// vaut à peu près autant que Renforcement au même palier (rapport proche de 1).
// Mêmes équipes et mêmes tirages du hasard pour chaque k (nombres aléatoires communs) : la courbe est lisse.
// Chaque combat est joué des deux côtés (camp A puis camp B) pour annuler l'avantage de frapper en premier.
//
// Usage : node scripts/calibrer-traits.mjs [--rarete rare] [--niveau 6] [--combats 2000] [--traits chaos,rempart] [--bonus 0.25]
import { pathToFileURL } from "node:url";
import { combat } from "../src/game/combat-engine.js";
import { SINGES, statsFinales } from "../src/game/monkeys.js";
import { competenceDe } from "../src/game/competences.js";
import { RESONANCES, appliquerResonances, resonancesAvecBonus } from "../src/game/resonances.js";

function generateur(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Scénarios fixes : 6 espèces de la rareté tirées au hasard, porteurs à des places au hasard, graine du combat.
function scenarios(nbPorteurs, { rarete, combats }) {
  const especes = Object.entries(SINGES).filter(([, e]) => e.rarete === rarete);
  if (especes.length === 0) throw new Error(`aucun singe de rareté ${rarete}`);
  const rnd = generateur(1000 + nbPorteurs);
  return Array.from({ length: combats }, () => {
    const equipe = Array.from({ length: 6 }, () => especes[Math.floor(rnd() * especes.length)]);
    const places = [0, 1, 2, 3, 4, 5].sort(() => rnd() - 0.5).slice(0, nbPorteurs);
    return { equipe, places, graine: Math.floor(rnd() * 2 ** 31) };
  });
}

function singe([id, e], niveau, traits) {
  return { id, nom: e.nom, ...statsFinales(e, niveau), perk: null, competence: competenceDe(e), traits };
}

// Part de victoires (nul = 1/2) de l'équipe portant `trait` contre la même équipe sans trait, stats × (1 + k).
function partVictoires(trait, liste, k, donnees, niveau) {
  let total = 0;
  for (const { equipe, places, graine } of liste) {
    const avec = appliquerResonances(equipe.map((e, i) => singe(e, niveau, places.includes(i) ? [trait] : [])), donnees).equipe;
    const contre = equipe.map((e) => {
      const s = singe(e, niveau, []);
      return { ...s, hp: Math.round(s.hp * (1 + k)), atk: Math.round(s.atk * (1 + k)), def: Math.round(s.def * (1 + k)) };
    });
    const a = combat(avec, contre, generateur(graine)).vainqueur;
    const b = combat(contre, avec, generateur(graine + 1)).vainqueur;
    total += (a === "A" ? 1 : a === null ? 0.5 : 0) + (b === "B" ? 1 : b === null ? 0.5 : 0);
  }
  return total / (2 * liste.length);
}

// Puissance équivalente (en part de 1) du trait avec `nbPorteurs` porteurs sur 6 : le k qui ramène à 50 % de victoires.
export function puissanceEquivalente(trait, nbPorteurs, { donnees = RESONANCES, rarete = "rare", niveau = 6, combats = 2000 } = {}) {
  const liste = scenarios(nbPorteurs, { rarete, combats });
  let bas = -0.5, haut = 2;
  for (let i = 0; i < 16; i++) {
    const mid = (bas + haut) / 2;
    if (partVictoires(trait, liste, mid, donnees, niveau) > 0.5) bas = mid; else haut = mid;
  }
  return (bas + haut) / 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((paires, a, i, t) => (a.startsWith("--") ? [...paires, [a.slice(2), t[i + 1]]] : paires), []));
  const options = {
    rarete: args.rarete ?? "rare",
    niveau: Number(args.niveau ?? 6),
    combats: Number(args.combats ?? 2000),
    donnees: resonancesAvecBonus(Number(args.bonus ?? 0), RESONANCES),
  };
  const traits = args.traits ? args.traits.split(",") : Object.keys(options.donnees.traits);
  const paliers = options.donnees.paliers;
  console.log(`Rareté ${options.rarete}, niveau ${options.niveau}, ${options.combats} × 2 combats par mesure${args.bonus ? `, bonus de résonance +${args.bonus * 100} %` : ""}`);
  const mesurer = (trait) => paliers.map((n) => puissanceEquivalente(trait, n, options));
  const resultats = Object.fromEntries(traits.map((t) => [t, mesurer(t)]));
  const reference = resultats.renforcement ?? mesurer("renforcement");
  const pct = (x) => `${(x * 100).toFixed(1).replace(".", ",")} %`;
  console.log(`\n${"Trait".padEnd(18)}${paliers.map((n) => `${n} porteurs`.padStart(18)).join("")}`);
  for (const trait of traits) {
    const cases = resultats[trait].map((k, i) => `${pct(k)} (${(k / reference[i]).toFixed(2).replace(".", ",")})`.padStart(18));
    console.log(`${options.donnees.traits[trait].nom.padEnd(18)}${cases.join("")}`);
  }
  console.log("\nPuissance équivalente : % de PV, ATK et DEF sur toute l'équipe qui vaut autant que le trait ; entre parenthèses, rapport à Renforcement.");
}
