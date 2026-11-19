// Singes 51 à 57 et compétence Arc-en-ciel protecteur (bouclier) : données, mécanique de combat avec `hasard` injecté, éveil.
import assert from "node:assert/strict";
import test from "node:test";
import { combat, degatsDe } from "../src/game/combat-engine.js";
import { RESONANCES, appliquerResonances, resonancesAvecBonus, validerTraitsSinges } from "../src/game/resonances.js";
import { SINGES, getEspece } from "../src/game/monkeys.js";
import { COMPETENCES, competenceDe, validerCompetencesSinges } from "../src/game/competences.js";
import { ameliorationCompetence, paliersEveil } from "../src/game/eveil.js";
import { puissance, puissanceCible, statsAuNiveau } from "../src/game/puissance.js";
import { generateur } from "../src/game/aventure.js";
import { agregerEffets } from "../src/game/starter-arbre.js";
import { effetPerk } from "../src/game/perks.js";
import { dureeReplayMs, singeDeCombat } from "../src/services/combat-service.js";
import { DELAI_INITIAL_MS, PAS_MS } from "../src/constants/game.js";

const singe = (nom, extra = {}) => ({ nom, hp: 1000, atk: 100, def: 100, spd: 1, prec: 0, esq: 0, crit: 0, critdmg: 150, perk: null, ...extra });
const porteur = (nom, traits, extra = {}) => singe(nom, { traits, ...extra });
// Valeurs de référence des traits utilisés ici (palier 2 porteurs), indépendantes du calibrage du jeu
const TEST = structuredClone(RESONANCES);
TEST.traits.rempart.paliers = [{ reductionBase: 4, reductionBonus: 8 }, { reductionBase: 8, reductionBonus: 16 }, { reductionBase: 12, reductionBonus: 24 }];
TEST.traits.devouement.paliers = [{ soinPct: 12 }, { soinPct: 20 }, { soinPct: 30 }];
const pret = (equipe) => appliquerResonances(equipe, resonancesAvecBonus(0, TEST)).equipe;
const arc = competenceDe(getEspece("rainbow_monkey"));
const coups = (r, sur) => r.journal.filter((e) => e.type === "degats" && e.sur === sur);
const boucliers = (r) => r.journal.filter((e) => e.type === "bouclier");

const NOUVEAUX = ["virus_monkey", "stunned_monkey", "snail_monkey", "cactus_monkey", "cyclope_monkey", "nerd_monkey", "rainbow_monkey"];

test("nouveaux singes : ids 51 à 57, puissance de leur rareté à ±0,25 %, traits valides, stats uniques", () => {
  assert.deepEqual(NOUVEAUX.map((id) => SINGES[id]?.id), [51, 52, 53, 54, 55, 56, 57]);
  const ids = Object.values(SINGES).map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of NOUVEAUX) {
    const s = SINGES[id];
    assert.ok(s.nom && s.description, id);
    for (const niveau of [1, 10]) {
      const cible = puissanceCible(s.rarete, niveau);
      const p = puissance(statsAuNiveau(s, niveau), s.rarete, niveau);
      // Au plus +0,223 % (Cactus au niveau 10) : stats fournies équilibrées, non retouchées par le script
      assert.ok(Math.abs(p - cible) / cible < 0.0025, `${id} niveau ${niveau} : ${p.toFixed(1)} au lieu de ${cible.toFixed(1)}`);
    }
    // Croissance des stats secondaires : +1 en vitesse, précision, esquive (2/2/1 pour le mythique, comme Crystal Ball et King) ;
    // rien en critique
    const attendu = s.rarete === "mythic" ? [2, 2, 1, 0, 0] : [1, 1, 1, 0, 0];
    assert.deepEqual([s.croissance.spd, s.croissance.prec, s.croissance.esq, s.croissance.crit, s.croissance.critdmg], attendu, id);
  }
  assert.deepEqual(NOUVEAUX.map((id) => SINGES[id].rarete), ["epic", "epic", "epic", "epic", "legendary", "legendary", "mythic"]);
  assert.deepEqual(getEspece("nerd_monkey").traits, ["devouement", "renforcement"]);
  assert.equal(getEspece("rainbow_monkey").competence, "arc_en_ciel");
  // Traits connus, 1 à 3, sans doublon ; compétence connue
  validerTraitsSinges(SINGES);
  validerCompetencesSinges(SINGES);
  assert.throws(() => validerCompetencesSinges({ x: { competence: "inconnue" } }), /compétence inconnue/);
  // Aucune base ni croissance partagée avec un autre singe
  for (const cle of ["base", "croissance"]) {
    const vus = Object.values(SINGES).map((s) => JSON.stringify(s[cle]));
    assert.equal(new Set(vus).size, vus.length, cle);
  }
});

test("Arc-en-ciel protecteur : réglages, et 15 % puis 20 % aux éveils 3 et 6", () => {
  assert.deepEqual(arc, { id: "arc_en_ciel", nom: "Arc-en-ciel protecteur", icone: "🌈", tousLes: 3, bouclierPct: 12 });
  assert.equal(competenceDe(getEspece("rainbow_monkey"), 1, { arc_en_ciel: { ...COMPETENCES.arc_en_ciel, actif: false } }), null);
  const rainbow = getEspece("rainbow_monkey");
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => competenceDe(rainbow, n).bouclierPct), [12, 12, 15, 15, 15, 20]);
  assert.ok(ameliorationCompetence(rainbow, 3) && ameliorationCompetence(rainbow, 6) && !ameliorationCompetence(rainbow, 4));
  assert.deepEqual(paliersEveil(rainbow).map((p) => p.competence?.bouclierPct ?? null), [12, null, 15, null, null, 20]);
  // Singe de combat d'un joueur : la compétence suit son niveau d'éveil
  const s = singeDeCombat("rainbow_monkey", rainbow, 1, { effets: agregerEffets([]), eveil: 6 });
  assert.equal(s.competence.bouclierPct, 20);
  // Un événement de bouclier compte pour un pas de replay
  assert.equal(dureeReplayMs([{ type: "bouclier" }]), DELAI_INITIAL_MS + PAS_MS);
});

test("bouclier : Rempart réduit d'abord, le bouclier absorbe ensuite, seul le reliquat retire des PV", () => {
  const brut = degatsDe(300, 100); // 225
  const r = combat(
    pret([porteur("Arc", ["rempart"], { atk: 1, competence: arc }), porteur("Mur", ["rempart"], { atk: 1 })]),
    [singe("Brute", { atk: 300, hp: 1e6 })],
    () => 0
  );
  const sur = coups(r, "Arc");
  let pv = 1000;
  let bouclier = 0;
  let absorbes = 0;
  for (const e of r.journal) {
    if (e.type === "bouclier") bouclier = e.cibles.find((c) => c.slot === 0)?.bouclier ?? bouclier;
    if (e.type !== "degats" || e.sur !== "Arc") continue;
    const reduction = 4 + 8 * (1 - pv / 1000);
    assert.equal(e.degats, Math.max(1, Math.round(brut * (1 - reduction / 100))), `tour ${e.tour}`);
    const absorbe = Math.min(bouclier, e.degats);
    assert.equal(e.absorbe, absorbe || undefined, `tour ${e.tour}`);
    bouclier -= absorbe;
    if (absorbe) assert.equal(e.bouclierRestant, bouclier);
    assert.equal(e.pvRestants, Math.max(0, pv - (e.degats - absorbe)), `tour ${e.tour}`);
    pv = e.pvRestants;
    absorbes += absorbe;
  }
  // Tour 3 : bouclier de 12 % des PV max, entièrement absorbé par un coup plus gros que lui
  assert.deepEqual(boucliers(r)[0].cibles, [{ slot: 0, bouclier: 120 }, { slot: 1, bouclier: 120 }]);
  const tour3 = sur.find((e) => e.tour === 3);
  assert.ok(tour3.degats < brut && tour3.degats > 120);
  assert.deepEqual([tour3.absorbe, tour3.bouclierRestant], [120, 0]);
  // Chaque bouclier (tours 3 et 6) est entièrement consommé par le coup suivant
  assert.deepEqual(boucliers(r).map((e) => e.tour), [3, 6]);
  assert.equal(absorbes, 240);
  // Un coup plus petit que le bouclier ne retire aucun PV
  const petit = combat([singe("Arc", { atk: 1, competence: arc })], [singe("Chaton", { atk: 30, hp: 1e6 })], () => 0);
  const p3 = coups(petit, "Arc").find((e) => e.tour === 3);
  const p2 = coups(petit, "Arc").find((e) => e.tour === 2);
  assert.equal(p3.pvRestants, p2.pvRestants);
  assert.deepEqual([p3.absorbe, p3.bouclierRestant], [p3.degats, 120 - p3.degats]);
});

test("bouclier : recalculé à chaque lancer, sans cumul, tous les 3 tours", () => {
  // Le Sac (slot 1) prend tous les coups ; Rainbow (slot 2) garde son bouclier intact
  const r = combat(
    [singe("Sac", { hp: 1e6, atk: 1 }), singe("Arc", { atk: 1, competence: arc })],
    [singe("Brute", { atk: 300, hp: 1e7 })],
    () => 0
  );
  const b = boucliers(r);
  assert.deepEqual(b.slice(0, 4).map((e) => e.tour), [3, 6, 9, 12]);
  assert.ok(b.every((e) => e.tour % 3 === 0));
  // Même valeur à chaque lancer : 12 % des PV max, jamais 24 %
  assert.ok(b.every((e) => e.cibles.find((c) => c.slot === 1).bouclier === 120));
  assert.ok(b.every((e) => e.cibles.find((c) => c.slot === 0).bouclier === 120000));
  assert.deepEqual(b[0].competence, { nom: "Arc-en-ciel protecteur", icone: "🌈" });
  assert.equal(b[0].bouclierPct, 12);
  assert.deepEqual([b[0].de, b[0].deCamp, b[0].deSlot], ["Arc", "A", 1]);
  // Le bouclier du Sac, entamé, repart de 120000 au lancer suivant (remplacé, pas ajouté au reste)
  const avant6 = coups(r, "Sac").filter((e) => e.tour === 5).at(-1);
  const apres6 = coups(r, "Sac").find((e) => e.tour === 6);
  assert.ok(avant6.bouclierRestant < 120000);
  assert.equal(apres6.bouclierRestant, 120000 - apres6.absorbe);
});

test("bouclier : seulement si Rainbow est vivant et dans la rotation active", () => {
  // En réserve (slot 4) : rien tant que le groupe 1 est en jeu
  const reserve = combat([singe("Soldat", { hp: 1e6, atk: 1 }), null, null, singe("Arc", { atk: 1, competence: arc }), null, null], [singe("Cible", { hp: 1e6, atk: 1 })], () => 0.5);
  assert.equal(boucliers(reserve).length, 0);
  // En jeu : le réserviste ne reçoit rien
  const enJeu = combat([singe("Arc", { hp: 1e6, atk: 1, competence: arc }), null, null, singe("Réserviste"), null, null], [singe("Cible", { hp: 1e6, atk: 1 })], () => 0.5);
  assert.ok(boucliers(enJeu).length > 0 && boucliers(enJeu).every((e) => e.cibles.every((c) => c.slot === 0)));
  // Mort au tour 4 : plus de bouclier au tour 6, même si un allié vit encore
  const mort = combat([singe("Arc", { atk: 1, competence: arc }), singe("Mur", { hp: 1e6, atk: 1 })], [singe("Brute", { atk: 400, hp: 1e6 })], () => 0);
  const ko = mort.journal.find((e) => e.type === "KO" && e.nom === "Arc");
  assert.ok(ko && ko.tour > 3 && ko.tour < 6);
  assert.deepEqual(boucliers(mort).map((e) => e.tour), [3]);
});

test("Dévouement : le soin ne compte que les PV retirés, sans la part absorbée par le bouclier", () => {
  const r = combat(
    [singe("Arc", { atk: 200, competence: arc })],
    pret([porteur("Pretre", ["devouement"], { atk: 300, hp: 1e6 }), porteur("Aide", ["devouement"], { atk: 1, hp: 1e6 })]),
    () => 0
  );
  const coup = (tour) => r.journal.find((e) => e.type === "degats" && e.de === "Pretre" && e.tour === tour);
  assert.equal(coup(2).devouement.soin, Math.round((225 * 12) / 100)); // sans bouclier : 27
  assert.deepEqual([coup(3).degats, coup(3).absorbe], [225, 120]);
  assert.equal(coup(3).devouement.soin, Math.round(((225 - 120) * 12) / 100)); // 13
  // Coup entièrement absorbé : aucun soin
  const absorbe = combat(
    [singe("Arc", { atk: 200, competence: arc })],
    pret([porteur("Pretre", ["devouement"], { atk: 1, hp: 1e6 }), porteur("Aide", ["devouement"], { atk: 1, hp: 1e6 })]),
    () => 0
  );
  const tour3 = absorbe.journal.filter((e) => e.type === "degats" && e.surCamp === "A" && e.tour === 3);
  assert.ok(tour3.length > 0 && tour3.every((e) => e.absorbe === e.degats && !e.devouement));
});

test("bouclier : toutes les frappes (Présage, seconde frappe de Chaos) passent par lui, PV et bouclier toujours cohérents", () => {
  const presage = competenceDe(getEspece("crystal_ball_monkey"));
  const decret = competenceDe(getEspece("king_monkey"));
  let verifies = 0;
  let chaosAbsorbe = 0;
  let presageAbsorbe = 0;
  for (let graine = 1; graine <= 40; graine++) {
    const A = pret([
      porteur("Arc", ["rempart"], { hp: 3000, competence: arc }), porteur("Roi", ["sacrifice"], { hp: 2500, competence: decret }),
      porteur("Mur", ["rempart"], { hp: 2500, perk: effetPerk("second_souffle", 1) }), porteur("S1", ["sacrifice"], { hp: 2000 }),
    ]);
    const B = pret([
      porteur("Devin", ["chaos"], { atk: 160, hp: 3000, competence: presage }), porteur("C2", ["chaos", "devouement"], { atk: 150, hp: 2500 }),
      porteur("C3", ["devouement"], { atk: 140, hp: 2500 }), porteur("Arc2", ["chaos"], { hp: 3000, competence: arc }),
    ]);
    const r = combat(A, B, generateur(graine));
    const pv = { A: A.map((s) => s?.hp), B: B.map((s) => s?.hp) };
    const bouclier = { A: [0, 0, 0, 0], B: [0, 0, 0, 0] };
    for (const e of r.journal) {
      if (e.type === "bouclier") for (const c of e.cibles) bouclier[e.deCamp][c.slot] = c.bouclier;
      else if (e.type === "decret") for (const c of e.cibles) pv[e.deCamp][c.slot] = c.pv;
      else if (e.type === "sacrifice") for (const c of e.cibles) pv[e.camp][c.slot] = c.pv;
      else if (e.type === "soin") pv[e.surCamp][e.surSlot] = e.pvRestants;
      else if (e.type === "souffle") pv[e.camp][e.slot] = e.pvRestants;
      else if (e.type === "degats") {
        const avant = bouclier[e.surCamp][e.surSlot];
        const absorbe = Math.min(avant, e.degats);
        assert.equal(e.absorbe ?? 0, absorbe);
        bouclier[e.surCamp][e.surSlot] = avant - absorbe;
        assert.equal(e.pvRestants, Math.max(0, pv[e.surCamp][e.surSlot] - (e.degats - absorbe)));
        pv[e.surCamp][e.surSlot] = e.pvRestants;
        if (e.devouement) pv[e.deCamp][e.devouement.surSlot] = e.devouement.pvRestants;
        if (absorbe && e.doubleFrappe) chaosAbsorbe++;
        if (absorbe && e.competence) presageAbsorbe++;
        verifies++;
      }
    }
  }
  assert.ok(verifies > 1000);
  assert.ok(chaosAbsorbe > 0, "aucune seconde frappe de Chaos absorbée");
  assert.ok(presageAbsorbe > 0, "aucun Présage absorbé");
});
