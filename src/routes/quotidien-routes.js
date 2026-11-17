import { Router } from "express";
import { authentifie } from "../middleware/authentifie.js";
import { getQuotidien, reclamerBonus, reclamerQuete, reclamerSerie } from "../services/quotidien-service.js";

// Cadeau (série de connexion) et parchemin (quêtes du jour) du footer.
export const quotidienRoutes = Router();

quotidienRoutes.get("/quotidien", authentifie, async (req, res) => {
  res.json(await getQuotidien(req.userId));
});

quotidienRoutes.post("/quotidien/serie", authentifie, async (req, res) => {
  res.json(await reclamerSerie(req.userId));
});

// { rang } : 1 à 3, la quête du jour dont on récupère la récompense
quotidienRoutes.post("/quotidien/quetes", authentifie, async (req, res) => {
  res.json(await reclamerQuete(req.userId, req.body?.rang));
});

quotidienRoutes.post("/quotidien/bonus", authentifie, async (req, res) => {
  res.json(await reclamerBonus(req.userId));
});
