// Rareté Prismatique, Shiny Monkey et compétence Lumière rasante : données, mécanique de combat avec `hasard` injecté, éveil.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { combat, degatsDe } from "../src/game/combat-engine.js";
import { RARETES, PALIERS } from "../src/constants/game.js";
import { SINGES, estNotable, estRare, getEspece, getNiveau, poidsRaretes, tirer, tirerRarete } from "../src/game/monkeys.js";
import { COMPETENCES, competenceDe, validerCompetences, validerCompetencesSinges } from "../src/game/competences.js";
import { validerTraitsSinges } from "../src/game/resonances.js";
import { ameliorationCompetence, coutEveil, paliersEveil, peutEveiller } from "../src/game/eveil.js";
import { FACTEUR_PRISMATIQUE, facteurRarete, puissance, puissanceCible, statsAuNiveau } from "../src/game/puissance.js";
import { RARETES_AUTO, passeFiltre, reglageAutoValide } from "../src/game/tirage-auto.js";
import { gainsDuTirage } from "../src/game/progression.js";
import { agregerEffets } from "../src/game/starter-arbre.js";
import { decrireRecompense } from "../src/game/quotidien.js";
import { singeDeCombat } from "../src/services/combat-service.js";

const singe = (nom, extra = {}) => ({ nom, hp: 1000, atk: 100, def: 100, spd: 1, prec: 0, esq: 0, crit: 0, critdmg: 150, perk: null, ...extra });
const shiny = getEspece("shiny_monkey");
const lumiere = competenceDe(shiny);
const porteur = (extra = {}) => singe("Shiny", { hp: 1e6, competence: lumiere, ...extra });
const coups = (r, de, filtre = () => true) => r.journal.filter((e) => e.type === "degats" && e.de === de && filtre(e));
// Hasard rejoué : les valeurs données, puis `ensuite`
const suite = (valeurs, ensuite = 0) => { let i = 0; return () => (i < valeurs.length ? valeurs[i++] : ensuite); };
const bonus = (e) => (e.lumiere ? e.lumiere.pct : 0);
const avecBonus = (base, pct) => Math.round(base * (1 + pct / 100));

// ---------- 1. Cumul ----------

test("Lumière rasante : +7 % par attaque successive sur la même cible, plafonné à 5 cumuls (+35 %)", () => {
  const jouer = () => combat([porteur()], [singe("Sac", { hp: 1e7, atk: 1 })], () => 0);
  const r = jouer();
  const c = coups(r, "Shiny").slice(0, 8);
  assert.deepEqual(c.map((e) => e.lumiere ?? null), [
    null,
    { cumul: 1, pct: 7 }, { cumul: 2, pct: 14 }, { cumul: 3, pct: 21 }, { cumul: 4, pct: 28 },
    { cumul: 5, pct: 35 }, { cumul: 5, pct: 35 }, { cumul: 5, pct: 35 },
  ]);
  const base = degatsDe(100, 100); // 50
  assert.deepEqual(c.map((e) => e.degats), [0, 7, 14, 21, 28, 35, 35, 35].map((p) => avecBonus(base, p)));
  // Aucun événement en plus : un coup = un événement de dégâts
  assert.equal(r.journal.filter((e) => e.type === "degats").length, 2 * r.tours);
  // Déterministe avec le même hasard
  assert.deepEqual(jouer(), r);
  // Sans la compétence : aucun champ lumiere
  const sans = combat([singe("Shiny", { hp: 1e6 })], [singe("Sac", { hp: 1e7, atk: 1 })], () => 0);
  assert.ok(sans.journal.every((e) => e.lumiere === undefined));
});

// ---------- 2. Reset ----------

test("Lumière rasante : le cumul retombe à 0 quand la cible change", () => {
  // Par tour : Shiny (cible, toucher, critique) puis X et Y (3 appels chacun) = 9 appels ; seul le choix de cible de Shiny varie
  const cibles = [0, 0, 0, 0.6, 0.6, 0, 0];
  let i = 0;
  const hasard = () => { const n = i++; return n % 9 === 0 ? (cibles[Math.floor(n / 9)] ?? 0) : 0; };
  const r = combat([porteur()], [singe("X", { hp: 1e7, atk: 1 }), singe("Y", { hp: 1e7, atk: 1 })], hasard);
  const c = coups(r, "Shiny").slice(0, 7);
  assert.deepEqual(c.map((e) => e.sur), ["X", "X", "X", "Y", "Y", "X", "X"]);
  assert.deepEqual(c.map(bonus), [0, 7, 14, 0, 7, 0, 7]);
});

test("Lumière rasante : le cumul retombe à 0 quand la cible meurt", () => {
  // Faible (200 PV) tombe au 4e coup (50 + 54 + 57 + 61) ; Shiny passe à Gros sans bonus
  const r = combat([porteur()], [singe("Faible", { hp: 200, atk: 1 }), singe("Gros", { hp: 1e7, atk: 1 })], () => 0);
  const c = coups(r, "Shiny").slice(0, 7);
  assert.deepEqual(c.map((e) => e.sur), ["Faible", "Faible", "Faible", "Faible", "Gros", "Gros", "Gros"]);
  assert.equal(c[3].pvRestants, 0);
  assert.deepEqual(c.map(bonus), [0, 7, 14, 21, 0, 7, 14]);
});

test("Lumière rasante : un raté sur la même cible garde le cumul, un raté sur une autre cible le remet à 0", () => {
  // Une seule cible : tour 1 touché, tour 2 raté (pas de jet de critique), tour 3 touché → +7 % (le raté n'a rien fait monter)
  const meme = combat([porteur()], [singe("Sac", { hp: 1e7, atk: 1 })], suite([0, 0, 0, 0, 0, 0, 0, 0.99, 0, 0, 0]));
  assert.deepEqual(meme.journal.filter((e) => e.de === "Shiny").slice(0, 4).map((e) => [e.type, bonus(e)]),
    [["degats", 0], ["rate", 0], ["degats", 7], ["degats", 14]]);
  // Deux cibles : tour 1 sur X, tour 2 raté sur Y, tour 3 sur X → pas de bonus
  const autre = combat([porteur()], [singe("X", { hp: 1e7, atk: 1 }), singe("Y", { hp: 1e7, atk: 1 })],
    suite([0, 0, 0, 0, 0, 0, 0, 0, 0, /* tour 2 */ 0.6, 0.99, 0, 0, 0, 0, 0, 0]));
  assert.deepEqual(autre.journal.filter((e) => e.de === "Shiny").slice(0, 4).map((e) => [e.type, e.sur, bonus(e)]),
    [["degats", "X", 0], ["rate", "Y", 0], ["degats", "X", 0], ["degats", "X", 7]]);
});

// ---------- 3. Éveil ----------

test("Lumière rasante : réglages, 9 % à l'éveil 3 et 6 cumuls à l'éveil 6", () => {
  assert.deepEqual(lumiere, { id: "lumiere_rasante", nom: "Lumière rasante", icone: "✨", degatsPct: 7, cumulMax: 5 });
  // Capacité passive : pas de cooldown
  assert.equal(COMPETENCES.lumiere_rasante.tousLes, undefined);
  assert.equal(COMPETENCES.lumiere_rasante.actif, true);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => competenceDe(shiny, n).degatsPct), [7, 7, 9, 9, 9, 9]);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => competenceDe(shiny, n).cumulMax), [5, 5, 5, 5, 5, 6]);
  assert.ok(ameliorationCompetence(shiny, 3) && ameliorationCompetence(shiny, 6) && !ameliorationCompetence(shiny, 2));
  assert.deepEqual(paliersEveil(shiny).map((p) => p.competence?.degatsPct ?? null), [7, null, 9, null, null, 9]);
  assert.deepEqual(paliersEveil(shiny).map((p) => p.competence?.cumulMax ?? null), [5, null, 5, null, null, 6]);
  // Singe de combat d'un joueur : la compétence suit son niveau d'éveil
  const s = singeDeCombat("shiny_monkey", shiny, 1, { effets: agregerEffets([]), eveil: 6 });
  assert.deepEqual([s.competence.degatsPct, s.competence.cumulMax], [9, 6]);
  // En combat, à l'éveil 6 : jusqu'à 6 cumuls de 9 % (+54 %)
  const r = combat([porteur({ competence: competenceDe(shiny, 6) })], [singe("Sac", { hp: 1e7, atk: 1 })], () => 0);
  assert.deepEqual(coups(r, "Shiny").slice(0, 9).map(bonus), [0, 9, 18, 27, 36, 45, 54, 54, 54]);
  // Éveil 3 : 9 % par cumul, toujours 5 cumuls au plus
  const r3 = combat([porteur({ competence: competenceDe(shiny, 3) })], [singe("Sac", { hp: 1e7, atk: 1 })], () => 0);
  assert.deepEqual(coups(r3, "Shiny").slice(0, 8).map(bonus), [0, 9, 18, 27, 36, 45, 45, 45]);
});

// ---------- 4. Ordre de calcul ----------

test("Lumière rasante : après le critique, avant Tueurs de géant et Rempart", () => {
  const r = combat(
    [porteur({ crit: 100, critdmg: 200, effetsTraits: { tueurs_de_geant: { pvMaxPct: 1, plafondAtkPct: 100 } } })],
    [singe("Mur", { hp: 1e7, atk: 1, effetsTraits: { rempart: { reductionBase: 10, reductionBonus: 0 } } })],
    () => 0
  );
  const [premier, second] = coups(r, "Shiny");
  // 50 → critique ×2 = 100 → Lumière ×1,07 = 107 → + Tueurs de géant min(1 % de 1e7, 100 % de 100 ATK) = 100 → 207 → Rempart −10 %
  assert.equal(premier.degats, Math.round((100 + 100) * 0.9));
  assert.equal(second.degats, Math.round((107 + 100) * 0.9));
  assert.equal(second.degats, 186);
  assert.ok(second.critique);
  // Ordres écartés : Lumière après Tueurs de géant (193) ou avant le critique (176)
  assert.notEqual(second.degats, Math.round(Math.round(200 * 1.07) * 0.9));
  assert.notEqual(second.degats, Math.round((Math.round(50 * 1.07) * 2 + 100) * 0.9));
});

// ---------- 5. Chaos ----------

test("Lumière rasante : la seconde frappe de Chaos profite du bonus mais ne touche ni au cumul ni à la cible", () => {
  // Par tour : Shiny (cible, toucher, critique, jet de Chaos, cible de Chaos) = 5 appels, puis X et Y (3 chacun) = 11 ;
  // la seconde frappe vise toujours Y, la première toujours X
  let i = 0;
  const hasard = () => (i++ % 11 === 4 ? 0.99 : 0);
  const r = combat(
    [porteur({ effetsTraits: { chaos: { chance: 100, partDegats: 20 } } })],
    [singe("X", { hp: 1e7, atk: 1 }), singe("Y", { hp: 1e7, atk: 1 })],
    hasard
  );
  const principaux = coups(r, "Shiny", (e) => !e.doubleFrappe).slice(0, 7);
  const secondes = coups(r, "Shiny", (e) => e.doubleFrappe).slice(0, 7);
  assert.ok(principaux.every((e) => e.sur === "X") && secondes.every((e) => e.sur === "Y"));
  assert.deepEqual(principaux.map(bonus), [0, 7, 14, 21, 28, 35, 35]);
  // La seconde frappe ne porte pas d'indication Lumière, et vaut 20 % des dégâts de la première (bonus compris)
  assert.ok(secondes.every((e) => e.lumiere === undefined));
  assert.deepEqual(secondes.map((e) => e.degats), principaux.map((e) => Math.round(e.degats * 0.2)));
});

// ---------- 6. Porteur mort ou hors rotation ----------

test("Lumière rasante : rien depuis la réserve ni après la mort du porteur", () => {
  // Shiny en slot 4 (réserve) : il n'attaque qu'une fois Fragile tombé, et repart d'un cumul vierge
  const r = combat(
    [singe("Fragile", { hp: 100, atk: 1 }), null, null, porteur({ hp: 3000 })],
    [singe("Brute", { hp: 1e7, atk: 1000, def: 100 })],
    () => 0
  );
  const ko = r.journal.findIndex((e) => e.type === "KO" && e.nom === "Fragile");
  assert.ok(ko > 0);
  assert.ok(r.journal.slice(0, ko).every((e) => e.de !== "Shiny"));
  const c = coups(r, "Shiny");
  assert.ok(c.length >= 2);
  assert.deepEqual(c.slice(0, 2).map(bonus), [0, 7]);
  // Brute (909 par coup) met Shiny K.O. : plus aucun coup de lui ensuite
  const mort = r.journal.findIndex((e) => e.type === "KO" && e.nom === "Shiny");
  assert.ok(mort > ko);
  assert.ok(r.journal.slice(mort).every((e) => e.de !== "Shiny"));
});

// ---------- 7. Rareté Prismatique ----------

test("Prismatique : 1/5000 au tirage, facteur 2,0125, puissance 1199, autres raretés inchangées", () => {
  assert.deepEqual(RARETES.at(-1), { id: 7, nom: "prismatic", poids: 1 / 5000 });
  assert.equal(PALIERS.prismatic, 1);
  assert.ok(Math.abs(FACTEUR_PRISMATIQUE - 2.0125) < 1e-12);
  assert.ok(Math.abs(facteurRarete("prismatic") - 2.0125) < 1e-12);
  assert.equal(Math.round(puissanceCible("prismatic")), 1199);
  assert.equal(Math.round(puissanceCible("mythic")), 1043);
  // +15 % réels sur Mythique
  assert.ok(Math.abs(puissanceCible("prismatic") / puissanceCible("mythic") - 1.15) < 1e-12);
  // Les six autres raretés gardent 1 + 0,15 × rang
  assert.deepEqual(["common", "uncommon", "rare", "epic", "legendary", "mythic"].map((r) => Math.round(facteurRarete(r) * 100)), [100, 115, 130, 145, 160, 175]);
  assert.ok(estRare("prismatic") && estNotable("prismatic"));
  assert.deepEqual(getNiveau("prismatic", 5), getNiveau("legendary", 5));
  assert.deepEqual(gainsDuTirage("prismatic", agregerEffets(["farm.loterie_coins"]), () => 0), { xp: 7500, coins: 3750, copieBonus: false });
  // Éveil : comme les légendaires et mythiques, coûts ×2
  assert.ok(peutEveiller("prismatic"));
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => coutEveil("prismatic", n)), [200, 400, 800, 1600, 3200, null]);
  assert.equal(paliersEveil(shiny).length, 6);
  // Récompense quotidienne : plus haute rareté, donc pas de « ou mieux »
  assert.deepEqual(decrireRecompense({ singe: "prismatic" }), [{ icone: "🐒", valeur: "Prismatique", nom: "singe prismatique" }]);
  assert.equal(decrireRecompense({ singe: "mythic" })[0].nom, "singe mythique ou mieux");
});

test("Prismatique : tirage avec un seul singe dans la rareté, et filtres « ou mieux »", () => {
  assert.deepEqual(Object.keys(SINGES).filter((id) => SINGES[id].rarete === "prismatic"), ["shiny_monkey"]);
  // Tout en haut du tirage : prismatique ; rareté minimale prismatique : seule rareté gardée
  assert.equal(tirerRarete(null, { hasard: () => 0.99999 }), "prismatic");
  assert.deepEqual(poidsRaretes(null, { rareteMin: "prismatic" }).map((r) => r.nom), ["prismatic"]);
  for (const h of [0, 0.5, 0.9999]) assert.equal(tirerRarete(null, { rareteMin: "prismatic", hasard: () => h }), "prismatic");
  for (let i = 0; i < 20; i++) assert.equal(tirer(null, { rareteMin: "prismatic" }), "shiny_monkey");
  // Étincelle : prismatique fait partie des raretés forcées
  assert.ok(poidsRaretes(null, { forcerRare: true }).some((r) => r.nom === "prismatic"));
  // Auto-tirage : on peut viser « prismatique » ; un prismatique passe tous les filtres, un mythique ne passe pas « prismatique »
  assert.equal(RARETES_AUTO.at(-1), "prismatic");
  assert.ok(reglageAutoValide(1, "prismatic"));
  for (const filtre of RARETES_AUTO) assert.ok(passeFiltre("prismatic", filtre), filtre);
  assert.ok(passeFiltre("prismatic", "prismatic"));
  assert.ok(!passeFiltre("mythic", "prismatic") && !passeFiltre("legendary", "prismatic"));
  // Pages : même liste de filtres que le serveur, et un libellé et une couleur pour chaque rareté
  const tirage = fs.readFileSync(new URL("../public/tirage.html", import.meta.url), "utf8");
  assert.ok(tirage.includes(`const RARETES_AUTO = ${JSON.stringify(RARETES_AUTO).replaceAll(",", ", ")};`));
  const commun = fs.readFileSync(new URL("../public/js/commun.js", import.meta.url), "utf8");
  for (const r of RARETES) assert.match(commun, new RegExp(`\\n  ${r.nom}:\\s+\\{ label: "[^"]+",\\s+couleur: "#[0-9A-Fa-f]{6}" \\}`), r.nom);
  assert.match(commun, /prismatic: \{ label: "Prismatique", couleur: "#FFB3E0" \}/);
  assert.ok(fs.existsSync(new URL("../public/images/MonkeysRarities/rarity_prismatic.png", import.meta.url)));
});

// ---------- 8. Données de Shiny Monkey ----------

test("Shiny Monkey : id 58, rareté, traits et compétence connus, stats fournies à la puissance de sa rareté", () => {
  assert.equal(shiny.id, 58);
  const ids = Object.values(SINGES).map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(shiny.nom === "Shiny Monkey" && shiny.description);
  assert.ok(RARETES.some((r) => r.nom === shiny.rarete));
  assert.equal(shiny.rarete, "prismatic");
  assert.deepEqual(shiny.traits, ["chaos", "tueurs_de_geant"]);
  assert.equal(shiny.competence, "lumiere_rasante");
  validerTraitsSinges({ shiny_monkey: shiny });
  validerCompetencesSinges({ shiny_monkey: shiny });
  validerCompetences(COMPETENCES);
  assert.throws(() => validerCompetences({ x: { ...COMPETENCES.lumiere_rasante, eveil: { 3: { tousLes: 2 } } } }), /réglage d'éveil inconnu/);
  assert.deepEqual(shiny.base, { hp: 3411, atk: 828, def: 336, spd: 124, prec: 20, esq: 12, crit: 13, critdmg: 175 });
  assert.deepEqual(shiny.croissance, { hp: 106, atk: 58, def: 25, spd: 2, prec: 2, esq: 1, crit: 0, critdmg: 0 });
  // Puissance : 1199 au niveau 1 (±0,1 %), et au plus +0,13 % au niveau 10 (stats fournies, non retouchées)
  const p1 = puissance(statsAuNiveau(shiny, 1), "prismatic", 1);
  assert.ok(Math.abs(p1 - puissanceCible("prismatic", 1)) / puissanceCible("prismatic", 1) < 0.001, p1);
  const p10 = puissance(statsAuNiveau(shiny, 10), "prismatic", 10);
  assert.ok(Math.abs(p10 - puissanceCible("prismatic", 10)) / puissanceCible("prismatic", 10) < 0.0013, p10);
  // Icône présente
  assert.ok(fs.existsSync(new URL("../public/images/MonkeysIcons/shiny_monkey.png", import.meta.url)));
});
