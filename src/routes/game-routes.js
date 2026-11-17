import { Router } from "express";
import { authentifie } from "../middleware/authentifie.js";
import { getResumeMonkeydex, getClassement } from "../services/collection-service.js";
import { choisirStarter, getStarter } from "../services/starter-service.js";
import { definirEquipe, getEquipe, nbSlotsDuJoueur } from "../services/team-service.js";
import { effetsDuJoueur, getArbre, getPointsArbre, prendreNoeud } from "../services/arbre-service.js";
import { getElo } from "../services/elo-service.js";
import { effectuerTirage, getQuota } from "../services/tirage-service.js";
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

gameRoutes.get("/equipe", authentifie, async (req, res) => {
  const [equipe, nbSlots, effets, prete] = await Promise.all([
    getEquipe(req.userId), nbSlotsDuJoueur(req.userId), effetsDuJoueur(req.userId), preparerEquipe(req.userId),
  ]);
  // Stats de chaque emplacement telles qu'en combat (arbre, perk, éveil, objets et résonances compris), null si vide
  const STATS = ["hp", "atk", "def", "spd", "prec", "esq", "crit", "critdmg"];
  const combat = prete.map((s) => (s ? Object.fromEntries(STATS.map((k) => [k, s[k]])) : null));
  // Bonus de résonance affichés tels qu'ils comptent en combat (Harmonie, Chœur compris)
  res.json({ equipe, nbSlots, resonances: resonancesAvecBonus(effets.resonance_pct), combat });
});

gameRoutes.post("/equipe", authentifie, async (req, res) => {
  const { especes } = req.body ?? {};
  if (!Array.isArray(especes)) throw new ErreurJeu("especes requis");
  res.json({ equipe: await definirEquipe(req.userId, especes) });
});

gameRoutes.get("/classement", authentifie, async (req, res) => {
  res.json({ joueurs: await getClassement(req.userId) });
});
