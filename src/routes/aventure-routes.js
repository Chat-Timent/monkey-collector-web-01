import { Router } from "express";
import { authentifie } from "../middleware/authentifie.js";
import { getAventure, lancerCombatAventure } from "../services/aventure-service.js";

export const aventureRoutes = Router();

aventureRoutes.get("/aventure", authentifie, async (req, res) => {
  res.json(await getAventure(req.userId));
});

// Lance le combat de l'étage courant ; le client ouvre ensuite le combat en direct.
aventureRoutes.post("/aventure/combat", authentifie, async (req, res) => {
  res.json({ combatId: await lancerCombatAventure(req.userId) });
});
