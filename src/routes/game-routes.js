import { Router } from "express";
import { authentifie } from "../middleware/authentifie.js";
import {
  ajouterCopie,
  getResumeMonkeydex,
} from "../services/collection-service.js";
import { choisirStarter, gagnerRecompense, getStarter } from "../services/starter-service.js";
import { definirEquipe, getEquipe } from "../services/team-service.js";
import { getEspece, getImageUrl, getNiveau, statsFinales, tirer } from "../game/monkeys.js";

export const gameRoutes = Router();

gameRoutes.get("/tirage", authentifie, async (req, res) => {
  const userId = req.userId;
  const starterAvant = await getStarter(userId);
  if (!starterAvant) {
    return res.status(400).json({ erreur: "aucun starter, choisis-en un d'abord" });
  }

  const id = tirer();
  const amount = await ajouterCopie(userId, id);
  const espece = getEspece(id);
  const niveau = getNiveau(espece.rarete, amount);
  const starter = await gagnerRecompense(userId, espece.rarete, starterAvant);

  res.json({
    id,
    espece,
    image: getImageUrl(id),
    amount,
    niveau,
    stats: statsFinales(espece, niveau.niveau),
    starter,
  });
});

gameRoutes.get("/monkeydex", authentifie, async (req, res) => {
  res.json(await getResumeMonkeydex(req.userId));
});

gameRoutes.get("/profil", authentifie, async (req, res) => {
  res.json({ starter: await getStarter(req.userId) });
});

gameRoutes.post("/starter", authentifie, async (req, res) => {
  const { choix } = req.body;
  if (!choix) return res.status(400).json({ erreur: "choix requis" });
  try {
    res.json(await choisirStarter(req.userId, choix));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erreur: err.message });
  }
});

gameRoutes.get("/equipe", authentifie, async (req, res) => {
  res.json({ equipe: await getEquipe(req.userId) });
});

gameRoutes.post("/equipe", authentifie, async (req, res) => {
  const { especes } = req.body;
  if (!Array.isArray(especes)) {
    return res.status(400).json({ erreur: "especes requis" });
  }
  try {
    res.json({ equipe: await definirEquipe(req.userId, especes) });
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});
