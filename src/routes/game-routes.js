import { Router } from "express";
import { authentifie } from "../middleware/authentifie.js";
import { getResumeMonkeydex, getClassement } from "../services/collection-service.js";
import { choisirStarter, getStarter } from "../services/starter-service.js";
import {
  activerDeck, definirEquipe, getDeckActif, getDecks, getEquipe, nbSlotsDuJoueur, renommerDeck, validerDeck,
} from "../services/team-service.js";
import { pool } from "../config/database.js";
import { effetsDuJoueur, getArbre, getPointsArbre, prendreNoeud } from "../services/arbre-service.js";
import { getElo } from "../services/elo-service.js";
import { effectuerTirage, getQuota } from "../services/tirage-service.js";
import { arreterAuto, avancerAuto, lancerAuto, passageAuto } from "../services/tirage-auto-service.js";
import { lireRessources } from "../services/ressources-joueur-service.js";
import { etatLoterie } from "../services/loterie-service.js";
import { ErreurJeu } from "../erreurs.js";
import { resonancesAvecBonus } from "../game/resonances.js";
import { preparerEquipe } from "../services/combat-service.js";

export const gameRoutes = Router();

// POST : le tirage modifie la collection et le starter.
gameRoutes.post("/tirage", authentifie, async (req, res) => {
  res.json(await effectuerTirage(req.userId));
});

// Auto-tirage. Le GET fait aussi les tirages dus depuis le dernier passage (calcul à la demande,
// comme la recharge) : la page Tirage l'appelle toutes les secondes pendant que ça tourne.
gameRoutes.get("/tirage/auto", authentifie, async (req, res) => {
  res.json(await passageAuto(req.userId));
});

gameRoutes.post("/tirage/auto", authentifie, async (req, res) => {
  const { rythme, rarete } = req.body ?? {};
  res.json({ auto: await lancerAuto(req.userId, Number(rythme), rarete) });
});

gameRoutes.post("/tirage/auto/arreter", authentifie, async (req, res) => {
  res.json({ auto: await arreterAuto(req.userId) });
});

gameRoutes.get("/monkeydex", authentifie, async (req, res) => {
  res.json(await getResumeMonkeydex(req.userId));
});

// Bas de la page Tirage : probabilités par rareté et flux des légendaires/mythiques.
// Endpoint à part plutôt que dans /profil : seule cette page s'en sert, inutile de le
// payer sur toutes les autres.
gameRoutes.get("/loterie", authentifie, async (req, res) => {
  res.json(await etatLoterie(req.userId));
});

// Tout ce que la barre du haut affiche : starter, stock de tirages, elo, points de talents
// et ressources (acier, étoffe, essence). Les ressources sont servies ici plutôt que par
// /armes, /equipements et /eveil : une requête de plus au lieu de trois appels par page.
gameRoutes.get("/profil", authentifie, async (req, res) => {
  // Auto-tirage en cours : ses tirages dus sont faits d'abord, pour que le stock affiché soit juste
  // sur toutes les pages. Un échec ici ne doit pas casser la barre du haut.
  await avancerAuto(req.userId).catch((err) => console.error("auto-tirage :", err));
  const [starter, quota, elo, ressources] = await Promise.all([
    getStarter(req.userId), getQuota(req.userId), getElo(req.userId), lireRessources(req.userId),
  ]);
  const pointsArbre = starter ? await getPointsArbre(req.userId, starter.niveau) : 0;
  res.json({ starter, quota, pointsArbre, elo, ressources });
});

// Arbre du starter : état complet, et déblocage d'un nœud (renvoie l'état mis à jour)
gameRoutes.get("/arbre", authentifie, async (req, res) => {
  res.json(await getArbre(req.userId));
});

gameRoutes.post("/arbre/noeuds", authentifie, async (req, res) => {
  res.json(await prendreNoeud(req.userId, req.body?.noeud));
});

gameRoutes.post("/starter", authentifie, async (req, res) => {
  const { choix } = req.body ?? {};
  if (!choix) throw new ErreurJeu("choix requis");
  res.json(await choisirStarter(req.userId, choix));
});

// `?deck=N` : deck affiché (par défaut le deck actif, celui des combats)
gameRoutes.get("/equipe", authentifie, async (req, res) => {
  const actif = await getDeckActif(req.userId);
  const deck = req.query.deck === undefined ? actif : validerDeck(req.query.deck);
  const [equipe, nbSlots, effets, prete, decks] = await Promise.all([
    getEquipe(req.userId, pool, deck), nbSlotsDuJoueur(req.userId), effetsDuJoueur(req.userId),
    preparerEquipe(req.userId, pool, deck), getDecks(req.userId),
  ]);
  // Stats de chaque emplacement telles qu'en combat (arbre, perk, éveil, objets et résonances compris), null si vide
  const STATS = ["hp", "atk", "def", "spd", "prec", "esq", "crit", "critdmg"];
  const combat = prete.map((s) => (s ? Object.fromEntries(STATS.map((k) => [k, s[k]])) : null));
  // Catalogue des traits avec leurs valeurs telles qu'elles comptent en combat (Harmonie, Chœur compris)
  res.json({ equipe, nbSlots, resonances: resonancesAvecBonus(effets.resonance_pct), combat, deck, actif, decks });
});

// `deck` absent : le deck actif (anciens clients)
gameRoutes.post("/equipe", authentifie, async (req, res) => {
  const { especes, deck } = req.body ?? {};
  if (!Array.isArray(especes)) throw new ErreurJeu("especes requis");
  const n = deck === undefined ? await getDeckActif(req.userId) : validerDeck(deck);
  res.json({ equipe: await definirEquipe(req.userId, especes, n) });
});

// Deck utilisé en combat
gameRoutes.post("/equipe/actif", authentifie, async (req, res) => {
  const deck = validerDeck(req.body?.deck);
  await activerDeck(req.userId, deck);
  res.json({ actif: deck });
});

gameRoutes.post("/equipe/nom", authentifie, async (req, res) => {
  const deck = validerDeck(req.body?.deck);
  await renommerDeck(req.userId, deck, req.body?.nom);
  res.json({ decks: await getDecks(req.userId) });
});

gameRoutes.get("/classement", authentifie, async (req, res) => {
  res.json({ joueurs: await getClassement(req.userId) });
});
