import assert from "node:assert/strict";
import test from "node:test";
import { combat, degatsDe } from "../src/game/combat-engine.js";
import { PALIER_RARETE, puissance, puissanceCible, statsAuNiveau } from "../src/game/puissance.js";
import { RESONANCES, appliquerResonances, resonancesActives, resonancesAvecBonus } from "../src/game/resonances.js";
import { SINGES } from "../src/game/monkeys.js";
import { chancesRaretes, estNotable, estRare, getEspece, getImageUrl, getNiveau, poidsRaretes, statsFinales, tirer, tirerRarete } from "../src/game/monkeys.js";
import {
  QUETE_BONUS, QUOTIDIEN, TYPES_QUETES, decrireRecompense, etatQuetes, etatSerie, pastilles, quetesDuJour, validerQuotidien, veille,
} from "../src/game/quotidien.js";
import { appliquerGains, gainsDuTirage } from "../src/game/progression.js";
import { COMPETENCES, competenceDe, validerCompetences } from "../src/game/competences.js";
import { EVEIL, ameliorationCompetence, bonusEveil, bonusEveilPct, coutEveil, paliersEveil, peutEveiller, validerEveil } from "../src/game/eveil.js";
import { dureeReplayMs, singeDeCombat } from "../src/services/combat-service.js";
import { DELAI_INITIAL_MS, PAS_MS, PAS_SOUFFLE } from "../src/constants/game.js";
import { etatDonjon } from "../src/services/ressources-service.js";
import {
  ARBRE, COURBE_COUTS, agregerEffets, coutAttendu, estGratuit, etatArbre, noeudsPris, peutPrendre,
  pointsDepenses, profondeurs, validerArbre, voisins,
} from "../src/game/starter-arbre.js";
import { nbSlots } from "../src/services/arbre-service.js";
import { compteurSansRare, etincelleDeclenchee } from "../src/services/tirage-service.js";
import { LOT_AUTO_MAX, RARETES_AUTO, RYTHMES_AUTO, instantsDus, passeFiltre, reglageAutoValide } from "../src/game/tirage-auto.js";
import { ajouterAuQuota, consommerTirage, etatQuota, parametresQuota, quotaPublic } from "../src/game/quota.js";
import { ennemisEtage, recompensesAvecBonus, recompensesEtage, singeBonus } from "../src/game/aventure.js";
import {
  DONJON_EVEIL, RESSOURCES, ennemisDonjon, estRessourceJoueur, etageEquivalent, gainDonjon, infoRecompense, jourParis,
  ticketsApresCadeau, ticketsDisponibles, ticketsParJour, validerDonjons, validerRessourcesJoueur,
} from "../src/game/ressources.js";
import {
  ARMES, CATALOGUES, EQUIPEMENTS, bonusObjets, remboursementDemantelement, effetObjet, nbTiersObjet, objetExiste, tirerObjet,
  validerCatalogue, valeursObjet,
} from "../src/game/objets.js";
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
    "DELETE /annonces/:annonce",
    "GET /annonces",
    "GET /arbre",
    "GET /armes",
    "GET /aventure",
    "GET /chat",
    "GET /classement",
    "GET /classement/elo",
    "GET /combats",
    "GET /combats/:id",
    "GET /combats/:id/messages",
    "GET /defis",
    "GET /equipe",
    "GET /equipements",
    "GET /eveil",
    "GET /joueurs",
    "GET /loterie",
    "GET /moi",
    "GET /monkeydex",
    "GET /perks",
    "GET /profil",
    "GET /quotidien",
    "GET /ressources",
    "GET /tirage/auto",
    "POST /annonces",
    "POST /annonces/lues",
    "POST /arbre/noeuds",
    "POST /armes/demanteler",
    "POST /armes/equiper",
    "POST /armes/loterie",
    "POST /aventure/combat",
    "POST /chat",
    "POST /combats/:id/fin",
    "POST /combats/:id/messages",
    "POST /connexion",
    "POST /deconnexion",
    "POST /defis",
    "POST /defis/:id/repondre",
    "POST /equipe",
    "POST /equipements/demanteler",
    "POST /equipements/equiper",
    "POST /equipements/loterie",
    "POST /eveil/balayer",
    "POST /eveil/combat",
    "POST /eveil/eveiller",
    "POST /inscription",
    "POST /perks/equiper",
    "POST /perks/loterie",
    "POST /presence",
    "POST /quotidien/bonus",
    "POST /quotidien/quetes",
    "POST /quotidien/serie",
    "POST /ressources/balayer",
    "POST /ressources/combat",
    "POST /starter",
    "POST /tirage",
    "POST /tirage/auto",
    "POST /tirage/auto/arreter",
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

    // Pages et actions de l'éveil, des armes et du balayage : connexion obligatoire
    for (const [methode, chemin] of [["GET", "/eveil"], ["POST", "/eveil/combat"], ["POST", "/eveil/balayer"], ["POST", "/eveil/eveiller"],
      ["GET", "/armes"], ["POST", "/armes/loterie"], ["POST", "/armes/equiper"], ["POST", "/armes/demanteler"], ["POST", "/ressources/balayer"],
      ["GET", "/equipements"], ["POST", "/equipements/loterie"], ["POST", "/equipements/equiper"]]) {
      const r = await fetch(`${base}${chemin}`, { method: methode });
      assert.equal(r.status, 401, chemin);
    }
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

test("chances affichées : part de chaque rareté, total 100 %, Flair compris", () => {
  const base = Object.fromEntries(chancesRaretes().map((c) => [c.rarete, c.chance]));
  assert.ok(Math.abs(Object.values(base).reduce((t, c) => t + c, 0) - 1) < 1e-12);
  // Les taux affichés en bas de la page Tirage
  assert.ok(Math.abs(base.common - 0.7746) < 0.0005);
  assert.ok(Math.abs(base.rare - 0.0516) < 0.0005);
  assert.ok(Math.abs(base.mythic - 0.00077) < 0.00005);
  // Flair déplace la masse des communs vers les rares, sans changer le total
  const flair = Object.fromEntries(chancesRaretes(agregerEffets(["farm.flair"])).map((c) => [c.rarete, c.chance]));
  assert.ok(Math.abs(Object.values(flair).reduce((t, c) => t + c, 0) - 1) < 1e-12);
  assert.ok(flair.common < base.common);
  for (const r of ["rare", "epic", "legendary", "mythic"]) assert.ok(flair[r] > base[r]);
});

test("flux : seuls les légendaires et les mythiques sont annoncés à tout le monde", () => {
  assert.deepEqual(
    ["common", "uncommon", "rare", "epic", "legendary", "mythic"].filter(estNotable),
    ["legendary", "mythic"]
  );
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

test("Présage : tous les 2 tours, un critique ×2,5 perce-armure sur l'ennemi le plus bas en PV", () => {
  // Compétence active ; l'interrupteur "actif" à false la retire du combat
  const presage = competenceDe(getEspece("crystal_ball_monkey"));
  assert.deepEqual(presage, { id: "presage", nom: "Présage", icone: "🔮", tousLes: 2, critMult: 2.5, percePct: 35 });
  assert.equal(competenceDe(getEspece("crystal_ball_monkey"), 1, { presage: { ...COMPETENCES.presage, actif: false } }), null);
  assert.equal(competenceDe(getEspece("sexy_monkey")), null);

  const singe = (nom, hp, extra = {}) => ({ nom, hp, atk: 100, def: 100, spd: 1, prec: 0, esq: 0, crit: 0, critdmg: 150, perk: null, ...extra });
  // Le devin attaque seul ; en face, un taunt plein de PV et un singe plus faible
  const devin = singe("Devin", 100000, { competence: presage });
  const adverses = () => [singe("Taunt", 100000, { atk: 1, perk: { id: "taunt" } }), singe("Faible", 50000, { atk: 1 })];
  const r = combat([devin], adverses(), () => 0.99); // 0.99 : aucun critique naturel, mais un raté au toucher
  const coups = r.journal.filter((e) => e.de === "Devin" && e.tour <= 6);
  assert.deepEqual(coups.map((e) => [e.tour, e.type, e.sur, e.critique ?? null]), [
    [1, "rate", "Taunt", null], [2, "degats", "Faible", true], [3, "rate", "Taunt", null],
    [4, "degats", "Faible", true], [5, "rate", "Taunt", null], [6, "degats", "Faible", true],
  ]);
  assert.equal(coups[1].degats, Math.round(degatsDe(100, 65) * 2.5)); // DEF 100 réduite de 35 %
  assert.deepEqual(coups[1].competence, { nom: "Présage", icone: "🔮" });

  // Sans compétence (désactivée), jamais de Présage
  const sans = combat([singe("Devin", 100000, { competence: null })], adverses(), () => 0.99);
  assert.ok(sans.journal.every((e) => !e.competence && (e.de !== "Devin" || e.sur === "Taunt")));
});

test("Décret royal : tous les 2 tours, +5 % ATK, PV et DEF à la rotation active, cumulable 5 fois", () => {
  const decret = competenceDe(getEspece("king_monkey"));
  assert.deepEqual(decret, { id: "decret_royal", nom: "Décret royal", icone: "👑", tousLes: 2, atkPct: 5, hpPct: 5, defPct: 5, cumulMax: 5 });
  assert.equal(competenceDe(getEspece("king_monkey"), 1, { decret_royal: { ...COMPETENCES.decret_royal, actif: false } }), null);

  const singe = (nom, extra = {}) => ({ nom, hp: 1e6, atk: 100, def: 100, spd: 1, prec: 0, esq: 0, crit: 0, critdmg: 150, perk: null, ...extra });
  const r = combat([singe("Roi", { competence: decret }), singe("Soldat")], [singe("Cible")], () => 0.5);
  const decrets = r.journal.filter((e) => e.type === "decret");
  // Déclenché aux tours 2, 4, 6, 8 et 10, puis plus rien une fois le cumul maximal atteint
  assert.deepEqual(decrets.map((e) => e.tour), [2, 4, 6, 8, 10]);
  assert.deepEqual(decrets[0].cibles.map((c) => [c.slot, c.cumul, c.hp]), [[0, 1, 1050000], [1, 1, 1050000]]);
  // Les PV actuels montent d'autant que les PV max
  assert.ok(decrets[0].cibles.every((c) => c.hp - c.pv === decrets[0].cibles[0].hp - decrets[0].cibles[0].pv || c.pv <= c.hp));
  assert.equal(decrets[4].cibles[0].hp, 1250000);
  assert.deepEqual(decrets[4].competence, { nom: "Décret royal", icone: "👑" });
  // Le bonus s'applique dès le tour du décret, sur l'ATK et la DEF de départ
  const coup = (tour, de = "Soldat") => r.journal.find((e) => e.type === "degats" && e.tour === tour && e.de === de).degats;
  assert.equal(coup(1), degatsDe(100, 100));
  assert.equal(coup(2), degatsDe(105, 100));
  assert.equal(coup(12), degatsDe(125, 100));
  assert.equal(coup(12, "Cible"), degatsDe(100, 125));

  // Roi en réserve (slot 4) : aucun décret tant que le groupe 1 est en jeu
  const reserve = combat([singe("Soldat"), null, null, singe("Roi", { competence: decret }), null, null], [singe("Cible")], () => 0.5);
  assert.equal(reserve.journal.filter((e) => e.type === "decret").length, 0);
  // Roi en jeu : le singe en réserve ne reçoit rien
  const enJeu = combat([singe("Roi", { competence: decret }), null, null, singe("Réserviste"), null, null], [singe("Cible")], () => 0.5);
  assert.ok(enJeu.journal.filter((e) => e.type === "decret").every((e) => e.cibles.every((c) => c.slot === 0)));
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

test("Maître des perks : valeurs des perks 15 % plus fortes, plafonds et cumuls inchangés", () => {
  const pct = agregerEffets(["strat.maitre_perks"]).perk_pct;
  assert.deepEqual(renforcerPerk(effetPerk("ironskin", 4), pct).defensePct, 201.3);
  assert.deepEqual(renforcerPerk(effetPerk("blossoming", 5), pct).soinPct, 17.3);
  assert.equal(renforcerPerk(effetPerk("taunt", 1), pct).pvPct, 80.5);
  const frenesie = renforcerPerk(effetPerk("frenesie", 2), pct);
  assert.deepEqual([frenesie.atkParCoupPct, frenesie.cumulMax], [6.9, 5]);
  const etendard = renforcerPerk(effetPerk("etendard", 5), pct);
  assert.deepEqual([etendard.atkGroupePct, etendard.plafondPct], [23, 30]);
  // Au-delà de 100 %, le moteur borne Second souffle
  assert.equal(renforcerPerk(effetPerk("second_souffle", 5), pct).retourPvPct, 115);
  assert.equal(renforcerPerk(effetPerk("perforant", 5), pct).ignoreDefPct, 86.3);
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
  // 7 perks à chances égales (ordre de perks.json : ironskin, taunt, blossoming, frenesie, etendard, second_souffle, perforant)
  assert.deepEqual(tirerPerk(suite(0.1, 0)), { perk: "ironskin", tier: 1 });
  assert.deepEqual(tirerPerk(suite(0.2)), { perk: "taunt", tier: 1 });
  assert.equal(tirerPerk(suite(0.3, 0)).perk, "blossoming");
  assert.deepEqual([0.5, 0.6, 0.8, 0.95].map((h) => tirerPerk(suite(h, 0)).perk), ["frenesie", "etendard", "second_souffle", "perforant"]);
  // Peau de fer : 55 / 28 / 13 / 4 %
  assert.equal(tirerPerk(suite(0.1, 0.54)).tier, 1);
  assert.equal(tirerPerk(suite(0.1, 0.56)).tier, 2);
  assert.equal(tirerPerk(suite(0.1, 0.84)).tier, 3);
  assert.equal(tirerPerk(suite(0.1, 0.97)).tier, 4);
  // Floraison : le tier V (2 %) n'arrive qu'en toute fin
  assert.equal(tirerPerk(suite(0.3, 0.97)).tier, 4);
  assert.equal(tirerPerk(suite(0.3, 0.99)).tier, 5);
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
  assert.deepEqual([1, 2, 3, 4].map((tier) => effetPerk("ironskin", tier).defensePct), [25, 75, 125, 175]);
  assert.deepEqual([1, 2, 3, 4, 5].map((tier) => effetPerk("blossoming", tier).soinPct), [3, 6, 9, 12, 15]);
  const t = (perk, cle) => [1, 2, 3, 4, 5].map((tier) => effetPerk(perk, tier)[cle]);
  assert.deepEqual(t("frenesie", "atkParCoupPct"), [3, 6, 9, 12, 15]);
  assert.deepEqual(t("etendard", "atkGroupePct"), [4, 8, 12, 16, 20]);
  assert.deepEqual(t("second_souffle", "retourPvPct"), [15, 35, 55, 75, 100]);
  assert.deepEqual(t("perforant", "ignoreDefPct"), [15, 30, 45, 60, 75]);
  assert.ok(["frenesie", "etendard", "second_souffle", "perforant"].every((p) => nbTiers(p) === 5 && perkExiste(p, 5) && !perkExiste(p, 6)));
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

  // Floraison I (3 %) : aux tours 2, 4… le porteur soigne le singe le plus bas de son équipe
  const r = combat(
    [singe("Soigneur", 1000, 1, 0, effetPerk("blossoming", 1)), singe("Blessé", 1000, 1, 0)],
    [singe("Brute", 100000, 300, 0)],
    () => 0
  );
  const soins = r.journal.filter((e) => e.type === "soin");
  assert.ok(soins.length > 0);
  assert.ok(soins.every((e) => r.journal.find((t) => t.type === "tour" && t.numero === e.tour).numero % 2 === 0));
  assert.ok(soins.every((e) => e.de === "Soigneur" && e.soin <= 30));
  assert.equal(soins[0].soin, 30);
  // Le soin vise le plus bas en PV : la Brute frappe au hasard 0, donc toujours le slot 1 (Soigneur)
  assert.equal(soins[0].sur, "Soigneur");
  // Personne n'est blessé (toutes les attaques ratent) : pas de soin
  const calme = combat([singe("S", 1000, 1, 0, effetPerk("blossoming", 5))], [singe("X", 1000, 1, 0)], () => 0.99);
  assert.equal(calme.journal.filter((e) => e.type === "soin").length, 0);
  // En réserve (slot 4), le soigneur ne soigne pas tant que le groupe 1 tient ; il prend le relais une fois en jeu
  const reserve = combat(
    [singe("Blessé", 1000, 1, 0), null, null, singe("Soigneur", 1000, 1, 0, effetPerk("blossoming", 1)), null, null],
    [singe("Brute", 100000, 300, 0)],
    () => 0
  );
  const koBlesse = reserve.journal.findIndex((e) => e.type === "KO" && e.nom === "Blessé");
  assert.ok(koBlesse > 0 && reserve.journal.slice(0, koBlesse).every((e) => e.type !== "soin"));
  assert.ok(reserve.journal.slice(koBlesse).some((e) => e.type === "soin" && e.de === "Soigneur"));
});

test("entre les tours : buffs des singes (Décret royal) puis perks (Floraison), toujours visibles dans cet ordre", () => {
  const decret = competenceDe(getEspece("king_monkey"));
  const singe = (nom, extra = {}) => ({ nom, hp: 10000, atk: 100, def: 0, spd: 1, prec: 0, esq: 0, crit: 0, critdmg: 100, perk: null, ...extra });
  const fleur = effetPerk("blossoming", 3);
  // Rois et soigneurs dans les deux camps, tous touchés : décret et floraison tombent aux mêmes tours
  const r = combat(
    [singe("RoiA", { competence: decret }), singe("FleurA", { perk: fleur }), singe("SoldatA")],
    [singe("FleurB", { perk: fleur }), singe("RoiB", { competence: decret }), singe("SoldatB")],
    () => 0.5
  );
  const parTour = new Map();
  let tour = 0;
  for (const e of r.journal) {
    if (e.type === "tour") parTour.set((tour = e.numero), []);
    else parTour.get(tour).push(e.type);
  }
  const toursDouble = [...parTour].filter(([, types]) => types.includes("decret") && types.includes("soin"));
  assert.ok(toursDouble.length >= 4);
  for (const [, types] of toursDouble) {
    const dernierDecret = types.lastIndexOf("decret");
    const premierSoin = types.indexOf("soin");
    const premiereAttaque = types.findIndex((t) => t === "degats" || t === "rate");
    // Un décret par roi, puis un soin par soigneur, le tout avant la première attaque
    assert.equal(types.filter((t) => t === "decret").length, 2);
    assert.equal(types.filter((t) => t === "soin").length, 2);
    assert.ok(dernierDecret < premierSoin && types.lastIndexOf("soin") < premiereAttaque);
  }
});

test("perks en combat : Frénésie, Étendard, Second souffle et Perforant", () => {
  const singe = (nom, extra = {}) => ({ nom, hp: 1e6, atk: 100, def: 100, spd: 1, prec: 0, esq: 0, crit: 0, critdmg: 100, perk: null, ...extra });
  const coups = (r, de) => r.journal.filter((e) => e.type === "degats" && e.de === de).map((e) => e.degats);

  // Frénésie I : +3 % d'ATK par coup porté, 5 cumuls au plus ; un coup raté ne compte pas
  const fr = combat([singe("Furie", { perk: effetPerk("frenesie", 1) })], [singe("Sac")], () => 0);
  assert.deepEqual(coups(fr, "Furie").slice(0, 7), [0, 1, 2, 3, 4, 5, 5].map((n) => degatsDe(Math.round(100 * (1 + 0.03 * n)), 100)));
  const rate = combat([singe("Furie", { perk: effetPerk("frenesie", 5) })], [singe("Sac")], () => 0.99); // toujours raté
  assert.equal(coups(rate, "Furie").length, 0);

  // Étendard II (+8 %) : tout le groupe 1, porteur compris ; pas le groupe 2 ; plafond 30 % à plusieurs
  const et = combat(
    [singe("Porte", { perk: effetPerk("etendard", 2) }), singe("Allié"), null, singe("Réserve"), null, null],
    [singe("Sac", { atk: 1 })], () => 0
  );
  assert.equal(coups(et, "Porte")[0], degatsDe(108, 100));
  assert.equal(coups(et, "Allié")[0], degatsDe(108, 100));
  const trois = combat([1, 2, 3].map((i) => singe(`E${i}`, { perk: effetPerk("etendard", 5) })), [singe("Sac", { atk: 1 })], () => 0);
  assert.equal(coups(trois, "E1")[0], degatsDe(130, 100)); // 3 × 20 % plafonné à 30 %
  // L'ATK de l'Étendard sert de base au Décret royal
  const decret = competenceDe(getEspece("king_monkey"));
  const roi = combat([singe("Roi", { competence: decret, perk: effetPerk("etendard", 1) })], [singe("Sac", { atk: 1 })], () => 0);
  assert.equal(coups(roi, "Roi")[1], degatsDe(Math.round(104 * 1.05), 100));

  // Second souffle I : une seule fois, le porteur revient à 15 % de ses PV au lieu d'être K.O.
  const fragile = (perk) => singe("Fragile", { hp: 1000, atk: 1, perk });
  const ss = combat([fragile(effetPerk("second_souffle", 1))], [singe("Brute", { atk: 2000 })], () => 0);
  const souffles = ss.journal.filter((e) => e.type === "souffle");
  assert.equal(souffles.length, 1);
  assert.deepEqual([souffles[0].pvRestants, souffles[0].perk.icone], [150, "💨"]);
  assert.equal(ss.journal.filter((e) => e.type === "KO" && e.nom === "Fragile").length, 1);
  const sansSouffle = combat([fragile(null)], [singe("Brute", { atk: 2000 })], () => 0);
  assert.ok(ss.tours > sansSouffle.tours);
  // Renforcé au-delà de 100 % : jamais plus que les PV max
  const fort = combat([fragile({ ...effetPerk("second_souffle", 5), retourPvPct: 115 })], [singe("Brute", { atk: 2000 })], () => 0);
  assert.equal(fort.journal.find((e) => e.type === "souffle").pvRestants, 1000);

  // Perforant II : ignore 30 % de la DEF ; cumulé avec Présage (35 %) : 45,5 % de la DEF restent
  const pf = combat([singe("Pique", { perk: effetPerk("perforant", 2) })], [singe("Mur", { atk: 1 })], () => 0.5);
  assert.equal(coups(pf, "Pique")[0], degatsDe(100, 70));
  const presage = competenceDe(getEspece("crystal_ball_monkey"));
  const devin = combat([singe("Devin", { competence: presage, perk: effetPerk("perforant", 2) })], [singe("Mur", { atk: 1 })], () => 0.5);
  assert.equal(coups(devin, "Devin")[1], Math.round(degatsDe(100, 45.5) * 2.5)); // Présage au tour 2
  const total = combat([singe("Pique", { perk: { ...effetPerk("perforant", 5), ignoreDefPct: 103.5 } })], [singe("Mur", { atk: 1 })], () => 0.5);
  assert.equal(coups(total, "Pique")[0], degatsDe(100, 0)); // jamais plus de 100 % de la DEF ignorée
});

test("Second souffle : le porteur se relève une seule fois, quel que soit le contexte du combat", () => {
  const singe = (nom, extra = {}) => ({ nom, hp: 1000, atk: 100, def: 100, spd: 1, prec: 0, esq: 0, crit: 0, critdmg: 150, perk: null, ...extra });
  const souffle = (tier) => effetPerk("second_souffle", tier);
  const evenements = (r, type) => r.journal.filter((e) => e.type === type);
  // Après chaque coup mortel d'un porteur : un « souffle » (jamais un KO) la première fois, puis un KO la seconde
  const verifierUnSeulSouffle = (r, nom) => {
    assert.equal(evenements(r, "souffle").filter((e) => e.nom === nom).length, 1);
    const iSouffle = r.journal.findIndex((e) => e.type === "souffle" && e.nom === nom);
    const iKo = r.journal.findIndex((e) => e.type === "KO" && e.nom === nom);
    assert.equal(r.journal[iSouffle - 1].type, "degats");
    assert.equal(r.journal[iSouffle - 1].pvRestants, 0);
    // Le K.O., s'il vient (le vainqueur d'un duel peut survivre), n'arrive qu'après le souffle
    assert.ok(iKo === -1 || iKo > iSouffle);
  };

  // 1 contre 1 : retour à 55 % (tier 3), puis K.O. au coup suivant
  const duel = combat([singe("Fragile", { atk: 1, perk: souffle(3) })], [singe("Brute", { atk: 2000 })], () => 0.5);
  assert.equal(evenements(duel, "souffle")[0].pvRestants, 550);
  verifierUnSeulSouffle(duel, "Fragile");

  // Présage (coup qui ignore le taunt) : le coup mortel déclenche aussi le souffle
  const presage = competenceDe(getEspece("crystal_ball_monkey"));
  const devin = combat([singe("Fragile", { hp: 300, atk: 1, perk: souffle(2) })], [singe("Devin", { atk: 300, competence: presage })], () => 0.5);
  verifierUnSeulSouffle(devin, "Fragile");

  // Porteur du groupe 2 : il se relève une fois entré en jeu, sans avoir rien déclenché avant
  const reserve = combat([singe("Front", { hp: 100, atk: 1 }), null, null, singe("Fragile", { atk: 1, perk: souffle(4) }), null, null], [singe("Brute", { atk: 800 })], () => 0.5);
  assert.ok(evenements(reserve, "souffle").every((e) => e.tour > 1));
  verifierUnSeulSouffle(reserve, "Fragile");

  // Les deux camps portent le perk : chacun se relève une fois
  const fragileFrappeur = (nom) => singe(nom, { atk: 1500, def: 0, perk: souffle(2) });
  const miroir = combat([fragileFrappeur("A1")], [fragileFrappeur("B1")], () => 0.5);
  assert.equal(evenements(miroir, "souffle").length, 2);
  verifierUnSeulSouffle(miroir, "A1");
  verifierUnSeulSouffle(miroir, "B1");

  // Batterie : équipes aléatoires, perks et compétences variés. Chaque porteur à 0 PV est suivi d'un souffle la première
  // fois (avec les bons PV), d'un KO ensuite, et se relève au plus une fois.
  let graine = 12345;
  const hasard = () => { graine = (graine * 1664525 + 1013904223) % 4294967296; return graine / 4294967296; };
  const tire = (liste) => liste[Math.floor(hasard() * liste.length)];
  const roi = competenceDe(getEspece("king_monkey"));
  const aleatoire = (nom) => singe(nom, {
    hp: 300 + Math.floor(hasard() * 2500), atk: 40 + Math.floor(hasard() * 250), def: 10 + Math.floor(hasard() * 120), crit: 10,
    perk: tire([null, souffle(1), souffle(3), souffle(5), effetPerk("taunt", 1), effetPerk("blossoming", 3), effetPerk("frenesie", 3), effetPerk("perforant", 3)]),
    competence: tire([null, null, roi, presage]),
  });
  const equipe = (p) => Array.from({ length: tire([1, 3, 6, 9]) }, (_, i) => (hasard() < 0.1 ? null : aleatoire(`${p}${i}`)));
  let releves = 0;
  for (let c = 0; c < 400; c++) {
    const r = combat(equipe("A"), equipe("B"), hasard);
    const dejaSouffle = new Set();
    r.journal.forEach((e, i) => {
      if (e.type !== "degats" || e.pvRestants > 0) return;
      const suivant = r.journal[i + 1];
      if (suivant.type === "souffle") {
        assert.equal(suivant.nom, e.sur);
        assert.ok(!dejaSouffle.has(e.sur + e.surCamp), `${e.sur} se relève deux fois`);
        dejaSouffle.add(e.sur + e.surCamp);
        assert.ok(suivant.pvRestants >= 1);
        releves++;
      } else {
        assert.equal(suivant.type, "KO");
        assert.equal(suivant.nom, e.sur);
      }
    });
  }
  assert.ok(releves > 100);
});

test("replay : un Second souffle met le combat en pause (plusieurs pas), le reste avance d'un pas par événement", () => {
  const sans = [{ type: "tour" }, { type: "degats" }, { type: "KO" }];
  assert.equal(dureeReplayMs(sans), DELAI_INITIAL_MS + 3 * PAS_MS);
  const avec = [{ type: "tour" }, { type: "degats" }, { type: "souffle" }, { type: "degats" }, { type: "KO" }];
  assert.equal(dureeReplayMs(avec), DELAI_INITIAL_MS + (4 + PAS_SOUFFLE) * PAS_MS);
  assert.ok(PAS_SOUFFLE > 1);
  assert.equal(dureeReplayMs([]), DELAI_INITIAL_MS);
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
  assert.equal(bonusDefense(effetPerk("ironskin", 1), 300), 75);   // +25 %
  assert.equal(bonusDefense(effetPerk("ironskin", 4), 281), 492);  // +175 % (491,75 arrondi)
  assert.equal(bonusDefense(effetPerk("ironskin", 1), 283), 71);   // 70,75 arrondi
  assert.equal(bonusDefense(effetPerk("taunt", 1), 300), 0);
  assert.equal(bonusDefense(null, 300), 0);
});

test("Taunt : le porteur gagne 70 % de PV et le perk reste sans tier", () => {
  const taunt = effetPerk("taunt", 1);
  assert.equal(taunt.pvPct, 70);
  assert.equal(bonusPv(taunt, 1900), 1330);
  assert.equal(bonusPv(taunt, 1625), 1138); // 1137,5 arrondi
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

test("éveil : légendaires et mythiques seulement, coûts 100 à 1 600 (×1,5 en mythique), +3 % par niveau", () => {
  assert.ok(peutEveiller("legendary") && peutEveiller("mythic"));
  assert.ok(!peutEveiller("epic") && !peutEveiller("common") && !peutEveiller(undefined));
  const couts = (r) => [1, 2, 3, 4, 5, 6].map((n) => coutEveil(r, n));
  assert.deepEqual(couts("legendary"), [100, 200, 400, 800, 1600, null]);
  assert.deepEqual(couts("mythic"), [150, 300, 600, 1200, 2400, null]);
  assert.equal(coutEveil("epic", 1), null);
  assert.equal(coutEveil("legendary", 0), null);
  // Bonus : 0 au niveau 1, +15 % au niveau 6, jamais au-delà
  assert.deepEqual([1, 2, 6, 7].map((n) => bonusEveilPct(n)), [0, 3, 15, 15]);
  assert.equal(bonusEveil(1000, 15), 150);
  assert.equal(bonusEveil(333, 3), 10); // arrondi
});

test("éveil : Présage et Décret royal s'améliorent aux niveaux 3 et 6", () => {
  const crystal = getEspece("crystal_ball_monkey");
  const king = getEspece("king_monkey");
  const presage = (n) => { const c = competenceDe(crystal, n); return [c.critMult, c.percePct]; };
  assert.deepEqual([1, 2, 3, 5, 6].map(presage), [[2.5, 35], [2.5, 35], [2.8, 35], [2.8, 35], [2.8, 50]]);
  const decret = (n) => { const c = competenceDe(king, n); return [c.atkPct, c.hpPct, c.defPct, c.cumulMax]; };
  assert.deepEqual([1, 3, 6].map(decret), [[5, 5, 5, 5], [8, 8, 8, 5], [8, 8, 8, 6]]);
  // Les réglages d'éveil ne sont jamais envoyés au moteur
  assert.equal(competenceDe(king, 6).eveil, undefined);
  assert.ok(ameliorationCompetence(crystal, 3) && ameliorationCompetence(king, 6));
  assert.ok(!ameliorationCompetence(crystal, 4) && !ameliorationCompetence(getEspece("sexy_monkey"), 3));
});

test("éveil : le JSON est vérifié au chargement", () => {
  assert.doesNotThrow(() => validerEveil(EVEIL));
  assert.throws(() => validerEveil({ ...EVEIL, couts: [100, 200] }), /coûts/);
  assert.throws(() => validerEveil({ ...EVEIL, raretes: { divin: 2 } }), /rareté/);
  assert.throws(() => validerEveil({ ...EVEIL, niveauMax: 5, couts: [1, 2, 3, 4] }), /au-delà du maximum/);
  assert.doesNotThrow(() => validerCompetences(COMPETENCES));
  const avecEveil = (eveil) => ({ x: { nom: "X", icone: "x", actif: true, critMult: 2, eveil } });
  assert.throws(() => validerCompetences(avecEveil({ 3: { vitesse: 2 } })), /réglage d'éveil inconnu/);
  assert.throws(() => validerCompetences(avecEveil({ 1: { critMult: 3 } })), /niveau d'éveil invalide/);
  assert.doesNotThrow(() => validerDonjons(DONJON_EVEIL, "eveil"));
  assert.throws(() => validerEveil({ ...EVEIL, ressource: "or" }), /ressource d'éveil inconnue/);
  assert.throws(() => validerDonjons({ ...DONJON_EVEIL, ticketsParJour: 0 }, "eveil"), /ticketsParJour/);
});

test("donjon d'éveil : gains, tickets, balayage et ennemis propres, absent de la page Ressources", () => {
  assert.ok(!Object.hasOwn(RESSOURCES.donjons, "eveil"));
  assert.deepEqual([1, 2, 10].map((p) => gainDonjon("eveil", p, DONJON_EVEIL)), [30, 33, 57]);
  assert.equal(etageEquivalent(10, DONJON_EVEIL), 23);
  // Ennemis différents de ceux des donjons de ressources au même palier
  const ids = (l) => l.filter(Boolean).map((s) => s.id).join();
  const autres = ["tirages", "coins", "xp"].map((x) => ids(ennemisDonjon(x, 25)));
  assert.ok(!autres.includes(ids(ennemisDonjon("eveil", 25, DONJON_EVEIL))));
  // 2 tickets par jour, 3 avec Clé de donjon, et le ticket offert au déblocage
  const sansCle = agregerEffets([]);
  const avecCle = agregerEffets(["strat.cle_donjon"]);
  assert.equal(ticketsParJour(sansCle, DONJON_EVEIL), 2);
  assert.equal(ticketsParJour(avecCle, DONJON_EVEIL), 3);
  assert.equal(ticketsApresCadeau({ jour: "2026-11-16", tickets: 0 }, "2026-11-16", 1, sansCle, DONJON_EVEIL), 1);
  assert.equal(ticketsApresCadeau(null, "2026-11-16", 1, sansCle, DONJON_EVEIL), 3);
  // État affiché : pas de balayage avant le premier palier battu, puis le gain du dernier palier battu
  const neuf = etatDonjon("eveil", null, DONJON_EVEIL, sansCle, "2026-11-16");
  assert.deepEqual([neuf.palier, neuf.gain, neuf.balayage, neuf.tickets, neuf.ticketsMax], [1, 30, null, 2, 2]);
  const avance = etatDonjon("eveil", { palier: 10, tickets: 1, jour: "2026-11-16" }, DONJON_EVEIL, avecCle, "2026-11-16");
  assert.deepEqual([avance.gain, avance.balayage, avance.tickets, avance.ticketsMax], [57, 54, 1, 3]);
});

test("éveil en combat : +x % de PV, ATK et DEF de base, cumulé avec l'arbre et les perks sans s'y multiplier", () => {
  const crystal = getEspece("crystal_ball_monkey");
  const effets = agregerEffets([]);
  const s = statsFinales(crystal, 5);
  const niv1 = singeDeCombat("crystal_ball_monkey", crystal, 5, { effets });
  assert.deepEqual([niv1.hp, niv1.atk, niv1.def], [s.hp, s.atk, s.def]);
  assert.equal(niv1.competence.critMult, 2.5);
  const niv6 = singeDeCombat("crystal_ball_monkey", crystal, 5, { effets, eveil: 6 });
  assert.deepEqual([niv6.hp, niv6.atk, niv6.def], [s.hp + bonusEveil(s.hp, 15), s.atk + bonusEveil(s.atk, 15), s.def + bonusEveil(s.def, 15)]);
  assert.deepEqual([niv6.competence.critMult, niv6.competence.percePct], [2.8, 50]);
  assert.equal(niv6.spd, s.spd); // stats secondaires inchangées
  // Avec Peau de fer IV (+25 %) : les deux bonus portent sur la DEF de base et s'additionnent
  const fer = singeDeCombat("crystal_ball_monkey", crystal, 5, { effets, perk: effetPerk("ironskin", 4), eveil: 6 });
  assert.equal(fer.def, s.def + bonusDefense(effetPerk("ironskin", 4), s.def) + bonusEveil(s.def, 15));
});

test("récompenses de donjon lues dans le JSON : tirages, coins, XP ou ressource stockée", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(RESSOURCES.donjons).map(([id, d]) => [id, d.recompense])),
    { tirages: "tirages", coins: "coins", xp: "xp", armement: "acier", equipement: "etoffe" });
  assert.equal(DONJON_EVEIL.donjons.eveil.recompense, "essence");
  assert.deepEqual(infoRecompense("acier"), { id: "acier", nom: "acier", icone: "🔩" });
  assert.deepEqual(infoRecompense("xp"), { id: "xp", nom: "XP", icone: "⭐" });
  assert.equal(infoRecompense("or"), null);
  assert.equal(infoRecompense("toString"), null);
  assert.ok(estRessourceJoueur("essence") && estRessourceJoueur("acier") && !estRessourceJoueur("coins"));
  // Récompense inconnue ou balayage mal écrit : refusés au chargement
  const avec = (d) => ({ ...RESSOURCES, donjons: { x: { ...RESSOURCES.donjons.armement, ...d } } });
  assert.throws(() => validerDonjons(avec({ recompense: "or" }), "test"), /récompense inconnue/);
  assert.throws(() => validerDonjons(avec({ balayage: "oui" }), "test"), /balayage invalide/);
  assert.throws(() => validerRessourcesJoueur({ coins: { nom: "coins", icone: "x" } }), /récompense spéciale/);
});

test("donjon de l'armement : 15 acier + 1 par palier, balayage permis ; pas de balayage pour tirages, coins et XP", () => {
  assert.deepEqual([1, 2, 10].map((p) => gainDonjon("armement", p)), [15, 16, 24]);
  const ids = (l) => l.filter(Boolean).map((s) => s.id).join();
  const autres = ["tirages", "coins", "xp"].map((x) => ids(ennemisDonjon(x, 25)));
  assert.ok(!autres.includes(ids(ennemisDonjon("armement", 25))));
  const effets = agregerEffets([]);
  const ligne = { palier: 10, tickets: 2, jour: "2026-11-17" };
  const etat = (id) => etatDonjon(id, ligne, RESSOURCES, effets, "2026-11-17");
  assert.equal(etat("armement").balayage, 23);
  assert.deepEqual(etat("armement").recompense, { id: "acier", nom: "acier", icone: "🔩" });
  for (const id of ["tirages", "coins", "xp"]) assert.equal(etat(id).balayage, null, id);
});

test("armes : catalogue vérifié, 4 armes à 5 tiers, loterie pondérée par tier", () => {
  assert.deepEqual(Object.keys(ARMES.objets), ["epee", "dague", "hache", "masse"]);
  assert.equal(nbTiersObjet(ARMES), 5);
  assert.ok(objetExiste(ARMES, "epee", 5) && !objetExiste(ARMES, "epee", 6) && !objetExiste(ARMES, "arc", 1) && !objetExiste(ARMES, "toString", 1));
  // Hasard injecté : l'arme se choisit sur le premier nombre, le tier sur le second
  const suite = (...v) => { let i = 0; return () => v[i++]; };
  assert.deepEqual(tirerObjet(ARMES, suite(0, 0)), { objet: "epee", tier: 1 });
  assert.deepEqual(tirerObjet(ARMES, suite(0.99, 0.999)), { objet: "masse", tier: 5 });
  assert.deepEqual(tirerObjet(ARMES, suite(0.3, 0.6)), { objet: "dague", tier: 2 }); // 0,6 × 100 = 60 : après les 50 du tier I
  // Sur beaucoup de tirages : environ 50 % de tier I et 2 % de tier V
  let graine = 7;
  const hasard = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
  const compte = [0, 0, 0, 0, 0];
  for (let i = 0; i < 20000; i++) compte[tirerObjet(ARMES, hasard).tier - 1]++;
  assert.ok(Math.abs(compte[0] / 20000 - 0.5) < 0.02 && Math.abs(compte[4] / 20000 - 0.02) < 0.006, String(compte));
  // JSON incohérent refusé
  const casse = (modif) => ({ ...ARMES, ...modif });
  assert.throws(() => validerCatalogue(casse({ ressource: "or" })), /ressource inconnue/);
  assert.throws(() => validerCatalogue(casse({ chancesTiers: [50, 50] })), /il faut 2/);
  assert.throws(() => validerCatalogue(casse({ demantelement: [2, 3, 5, 8, -1] })), /démantèlement/);
  assert.throws(() => validerCatalogue(casse({ objets: { x: { nom: "X", icone: "x", tiers: [{ vol: 1 }, {}, {}, {}, {}] } } })), /effet inconnu/);
});

test("objets uniques : pas de niveau, chaque exemplaire a les valeurs de son tier", () => {
  assert.equal(ARMES.niveaux, undefined);
  assert.equal(EQUIPEMENTS.niveaux, undefined);
  assert.deepEqual(valeursObjet(ARMES, "epee", 5), ARMES.objets.epee.tiers[4]);
  assert.deepEqual(valeursObjet(ARMES, "dague", 3), ARMES.objets.dague.tiers[2]);
  // Copie : modifier les valeurs renvoyées ne touche pas le catalogue
  valeursObjet(ARMES, "epee", 1).atkPct = 999;
  assert.notEqual(ARMES.objets.epee.tiers[0].atkPct, 999);
  assert.deepEqual(effetObjet(ARMES, "hache", 1),
    { type: "arme", id: "hache", tier: 1, nom: "Hache", icone: "🪓", ...ARMES.objets.hache.tiers[0] });
  assert.equal(effetObjet(ARMES, "hache", 9), null);
});

test("armes en combat : % des stats de base, crit en points, cumulés avec l'éveil et le perk sans s'y multiplier", () => {
  const s = { hp: 1000, atk: 500, def: 300, crit: 10, critdmg: 150 };
  const masse = ARMES.objets.masse.tiers[4], dague = ARMES.objets.dague.tiers[4];
  assert.deepEqual(bonusObjets([effetObjet(ARMES, "masse", 5)], s),
    { hp: 0, atk: Math.round(5 * masse.atkPct), def: Math.round(3 * masse.defPct), crit: 0, critdmg: 0 });
  assert.deepEqual(bonusObjets([effetObjet(ARMES, "dague", 5)], s),
    { hp: 0, atk: Math.round(5 * dague.atkPct), def: 0, crit: dague.crit, critdmg: 0 });
  assert.deepEqual(bonusObjets([], s), { hp: 0, atk: 0, def: 0, crit: 0, critdmg: 0 });

  const crystal = getEspece("crystal_ball_monkey");
  const effets = agregerEffets([]);
  const base = statsFinales(crystal, 5);
  const epee = effetObjet(ARMES, "epee", 5);
  const hache = effetObjet(ARMES, "hache", 3);
  const armee = singeDeCombat("crystal_ball_monkey", crystal, 5, { effets, eveil: 6, objets: [epee] });
  assert.equal(armee.atk, base.atk + bonusEveil(base.atk, 15) + Math.round((base.atk * epee.atkPct) / 100));
  assert.equal(armee.def, base.def + bonusEveil(base.def, 15));
  const crit = singeDeCombat("crystal_ball_monkey", crystal, 5, { effets, objets: [hache] });
  assert.deepEqual([crit.crit, crit.critdmg], [base.crit, base.critdmg + hache.critdmg]);
});

test("équipements : 6 sortes à 5 tiers, 3 emplacements, payés en étoffe", () => {
  assert.deepEqual(Object.keys(EQUIPEMENTS.objets), ["casque", "armure", "bottes", "gants", "anneau", "amulette"]);
  assert.deepEqual([EQUIPEMENTS.type, EQUIPEMENTS.slots, EQUIPEMENTS.prix, EQUIPEMENTS.ressource], ["equipement", 3, 10, "etoffe"]);
  assert.equal(EQUIPEMENTS.uneSorteParSinge, undefined);
  assert.deepEqual(Object.keys(CATALOGUES), ["arme", "equipement"]);
  assert.deepEqual(infoRecompense("etoffe"), { id: "etoffe", nom: "étoffe", icone: "🧵" });
  assert.deepEqual([1, 2, 10].map((p) => gainDonjon("equipement", p)), [15, 16, 24]);
  assert.equal(RESSOURCES.donjons.equipement.balayage, true);
  const ids = (l) => l.filter(Boolean).map((s) => s.id).join();
  assert.notEqual(ids(ennemisDonjon("equipement", 25)), ids(ennemisDonjon("armement", 25)));
  assert.deepEqual(valeursObjet(EQUIPEMENTS, "bottes", 5), EQUIPEMENTS.objets.bottes.tiers[4]);
});

test("équipements en combat : les 3 objets et l'arme s'additionnent en % des stats de base", () => {
  const s = { hp: 1000, atk: 500, def: 300, crit: 10, critdmg: 150 };
  const portes = [
    effetObjet(EQUIPEMENTS, "armure", 5), effetObjet(EQUIPEMENTS, "casque", 5), effetObjet(EQUIPEMENTS, "bottes", 5),
    effetObjet(ARMES, "epee", 5),
  ];
  // PV : 12 + 8 = 20 % ; DEF : 12 + 8 = 20 % ; ATK : 12 %
  assert.deepEqual(bonusObjets(portes, s), { hp: 200, atk: 60, def: 60, crit: 0, critdmg: 0 });
  const crystal = getEspece("crystal_ball_monkey");
  const base = statsFinales(crystal, 5);
  const singe = singeDeCombat("crystal_ball_monkey", crystal, 5, { effets: agregerEffets([]), objets: portes });
  assert.deepEqual([singe.hp, singe.atk, singe.def],
    [base.hp + Math.round(base.hp * 0.2), base.atk + Math.round(base.atk * 0.12), base.def + Math.round(base.def * 0.2)]);
  // Le même équipement trois fois sur un singe : ses pourcentages s'additionnent
  const casque = effetObjet(EQUIPEMENTS, "casque", 3);
  assert.equal(bonusObjets([casque, casque, casque], s).def, Math.round((300 * 3 * casque.defPct) / 100));
});

test("éveil : détail des 6 niveaux pour la fiche du Monkeydex (bonus, coût, compétence)", () => {
  const crystal = paliersEveil(getEspece("crystal_ball_monkey"));
  assert.deepEqual(crystal.map((p) => [p.niveau, p.bonusPct, p.cout]),
    [[1, 0, null], [2, 3, 150], [3, 6, 300], [4, 9, 600], [5, 12, 1200], [6, 15, 2400]]);
  // Compétence de base au niveau 1, puis aux niveaux qui l'améliorent seulement
  assert.deepEqual(crystal.map((p) => p.competence && [p.competence.critMult, p.competence.percePct]),
    [[2.5, 35], null, [2.8, 35], null, null, [2.8, 50]]);
  // Légendaire sans compétence : coûts de base, aucune compétence
  const sexy = paliersEveil(getEspece("sexy_monkey"));
  assert.deepEqual(sexy.map((p) => p.cout), [null, 100, 200, 400, 800, 1600]);
  assert.ok(sexy.every((p) => p.competence === null));
  // Rareté non éveillable : aucun niveau
  assert.deepEqual(paliersEveil(getEspece("balloon_monkey")), []);
});

test("série de connexion : J1 à J7, puis retour à J1 après J7 ou après un jour manqué", () => {
  const serie = QUOTIDIEN.serie;
  // Jamais récupérée : J1 disponible, le reste à venir
  const neuf = etatSerie(null, "2026-11-17");
  assert.equal(neuf.courant, 1);
  assert.equal(neuf.recuperee, false);
  assert.deepEqual(neuf.jours.map((j) => j.etat), ["dispo", ...Array(serie.length - 1).fill("avenir")]);
  // J3 récupéré hier : J4 disponible, J1 à J3 reçus
  const suite = etatSerie({ jour: 3, dernier_jour: "2026-11-16" }, "2026-11-17");
  assert.equal(suite.courant, 4);
  assert.deepEqual(suite.jours.slice(0, 5).map((j) => j.etat), ["recu", "recu", "recu", "dispo", "avenir"]);
  // J3 récupéré aujourd'hui : rien de disponible
  const fait = etatSerie({ jour: 3, dernier_jour: "2026-11-17" }, "2026-11-17");
  assert.equal(fait.recuperee, true);
  assert.equal(fait.courant, 3);
  assert.equal(fait.jours[2].etat, "recu");
  assert.equal(fait.jours[3].etat, "avenir");
  // Jour manqué : la série repart de J1
  assert.equal(etatSerie({ jour: 5, dernier_jour: "2026-11-15" }, "2026-11-17").courant, 1);
  // Après J7 : retour à J1 (passage de mois compris)
  assert.equal(etatSerie({ jour: serie.length, dernier_jour: "2026-11-30" }, "2026-12-01").courant, 1);
  assert.equal(veille("2026-03-01"), "2026-02-28");
  assert.equal(veille("2027-01-01"), "2026-12-31");
});

test("quêtes du jour : mêmes quêtes pour tous, distinctes, et qui changent d'un jour à l'autre", () => {
  const q = QUOTIDIEN.quetes;
  const jour = quetesDuJour("2026-11-17");
  assert.equal(jour.length, q.parJour);
  assert.equal(new Set(jour).size, q.parJour);
  assert.deepEqual(quetesDuJour("2026-11-17"), jour);
  for (const id of jour) assert.ok(TYPES_QUETES.includes(id));
  const differents = new Set(Array.from({ length: 14 }, (_, i) => quetesDuJour(`2026-12-${String(i + 1).padStart(2, "0")}`).join()));
  assert.ok(differents.size > 1);
});

test("quêtes du jour : progression plafonnée, bonus quand toutes sont terminées, pastilles", () => {
  const jour = "2026-11-17";
  const ids = quetesDuJour(jour);
  const objectif = (id) => QUOTIDIEN.quetes.catalogue[id].objectif;

  const vide = etatQuetes(jour, []);
  assert.deepEqual(vide.quetes.map((x) => x.rang), [1, 2, 3]);
  assert.ok(vide.quetes.every((x) => x.progres === 0 && !x.terminee));
  assert.equal(vide.bonus.disponible, false);

  const lignes = [
    { quete: ids[0], progres: objectif(ids[0]) + 40, reclamee: true },
    { quete: ids[1], progres: objectif(ids[1]), reclamee: false },
    { quete: ids[2], progres: objectif(ids[2]) - 1, reclamee: false },
  ];
  const partiel = etatQuetes(jour, lignes);
  assert.equal(partiel.quetes[0].progres, objectif(ids[0]));
  assert.equal(partiel.quetes[1].terminee, true);
  assert.equal(partiel.quetes[2].terminee, false);
  assert.equal(partiel.bonus.disponible, false);
  const serieFaite = etatSerie({ jour: 1, dernier_jour: jour }, jour);
  assert.deepEqual(pastilles(serieFaite, partiel), { serie: false, quetes: true });

  lignes[1].reclamee = true;
  lignes[2].progres += 1;
  lignes[2].reclamee = true;
  const complet = etatQuetes(jour, lignes);
  assert.equal(complet.bonus.disponible, true);
  assert.equal(pastilles(serieFaite, complet).quetes, true);
  const fini = etatQuetes(jour, [...lignes, { quete: QUETE_BONUS, progres: 0, reclamee: true }]);
  assert.deepEqual(pastilles(serieFaite, fini), { serie: false, quetes: false });
  assert.deepEqual(pastilles(etatSerie(null, jour), fini), { serie: true, quetes: false });
});

test("quotidien : règles validées et récompenses décrites", () => {
  assert.doesNotThrow(() => validerQuotidien(QUOTIDIEN));
  const copie = () => JSON.parse(JSON.stringify(QUOTIDIEN));
  const inconnue = copie();
  inconnue.quetes.catalogue.danser = { texte: "Danser", icone: "💃", objectif: 1 };
  assert.throws(() => validerQuotidien(inconnue), /quête inconnue/);
  const mauvaise = copie();
  mauvaise.serie[0] = { tirages: -5 };
  assert.throws(() => validerQuotidien(mauvaise), /quantité invalide/);
  const rarete = copie();
  rarete.serie[6] = { singe: "divin" };
  assert.throws(() => validerQuotidien(rarete), /rareté inconnue/);

  assert.deepEqual(decrireRecompense({ singe: "legendary" }), [{ icone: "🐒", valeur: "Légendaire+", nom: "singe légendaire ou mieux" }]);
  assert.deepEqual(decrireRecompense({ acier: 100 })[0].icone, "🔩");
  assert.equal(decrireRecompense({ objets: 3 })[0].valeur, "3 objets");
});

test("singe offert : rareté minimale respectée, dans les proportions des raretés gardées", () => {
  assert.deepEqual(poidsRaretes(null, { rareteMin: "legendary" }).map((r) => r.nom), ["legendary", "mythic"]);
  for (let i = 0; i < 50; i++) assert.ok(["legendary", "mythic"].includes(getEspece(tirer(null, { rareteMin: "legendary" })).rarete));
  assert.equal(tirerRarete(null, { rareteMin: "legendary", hasard: () => 0 }), "legendary");
  assert.equal(tirerRarete(null, { rareteMin: "legendary", hasard: () => 0.999 }), "mythic");
  assert.throws(() => poidsRaretes(null, { rareteMin: "divin" }), /rareté inconnue/);
});

test("objets uniques : démanteler rend de la ressource selon le tier", () => {
  assert.deepEqual(ARMES.demantelement, [2, 3, 5, 8, 15]);
  assert.deepEqual(EQUIPEMENTS.demantelement, [2, 3, 5, 8, 15]);
  assert.deepEqual([1, 2, 3, 4, 5].map((t) => remboursementDemantelement(ARMES, t)), [2, 3, 5, 8, 15]);
  assert.equal(remboursementDemantelement(EQUIPEMENTS, 9), 0);
});

test("auto-tirage : réglages, filtre « cette rareté ou mieux » et tirages dus", () => {
  assert.deepEqual(RYTHMES_AUTO, [1, 2, 5]);
  assert.deepEqual(RARETES_AUTO, ["uncommon", "rare", "epic", "legendary", "mythic"]);
  assert.ok(reglageAutoValide(5, "epic"));
  assert.ok(!reglageAutoValide(3, "epic"));
  assert.ok(!reglageAutoValide(10, "epic"));
  assert.ok(!reglageAutoValide(1, "common"));
  assert.ok(!reglageAutoValide(1, "<script>"));

  assert.ok(passeFiltre("epic", "epic"));
  assert.ok(passeFiltre("mythic", "epic"));
  assert.ok(!passeFiltre("rare", "epic"));
  assert.ok(passeFiltre("legendary", "legendary") && !passeFiltre("epic", "legendary"));

  const t = Date.UTC(2026, 10, 17, 12, 0, 0);
  // 2,5 s à 2 par seconde : 5 tirages, aux instants prévus
  assert.deepEqual(instantsDus(t, t + 2500, 2), [t + 500, t + 1000, t + 1500, t + 2000, t + 2500]);
  // Moins d'un intervalle : rien
  assert.deepEqual(instantsDus(t, t + 199, 5), []);
  // Longue absence : plafonné par passage, le reste viendra aux passages suivants
  const lot = instantsDus(t, t + 3600 * 1000, 5);
  assert.equal(lot.length, LOT_AUTO_MAX);
  assert.equal(lot.at(-1), t + LOT_AUTO_MAX * 200);
  // Horloge en arrière : rien
  assert.deepEqual(instantsDus(t, t - 5000, 1), []);
});

test("un tirage daté dans le passé ne compte la recharge que jusqu'à cet instant", () => {
  const t = Date.UTC(2026, 10, 17, 12, 0, 0);
  // Stock à 1 il y a 10 min : à l'heure du tirage (t - 10 min + 1 s), pas encore de recharge
  const ligne = { tirages_restants: 1, dernier_reset: new Date(t - 600 * 1000) };
  const passe = etatQuota(ligne, t - 599 * 1000);
  assert.ok(consommerTirage(passe));
  assert.equal(passe.stock, 0);
  assert.equal(consommerTirage(etatQuota({ tirages_restants: 0, dernier_reset: new Date(passe.debutRecharge) }, t - 598 * 1000)), false);
});
