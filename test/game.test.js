import assert from "node:assert/strict";
import test from "node:test";
import { combat, degatsDe } from "../src/game/combat-engine.js";
import { PALIER_RARETE, puissance, puissanceCible, statsAuNiveau } from "../src/game/puissance.js";
import { RESONANCES, appliquerResonances, resonancesActives, resonancesAvecBonus } from "../src/game/resonances.js";
import { SINGES } from "../src/game/monkeys.js";
import { estRare, getEspece, getImageUrl, getNiveau, poidsRaretes, statsFinales, tirerRarete } from "../src/game/monkeys.js";
import { appliquerGains, gainsDuTirage } from "../src/game/progression.js";
import { COMPETENCES, competenceDe } from "../src/game/competences.js";
import {
  ARBRE, COURBE_COUTS, agregerEffets, coutAttendu, estGratuit, etatArbre, noeudsPris, peutPrendre,
  pointsDepenses, profondeurs, validerArbre, voisins,
} from "../src/game/starter-arbre.js";
import { nbSlots } from "../src/services/arbre-service.js";
import { compteurSansRare, etincelleDeclenchee } from "../src/services/tirage-service.js";
import { ajouterAuQuota, consommerTirage, etatQuota, parametresQuota, quotaPublic } from "../src/game/quota.js";
import { ennemisEtage, recompensesAvecBonus, recompensesEtage, singeBonus } from "../src/game/aventure.js";
import { ennemisDonjon, etageEquivalent, gainDonjon, jourParis, ticketsApresCadeau, ticketsDisponibles, ticketsParJour } from "../src/game/ressources.js";
import { calculerElo, limiteCombatsElo } from "../src/game/elo.js";
import { bonusDefense, bonusPv, effetPerk, nbTiers, perkExiste, renforcerPerk, tirerPerk, xpDoublon } from "../src/game/perks.js";
import { creerApplication } from "../src/app.js";
import { VERSION, avecVersion, versionnerHtml } from "../src/version.js";
import { ErreurJeu, gererErreurs } from "../src/erreurs.js";

test("les paliers de niveau restent identiques", () => {
  assert.deepEqual(getNiveau("common", 5), { niveau: 1, progression: 5, prochain: 6 });
  assert.deepEqual(getNiveau("common", 6), { niveau: 2, progression: 0, prochain: 11 });
  assert.deepEqual(getNiveau("legendary", 5), { niveau: 3, progression: 0, prochain: 4 });
});

test("les données et statistiques d'un singe sont inchangées", () => {
  const espece = getEspece("basic_monkey");
  assert.equal(getImageUrl("basic_monkey"), `/images/MonkeysIcons/basic_monkey.png?v=${VERSION}`);
  // niveau 3 = base + 2 × croissance, pour chaque stat
  const attendu = Object.fromEntries(Object.keys(espece.base).map((k) => [k, espece.base[k] + 2 * espece.croissance[k]]));
  assert.deepEqual(statsFinales(espece, 3), attendu);
  assert.equal(statsFinales(espece, 1).hp, espece.base.hp);
});

test("le moteur de combat conserve son journal et son ordre de tour", () => {
  const attaquant = {
    nom: "A", hp: 10, atk: 10, def: 0, prec: 0, esq: 0, crit: 0, critdmg: 150,
  };
  const cible = {
    nom: "B", hp: 1, atk: 10, def: 0, prec: 0, esq: 0, crit: 0, critdmg: 150,
  };

  const resultat = combat([attaquant, null, null, null, null, null], [cible, null, null, null, null, null], () => 0);

  assert.equal(resultat.vainqueur, "A");
  assert.equal(resultat.tours, 1);
  assert.deepEqual(resultat.journal, [
    { type: "tour", numero: 1 },
    {
      type: "degats", tour: 1,
      de: "A", deCamp: "A", deSlot: 0,
      sur: "B", surCamp: "B", surSlot: 0,
      degats: 10, critique: false, pvRestants: 0,
    },
    { type: "KO", tour: 1, nom: "B", camp: "B", slot: 0 },
  ]);
});

test("l'application expose exactement les mêmes routes HTTP", () => {
  const app = creerApplication();
  const routes = app.router.stack
    .flatMap((layer) => layer.handle.stack ?? [])
    .filter((layer) => layer.route)
    .flatMap((layer) => Object.keys(layer.route.methods).map(
      (method) => `${method.toUpperCase()} ${layer.route.path}`
    ))
    .sort();

  assert.deepEqual(routes, [
    "GET /arbre",
    "GET /aventure",
    "GET /chat",
    "GET /classement",
    "GET /classement/elo",
    "GET /combats",
    "GET /combats/:id",
    "GET /combats/:id/messages",
    "GET /defis",
    "GET /equipe",
    "GET /joueurs",
    "GET /moi",
    "GET /monkeydex",
    "GET /perks",
    "GET /profil",
    "GET /ressources",
    "POST /arbre/noeuds",
    "POST /aventure/combat",
    "POST /chat",
    "POST /combats/:id/fin",
    "POST /combats/:id/messages",
    "POST /connexion",
    "POST /deconnexion",
    "POST /defis",
    "POST /defis/:id/repondre",
    "POST /equipe",
    "POST /inscription",
    "POST /perks/equiper",
    "POST /perks/loterie",
    "POST /presence",
    "POST /ressources/combat",
    "POST /starter",
    "POST /tirage",
  ]);
});

test("la progression du starter conserve ses paliers d'XP", () => {
  const depart = { nom: "Fire monkey", niveau: 1, xp: 0, coins: 0 };
  assert.deepEqual(appliquerGains(depart, { xp: 5, coins: 1 }), { niveau: 1, xp: 5, coins: 1, niveauxGagnes: 0 });
  // 100 XP pour passer niv. 2, puis 200 pour niv. 3 : 1250 XP depuis niv. 1 = niv. 5 (100+200+300+400), reste 250
  assert.deepEqual(appliquerGains(depart, { xp: 1250, coins: 500 }), { niveau: 5, xp: 250, coins: 500, niveauxGagnes: 4 });
  assert.deepEqual(
    appliquerGains({ niveau: 3, xp: 290, coins: 10 }, { xp: 10, coins: 1 }),
    { niveau: 4, xp: 0, coins: 11, niveauxGagnes: 1 }
  );
});

function fausseReponse() {
  return {
    headersSent: false,
    statut: 200,
    corps: null,
    status(code) { this.statut = code; return this; },
    json(corps) { this.corps = corps; return this; },
  };
}

test("les erreurs métier sont renvoyées au joueur, les autres masquées", () => {
  const req = { method: "GET", originalUrl: "/test" };

  const metier = fausseReponse();
  gererErreurs(new ErreurJeu("combat introuvable", 404), req, metier, () => {});
  assert.equal(metier.statut, 404);
  assert.deepEqual(metier.corps, { erreur: "combat introuvable" });

  const technique = fausseReponse();
  const erreurConsole = console.error;
  console.error = () => {};
  try {
    gererErreurs(new Error("connexion PostgreSQL perdue"), req, technique, () => {});
  } finally {
    console.error = erreurConsole;
  }
  assert.equal(technique.statut, 500);
  assert.equal(technique.corps.erreur.includes("PostgreSQL"), false);
});

test("les requêtes invalides reçoivent une erreur JSON sans toucher la base", async () => {
  const serveur = creerApplication().listen(0);
  const base = `http://127.0.0.1:${serveur.address().port}`;
  try {
    const jsonCasse = await fetch(`${base}/connexion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{pas du json",
    });
    assert.equal(jsonCasse.status, 400);
    assert.deepEqual(await jsonCasse.json(), { erreur: "requête invalide" });

    const nonConnecte = await fetch(`${base}/moi`);
    assert.equal(nonConnecte.status, 401);
    assert.deepEqual(await nonConnecte.json(), { erreur: "non connecté" });

    const idInvalide = await fetch(`${base}/combats/abc`);
    assert.equal(idInvalide.status, 400);
    assert.deepEqual(await idInvalide.json(), { erreur: "identifiant invalide" });

    const sansCorps = await fetch(`${base}/connexion`, { method: "POST" });
    assert.equal(sansCorps.status, 401);
  } finally {
    serveur.close();
  }
});

test("les tirages se rechargent de 1 toutes les 30 s jusqu'à 100", () => {
  const t = Date.UTC(2026, 10, 15, 14, 0, 0);
  const s30 = 30 * 1000;

  // Jamais tiré : stock plein, pas de recharge en cours
  const neuf = etatQuota(null, t);
  assert.deepEqual(quotaPublic(neuf), { restants: 100, max: 100, intervalleMs: s30, msAvantProchain: null });

  // 10 tirages il y a 95 s : +3, et le prochain arrive dans 25 s
  const q = etatQuota({ tirages_restants: 10, dernier_reset: new Date(t - 95 * 1000) }, t);
  assert.equal(q.stock, 13);
  assert.equal(quotaPublic(q).msAvantProchain, 25 * 1000);
  assert.equal(q.debutRecharge, t - 5 * 1000);

  // Absent longtemps : plafonné à 100 (date en texte acceptée)
  assert.equal(etatQuota({ tirages_restants: 0, dernier_reset: new Date(t - 3600 * 1000).toISOString() }, t).stock, 100);
  assert.equal(etatQuota({ tirages_restants: 0, dernier_reset: new Date(t - 50 * 60 * 1000 + 1) }, t).stock, 99);

  // Tirer depuis le plafond : la recharge repart de maintenant
  const plein = etatQuota({ tirages_restants: 100, dernier_reset: new Date(t - 3600 * 1000) }, t);
  assert.ok(consommerTirage(plein));
  assert.equal(plein.stock, 99);
  assert.equal(quotaPublic(plein).msAvantProchain, s30);

  // Stock vide : rien à consommer, état inchangé
  const vide = etatQuota({ tirages_restants: 0, dernier_reset: new Date(t - 10 * 1000) }, t);
  assert.equal(consommerTirage(vide), false);
  assert.equal(vide.stock, 0);
  assert.equal(quotaPublic(vide).msAvantProchain, 20 * 1000);
});

test("les tirages gagnés dépassent le plafond, et la recharge s'arrête au-dessus", () => {
  const t = Date.UTC(2026, 10, 15, 14, 0, 0);

  // 90 + 20 de recharge accumulée (plafonnée à 100) + 50 gagnés = 150
  const q = etatQuota({ tirages_restants: 90, dernier_reset: new Date(t - 600 * 1000) }, t);
  ajouterAuQuota(q, 50);
  assert.equal(q.stock, 150);
  assert.equal(quotaPublic(q).msAvantProchain, null);

  // Au-dessus du plafond, le temps ne rajoute rien
  assert.equal(etatQuota({ tirages_restants: 150, dernier_reset: new Date(t - 3600 * 1000) }, t).stock, 150);

  // Ajout sous le plafond : la recharge en cours continue
  const bas = etatQuota({ tirages_restants: 10, dernier_reset: new Date(t - 10 * 1000) }, t);
  ajouterAuQuota(bas, 5);
  assert.equal(bas.stock, 15);
  assert.equal(quotaPublic(bas).msAvantProchain, 20 * 1000);

  // L'ancien stock bonus est ajouté au stock
  const ancien = etatQuota({ tirages_restants: 4, dernier_reset: new Date(t), tirages_bonus: 30 }, t);
  assert.equal(ancien.stock, 34);
});

test("Ressourcement : +10 au plafond et une recharge plus rapide d'1 s", () => {
  assert.deepEqual(parametresQuota(agregerEffets([])), { max: 100, intervalleMs: 30 * 1000 });
  const params = parametresQuota(agregerEffets(["farm.reset_1"]));
  assert.deepEqual(params, { max: 110, intervalleMs: 29 * 1000 });
  const t = Date.UTC(2026, 10, 15, 14, 0, 0);
  assert.equal(etatQuota({ tirages_restants: 0, dernier_reset: new Date(t - 58 * 1000) }, t, params).stock, 2);
  assert.equal(etatQuota(null, t, params).stock, 110);
});

test("une erreur métier peut renvoyer des détails au client", () => {
  let statut, corps;
  const res = { headersSent: false, status(s) { statut = s; return this; }, json(c) { corps = c; } };
  gererErreurs(new ErreurJeu("plus de tirages", 429, { quota: { restants: 0 } }), {}, res, () => {});
  assert.equal(statut, 429);
  assert.deepEqual(corps, { quota: { restants: 0 }, erreur: "plus de tirages" });
});

// Petit arbre de test : centre gratuit, une racine gratuite, deux chemins qui se rejoignent
function arbreTest(extra = {}) {
  const n = (branche, cout, liens, effet = {}, plus = {}) => ({ branche, nom: "N", cout, x: 0, y: 0, liens, effet, ...plus });
  return {
    centre: n("centre", 0, ["a.racine"]),
    "a.racine": n("farm", 0, []),
    "a.un": n("farm", 1, ["a.racine"], { xp_pct: 0.05 }),
    "a.deux": n("farm", 2, ["a.racine"], { xp_pct: 0.1 }),
    "a.bout": n("farm", 1, ["a.un", "a.deux"]),
    "a.loin": n("farm", 3, ["a.bout"], { slots_bonus: 1 }, { multiplicateur: 2 }),
    ...extra,
  };
}

test("l'arbre du starter : 1 point par niveau gagné, nœuds gratuits pris d'office", () => {
  const arbre = arbreTest();
  const etat = (niveau, pris) => Object.fromEntries(etatArbre(niveau, pris, arbre).noeuds.map((n) => [n.id, n.etat]));

  // Niveau 1 : aucun point ; le centre et la racine sont déjà pris, sans rien coûter
  assert.equal(etatArbre(1, [], arbre).points, 0);
  const debut = etat(1, []);
  assert.equal(debut.centre, "pris");
  assert.equal(debut["a.racine"], "pris");
  assert.equal(debut["a.un"], "verrouille");
  assert.deepEqual([...noeudsPris([], arbre)].sort(), ["a.racine", "centre"]);
  // Niveau 2 : 1 point, les nœuds reliés à la racine deviennent disponibles selon leur coût
  assert.deepEqual(etat(2, []), {
    centre: "pris", "a.racine": "pris", "a.un": "disponible", "a.deux": "verrouille", "a.bout": "verrouille", "a.loin": "verrouille",
  });
  assert.equal(etat(3, [])["a.deux"], "disponible");
  // Le coût compte ; une ligne en base pour un nœud gratuit ne coûte rien
  assert.equal(pointsDepenses(["a.un", "a.deux", "centre"], arbre), 3);
  // Effets cumulés ; un nœud retiré du JSON est ignoré et remboursé
  assert.ok(Math.abs(etatArbre(10, ["a.un", "a.deux", "disparu"], arbre).effets.xp_pct - 0.15) < 1e-9);
  assert.equal(etatArbre(10, ["a.un", "disparu"], arbre).points, 8);
});

test("l'arbre du starter : un nœud se débloque s'il est relié à au moins un nœud pris", () => {
  const arbre = arbreTest();
  const pris = (...ids) => noeudsPris(ids, arbre);
  // a.bout touche a.un et a.deux : un seul des deux suffit (liens non orientés)
  assert.deepEqual(peutPrendre("a.bout", pris(), 10, arbre), { ok: false, raison: "aucun nœud relié" });
  assert.deepEqual(peutPrendre("a.bout", pris("a.un"), 10, arbre), { ok: true });
  assert.deepEqual(peutPrendre("a.bout", pris("a.deux"), 10, arbre), { ok: true });
  // Un lien déclaré d'un seul côté vaut dans les deux sens
  assert.ok(voisins(arbre)["a.un"].has("a.bout"));
  assert.ok(voisins(arbre)["a.racine"].has("centre"));
  // Autres refus
  assert.deepEqual(peutPrendre("a.bout", pris("a.un"), 0, arbre), { ok: false, raison: "points insuffisants" });
  assert.deepEqual(peutPrendre("a.un", pris("a.un"), 10, arbre), { ok: false, raison: "déjà pris" });
  assert.deepEqual(peutPrendre("a.racine", pris(), 10, arbre), { ok: false, raison: "déjà pris" });
  assert.deepEqual(peutPrendre("inconnu", pris(), 10, arbre), { ok: false, raison: "nœud inconnu" });
});

test("l'arbre du starter : le JSON est vérifié au chargement", () => {
  const noeud = (cout, liens, effet = {}) => ({ branche: "farm", nom: "X", cout, x: 0, y: 0, liens, effet });
  assert.doesNotThrow(() => validerArbre(arbreTest()));
  // Coût 0 autorisé seulement pour un nœud sans effet
  assert.throws(() => validerArbre(arbreTest({ "a.x": noeud(0, ["a.un"], { xp_pct: 0.1 }) })), /gratuit/);
  assert.doesNotThrow(() => validerArbre(arbreTest({ "a.x": noeud(0, ["a.un"]) })));
  // Lien inconnu, nœud isolé, effet inconnu
  assert.throws(() => validerArbre(arbreTest({ "a.x": noeud(1, ["nulle.part"]) })), /lien inconnu/);
  assert.throws(() => validerArbre(arbreTest({ "a.x": noeud(1, []) })), /aucun chemin/);
  assert.throws(() => validerArbre(arbreTest({ "a.x": noeud(1, ["a.un"], { vol: 1 }) })), /effet inconnu/);
  // Le vrai arbre est valide et tous ses nœuds sont reliés au centre
  assert.doesNotThrow(() => validerArbre(ARBRE));
});

test("l'arbre du starter : le coût suit la profondeur depuis le centre", () => {
  // Profondeur = nombre minimal de nœuds payants depuis le centre, le nœud compris
  const petit = arbreTest();
  assert.deepEqual(profondeurs(petit), { centre: 0, "a.racine": 0, "a.un": 1, "a.deux": 1, "a.bout": 2, "a.loin": 3 });
  assert.equal(coutAttendu("a.loin", petit), Math.round(COURBE_COUTS[2] * 2));

  // La courbe commence à 1 et ne descend jamais
  assert.equal(COURBE_COUTS[0], 1);
  for (let i = 1; i < COURBE_COUTS.length; i++) assert.ok(COURBE_COUTS[i] >= COURBE_COUTS[i - 1]);

  // Dans le vrai arbre, chaque coût vaut arrondi(courbe[profondeur] × multiplicateur)
  const prof = profondeurs(ARBRE);
  for (const [id, noeud] of Object.entries(ARBRE)) {
    const attendu = coutAttendu(id, ARBRE, prof);
    assert.equal(noeud.cout, attendu, `coût de ${id} : attendu ${attendu} (profondeur ${prof[id]})`);
    // Un nœud payant ne coûte jamais moins qu'un voisin plus proche du centre (à multiplicateur égal ou moindre)
    if (estGratuit(noeud)) continue;
    for (const v of voisins(ARBRE)[id]) {
      if (prof[v] < prof[id] && (ARBRE[v].multiplicateur ?? 1) <= (noeud.multiplicateur ?? 1)) {
        assert.ok(noeud.cout >= ARBRE[v].cout, `${id} coûte moins que ${v}`);
      }
    }
  }
  // Premier nœud de chaque bras à 1 point ; le centre et les racines sont gratuits
  for (const id of ["farm.xp_1", "farm.coins_1", "pvp.atk_1", "pvp.prec_1", "strat.hp_1", "strat.def_1"]) assert.equal(ARBRE[id].cout, 1);
  for (const id of ["centre", "farm.racine", "pvp.racine", "strat.racine"]) assert.equal(ARBRE[id].cout, 0);
});

test("l'arbre du starter : agrégation des nouveaux effets et plafonds", () => {
  const effets = agregerEffets(["farm.xp_1", "farm.xp_2", "farm.xp_3", "farm.coins_1", "farm.coins_2",
    "farm.reset_1", "farm.reserve_1", "farm.copie_1", "farm.copie_2", "pvp.atk_1", "pvp.atk_2",
    "pvp.crit_1", "pvp.crit_2", "pvp.critdmg_1", "pvp.critdmg_2", "strat.hp_1", "strat.def_1", "strat.cle_donjon"]);
  const proche = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
  proche(effets.xp_pct, 0.25);
  proche(effets.coins_pct, 0.15);
  proche(effets.copie_bonus, 0.07);
  proche(effets.atk_pct, 0.07);
  proche(effets.hp_pct, 0.04);
  proche(effets.def_pct, 0.04);
  assert.equal(effets.tirages_max, 20);
  assert.equal(effets.recharge_sec, 2);
  assert.equal(effets.crit_flat, 6);
  assert.equal(effets.critdmg_flat, 25);
  assert.equal(effets.tickets_donjon, 1);
  assert.deepEqual(parametresQuota(effets), { max: 120, intervalleMs: 28 * 1000 });
  assert.equal(nbSlots(agregerEffets(["pvp.slot_1", "strat.slot_2"])), 8);

  // Plafonds : +3 emplacements, +15 de critique
  const arbre = arbreTest({
    "a.s": { branche: "farm", nom: "S", cout: 1, x: 0, y: 0, liens: ["a.un"], effet: { slots_bonus: 5, crit_flat: 40 } },
  });
  const plafonne = agregerEffets(["a.s"], arbre);
  assert.equal(plafonne.slots_bonus, 3);
  assert.equal(plafonne.crit_flat, 15);
});

test("Clé de donjon : un ticket de plus par jour dans chaque donjon", () => {
  const avecCle = agregerEffets(["strat.cle_donjon"]);
  assert.equal(ticketsParJour(agregerEffets([])), 2);
  assert.equal(ticketsParJour(avecCle), 3);
  // Nouveau jour (ou première visite) : stock plein, bonus compris
  assert.equal(ticketsDisponibles(null, "2026-11-15", undefined, avecCle), 3);
  assert.equal(ticketsDisponibles({ jour: "2026-11-14", tickets: 0 }, "2026-11-15", undefined, avecCle), 3);
  // Jour en cours : le stock enregistré fait foi
  assert.equal(ticketsDisponibles({ jour: "2026-11-15", tickets: 1 }, "2026-11-15", undefined, avecCle), 1);

  // Au déblocage, un ticket offert tout de suite, quel que soit le stock du jour
  const sansCle = agregerEffets([]);
  assert.equal(ticketsApresCadeau({ jour: "2026-11-15", tickets: 0 }, "2026-11-15", 1, sansCle), 1);
  assert.equal(ticketsApresCadeau({ jour: "2026-11-15", tickets: 2 }, "2026-11-15", 1, sansCle), 3);
  // Stock d'un jour passé (ou jamais joué) : plein sans la clé (2), plus le cadeau
  assert.equal(ticketsApresCadeau({ jour: "2026-11-14", tickets: 0 }, "2026-11-15", 1, sansCle), 3);
  assert.equal(ticketsApresCadeau(null, "2026-11-15", 1, sansCle), 3);
});

test("Flair : rare, épique, légendaire et mythique 10 % plus lourds au tirage", () => {
  const neutre = poidsRaretes(agregerEffets([]));
  const flair = poidsRaretes(agregerEffets(["farm.flair"]));
  const parNom = (poids) => Object.fromEntries(poids.map((r) => [r.nom, r.poids]));
  const [n, f] = [parNom(neutre), parNom(flair)];
  assert.equal(f.common, n.common);
  assert.equal(f.uncommon, n.uncommon);
  for (const r of ["rare", "epic", "legendary", "mythic"]) assert.ok(Math.abs(f[r] - n[r] * 1.1) < 1e-12);
  // Part des raretés rare et mieux : 7,05 % → 7,70 %
  const partRare = (poids) => poids.filter((r) => estRare(r.nom)).reduce((t, r) => t + r.poids, 0) / poids.reduce((t, r) => t + r.poids, 0);
  assert.ok(Math.abs(partRare(neutre) - 0.0705) < 0.0005);
  assert.ok(Math.abs(partRare(flair) - 0.0770) < 0.0005);
  // Le tirage suit les poids : tout en bas, commun ; tout en haut, mythique
  assert.equal(tirerRarete(null, { hasard: () => 0 }), "common");
  assert.equal(tirerRarete(null, { hasard: () => 0.9999 }), "mythic");
});

test("Étincelle : après 50 tirages sans rare, le suivant est rare ou mieux", () => {
  const avec = agregerEffets(["farm.etincelle"]);
  const sans = agregerEffets([]);
  // Déclenchement : nœud pris et seuil atteint
  assert.equal(etincelleDeclenchee(avec, 49), false);
  assert.equal(etincelleDeclenchee(avec, 50), true);
  assert.equal(etincelleDeclenchee(sans, 200), false);
  // Rareté forcée : seulement rare, épique, légendaire ou mythique, dans leurs proportions
  assert.deepEqual(poidsRaretes(avec, { forcerRare: true }).map((r) => r.nom), ["rare", "epic", "legendary", "mythic"]);
  for (const h of [0, 0.3, 0.6, 0.9, 0.9999]) assert.ok(estRare(tirerRarete(avec, { forcerRare: true, hasard: () => h })));
  // Compteur : +1 par tirage sans rare, remis à 0 sur un rare ou mieux
  assert.equal(compteurSansRare(0, "common"), 1);
  assert.equal(compteurSansRare(49, "uncommon"), 50);
  assert.equal(compteurSansRare(50, "rare"), 0);
  assert.equal(compteurSansRare(12, "legendary"), 0);
  assert.equal(compteurSansRare(12, "mythic"), 0);
});

test("Mythique : 1/1000 au tirage, même palier de 15 % au-dessus du légendaire, Crystal Ball Monkey offensif", () => {
  const poids = Object.fromEntries(poidsRaretes(null).map((r) => [r.nom, r.poids]));
  assert.equal(poids.mythic, 1 / 1000);
  const ecart = (a, b) => puissanceCible(a) - puissanceCible(b);
  assert.ok(Math.abs(ecart("mythic", "legendary") - ecart("legendary", "epic")) < 1e-9);
  assert.deepEqual(gainsDuTirage("mythic", agregerEffets(["farm.loterie_coins"]), () => 0), { xp: 3000, coins: 1500, copieBonus: false });
  assert.deepEqual(getNiveau("mythic", 5), getNiveau("legendary", 5));

  const s = getEspece("crystal_ball_monkey");
  assert.equal(s.rarete, "mythic");
  assert.equal(s.categorie, "Amour");
  assert.equal(s.competence, "presage");
  const legendaires = Object.values(SINGES).filter((e) => e.rarete === "legendary");
  // Offensif : plus d'attaque que tout légendaire, et le profil le plus tourné vers l'attaque (ATK / DEF)
  assert.ok(legendaires.every((e) => s.base.atk > e.base.atk && s.base.atk / s.base.def > e.base.atk / e.base.def));
});

test("Présage : tous les 3 tours, un critique ×2,5 perce-armure sur l'ennemi le plus bas en PV", () => {
  // Compétence active ; l'interrupteur "actif" à false la retire du combat
  const presage = competenceDe(getEspece("crystal_ball_monkey"));
  assert.deepEqual(presage, { id: "presage", nom: "Présage", icone: "🔮", tousLes: 3, critMult: 2.5, percePct: 35 });
  assert.equal(competenceDe(getEspece("crystal_ball_monkey"), { presage: { ...COMPETENCES.presage, actif: false } }), null);
  assert.equal(competenceDe(getEspece("sexy_monkey")), null);

  const singe = (nom, hp, extra = {}) => ({ nom, hp, atk: 100, def: 100, spd: 1, prec: 0, esq: 0, crit: 0, critdmg: 150, perk: null, ...extra });
  // Le devin attaque seul ; en face, un taunt plein de PV et un singe plus faible
  const devin = singe("Devin", 100000, { competence: presage });
  const adverses = () => [singe("Taunt", 100000, { atk: 1, perk: { id: "taunt" } }), singe("Faible", 50000, { atk: 1 })];
  const r = combat([devin], adverses(), () => 0.99); // 0.99 : aucun critique naturel, mais un raté au toucher
  const coups = r.journal.filter((e) => e.de === "Devin" && e.tour <= 6);
  assert.deepEqual(coups.map((e) => [e.tour, e.type, e.sur, e.critique ?? null]), [
    [1, "rate", "Taunt", null], [2, "rate", "Taunt", null], [3, "degats", "Faible", true],
    [4, "rate", "Taunt", null], [5, "rate", "Taunt", null], [6, "degats", "Faible", true],
  ]);
  assert.equal(coups[2].degats, Math.round(degatsDe(100, 65) * 2.5)); // DEF 100 réduite de 35 %
  assert.deepEqual(coups[2].competence, { nom: "Présage", icone: "🔮" });

  // Sans compétence (désactivée), jamais de Présage
  const sans = combat([singe("Devin", 100000, { competence: null })], adverses(), () => 0.99);
  assert.ok(sans.journal.every((e) => !e.competence && (e.de !== "Devin" || e.sur === "Taunt")));
});

test("Duelliste : un combat classé de plus par jour contre un même adversaire", () => {
  const sans = agregerEffets([]);
  const duelliste = agregerEffets(["pvp.duel"]);
  assert.equal(limiteCombatsElo(sans, sans), 3);
  // Il suffit que l'un des deux joueurs ait le nœud ; le bonus ne s'additionne pas entre eux
  assert.equal(limiteCombatsElo(duelliste, sans), 4);
  assert.equal(limiteCombatsElo(sans, duelliste), 4);
  assert.equal(limiteCombatsElo(duelliste, duelliste), 4);
});

test("Explorateur : +10 % d'XP et de coins en Aventure, tirages inchangés", () => {
  const base = { xp: 155, coins: 42, tirages: 5 };
  assert.deepEqual(recompensesAvecBonus(base, agregerEffets([])), base);
  assert.deepEqual(recompensesAvecBonus(base, agregerEffets(["strat.explorateur"])), { xp: 171, coins: 46, tirages: 5 });
});

test("Harmonie et Chœur : bonus de résonance augmentés de 10 % puis 25 %", () => {
  assert.equal(resonancesAvecBonus(0), RESONANCES);
  const pct = agregerEffets(["strat.harmonie", "strat.choeur"]).resonance_pct;
  assert.ok(Math.abs(pct - 0.25) < 1e-9);
  const augmentees = resonancesAvecBonus(pct);
  // Amour, palier 4 : { hp: 47, atk: 9, def: 19 } → +25 %, arrondi au dixième
  assert.deepEqual(augmentees.categories.Amour.bonus[1], { hp: 58.8, atk: 11.3, def: 23.8 });
  assert.deepEqual(augmentees.paliers, RESONANCES.paliers);
  // Les données d'origine ne sont pas modifiées
  assert.deepEqual(RESONANCES.categories.Amour.bonus[1], { hp: 47, atk: 9, def: 19 });
  // Appliqué à une équipe : deux singes Amour reçoivent le palier 2 augmenté
  const singe = (categorie) => ({ hp: 1000, atk: 100, def: 100, categorie });
  const { equipe } = appliquerResonances([singe("Amour"), singe("Amour")], resonancesAvecBonus(0.1));
  assert.deepEqual([equipe[0].hp, equipe[0].atk, equipe[0].def], [1110, 102, 104]);
});

test("Maître des perks : Peau de fer, Taunt et Floraison 15 % plus forts", () => {
  const pct = agregerEffets(["strat.maitre_perks"]).perk_pct;
  assert.deepEqual(renforcerPerk(effetPerk("ironskin", 4), pct).defensePct, 28.8);
  assert.deepEqual(renforcerPerk(effetPerk("blossoming", 5), pct).soinPct, 34.5);
  assert.equal(renforcerPerk(effetPerk("taunt", 1), pct).pvPct, 11.5);
  // Sans le nœud, rien ne change
  assert.deepEqual(renforcerPerk(effetPerk("ironskin", 1), 0), effetPerk("ironskin", 1));
  assert.equal(renforcerPerk(null, pct), null);
});

test("l'arbre complet : 115 points, trois emplacements au plus, effets de la phase B", () => {
  const tous = Object.keys(ARBRE);
  assert.equal(pointsDepenses(tous), 115);
  const effets = agregerEffets(tous);
  const proche = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
  assert.equal(effets.slots_bonus, 3);
  assert.equal(nbSlots(effets), 9);
  proche(effets.coins_pct, 0.30);
  proche(effets.valeur_or_pct, 0.05);
  proche(effets.copie_bonus, 0.12);
  proche(effets.atk_pct, 0.12);
  proche(effets.hp_pct, 0.09);
  proche(effets.def_pct, 0.09);
  assert.equal(effets.tirages_max, 30);
  assert.equal(effets.recharge_sec, 3);
  assert.equal(effets.etincelle, true);
  assert.equal(effets.elo_combats_bonus, 1);
});

test("les gains du tirage suivent les effets de l'arbre", () => {
  const neutre = agregerEffets([]);
  const toujours = () => 0;
  const jamais = () => 0.999;

  // Sans arbre : XP de base, aucun coin, pas de copie bonus
  assert.deepEqual(gainsDuTirage("rare", neutre, toujours), { xp: 100, coins: 0, copieBonus: false });

  // Bonus d'XP et de coins ; coins seulement avec la loterie et si la chance tombe
  const effets = { ...neutre, xp_pct: 0.15, coins_pct: 0.05, lottery_coins: true, valeur_or_pct: 0.02, copie_bonus: 0.03 };
  assert.deepEqual(gainsDuTirage("rare", effets, toujours), { xp: 115, coins: 63, copieBonus: true });
  assert.deepEqual(gainsDuTirage("rare", effets, jamais), { xp: 115, coins: 0, copieBonus: false });

  // La chance de coins vaut 25 % + Valeur marchande
  assert.equal(gainsDuTirage("rare", effets, () => 0.269).coins, 63);
  assert.equal(gainsDuTirage("rare", effets, () => 0.271).coins, 0);
  assert.equal(gainsDuTirage("rare", { ...effets, valeur_or_pct: 0 }, () => 0.26).coins, 0);
});

test("le rang de renfort (slots 7 à 9) entre en jeu quand les deux premiers groupes sont K.O.", () => {
  const singe = (nom, hp, atk) => ({ nom, hp, atk, def: 0, spd: 1, prec: 0, esq: 0, crit: 0, critdmg: 100, perk: null });
  const A = [singe("A1", 1, 1), null, null, null, null, null, singe("A7", 50, 100)];
  const B = [singe("B1", 100, 1), null, null, null, null, null];
  const resultat = combat(A, B, () => 0);
  // A1 tombe, puis A7 (renfort) prend le relais et gagne
  assert.equal(resultat.vainqueur, "A");
  assert.ok(resultat.journal.some((e) => e.type === "degats" && e.de === "A7"));
  assert.ok(resultat.journal.some((e) => e.type === "KO" && e.nom === "A1"));
});

test("l'elo suit la formule classique (K = 32) et reste à somme nulle", () => {
  // À égalité : +16 / -16, match nul : 0
  assert.deepEqual(calculerElo(1000, 1000, "A"), { A: 16, B: -16 });
  assert.deepEqual(calculerElo(1000, 1000, "B"), { A: -16, B: 16 });
  assert.deepEqual(calculerElo(1000, 1000, null), { A: 0, B: 0 });
  // Battre plus faible rapporte peu, perdre contre lui coûte cher
  assert.deepEqual(calculerElo(1200, 1000, "A"), { A: 8, B: -8 });
  assert.deepEqual(calculerElo(1200, 1000, "B"), { A: -24, B: 24 });
  // Match nul entre niveaux différents : le plus faible gagne un peu
  assert.deepEqual(calculerElo(1200, 1000, null), { A: -8, B: 8 });
  for (const [a, b, v] of [[1500, 900, "A"], [873, 1432, "A"], [1000, 1001, null]]) {
    const d = calculerElo(a, b, v);
    assert.equal(d.A + d.B, 0);
  }
});

test("Aventure : ennemis fixes par étage, difficulté par paliers", () => {
  // Un même étage donne toujours les mêmes ennemis
  assert.deepEqual(ennemisEtage(23), ennemisEtage(23));
  assert.notDeepEqual(ennemisEtage(23), ennemisEtage(24));

  const presents = (e) => ennemisEtage(e).filter(Boolean);
  // Nombre d'ennemis par palier, 6 emplacements au maximum
  for (const [etage, nombre] of [[1, 1], [4, 1], [5, 2], [10, 3], [20, 4], [30, 5], [50, 6], [100, 6], [500, 6]]) {
    assert.equal(presents(etage).length, nombre, `étage ${etage}`);
    assert.equal(ennemisEtage(etage).length, 6);
  }
  // Rareté maximale du palier, ou celle juste en dessous
  assert.ok(presents(3).every((s) => s.rarete === "common"));
  assert.ok(presents(12).every((s) => ["common", "uncommon"].includes(s.rarete)));
  assert.ok(presents(120).every((s) => ["epic", "legendary"].includes(s.rarete)));
  // Niveau : 1 au début du palier, +1 par étage
  assert.ok(presents(10).every((s) => s.niveau === 1));
  assert.ok(presents(14).every((s) => s.niveau === 5));
  // Étage 1 affaibli de moitié par rapport à l'étage 6 (même espèce, même niveau sinon)
  const e1 = presents(1)[0];
  const espece = getEspece(e1.id);
  const s1 = statsFinales(espece, 1);
  assert.equal(e1.hp, Math.round(s1.hp * 0.5));
  assert.equal(e1.atk, Math.round(s1.atk * 0.5));
});

test("Aventure : récompenses par étage", () => {
  assert.deepEqual(recompensesEtage(1), { xp: 25, coins: 13, tirages: 0 });
  assert.deepEqual(recompensesEtage(10), { xp: 70, coins: 40, tirages: 1 });
  assert.deepEqual(recompensesEtage(50), { xp: 270, coins: 160, tirages: 1 });
  assert.equal(recompensesEtage(51).tirages, 0);
  // Singe bonus : 10 % de chance, une copie d'un des ennemis
  const ennemis = ennemisEtage(30);
  assert.equal(singeBonus(ennemis, () => 0.5), null);
  const singe = singeBonus(ennemis, () => 0.05);
  assert.ok(ennemis.filter(Boolean).some((s) => s.id === singe));
});

test("donjons de ressources : paliers, gains et ennemis propres à chaque donjon", () => {
  // Gains : 20 tirages au palier 1, puis +1 par palier ; coins et XP montent aussi
  assert.deepEqual([1, 2, 10].map((p) => gainDonjon("tirages", p)), [20, 21, 29]);
  assert.deepEqual([1, 2, 10].map((p) => gainDonjon("coins", p)), [500, 550, 950]);
  assert.deepEqual([1, 2, 10].map((p) => gainDonjon("xp", p)), [400, 440, 760]);
  // Difficulté deux fois plus rapide que l'Aventure
  assert.deepEqual([1, 10, 50].map((p) => etageEquivalent(p)), [5, 23, 103]);
  const presents = (d, p) => ennemisDonjon(d, p).filter(Boolean);
  assert.equal(presents("tirages", 1).length, ennemisEtage(5).filter(Boolean).length);
  // Même palier : mêmes ennemis ; donjons différents (et Aventure) : ennemis différents
  assert.deepEqual(ennemisDonjon("xp", 7), ennemisDonjon("xp", 7));
  const ids = (l) => l.filter(Boolean).map((s) => s.id).join();
  const d = ["tirages", "coins", "xp"].map((x) => ids(ennemisDonjon(x, 25)));
  assert.equal(new Set([...d, ids(ennemisEtage(53))]).size, 4);
});

test("les tickets de donjon reviennent à minuit, heure de Paris", () => {
  // Hiver (UTC+1) : minuit à Paris = 23 h UTC ; été (UTC+2) : 22 h UTC
  assert.equal(jourParis(new Date("2026-11-14T22:59:59Z")), "2026-11-14");
  assert.equal(jourParis(new Date("2026-11-14T23:00:00Z")), "2026-11-15");
  assert.equal(jourParis(new Date("2026-07-14T21:59:59Z")), "2026-07-14");
  assert.equal(jourParis(new Date("2026-07-14T22:00:00Z")), "2026-07-15");
  // Tickets : pleins sans ligne ou si la ligne date d'hier, sinon ceux qui restent
  assert.equal(ticketsDisponibles(null, "2026-11-15"), 2);
  assert.equal(ticketsDisponibles({ tickets: 0, jour: "2026-11-14" }, "2026-11-15"), 2);
  assert.equal(ticketsDisponibles({ tickets: 1, jour: "2026-11-15" }, "2026-11-15"), 1);
  assert.equal(ticketsDisponibles({ tickets: 0, jour: "2026-11-15" }, "2026-11-15"), 0);
});

test("loterie des perks : perk au hasard, tiers élevés plus rares, doublons convertis en XP", () => {
  // Suite de nombres imposée : [choix du perk, choix du tier]
  const suite = (...v) => () => v.shift();
  // 3 perks à chances égales (ordre : ironskin, taunt, blossoming)
  assert.deepEqual(tirerPerk(suite(0.1, 0)), { perk: "ironskin", tier: 1 });
  assert.deepEqual(tirerPerk(suite(0.5)), { perk: "taunt", tier: 1 });
  assert.equal(tirerPerk(suite(0.9, 0)).perk, "blossoming");
  // Peau de fer : 55 / 28 / 13 / 4 %
  assert.equal(tirerPerk(suite(0.1, 0.54)).tier, 1);
  assert.equal(tirerPerk(suite(0.1, 0.56)).tier, 2);
  assert.equal(tirerPerk(suite(0.1, 0.84)).tier, 3);
  assert.equal(tirerPerk(suite(0.1, 0.97)).tier, 4);
  // Floraison : le tier V (2 %) n'arrive qu'en toute fin
  assert.equal(tirerPerk(suite(0.9, 0.97)).tier, 4);
  assert.equal(tirerPerk(suite(0.9, 0.99)).tier, 5);
  // Sur beaucoup de tirages, les tiers bas dominent
  const tiers = Array.from({ length: 4000 }, () => tirerPerk()).filter((t) => t.perk === "ironskin").map((t) => t.tier);
  const part = (t) => tiers.filter((x) => x === t).length / tiers.length;
  assert.ok(part(1) > part(2) && part(2) > part(3) && part(3) > part(4));

  // Conversion des doublons (table du bot)
  assert.equal(xpDoublon("taunt", 1), 50);
  assert.deepEqual([1, 2, 3, 4].map((t) => xpDoublon("ironskin", t)), [50, 100, 250, 500]);
  assert.equal(xpDoublon("blossoming", 5), 1000);

  // Validité et valeurs des tiers
  assert.ok(perkExiste("taunt", 1) && perkExiste("ironskin", 4) && perkExiste("blossoming", 5));
  assert.ok(!perkExiste("taunt", 2) && !perkExiste("ironskin", 5) && !perkExiste("constructor", 1) && !perkExiste("ironskin", "1"));
  assert.deepEqual([1, 2, 3, 4].map((tier) => effetPerk("ironskin", tier).defensePct), [10, 15, 20, 25]);
  assert.deepEqual([1, 2, 3, 4, 5].map((tier) => effetPerk("blossoming", tier).soinPct), [10, 15, 20, 25, 30]);
  assert.equal(effetPerk("taunt", 1).icone, "🎯");
});

test("perks en combat : taunt attire les attaques, floraison soigne tous les 2 tours", () => {
  const singe = (nom, hp, atk, def, perk = null) => ({ nom, hp, atk, def, spd: 1, prec: 0, esq: 0, crit: 0, critdmg: 100, perk });

  // Taunt : tant qu'il est en vie, le porteur (slot 2) prend toutes les attaques, quel que soit le hasard ;
  // une fois K.O., les autres redeviennent des cibles
  for (const h of [0, 0.5, 0.94]) {
    const r = combat(
      [singe("A1", 100, 1, 0), singe("A2", 100, 1, 0, effetPerk("taunt", 1)), singe("A3", 100, 1, 0)],
      [singe("B1", 100, 10, 0)],
      () => h
    );
    const ko = r.journal.findIndex((e) => e.type === "KO" && e.nom === "A2");
    assert.ok(ko > 0, `hasard ${h} : A2 tombe`);
    const avantKo = r.journal.slice(0, ko).filter((e) => e.type === "degats" && e.deCamp === "B");
    assert.ok(avantKo.length === 10 && avantKo.every((e) => e.sur === "A2"), `hasard ${h}`);
    assert.ok(r.journal.slice(ko).some((e) => e.type === "degats" && e.deCamp === "B" && e.sur !== "A2"));
  }

  // Floraison I (10 %) : aux tours 2, 4… le porteur soigne le singe le plus bas de son équipe
  const r = combat(
    [singe("Soigneur", 1000, 1, 0, effetPerk("blossoming", 1)), singe("Blessé", 1000, 1, 0)],
    [singe("Brute", 100000, 300, 0)],
    () => 0
  );
  const soins = r.journal.filter((e) => e.type === "soin");
  assert.ok(soins.length > 0);
  assert.ok(soins.every((e) => r.journal.find((t) => t.type === "tour" && t.numero === e.tour).numero % 2 === 0));
  assert.ok(soins.every((e) => e.de === "Soigneur" && e.soin <= 100));
  assert.equal(soins[0].soin, 100);
  // Le soin vise le plus bas en PV : la Brute frappe au hasard 0, donc toujours le slot 1 (Soigneur)
  assert.equal(soins[0].sur, "Soigneur");
  // Personne n'est blessé (toutes les attaques ratent) : pas de soin
  const calme = combat([singe("S", 1000, 1, 0, effetPerk("blossoming", 5))], [singe("X", 1000, 1, 0)], () => 0.99);
  assert.equal(calme.journal.filter((e) => e.type === "soin").length, 0);
});

test("défense : les dégâts diminuent sans jamais s'annuler", () => {
  assert.equal(degatsDe(100, 0), 100);
  assert.equal(degatsDe(100, 100), 50);  // défense = attaque : moitié des dégâts
  assert.equal(degatsDe(100, 200), 33);  // double : un tiers
  assert.equal(degatsDe(100, 100000), 1); // jamais moins de 1
  // une équipe tout-défense ne rend plus le combat interminable
  const tank = (nom) => ({ nom, hp: 1000, atk: 100, def: 400, spd: 1, prec: 0, esq: 0, crit: 0, critdmg: 100, perk: null });
  const r = combat([tank("A")], [tank("B")], () => 0);
  assert.ok(r.vainqueur && r.tours < 100);
});

test("les singes d'une même rareté ont la même puissance, et le palier entre raretés est respecté", () => {
  const raretes = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
  for (const [rang, rarete] of raretes.entries()) {
    const groupe = Object.entries(SINGES).filter(([, s]) => s.rarete === rarete);
    assert.ok(groupe.length > 0);
    for (const niveau of [1, 10]) {
      const cible = puissanceCible(rarete, niveau);
      for (const [id, s] of groupe) {
        const p = puissance(statsAuNiveau(s, niveau), rarete, niveau);
        assert.ok(Math.abs(p - cible) / cible < 0.02, `${id} niveau ${niveau} : ${Math.round(p)} au lieu de ${Math.round(cible)}`);
      }
    }
    assert.ok(Math.abs(puissanceCible(rarete) / puissanceCible("common") - (1 + PALIER_RARETE * rang)) < 1e-9);
  }
});

test("aucun singe n'a les mêmes stats qu'un autre, ni la même croissance", () => {
  const bases = new Set();
  const croissances = new Set();
  for (const [id, s] of Object.entries(SINGES)) {
    const b = JSON.stringify(s.base);
    const c = JSON.stringify(s.croissance);
    assert.ok(!bases.has(b), `stats de ${id} déjà utilisées`);
    assert.ok(!croissances.has(c), `croissance de ${id} déjà utilisée`);
    bases.add(b);
    croissances.add(c);
  }
});

test("résonances : paliers à 2, 4 et 6 singes de la même catégorie, tous slots confondus", () => {
  const s = (categorie) => ({ categorie, nom: categorie, hp: 1000, atk: 100, def: 100 });
  // 1 singe : rien
  assert.deepEqual(resonancesActives([s("Joie"), s("Chaos"), null]), []);
  // 2 Joie : palier 2 ; le singe d'une autre catégorie n'est pas touché
  const deux = appliquerResonances([s("Joie"), s("Chaos"), s("Joie")]);
  assert.deepEqual(deux.resonances.map((r) => [r.categorie, r.nb, r.palier]), [["Joie", 2, 2]]);
  const b = RESONANCES.categories.Joie.bonus[0];
  assert.equal(deux.equipe[0].atk, Math.round(100 * (1 + b.atk / 100)));
  assert.equal(deux.equipe[1].atk, 100);
  // les singes hors rotation active (slots 4 à 9) comptent aussi : 4 Joie répartis sur 9 slots = palier 4
  const neuf = [s("Joie"), null, null, s("Joie"), null, null, s("Joie"), null, s("Joie")];
  assert.equal(resonancesActives(neuf)[0].palier, 4);
  // palier 6 atteint, et 5 reste au palier 4
  assert.equal(resonancesActives(Array(5).fill(0).map(() => s("Amour")))[0].palier, 4);
  assert.equal(resonancesActives(Array(6).fill(0).map(() => s("Amour")))[0].palier, 6);
  // plusieurs résonances en même temps, équipe d'origine non modifiée
  const origine = [s("Joie"), s("Joie"), s("Chaos"), s("Chaos")];
  const deux2 = appliquerResonances(origine);
  assert.equal(deux2.resonances.length, 2);
  assert.equal(origine[0].atk, 100);
});

test("résonances : les singes du catalogue ont tous une famille connue", () => {
  for (const [id, s] of Object.entries(SINGES)) {
    assert.ok(RESONANCES.categories[s.categorie], `${id} : catégorie ${s.categorie}`);
  }
  for (const cat of Object.values(RESONANCES.categories)) assert.equal(cat.bonus.length, RESONANCES.paliers.length);
});

test("les ennemis de l'aventure ne profitent pas des résonances", () => {
  const ennemis = ennemisEtage(30).filter(Boolean);
  assert.ok(ennemis.length > 0 && ennemis.every((e) => e.categorie === undefined));
});

test("Peau de fer : la défense du porteur augmente du pourcentage de son tier", () => {
  assert.equal(bonusDefense(effetPerk("ironskin", 1), 300), 30);  // +10 %
  assert.equal(bonusDefense(effetPerk("ironskin", 4), 281), 70);  // +25 %, arrondi
  assert.equal(bonusDefense(effetPerk("taunt", 1), 300), 0);
  assert.equal(bonusDefense(null, 300), 0);
});

test("Taunt : le porteur gagne 10 % de PV et le perk reste sans tier", () => {
  const taunt = effetPerk("taunt", 1);
  assert.equal(taunt.pvPct, 10);
  assert.equal(bonusPv(taunt, 1900), 190);
  assert.equal(bonusPv(taunt, 1625), 163);  // arrondi
  assert.equal(bonusPv(effetPerk("ironskin", 4), 1900), 0);
  assert.equal(bonusPv(null, 1900), 0);
  // Toujours un perk unique : pas de tiers, doublon payé au tarif « unique »
  assert.equal(nbTiers("taunt"), 0);
  assert.ok(perkExiste("taunt", 1) && !perkExiste("taunt", 2));
  assert.equal(xpDoublon("taunt", 1), 50);
});

test("version : les pages réécrivent scripts, styles et images avec ?v= et portent la version", () => {
  const html = '<html><head><link rel="stylesheet" href="/css/commun.css"><script src="/js/commun.js"></script>' +
    '<img src="/images/Starters/fire_starter.png"><a href="/equipe.html">x</a><script src="https://cdn.example/x.js"></script></head></html>';
  const v = versionnerHtml(html, "abc123");
  assert.ok(v.includes('<meta name="version" content="abc123">'));
  assert.ok(v.includes('href="/css/commun.css?v=abc123"'));
  assert.ok(v.includes('src="/js/commun.js?v=abc123"'));
  assert.ok(v.includes('src="/images/Starters/fire_starter.png?v=abc123"'));
  assert.ok(v.includes('href="/equipe.html"'));            // liens de pages inchangés
  assert.ok(v.includes('src="https://cdn.example/x.js"')); // ressources externes inchangées
  assert.equal(avecVersion("/a.png?x=1", "z"), "/a.png?x=1&v=z");
});

test("version : pages HTML non mises en cache, en-tête X-Version sur toutes les réponses", async () => {
  const serveur = creerApplication().listen(0);
  const base = `http://localhost:${serveur.address().port}`;
  try {
    for (const chemin of ["/", "/equipe.html"]) {
      const r = await fetch(base + chemin);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("x-version"), VERSION);
      assert.equal(r.headers.get("cache-control"), "no-cache");
      const page = await r.text();
      assert.ok(page.includes(`<meta name="version" content="${VERSION}">`));
      assert.ok(page.includes(`/js/commun.js?v=${VERSION}`));
    }
    const js = await fetch(base + "/js/commun.js?v=" + VERSION);
    assert.equal(js.headers.get("cache-control"), "no-cache");
    const api = await fetch(base + "/moi");
    assert.equal(api.headers.get("x-version"), VERSION);
    assert.equal((await fetch(base + "/../package.json")).status, 404);
    assert.equal((await fetch(base + "/inexistant.html")).status, 404);
  } finally {
    serveur.close();
  }
});
