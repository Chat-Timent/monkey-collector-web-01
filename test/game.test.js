import assert from "node:assert/strict";
import test from "node:test";
import { combat } from "../src/game/combat-engine.js";
import { getEspece, getImageUrl, getNiveau, statsFinales } from "../src/game/monkeys.js";
import { appliquerGains } from "../src/game/progression.js";
import { debutFenetre, etatQuota } from "../src/game/quota.js";
import { creerApplication } from "../src/app.js";
import { ErreurJeu, gererErreurs } from "../src/erreurs.js";

test("les paliers de niveau restent identiques", () => {
  assert.deepEqual(getNiveau("common", 5), { niveau: 1, progression: 5, prochain: 6 });
  assert.deepEqual(getNiveau("common", 6), { niveau: 2, progression: 0, prochain: 11 });
  assert.deepEqual(getNiveau("legendary", 5), { niveau: 3, progression: 0, prochain: 4 });
});

test("les données et statistiques d'un singe sont inchangées", () => {
  const espece = getEspece("basic_monkey");
  assert.equal(getImageUrl("basic_monkey"), "/images/MonkeysIcons/basic_monkey.png");
  assert.deepEqual(statsFinales(espece, 3), {
    hp: 490,
    atk: 390,
    def: 317,
    spd: 102,
    prec: 5,
    esq: 5,
    crit: 5,
    critdmg: 150,
  });
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
    "GET /chat",
    "GET /classement",
    "GET /combats",
    "GET /combats/:id",
    "GET /combats/:id/messages",
    "GET /defis",
    "GET /equipe",
    "GET /joueurs",
    "GET /moi",
    "GET /monkeydex",
    "GET /profil",
    "POST /chat",
    "POST /combats/:id/messages",
    "POST /connexion",
    "POST /deconnexion",
    "POST /defis",
    "POST /defis/:id/repondre",
    "POST /equipe",
    "POST /inscription",
    "POST /presence",
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

test("le quota de tirages se réinitialise à heure fixe toutes les 10 minutes", () => {
  const dix = 10 * 60 * 1000;
  const t = Date.UTC(2026, 10, 14, 14, 37, 12); // 14:37:12 UTC
  const debut = Date.UTC(2026, 10, 14, 14, 30);

  // Fenêtre calée sur l'horloge, indépendante du joueur
  assert.equal(debutFenetre(t), debut);
  assert.equal(debutFenetre(debut), debut);
  assert.equal(debutFenetre(debut - 1), debut - dix);

  // Jamais tiré : quota plein
  const neuf = etatQuota(null, t);
  assert.equal(neuf.restants, 20);
  assert.equal(neuf.max, 20);
  assert.equal(neuf.prochainReset, "2026-11-14T14:40:00.000Z");
  assert.equal(neuf.msAvantReset, Date.UTC(2026, 10, 14, 14, 40) - t);

  // Ligne de la fenêtre en cours : on garde le compte
  assert.equal(etatQuota({ tirages_restants: 0, dernier_reset: new Date(debut) }, t).restants, 0);
  assert.equal(etatQuota({ tirages_restants: 7, dernier_reset: new Date(debut).toISOString() }, t).restants, 7);

  // Ligne d'une fenêtre passée : reset
  assert.equal(etatQuota({ tirages_restants: 0, dernier_reset: new Date(debut - dix) }, t).restants, 20);
  assert.equal(etatQuota({ tirages_restants: 0, dernier_reset: new Date(debut) }, debut + dix).restants, 20);
});

test("une erreur métier peut renvoyer des détails au client", () => {
  let statut, corps;
  const res = { headersSent: false, status(s) { statut = s; return this; }, json(c) { corps = c; } };
  gererErreurs(new ErreurJeu("plus de tirages", 429, { quota: { restants: 0 } }), {}, res, () => {});
  assert.equal(statut, 429);
  assert.deepEqual(corps, { quota: { restants: 0 }, erreur: "plus de tirages" });
});
