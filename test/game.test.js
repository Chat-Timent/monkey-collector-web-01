import assert from "node:assert/strict";
import test from "node:test";
import { combat } from "../src/game/combat-engine.js";
import { getEspece, getImageUrl, getNiveau, statsFinales } from "../src/game/monkeys.js";
import { appliquerGains, gainsDuTirage } from "../src/game/progression.js";
import { agregerEffets, etatArbre, pointsDepenses } from "../src/game/starter-arbre.js";
import { consommerTirage, debutFenetre, etatQuota } from "../src/game/quota.js";
import { ennemisEtage, recompensesEtage, singeBonus } from "../src/game/aventure.js";
import { calculerElo } from "../src/game/elo.js";
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
    "GET /profil",
    "POST /arbre/noeuds",
    "POST /aventure/combat",
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

test("l'arbre du starter : 1 point par niveau gagné, prérequis respectés", () => {
  const arbre = {
    "a.racine": { branche: "farm", nom: "R", cout: 1, prerequis: [], mode: "tous", effet: {} },
    "a.un": { branche: "farm", nom: "Un", cout: 1, prerequis: ["a.racine"], mode: "tous", effet: { xp_pct: 0.05 } },
    "a.deux": { branche: "farm", nom: "Deux", cout: 2, prerequis: ["a.racine"], mode: "tous", effet: { xp_pct: 0.1 } },
    "a.les2": { branche: "farm", nom: "Les2", cout: 1, prerequis: ["a.un", "a.deux"], mode: "tous", effet: {} },
    "a.l1": { branche: "farm", nom: "L1", cout: 1, prerequis: ["a.un", "a.deux"], mode: "au_moins_un", effet: {} },
  };
  const etat = (niveau, pris) => Object.fromEntries(etatArbre(niveau, pris, arbre).noeuds.map((n) => [n.id, n.etat]));

  // Niveau 1 : aucun point
  assert.equal(etatArbre(1, [], arbre).points, 0);
  assert.equal(etat(1, [])["a.racine"], "verrouille");
  // Niveau 2 : 1 point, seule la racine est disponible
  assert.deepEqual(etat(2, []), { "a.racine": "disponible", "a.un": "verrouille", "a.deux": "verrouille", "a.les2": "verrouille", "a.l1": "verrouille" });
  // Le coût compte : a.deux coûte 2 points
  assert.equal(pointsDepenses(["a.racine", "a.deux"], arbre), 3);
  assert.equal(etat(3, ["a.racine"])["a.deux"], "verrouille");
  assert.equal(etat(4, ["a.racine"])["a.deux"], "disponible");
  // Mode "tous" contre "au_moins_un"
  const e = etat(10, ["a.racine", "a.un"]);
  assert.equal(e["a.les2"], "verrouille");
  assert.equal(e["a.l1"], "disponible");
  // Effets cumulés ; un nœud retiré du JSON est ignoré et remboursé
  assert.ok(Math.abs(etatArbre(10, ["a.racine", "a.un", "a.deux", "disparu"], arbre).effets.xp_pct - 0.15) < 1e-9);
  assert.equal(etatArbre(10, ["a.racine", "disparu"], arbre).points, 8);
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

test("les tirages bonus sont consommés après le quota gratuit", () => {
  const maintenant = Date.UTC(2026, 10, 14, 14, 37);
  const debut = new Date(Date.UTC(2026, 10, 14, 14, 30));
  const quota = etatQuota({ tirages_restants: 1, dernier_reset: debut, tirages_bonus: 2 }, maintenant);
  assert.equal(quota.bonus, 2);
  assert.ok(consommerTirage(quota));
  assert.deepEqual([quota.restants, quota.bonus], [0, 2]);
  assert.ok(consommerTirage(quota));
  assert.ok(consommerTirage(quota));
  assert.deepEqual([quota.restants, quota.bonus], [0, 0]);
  assert.equal(consommerTirage(quota), false);
  // Le stock bonus survit au reset ; sans ligne, il vaut 0
  assert.equal(etatQuota({ tirages_restants: 0, dernier_reset: new Date(0), tirages_bonus: 3 }, maintenant).bonus, 3);
  assert.equal(etatQuota(null, maintenant).bonus, 0);
});
