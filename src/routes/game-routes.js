import { Router } from "express";
import { authentifie } from "../middleware/authentifie.js";
import { getResumeMonkeydex, getClassement } from "../services/collection-service.js";
import { choisirStarter, getStarter } from "../services/starter-service.js";
import { definirEquipe, getEquipe } from "../services/team-service.js";
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
  res.json({ starter, quota });
});

gameRoutes.post("/starter", authentifie, async (req, res) => {
  const { choix } = req.body ?? {};
  if (!choix) throw new ErreurJeu("choix requis");
  res.json(await choisirStarter(req.userId, choix));
});

gameRoutes.get("/equipe", authentifie, async (req, res) => {
  res.json({ equipe: await getEquipe(req.userId) });
});

gameRoutes.post("/equipe", authentifie, async (req, res) => {
  const { especes } = req.body ?? {};
  if (!Array.isArray(especes)) throw new ErreurJeu("especes requis");
  res.json({ equipe: await definirEquipe(req.userId, especes) });
});

gameRoutes.get("/classement", authentifie, async (req, res) => {
  res.json({ joueurs: await getClassement(req.userId) });
});
