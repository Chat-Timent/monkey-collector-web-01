import { Router } from "express";
import { authentifie } from "../middleware/authentifie.js";
import { getResumeMonkeydex, getClassement } from "../services/collection-service.js";
import { choisirStarter, getStarter } from "../services/starter-service.js";
import { definirEquipe, getEquipe, nbSlotsDuJoueur } from "../services/team-service.js";
import { getArbre, getPointsArbre, prendreNoeud } from "../services/arbre-service.js";
import { effectuerTirage, getQuota } from "../services/tirage-service.js";
import { ErreurJeu } from "../erreurs.js";

export const gameRoutes = Router();

// POST : le tirage modifie la collection et le starter.
gameRoutes.post("/tirage", authentifie, async (req, res) => {
  res.json(await effectuerTirage(req.userId));
});

gameRoutes.get("/monkeydex", authentifie, async (req, res) => {
  res.json(await getResumeMonkeydex(req.userId));
});

gameRoutes.get("/profil", authentifie, async (req, res) => {
  const [starter, quota] = await Promise.all([getStarter(req.userId), getQuota(req.userId)]);
  const pointsArbre = starter ? await getPointsArbre(req.userId, starter.niveau) : 0;
  res.json({ starter, quota, pointsArbre });
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
  const [equipe, nbSlots] = await Promise.all([getEquipe(req.userId), nbSlotsDuJoueur(req.userId)]);
  res.json({ equipe, nbSlots });
});

gameRoutes.post("/equipe", authentifie, async (req, res) => {
  const { especes } = req.body ?? {};
  if (!Array.isArray(especes)) throw new ErreurJeu("especes requis");
  res.json({ equipe: await definirEquipe(req.userId, especes) });
});

gameRoutes.get("/classement", authentifie, async (req, res) => {
  res.json({ joueurs: await getClassement(req.userId) });
});
