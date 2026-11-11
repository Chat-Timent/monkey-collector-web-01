import assert from "node:assert/strict";
import test from "node:test";
import { combat } from "../src/game/combat-engine.js";
import { getEspece, getImageUrl, getNiveau, statsFinales } from "../src/game/monkeys.js";
import { creerApplication } from "../src/app.js";

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

test("les anciens points d'entrée restent utilisables", async () => {
  const facade = await import("../tirage.js");
  const ancienMoteur = await import("../combat.js");

  for (const nom of [
    "tirer", "getEspece", "getImageUrl", "getNiveau", "statsFinales",
    "creerCompte", "connecter", "deconnecter", "getPseudo", "userIdDepuisToken",
    "ajouterCopie", "getMonkeydex", "getCompteurRarete", "getStarter", "choisirStarter",
    "gagnerRecompense", "getEquipe", "definirEquipe", "marquerPresence", "listerJoueurs",
    "envoyerDefi", "defisDuJoueur", "repondreDefi", "getCombat", "combatsDuJoueur",
    "lireMessages", "envoyerMessage", "lireChatGlobal", "envoyerChatGlobal",
  ]) {
    assert.equal(typeof facade[nom], "function", `${nom} doit rester exporté`);
  }
  assert.equal(ancienMoteur.combat, combat);
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
    "GET /combats",
    "GET /combats/:id",
    "GET /combats/:id/messages",
    "GET /defis",
    "GET /equipe",
    "GET /joueurs",
    "GET /moi",
    "GET /monkeydex",
    "GET /profil",
    "GET /tirage",
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
  ]);
});
