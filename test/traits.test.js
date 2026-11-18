// Traits (résonances d'équipe) : données, paliers, Harmonie/Chœur, et chaque mécanique de combat avec `hasard` injecté.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { combat, degatsDe } from "../src/game/combat-engine.js";
import {
  REGLAGES_TRAITS, RESONANCES, appliquerResonances, compterTraits, resonancesActives, resonancesAvecBonus,
  validerResonances, validerTraitsSinges,
} from "../src/game/resonances.js";
import { SINGES, getEspece } from "../src/game/monkeys.js";
import { agregerEffets } from "../src/game/starter-arbre.js";
import { competenceDe } from "../src/game/competences.js";
import { effetPerk } from "../src/game/perks.js";
import { ennemisEtage } from "../src/game/aventure.js";
import { dureeReplayMs, singeDeCombat } from "../src/services/combat-service.js";
import { DELAI_INITIAL_MS, PAS_MS } from "../src/constants/game.js";

const singe = (nom, extra = {}) => ({ nom, hp: 1000, atk: 100, def: 100, spd: 1, prec: 0, esq: 0, crit: 0, critdmg: 150, perk: null, ...extra });
const porteur = (nom, traits, extra = {}) => singe(nom, { traits, ...extra });
// Équipe prête pour le combat (résonances appliquées), `pct` : bonus Harmonie / Chœur
// Valeurs de référence des mécaniques (celles du brief, avant calibrage) : les tests de mécanique calculent leurs attendus
// avec elles et ne dépendent pas du calibrage. Les valeurs réelles du jeu sont vérifiées à part (test « valeurs calibrées »).
const TEST = structuredClone(RESONANCES);
const reference = {
  rempart: [{ reductionBase: 4, reductionBonus: 8 }, { reductionBase: 8, reductionBonus: 16 }, { reductionBase: 12, reductionBonus: 24 }],
  sacrifice: [{ partStats: 10 }, { partStats: 20 }, { partStats: 30 }],
  euphorie: [{ atkParTour: 2, atkPlafond: 8 }, { atkParTour: 3, atkPlafond: 16 }, { atkParTour: 4, atkPlafond: 24 }],
  chaos: [{ chance: 35, partDegats: 20 }, { chance: 60, partDegats: 20 }, { chance: 85, partDegats: 20 }],
  tueurs_de_geant: [{ pvMaxPct: 0.4, plafondAtkPct: 5 }, { pvMaxPct: 0.8, plafondAtkPct: 10 }, { pvMaxPct: 1.2, plafondAtkPct: 15 }],
  devouement: [{ soinPct: 12 }, { soinPct: 20 }, { soinPct: 30 }],
  malediction: [{ parTour: 6, plafond: 25 }, { parTour: 10, plafond: 50 }, { parTour: 15, plafond: 75 }],
  renforcement: [{ statsPct: 4 }, { statsPct: 12 }, { statsPct: 18 }],
};
for (const [id, paliers] of Object.entries(reference)) TEST.traits[id].paliers = paliers;
validerResonances(TEST);
const pret = (equipe, pct = 0, donnees = TEST) => appliquerResonances(equipe, resonancesAvecBonus(pct, donnees)).equipe;
const V = (trait, i) => TEST.traits[trait].paliers[i];
// Hasard rejoué : les valeurs données, puis `ensuite`
const suite = (valeurs, ensuite = 0) => { let i = 0; return () => (i < valeurs.length ? valeurs[i++] : ensuite); };
const coups = (r, de, filtre = () => true) => r.journal.filter((e) => e.type === "degats" && e.de === de && filtre(e));
const principaux = (r, de) => coups(r, de, (e) => !e.doubleFrappe).map((e) => e.degats);

// ---------- Données ----------

test("traits : 8 traits valides, chaque singe en porte 1 à 3, 7 porteurs par trait (8 pour Malédiction)", () => {
  assert.deepEqual(Object.keys(RESONANCES.traits), Object.keys(REGLAGES_TRAITS));
  assert.deepEqual(RESONANCES.paliers, [2, 4, 6]);
  validerResonances(RESONANCES);
  validerTraitsSinges(SINGES);
  const tous = Object.values(SINGES);
  const compte = compterTraits(tous);
  for (const t of Object.keys(REGLAGES_TRAITS)) assert.equal(compte[t], t === "malediction" ? 8 : 7, t);
  assert.equal(tous.filter((s) => s.traits.length === 2).length, 10);
  assert.ok(tous.every((s) => s.categorie === undefined && s.traits.length >= 1 && s.traits.length <= 2));
  // Chaque trait compte au moins 2 singes communs ou peu communs
  const bas = compterTraits(tous.filter((s) => s.rarete === "common" || s.rarete === "uncommon"));
  for (const t of Object.keys(REGLAGES_TRAITS)) assert.ok(bas[t] >= 2, t);
  // Quelques assignations du brief
  assert.deepEqual(getEspece("basic_monkey").traits, ["renforcement"]);
  assert.deepEqual(getEspece("glucide_monkey").traits, ["rempart", "sacrifice"]);
  assert.deepEqual(getEspece("earth_monkey").traits, ["euphorie"]);
  assert.deepEqual(getEspece("king_monkey").traits, ["renforcement"]);
  // Chaque trait a un nom, une icône, une couleur et un rôle
  for (const t of Object.values(RESONANCES.traits)) assert.ok(t.nom && t.icone && /^#[0-9a-f]{6}$/i.test(t.couleur) && t.role);
});

test("traits : nom, icône et couleur affichés par les pages identiques au JSON, et un effet décrit pour chaque trait", () => {
  const commun = fs.readFileSync(new URL("../public/js/commun.js", import.meta.url), "utf8");
  const bloc = (nom) => new Function(`return ${commun.match(new RegExp(`const ${nom} = (\\{[\\s\\S]*?\\n\\});`))[1]}`)();
  const affichage = bloc("TRAITS_AFFICHAGE");
  assert.deepEqual(Object.keys(affichage), Object.keys(RESONANCES.traits));
  for (const [id, t] of Object.entries(RESONANCES.traits)) {
    assert.deepEqual(affichage[id], { nom: t.nom, icone: t.icone, couleur: t.couleur }, id);
  }
  const descriptions = bloc("DESCRIPTIONS_TRAITS");
  assert.deepEqual(Object.keys(descriptions), Object.keys(RESONANCES.traits));
  // effetTrait cite chaque réglage du trait
  const corps = commun.slice(commun.indexOf("function effetTrait"), commun.indexOf("function indexPalierTrait"));
  for (const [id, cles] of Object.entries(REGLAGES_TRAITS)) {
    const ligne = corps.split("\n").find((l) => l.includes(`id === "${id}"`));
    assert.ok(ligne, `effet de ${id} non décrit`);
    for (const cle of cles) assert.ok(ligne.includes(`v.${cle}`), `${id} : ${cle} absent de la description`);
  }
});

test("traits : valeurs calibrées par simulation (scripts/calibrer-traits.mjs), chacune proche de Renforcement à chaque palier", () => {
  const valeurs = Object.fromEntries(Object.entries(RESONANCES.traits).map(([id, t]) => [id, t.paliers]));
  assert.deepEqual(valeurs, {
    rempart: [{ reductionBase: 5.5, reductionBonus: 11 }, { reductionBase: 14, reductionBonus: 28 }, { reductionBase: 19, reductionBonus: 38 }],
    sacrifice: [{ partStats: 11 }, { partStats: 10 }, { partStats: 8 }],
    euphorie: [{ atkParTour: 2.5, atkPlafond: 10 }, { atkParTour: 6.5, atkPlafond: 35 }, { atkParTour: 10, atkPlafond: 60 }],
    chaos: [{ chance: 35, partDegats: 34 }, { chance: 60, partDegats: 64 }, { chance: 85, partDegats: 72 }],
    tueurs_de_geant: [{ pvMaxPct: 1.1, plafondAtkPct: 14 }, { pvMaxPct: 3.2, plafondAtkPct: 40 }, { pvMaxPct: 4.8, plafondAtkPct: 60 }],
    devouement: [{ soinPct: 11 }, { soinPct: 30 }, { soinPct: 48 }],
    malediction: [{ parTour: 2, plafond: 8 }, { parTour: 7, plafond: 35 }, { parTour: 14, plafond: 70 }],
    renforcement: [{ statsPct: 4 }, { statsPct: 12 }, { statsPct: 18 }],
  });
});

test("traits : le JSON des traits et les traits des singes sont vérifiés au chargement", () => {
  const casse = (modif) => { const d = structuredClone(RESONANCES); modif(d); return () => validerResonances(d); };
  assert.doesNotThrow(casse(() => {}));
  assert.throws(casse((d) => { delete d.traits.chaos; }), /trait manquant : chaos/);
  assert.throws(casse((d) => { d.traits.joie = structuredClone(d.traits.chaos); }), /trait inconnu : joie/);
  assert.throws(casse((d) => { d.traits.chaos.paliers.pop(); }), /3 paliers/);
  assert.throws(casse((d) => { d.traits.chaos.paliers[0] = { chance: 35 }; }), /réglages du trait chaos/);
  assert.throws(casse((d) => { d.traits.chaos.paliers[1].bonus = 2; }), /réglages du trait chaos/);
  assert.throws(casse((d) => { d.traits.chaos.paliers[2].chance = 120; }), /chance au-dessus de 100/);
  assert.throws(casse((d) => { d.traits.rempart.paliers[0].reductionBase = -1; }), /valeur invalide/);
  assert.throws(casse((d) => { d.traits.rempart.paliers[0].reductionBase = "4"; }), /valeur invalide/);
  assert.throws(casse((d) => { d.traits.rempart.nom = ""; }), /nom manquant/);
  assert.throws(casse((d) => { delete d.traits.rempart.role; }), /role manquant/);
  assert.throws(casse((d) => { d.traits.rempart.couleur = "bleu"; }), /couleur invalide/);
  assert.throws(casse((d) => { d.paliers = [2, 2, 6]; }), /palier de résonance invalide/);
  assert.throws(casse((d) => { delete d.traits; }), /traits manquants/);

  const catalogue = (traits) => ({ test_monkey: { traits } });
  assert.doesNotThrow(() => validerTraitsSinges(catalogue(["chaos", "rempart", "sacrifice"]))); // 3 traits acceptés
  assert.throws(() => validerTraitsSinges(catalogue([])), /1 à 3 traits/);
  assert.throws(() => validerTraitsSinges(catalogue(undefined)), /1 à 3 traits/);
  assert.throws(() => validerTraitsSinges(catalogue(["chaos", "rempart", "sacrifice", "euphorie"])), /1 à 3 traits/);
  assert.throws(() => validerTraitsSinges(catalogue(["Joie"])), /trait inconnu Joie/);
  assert.throws(() => validerTraitsSinges(catalogue(["chaos", "chaos"])), /trait en double/);
});

// ---------- Paliers ----------

test("résonances : paliers à 2, 4 et 6 porteurs, tous slots comptés, un singe à 2 traits compte pour les deux", () => {
  const t = (...traits) => porteur(traits.join("+"), traits);
  const resume = (equipe) => resonancesActives(equipe).map((r) => [r.trait, r.nb, r.palier]);
  // 1 porteur : rien ; les emplacements vides et les singes sans trait sont ignorés
  assert.deepEqual(resume([t("chaos"), t("rempart"), null, singe("Ennemi")]), []);
  // 2 porteurs : palier 2, avec ses valeurs
  const deux = resonancesActives([t("chaos"), t("rempart"), t("chaos")], TEST);
  assert.deepEqual(deux, [{ trait: "chaos", nb: 2, palier: 2, valeurs: V("chaos", 0) }]);
  // Réserve et renfort comptent : 4 porteurs répartis sur 9 slots = palier 4
  assert.deepEqual(resume([t("chaos"), null, null, null, t("chaos"), null, t("chaos"), null, t("chaos")]), [["chaos", 4, 4]]);
  // 3 → palier 2, 5 → palier 4, 6 et 9 → palier 6
  const n = (k, trait = "euphorie") => Array.from({ length: k }, () => t(trait));
  assert.deepEqual(resume(n(3)), [["euphorie", 3, 2]]);
  assert.deepEqual(resume(n(5)), [["euphorie", 5, 4]]);
  assert.deepEqual(resume(n(6)), [["euphorie", 6, 6]]);
  assert.deepEqual(resume(n(9)), [["euphorie", 9, 6]]);
  assert.equal(resonancesActives(n(6), TEST)[0].valeurs, V("euphorie", 2));
  // Un singe à 2 traits compte dans les deux ; ordre du catalogue, quel que soit l'ordre des singes
  assert.deepEqual(resume([t("tueurs_de_geant", "chaos"), t("chaos"), t("tueurs_de_geant")]), [["chaos", 2, 2], ["tueurs_de_geant", 2, 2]]);
  assert.deepEqual(resume([t("tueurs_de_geant"), t("chaos"), t("chaos", "tueurs_de_geant")]), [["chaos", 2, 2], ["tueurs_de_geant", 2, 2]]);
  // Équipe typique 4 + 2, et singes à 3 traits
  assert.deepEqual(resume([t("rempart", "sacrifice"), t("rempart"), t("rempart", "devouement", "malediction"), t("rempart"), t("devouement"), t("euphorie")]),
    [["rempart", 4, 4], ["devouement", 2, 2]]);
  // Un même trait listé deux fois par erreur ne compte qu'une fois
  assert.deepEqual(compterTraits([{ traits: ["chaos", "chaos"] }]), { chaos: 1 });
});

test("résonances : Renforcement augmente PV, ATK et DEF avant le combat, les autres traits sont attachés aux porteurs", () => {
  const t = (...traits) => porteur(traits.join("+"), traits);
  const origine = [t("renforcement"), t("renforcement", "chaos"), t("chaos"), t("rempart"), null];
  const { equipe, resonances } = appliquerResonances(origine, TEST);
  assert.deepEqual(resonances.map((r) => r.trait), ["chaos", "renforcement"]);
  assert.deepEqual([equipe[0].hp, equipe[0].atk, equipe[0].def], [1040, 104, 104]);
  assert.deepEqual(equipe[0].effetsTraits, { renforcement: V("renforcement", 0) });
  assert.deepEqual(equipe[1].effetsTraits, { renforcement: V("renforcement", 0), chaos: V("chaos", 0) });
  assert.deepEqual([equipe[2].hp, equipe[2].atk, equipe[2].effetsTraits], [1000, 100, { chaos: V("chaos", 0) }]);
  // Trait sans palier atteint : le singe est repris tel quel
  assert.equal(equipe[3], origine[3]);
  assert.equal(equipe[4], null);
  // L'équipe d'origine n'est pas modifiée
  assert.deepEqual([origine[0].hp, origine[0].effetsTraits], [1000, undefined]);
  // Paliers 4 et 6 : +12 % et +18 % ; avec Chœur (+25 %) : +5 % au palier 2
  const n = (k) => Array.from({ length: k }, () => t("renforcement"));
  assert.equal(appliquerResonances(n(4), TEST).equipe[0].hp, 1120);
  assert.equal(appliquerResonances(n(6), TEST).equipe[0].atk, 118);
  assert.equal(pret(n(2), 0.25)[0].def, 105);
  // En combat, la stat renforcée est bien celle utilisée
  const r = combat(pret([t("renforcement"), t("renforcement")]), [singe("Sac", { def: 0, atk: 1, hp: 1e6 })], () => 0);
  assert.equal(principaux(r, "renforcement")[0], 104);
});

test("singes de combat : les traits du catalogue sont transmis, plus de catégorie ; les ennemis PVE n'en ont pas", () => {
  const s = singeDeCombat("smirking_monkey", getEspece("smirking_monkey"), 1, { effets: agregerEffets([]) });
  assert.deepEqual(s.traits, ["chaos", "tueurs_de_geant"]);
  assert.equal(s.categorie, undefined);
  const ennemis = ennemisEtage(30).filter(Boolean);
  assert.ok(ennemis.length > 0 && ennemis.every((e) => e.traits === undefined && e.categorie === undefined));
  // Sans trait, appliquerResonances ne touche à rien
  const source = ennemisEtage(30);
  const prets = appliquerResonances(source);
  assert.deepEqual(prets.resonances, []);
  prets.equipe.forEach((e, i) => assert.equal(e, source[i]));
});

test("Harmonie et Chœur : toutes les valeurs des traits augmentées de 10 % puis 25 %, chances plafonnées à 100 %", () => {
  assert.equal(resonancesAvecBonus(0), RESONANCES);
  const pct = agregerEffets(["strat.harmonie", "strat.choeur"]).resonance_pct;
  assert.ok(Math.abs(pct - 0.25) < 1e-9);
  assert.ok(Math.abs(agregerEffets(["strat.harmonie"]).resonance_pct - 0.1) < 1e-9);
  const a = resonancesAvecBonus(pct, TEST);
  assert.deepEqual(a.traits.rempart.paliers[2], { reductionBase: 15, reductionBonus: 30 });
  assert.deepEqual(a.traits.chaos.paliers.map((p) => p.chance), [43.8, 75, 100]); // 85 × 1,25 plafonné à 100
  assert.deepEqual(a.traits.chaos.paliers.map((p) => p.partDegats), [25, 25, 25]);
  assert.deepEqual(a.traits.tueurs_de_geant.paliers[0], { pvMaxPct: 0.5, plafondAtkPct: 6.3 });
  assert.deepEqual(a.traits.malediction.paliers[2], { parTour: 18.8, plafond: 93.8 });
  assert.deepEqual(a.traits.euphorie.paliers[0], { atkParTour: 2.5, atkPlafond: 10 });
  assert.deepEqual(resonancesAvecBonus(0.1, TEST).traits.rempart.paliers[0], { reductionBase: 4.4, reductionBonus: 8.8 });
  // Toutes les valeurs, sans exception, des valeurs de référence comme des valeurs réelles du jeu
  for (const donnees of [TEST, RESONANCES]) {
    const augmentees = resonancesAvecBonus(pct, donnees);
    for (const [id, t] of Object.entries(donnees.traits)) {
      t.paliers.forEach((valeurs, i) => {
        for (const [cle, v] of Object.entries(valeurs)) {
          const attendu = Math.round(v * 1.25 * 10 + 1e-9) / 10;
          assert.equal(augmentees.traits[id].paliers[i][cle], cle === "chance" ? Math.min(100, attendu) : attendu, `${id}.${cle}`);
        }
      });
      assert.deepEqual([augmentees.traits[id].nom, augmentees.traits[id].icone, augmentees.traits[id].couleur, augmentees.traits[id].role], [t.nom, t.icone, t.couleur, t.role]);
    }
    assert.deepEqual(augmentees.paliers, donnees.paliers);
  }
  // Données d'origine intactes
  assert.equal(TEST.traits.chaos.paliers[2].chance, 85);
  // Les effets de combat lisent les valeurs augmentées : Euphorie +2,5 % par tour, plafond 10 %
  const r = combat(pret([porteur("E1", ["euphorie"]), porteur("E2", ["euphorie"])], pct), [singe("Sac", { def: 0, atk: 1, hp: 1e6 })], () => 0);
  assert.deepEqual(principaux(r, "E1").slice(0, 6), [2.5, 5, 7.5, 10, 10, 10].map((x) => Math.round(100 * (1 + x / 100))));
});

// ---------- Mécaniques de combat ----------

test("Rempart : réduction des dégâts de base + bonus × PV perdus, sur tous les coups (Présage compris)", () => {
  const reduction = (v, pv, hp) => v.reductionBase + v.reductionBonus * (1 - pv / hp);
  const verifier = (r, v, cibles) => {
    const pv = Object.fromEntries(cibles.map((n) => [n, 1000]));
    let vus = 0;
    for (const e of r.journal) {
      if (e.type !== "degats" || !(e.sur in pv)) continue;
      const brut = degatsDe(100, 100);
      assert.equal(e.degats, Math.max(1, Math.round(brut * (1 - reduction(v, pv[e.sur], 1000) / 100))), `${e.sur} à ${pv[e.sur]} PV`);
      pv[e.sur] = e.pvRestants;
      vus++;
    }
    return vus;
  };
  const attaquant = singe("Frappeur", { hp: 1e9 });
  // Palier 2 : 4 % à PV pleins (50 → 48), jusqu'à 12 % près de 0 PV
  const r2 = combat([attaquant], pret([porteur("Mur1", ["rempart"], { atk: 1 }), porteur("Mur2", ["rempart"], { atk: 1 })]), () => 0);
  assert.equal(coups(r2, "Frappeur")[0].degats, 48);
  assert.ok(verifier(r2, V("rempart", 0), ["Mur1", "Mur2"]) > 40);
  assert.equal(r2.vainqueur, "A");
  // Palier 6 : 12 % à PV pleins (50 → 44), jusqu'à 36 %
  const six = Array.from({ length: 6 }, (_, i) => porteur(`M${i}`, ["rempart"], { atk: 1 }));
  const r6 = combat([attaquant], pret(six), () => 0);
  assert.equal(coups(r6, "Frappeur")[0].degats, 44);
  verifier(r6, V("rempart", 2), six.map((s) => s.nom));
  const dernier = coups(r6, "Frappeur").filter((e) => e.sur === "M0").at(-1);
  assert.ok(dernier.degats <= Math.round(50 * 0.66)); // près de 0 PV, la réduction approche 36 %
  // Un allié sans le trait (attiré par le taunt) subit les dégâts entiers
  const nu = combat([attaquant], pret([porteur("Mur1", ["rempart"]), porteur("Mur2", ["rempart"]), singe("Nu", { perk: effetPerk("taunt", 1) })]), () => 0);
  assert.equal(coups(nu, "Frappeur")[0].degats, 50);
  // Présage : critique ×2,5 perce-armure, puis Rempart
  const presage = competenceDe(getEspece("crystal_ball_monkey"));
  const devin = combat([singe("Devin", { hp: 1e9, competence: presage })], pret([porteur("Mur1", ["rempart"], { atk: 1, hp: 1e6 }), porteur("Mur2", ["rempart"], { atk: 1, hp: 1e6 })]), () => 0);
  const [premier, second] = coups(devin, "Devin");
  assert.equal(premier.degats, 48);
  const pvAvant = premier.pvRestants;
  assert.equal(second.degats, Math.round(Math.round(degatsDe(100, 65) * 2.5) * (1 - reduction(V("rempart", 0), pvAvant, 1e6) / 100)));
  // Réduction plafonnée à 100 % : il reste toujours au moins 1 dégât
  const blinde = singe("Blindé", { hp: 10000, effetsTraits: { rempart: { reductionBase: 90, reductionBonus: 90 } } });
  const rb = combat([singe("Frappeur", { hp: 1e9, atk: 5000 })], [blinde], () => 0);
  assert.ok(coups(rb, "Frappeur").every((e) => e.degats >= 1));
  assert.equal(coups(rb, "Frappeur").at(-1).degats, 1);
});

test("Euphorie : ATK cumulée à chaque tour, plafonnée, additionnée à Frénésie, seulement dans la rotation active", () => {
  const sac = singe("Sac", { def: 0, atk: 1, hp: 1e9 });
  // Palier 2 : +2 % par tour, plafond 8 % ; un allié sans le trait n'en profite pas
  const r = combat(pret([porteur("E1", ["euphorie"]), porteur("E2", ["euphorie"]), singe("Témoin")]), [sac], () => 0);
  assert.deepEqual(principaux(r, "E1").slice(0, 7), [102, 104, 106, 108, 108, 108, 108]);
  assert.deepEqual(principaux(r, "Témoin").slice(0, 3), [100, 100, 100]);
  // Palier 6 : +4 % par tour, plafond 24 %
  const six = Array.from({ length: 6 }, (_, i) => porteur(`E${i}`, ["euphorie"]));
  const r6 = combat(pret(six), [sac], () => 0);
  assert.deepEqual(principaux(r6, "E0").slice(0, 8), [104, 108, 112, 116, 120, 124, 124, 124]);
  // Frénésie I (+3 % par coup, 5 cumuls) et Euphorie s'additionnent : ATK × (1 + Frénésie + Euphorie)
  const fr = combat(pret([porteur("Furie", ["euphorie"], { perk: effetPerk("frenesie", 1) }), porteur("E2", ["euphorie"])]), [sac], () => 0);
  assert.deepEqual(principaux(fr, "Furie").slice(0, 8), [[2, 0], [4, 3], [6, 6], [8, 9], [8, 12], [8, 15], [8, 15], [8, 15]].map(([e, f]) => Math.round(100 * (1 + (e + f) / 100))));
  // Un porteur en réserve ne cumule rien : il entre en jeu à +0 % puis cumule à partir du tour suivant
  const reserve = combat(pret([porteur("Front", ["euphorie"], { hp: 1, def: 0 }), null, null, porteur("Réserve", ["euphorie"], { hp: 1e9, def: 0 })]),
    [singe("Brute", { atk: 1000, def: 0, hp: 1e9 })], () => 0);
  assert.deepEqual(principaux(reserve, "Front"), [102]);
  assert.deepEqual(principaux(reserve, "Réserve").slice(0, 3), [100, 102, 104]);
});

test("Chaos : seconde frappe à 20 % des dégâts sur un ennemi au hasard, sans toucher ni critique, ni Frénésie", () => {
  const cibles = () => [singe("C0", { hp: 1e6, atk: 1 }), singe("Taunt", { hp: 1e6, atk: 1, perk: effetPerk("taunt", 1) }), singe("C2", { hp: 1e6, atk: 1 })];
  const deux = () => pret([porteur("X1", ["chaos"], { hp: 1e9, perk: effetPerk("frenesie", 1) }), porteur("X2", ["chaos"], { hp: 1e9 })]);
  // Palier 2 (35 %) avec un jet à 0,3 : la seconde frappe part, sur la cible tirée (C0), taunt ignoré
  const r = combat(deux(), cibles(), () => 0.3);
  const j = r.journal;
  let secondes = 0;
  j.forEach((e, i) => {
    if (e.type !== "degats" || e.deCamp !== "A" || e.doubleFrappe) return;
    assert.equal(e.sur, "Taunt");
    const suivant = j[i + 1];
    assert.deepEqual([suivant.type, suivant.de, suivant.sur, suivant.doubleFrappe, suivant.critique], ["degats", e.de, "C0", true, false]);
    assert.equal(suivant.degats, Math.round(e.degats * 0.2));
    secondes++;
  });
  assert.ok(secondes > 10);
  // La seconde frappe ne compte pas pour Frénésie : +3 % par coup principal seulement
  assert.deepEqual(principaux(r, "X1").slice(0, 4), [0, 1, 2, 3].map((n) => degatsDe(Math.round(100 * (1 + 0.03 * n)), 100)));
  // Jet à 0,5 : raté au palier 2 (35 %), réussi au palier 4 (60 %), cible d'indice 1
  assert.equal(coups(combat(deux(), cibles(), () => 0.5), "X1", (e) => e.doubleFrappe).length, 0);
  const quatre = pret([porteur("X1", ["chaos"], { hp: 1e9 }), porteur("X2", ["chaos"]), porteur("X3", ["chaos"]), porteur("X4", ["chaos"])]);
  const r4 = combat(quatre, cibles(), () => 0.5);
  assert.ok(coups(r4, "X1", (e) => e.doubleFrappe).every((e) => e.sur === "Taunt"));
  assert.ok(coups(r4, "X1", (e) => e.doubleFrappe).length > 0);
  // Pas de seconde frappe après un raté, même à 100 % de chance (palier 6 + Chœur)
  const six = Array.from({ length: 6 }, (_, i) => porteur(`X${i}`, ["chaos"], { hp: 1e9 }));
  assert.equal(pret(six, 0.25)[0].effetsTraits.chaos.chance, 100);
  const esquive = combat(pret(six, 0.25), [singe("Fuyant", { esq: 300, hp: 1e6, atk: 1 })], () => 0.9);
  assert.ok(esquive.journal.some((e) => e.type === "rate"));
  assert.equal(esquive.journal.filter((e) => e.doubleFrappe).length, 0);
  // Avec Chœur, la part de dégâts monte aussi : 25 %
  const choeur = combat(pret(six, 0.25), cibles(), () => 0.3);
  const iChoeur = choeur.journal.findIndex((e) => e.doubleFrappe);
  assert.equal(choeur.journal[iChoeur].degats, Math.round(choeur.journal[iChoeur - 1].degats * 0.25));
  // Contre un Rempart : 20 % des dégâts avant le Rempart de la 1re cible, puis seul le Rempart de la 2e cible
  const murs = pret(Array.from({ length: 6 }, (_, i) => porteur(`R${i}`, ["rempart"], { hp: 1e6, atk: 1, ...(i === 1 && { perk: effetPerk("taunt", 1) }) })));
  const rr = combat(pret([porteur("X1", ["chaos"], { atk: 1000, hp: 1e9 }), porteur("X2", ["chaos"])]), murs, () => 0.3);
  const [frappe, seconde] = rr.journal.filter((e) => e.type === "degats").slice(0, 2);
  const brut = degatsDe(1000, 100);
  assert.equal(frappe.degats, Math.round(brut * 0.88));
  assert.deepEqual([seconde.sur, seconde.degats], ["R0", Math.round(Math.round(brut * 0.2) * 0.88)]);
  // La seconde frappe peut mettre K.O. : Second souffle d'abord, puis K.O.
  const fragile = singe("Fragile", { hp: 5, atk: 1, def: 0, perk: effetPerk("second_souffle", 1) });
  const rk = combat(deux(), [fragile, singe("Taunt", { hp: 1e6, atk: 1, perk: effetPerk("taunt", 1) })], () => 0.3);
  const chutes = rk.journal.map((e, i) => [e, rk.journal[i + 1]]).filter(([e]) => e.doubleFrappe && e.sur === "Fragile" && e.pvRestants === 0);
  assert.deepEqual(chutes.map(([, s]) => s.type), ["souffle", "KO"]);
});

test("Tueurs de géant : bonus de % des PV max de la cible, plafonné en % de l'ATK, ajouté après le critique, avant Rempart", () => {
  const tueurs = (extra = {}) => pret([porteur("G1", ["tueurs_de_geant"], { hp: 1e9, ...extra }), porteur("G2", ["tueurs_de_geant"])]);
  const premier = (equipe, cible, h = () => 0) => principaux(combat(equipe, [cible], h), "G1")[0];
  // Palier 2 : 0,4 % des PV max (1 000 → 4), plafond 5 % de l'ATK (100 → 5)
  assert.equal(premier(tueurs(), singe("Cible", { atk: 1 })), 50 + 4);
  assert.equal(premier(tueurs(), singe("Géant", { atk: 1, hp: 10000 })), 50 + 5);
  // Critique ×2 : le bonus n'est pas multiplié
  assert.equal(premier(tueurs({ crit: 100, critdmg: 200 }), singe("Cible", { atk: 1 })), 100 + 4);
  // Palier 6 : 1,2 % des PV max, plafond 15 % de l'ATK
  const six = pret(Array.from({ length: 6 }, (_, i) => porteur(i === 0 ? "G1" : `G${i + 1}`, ["tueurs_de_geant"], { hp: 1e9 })));
  assert.equal(premier(six, singe("Cible", { atk: 1 })), 50 + 12);
  assert.equal(premier(six, singe("Géant", { atk: 1, hp: 1e5 })), 50 + 15);
  // Le plafond suit l'ATK du coup (Euphorie comprise : 104 × 15 % = 15,6 → 16)
  const euphoriques = pret(Array.from({ length: 6 }, (_, i) => porteur(i === 0 ? "G1" : `G${i + 1}`, ["tueurs_de_geant", "euphorie"], { hp: 1e9 })));
  assert.equal(premier(euphoriques, singe("Géant", { atk: 1, hp: 1e5 })), degatsDe(104, 100) + 16);
  // Rempart réduit le total : (50 + 4) × 96 % = 52
  const murs = pret([porteur("Mur1", ["rempart"], { atk: 1 }), porteur("Mur2", ["rempart"], { atk: 1 })]);
  assert.equal(principaux(combat(tueurs(), murs, () => 0), "G1")[0], 52);
});

test("Dévouement : chaque coup soigne l'allié au plus petit ratio PV / PV max (pas les PV bruts), sans dépasser le max", () => {
  const equipe = pret([
    porteur("Soigneur", ["devouement"], { hp: 1e6, def: 0 }),
    singe("P", { hp: 1000, atk: 1, def: 0 }),
    singe("Q", { hp: 10000, atk: 1, def: 0 }),
    porteur("Réserve", ["devouement"], { hp: 1e6 }),
  ]);
  const ennemis = [singe("K1", { atk: 500, def: 0, hp: 1e9 }), singe("K2", { atk: 6000, def: 0, hp: 1e9 })];
  // Tour 1 : K1 frappe P (1 000 → 500 PV, 50 %), K2 frappe Q (10 000 → 4 000 PV, 40 %)
  const h = suite([0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.9, 0.9, 0.9, 0.5, 0.5, 0.5]);
  const r = combat(equipe, ennemis, h);
  const soins = coups(r, "Soigneur");
  // 1er coup : tout le monde a ses PV max, pas de soin
  assert.equal(soins[0].devouement, undefined);
  assert.deepEqual(r.journal.filter((e) => e.type === "degats" && e.tour === 1 && e.deCamp === "B").map((e) => [e.sur, e.pvRestants]), [["P", 500], ["Q", 4000]]);
  // Tour 2 : Q (40 %) est soigné, pas P (500 PV bruts mais 50 %) ; 12 % des 100 dégâts infligés
  assert.equal(soins[1].tour, 2);
  assert.deepEqual(soins[1].devouement, { sur: "Q", surSlot: 2, soin: 12, pvRestants: 4012 });
  // Sans le trait actif (porteur seul), aucun soin
  const seul = combat(pret([porteur("Soigneur", ["devouement"], { hp: 1e6, def: 0 }), singe("P", { hp: 1000, atk: 1, def: 0 }), singe("Q", { hp: 10000, atk: 1, def: 0 })]), ennemis,
    suite([0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.9, 0.9, 0.9, 0.5, 0.5, 0.5]));
  assert.ok(coups(seul, "Soigneur").every((e) => e.devouement === undefined));
  // Le soin ne dépasse jamais les PV max : S1, blessé de 5 PV, ne récupère que 5 PV (12 % des 100 dégâts de S2 = 12)
  const egratigne = combat(pret([porteur("S1", ["devouement"], { hp: 1000, def: 0 }), porteur("S2", ["devouement"], { hp: 1e9 })]),
    [singe("Piqûre", { atk: 5, def: 0, hp: 1e9 })], () => 0);
  assert.deepEqual(coups(egratigne, "S2")[0].devouement, { sur: "S1", surSlot: 0, soin: 5, pvRestants: 1000 });
  // Palier 6 : 30 % des dégâts réellement infligés (un coup mortel ne compte que les PV restants)
  const six = pret(Array.from({ length: 6 }, (_, i) => porteur(`D${i}`, ["devouement"], { hp: 1e6, atk: 1000, def: 0 })));
  const rm = combat(six, [singe("Mouche", { hp: 50, atk: 100, def: 0 }), singe("Mur", { hp: 1e9, atk: 1000, def: 0 })], () => 0);
  const mortel = coups(rm, "D0", (e) => e.sur === "Mouche")[0];
  assert.equal(mortel.pvRestants, 0);
  assert.ok(!mortel.devouement || mortel.devouement.soin <= Math.round(50 * 0.3));
});

test("Malédiction : l'ennemi qui a le plus de PV perd de la DEF et de l'ATK à chaque tour, cumul plafonné, appliqué malgré le Décret royal", () => {
  const maudits = () => [porteur("M1", ["malediction"], { atk: 1, hp: 1e9 }), porteur("M2", ["malediction"], { atk: 1, hp: 1e9 }), singe("X", { hp: 1e9 })];
  // Palier 2 : −6 % par tour, plafond −25 %, toujours sur B1 (le plus de PV), une seule fois par tour malgré deux porteurs
  const r = combat(pret(maudits()), [singe("B0", { hp: 5000, atk: 1 }), singe("B1", { hp: 9000, atk: 1 })], () => 0);
  const mal = r.journal.filter((e) => e.type === "malediction");
  assert.deepEqual(mal.map((e) => [e.tour, e.de, e.sur, e.pct, e.cumul]),
    [[1, "M1", "B1", 6, 6], [2, "M1", "B1", 6, 12], [3, "M1", "B1", 6, 18], [4, "M1", "B1", 6, 24], [5, "M1", "B1", 1, 25]]);
  // Le taunt n'attire pas la malédiction
  const rt = combat(pret(maudits()), [singe("B0", { hp: 5000, atk: 1, perk: effetPerk("taunt", 1) }), singe("B1", { hp: 9000, atk: 1 })], () => 0);
  assert.ok(rt.journal.filter((e) => e.type === "malediction").every((e) => e.sur === "B1"));
  // Dégâts : DEF (recalculée par le Décret royal) × (1 − malédiction)
  const decret = competenceDe(getEspece("king_monkey"));
  const rd = combat(pret(maudits()), [singe("B0", { hp: 5000, atk: 1 }), singe("Roi", { hp: 9000, atk: 1, competence: decret, perk: effetPerk("taunt", 1) })], () => 0);
  let n = 0, cumul = 0, verifies = 0;
  for (const e of rd.journal) {
    if (e.type === "decret") n = e.cibles.find((c) => c.slot === 1).cumul;
    if (e.type === "malediction") cumul = e.cumul;
    if (e.type === "degats" && e.de === "X" && e.tour <= 12) {
      assert.equal(e.degats, degatsDe(100, Math.round(100 * (1 + (decret.defPct * n) / 100)) * (1 - cumul / 100)), `tour ${e.tour}`);
      verifies++;
    }
  }
  assert.ok(verifies === 12 && n >= 5 && cumul === 25);
  // L'ennemi maudit perd autant d'ATK : ses coups valent degatsDe(ATK × (1 − malédiction), DEF)
  const ra = combat(pret(maudits()), [singe("B0", { hp: 5000, atk: 1 }), singe("Cogneur", { hp: 9000, atk: 300 })], () => 0);
  let cumulA = 0, coupsMaudits = 0;
  for (const e of ra.journal) {
    if (e.type === "malediction") { assert.equal(e.sur, "Cogneur"); cumulA = e.cumul; }
    if (e.type === "degats" && e.de === "Cogneur" && e.tour <= 8) {
      assert.equal(e.degats, degatsDe(Math.round(300 * (1 - cumulA / 100)), 100), `tour ${e.tour}`);
      coupsMaudits++;
    }
  }
  assert.ok(coupsMaudits === 8 && cumulA === 25);
  // Sans malédiction, le même ennemi frappe à pleine ATK
  const sansMal = combat([singe("M1", { atk: 1, hp: 1e9 }), singe("M2", { atk: 1, hp: 1e9 }), singe("X", { hp: 1e9 })],
    [singe("B0", { hp: 5000, atk: 1 }), singe("Cogneur", { hp: 9000, atk: 300 })], () => 0);
  assert.equal(coups(sansMal, "Cogneur")[3].degats, degatsDe(300, 100));
  // Porteurs en réserve seulement : aucune malédiction tant que le groupe 1 tient
  const reserve = combat(pret([singe("A1", { hp: 1e9 }), singe("A2", { hp: 1e9 }), singe("A3", { hp: 1e9 }), porteur("M1", ["malediction"]), porteur("M2", ["malediction"])]),
    [singe("B0", { hp: 1e7, atk: 1 })], () => 0);
  assert.equal(reserve.journal.filter((e) => e.type === "malediction").length, 0);
  // Palier 6 avec Chœur : −18,8 % par tour, plafond −93,8 %
  const six = pret(Array.from({ length: 6 }, (_, i) => porteur(`M${i}`, ["malediction"], { atk: 1, hp: 1e9 })), 0.25);
  const r6 = combat(six, [singe("Cible", { hp: 1e9, atk: 1 })], () => 0);
  assert.deepEqual(r6.journal.filter((e) => e.type === "malediction").map((e) => [e.pct, e.cumul]),
    [[18.8, 18.8], [18.8, 37.6], [18.8, 56.4], [18.8, 75.2], [18.6, 93.8]]);
});

test("Sacrifice : à la mort définitive d'un porteur, les autres porteurs vivants (réserve comprise) gagnent un % de ses stats", () => {
  const brute = () => [singe("Brute", { atk: 1000, def: 0, hp: 1e9 })];
  // Palier 2 (3 porteurs) : +10 % des PV max, ATK et DEF du mort ; le non-porteur X n'a rien
  const r = combat(pret([
    porteur("S1", ["sacrifice"], { hp: 100, def: 50 }), porteur("S2", ["sacrifice"], { hp: 1e6 }), singe("X", { hp: 1e6 }), porteur("S3", ["sacrifice"], { hp: 1e6 }),
  ]), brute(), () => 0);
  const sac = r.journal.filter((e) => e.type === "sacrifice");
  assert.deepEqual(sac, [{
    type: "sacrifice", tour: 1, nom: "S1", camp: "A", slot: 0, partStats: 10, hp: 10, atk: 10, def: 5,
    cibles: [{ slot: 1, hp: 1e6 + 10, pv: 1e6 + 10 }, { slot: 3, hp: 1e6 + 10, pv: 1e6 + 10 }],
  }]);
  const iKo = r.journal.findIndex((e) => e.type === "KO" && e.nom === "S1");
  assert.equal(r.journal[iKo + 1].type, "sacrifice");
  assert.equal(principaux(r, "S2")[0], 110); // ATK 100 + 10 contre une DEF de 0
  assert.equal(principaux(r, "X")[0], 100);

  // Second souffle : pas de sacrifice quand le porteur se relève, un seul à sa vraie mort
  const ss = combat(pret([
    porteur("S1", ["sacrifice"], { hp: 100, perk: effetPerk("second_souffle", 1) }), porteur("S2", ["sacrifice"], { hp: 1e6 }),
  ]), brute(), () => 0);
  const types = ss.journal.filter((e) => ["souffle", "KO", "sacrifice"].includes(e.type)).map((e) => [e.type, e.tour]);
  assert.deepEqual(types.slice(0, 3), [["souffle", 1], ["KO", 2], ["sacrifice", 2]]);
  assert.equal(ss.journal.filter((e) => e.type === "sacrifice" && e.nom === "S1").length, 1);

  // Cumul à chaque mort, et Décret royal recalcule l'ATK depuis une base qui garde les gains
  const decret = competenceDe(getEspece("king_monkey"));
  const rd = combat(pret([
    porteur("S1", ["sacrifice"], { hp: 100 }), porteur("S2", ["sacrifice"], { hp: 200 }), porteur("Roi", ["sacrifice"], { hp: 1e9, competence: decret }),
  ]), brute(), () => 0);
  const [g1, g2] = rd.journal.filter((e) => e.type === "sacrifice");
  assert.deepEqual([g1.nom, g1.tour, g2.nom, g2.tour], ["S1", 1, "S2", 2]);
  assert.deepEqual(g2.cibles.map((c) => c.slot), [2]);
  // S2 meurt au tour 2 après le décret : ses gains sont calculés sur ses stats du moment (base 100 + 10, décret 5 %)
  assert.equal(g2.atk, Math.round(Math.round(110 * 1.05) * 0.1));
  const roi = principaux(rd, "Roi");
  assert.equal(roi[0], 110);                                    // tour 1 : 100 + 10
  assert.equal(roi[1], Math.round(110 * 1.05) + g2.atk);         // tour 2 : décret ×1,05 puis + gain de S2
  assert.equal(roi[3], Math.round((100 + g1.atk + g2.atk) * 1.1)); // tour 4 : décret ×1,10 sur la base gains compris

  // Palier 6 : +30 % ; un porteur seul (palier non atteint) ne déclenche rien
  const six = pret(Array.from({ length: 6 }, (_, i) => porteur(`S${i}`, ["sacrifice"], { hp: i === 0 ? 100 : 1e6 })));
  assert.equal(combat(six, brute(), () => 0).journal.find((e) => e.type === "sacrifice").partStats, 30);
  const solo = combat(pret([porteur("S1", ["sacrifice"], { hp: 100 }), singe("X", { hp: 1e6 })]), brute(), () => 0);
  assert.equal(solo.journal.filter((e) => e.type === "sacrifice").length, 0);
});

test("traits inactifs : le combat et la séquence du hasard sont exactement ceux d'avant les traits", () => {
  let graine = 777;
  const rnd = () => { graine = (graine * 1664525 + 1013904223) % 4294967296; return graine / 4294967296; };
  const noms = Object.keys(REGLAGES_TRAITS);
  for (let c = 0; c < 60; c++) {
    // Chaque singe porte un trait différent : aucun palier atteint
    const equipe = (p) => Array.from({ length: 6 }, (_, i) => singe(`${p}${i}`, {
      hp: 500 + Math.floor(rnd() * 2000), atk: 50 + Math.floor(rnd() * 200), def: Math.floor(rnd() * 150), crit: 15, esq: Math.floor(rnd() * 60),
    }));
    const A = equipe("A"), B = equipe("B");
    const avecTraits = (eq, decalage) => eq.map((s, i) => ({ ...s, traits: [noms[(i + decalage) % noms.length]] }));
    const graineCombat = graine;
    let g1 = graineCombat, g2 = graineCombat;
    const h1 = () => { g1 = (g1 * 1664525 + 1013904223) % 4294967296; return g1 / 4294967296; };
    const h2 = () => { g2 = (g2 * 1664525 + 1013904223) % 4294967296; return g2 / 4294967296; };
    const sans = combat(A, B, h1);
    const inactifs = combat(pret(avecTraits(A, 0)), pret(avecTraits(B, 1)), h2);
    assert.deepEqual(inactifs.journal, sans.journal);
    assert.equal(g1, g2);
  }
});

test("replay : malédiction, sacrifice et seconde frappe comptent un pas ; le soin de Dévouement est dans le coup", () => {
  const journal = [
    { type: "tour" }, { type: "malediction" }, { type: "degats", devouement: { soin: 3 } }, { type: "degats", doubleFrappe: true },
    { type: "KO" }, { type: "sacrifice" },
  ];
  assert.equal(dureeReplayMs(journal), DELAI_INITIAL_MS + 6 * PAS_MS);
});

// ---------- Batterie aléatoire ----------
// Équipes aléatoires (traits, perks, compétences, Harmonie/Chœur), puis rejeu du journal avec un état suivi à part :
// chaque événement de trait doit respecter sa règle (cible, porteur, montant), et aucun nombre n'est invalide.
test("traits : batterie de combats aléatoires, chaque événement respecte sa règle", () => {
  let graine = 2026;
  const rnd = () => { graine = (graine * 1664525 + 1013904223) % 4294967296; return graine / 4294967296; };
  const tire = (liste) => liste[Math.floor(rnd() * liste.length)];
  const TRAITS = Object.keys(REGLAGES_TRAITS);
  const roi = competenceDe(getEspece("king_monkey"));
  const presage = competenceDe(getEspece("crystal_ball_monkey"));
  const perks = [null, null, effetPerk("taunt", 1), effetPerk("second_souffle", 3), effetPerk("blossoming", 3), effetPerk("frenesie", 3), effetPerk("perforant", 3), effetPerk("etendard", 2)];
  const equipe = (p) => {
    // 3 traits « favoris » par équipe, pour atteindre souvent les paliers ; parfois une équipe sans trait (PVE)
    const favoris = [tire(TRAITS), tire(TRAITS), tire(TRAITS)];
    const pve = rnd() < 0.15;
    return Array.from({ length: tire([3, 6, 6, 9]) }, (_, i) => {
      if (rnd() < 0.08) return null;
      const traits = pve ? undefined : [...new Set(Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => (rnd() < 0.8 ? tire(favoris) : tire(TRAITS))))];
      return singe(`${p}${i}`, {
        traits, hp: 300 + Math.floor(rnd() * 3000), atk: 40 + Math.floor(rnd() * 300), def: Math.floor(rnd() * 200),
        crit: Math.floor(rnd() * 30), critdmg: 150, esq: Math.floor(rnd() * 50), prec: Math.floor(rnd() * 50),
        perk: tire(perks), competence: tire([null, null, null, roi, presage]),
      });
    });
  };
  const compteurs = { malediction: 0, sacrifice: 0, double: 0, devouement: 0 };
  for (let c = 0; c < 500; c++) {
    // Un combat sur deux avec les valeurs réelles du jeu, l'autre avec les valeurs de référence
    const donnees = c % 2 ? RESONANCES : TEST;
    const A = pret(equipe("A"), tire([0, 0, 0.1, 0.25]), donnees);
    const B = pret(equipe("B"), tire([0, 0, 0.1, 0.25]), donnees);
    const r = combat(A, B, rnd);
    // État suivi : PV, PV max, malédiction, sacrifices
    const etat = {
      A: A.map((s) => s && { s, hp: s.hp, pv: s.hp, mal: 0 }),
      B: B.map((s) => s && { s, hp: s.hp, pv: s.hp, mal: 0 }),
    };
    const rotation = (camp) => {
      for (let d = 0; d < etat[camp].length; d += 3) {
        const g = etat[camp].slice(d, d + 3).filter((m) => m && m.pv > 0);
        if (g.length) return g;
      }
      return [];
    };
    const tr = (m, id) => m?.s.effetsTraits?.[id];
    let dernierCoup = null; // attaquant du dernier coup principal (ou raté)
    let malParTour = new Set();
    const sacrifies = new Set();
    r.journal.forEach((e, i) => {
      for (const [cle, v] of Object.entries(e)) if (typeof v === "number") assert.ok(Number.isFinite(v), `${e.type}.${cle} invalide`);
      if (e.type === "tour") { malParTour = new Set(); return; }
      if (e.type === "rate") { dernierCoup = { camp: e.deCamp, slot: e.deSlot, double: false }; return; }
      if (e.type === "degats") {
        const att = etat[e.deCamp][e.deSlot];
        const cible = etat[e.surCamp][e.surSlot];
        assert.ok(att.pv > 0 && cible.pv > 0, "coup d'un mort ou sur un mort");
        assert.ok(rotation(e.surCamp).includes(cible), "cible hors rotation active");
        assert.ok(e.degats >= 1);
        if (e.doubleFrappe) {
          assert.ok(tr(att, "chaos"), "seconde frappe sans Chaos");
          assert.equal(e.critique, false);
          assert.ok(dernierCoup && dernierCoup.camp === e.deCamp && dernierCoup.slot === e.deSlot && !dernierCoup.double, "seconde frappe orpheline");
          dernierCoup.double = true;
          compteurs.double++;
        } else {
          dernierCoup = { camp: e.deCamp, slot: e.deSlot, double: false };
        }
        const avant = cible.pv;
        assert.equal(e.pvRestants, Math.max(0, avant - e.degats));
        cible.pv = e.pvRestants;
        const dev = tr(att, "devouement");
        if (dev) {
          const allies = rotation(e.deCamp);
          const bas = allies.reduce((b, m) => (m.pv / m.hp < b.pv / b.hp ? m : b));
          const soinAttendu = Math.min(Math.round(((avant - cible.pv) * dev.soinPct) / 100), bas.hp - bas.pv);
          if (soinAttendu > 0) {
            assert.ok(e.devouement, "soin de Dévouement manquant");
            assert.equal(e.devouement.surSlot, bas.s.slot ?? etat[e.deCamp].indexOf(bas));
            assert.equal(e.devouement.soin, soinAttendu);
            bas.pv += soinAttendu;
            assert.equal(bas.pv, e.devouement.pvRestants);
            assert.ok(bas.pv <= bas.hp);
            compteurs.devouement++;
          } else assert.equal(e.devouement, undefined);
        } else assert.equal(e.devouement, undefined, "soin sans Dévouement");
        return;
      }
      if (e.type === "soin" || e.type === "souffle") {
        const m = e.type === "soin" ? etat[e.surCamp][e.surSlot] : etat[e.camp][e.slot];
        m.pv = e.pvRestants;
        assert.ok(m.pv <= m.hp);
        return;
      }
      if (e.type === "decret") {
        for (const cible of e.cibles) Object.assign(etat[e.deCamp][cible.slot], { hp: cible.hp, pv: cible.pv });
        return;
      }
      if (e.type === "KO") { assert.equal(etat[e.camp][e.slot].pv, 0); return; }
      if (e.type === "malediction") {
        const p = etat[e.deCamp][e.deSlot];
        const t = tr(p, "malediction");
        assert.ok(t && p.pv > 0);
        assert.equal(rotation(e.deCamp).find((m) => tr(m, "malediction")), p, "le porteur n'est pas le premier de la rotation");
        const actifs = rotation(e.surCamp);
        const haut = actifs.reduce((h, m) => (m.pv > h.pv ? m : h));
        assert.equal(etat[e.surCamp][e.surSlot], haut, "malédiction pas sur l'ennemi qui a le plus de PV");
        assert.ok(!malParTour.has(e.deCamp), "deux malédictions dans un tour");
        malParTour.add(e.deCamp);
        assert.ok(e.cumul <= Math.min(100, t.plafond) && e.pct > 0 && e.pct <= t.parTour + 1e-9);
        assert.ok(Math.abs(haut.mal + e.pct - e.cumul) < 1e-6);
        haut.mal = e.cumul;
        compteurs.malediction++;
        return;
      }
      if (e.type === "sacrifice") {
        const mort = etat[e.camp][e.slot];
        const t = tr(mort, "sacrifice");
        assert.ok(t && mort.pv === 0);
        assert.deepEqual([r.journal[i - 1].type, r.journal[i - 1].slot, r.journal[i - 1].camp], ["KO", e.slot, e.camp]);
        assert.ok(!sacrifies.has(e.camp + e.slot), "sacrifice déclenché deux fois");
        sacrifies.add(e.camp + e.slot);
        assert.equal(e.hp, Math.round((mort.hp * t.partStats) / 100));
        const attendus = etat[e.camp].filter((m) => m && m !== mort && m.pv > 0 && tr(m, "sacrifice"));
        assert.deepEqual(e.cibles.map((c) => c.slot), attendus.map((m) => etat[e.camp].indexOf(m)));
        for (const cible of e.cibles) {
          const m = etat[e.camp][cible.slot];
          assert.deepEqual([cible.hp, cible.pv], [m.hp + e.hp, m.pv + e.hp]);
          Object.assign(m, { hp: cible.hp, pv: cible.pv });
        }
        compteurs.sacrifice++;
        return;
      }
      assert.fail(`événement inconnu : ${e.type}`);
    });
    // Le vainqueur est cohérent avec l'état suivi
    const vivants = (camp) => etat[camp].some((m) => m && m.pv > 0);
    if (r.vainqueur === "A") assert.ok(vivants("A") && !vivants("B"));
    if (r.vainqueur === "B") assert.ok(vivants("B") && !vivants("A"));
  }
  // La batterie a bien exercé chaque mécanique
  for (const [nom, n] of Object.entries(compteurs)) assert.ok(n > 50, `${nom} : ${n}`);
});
