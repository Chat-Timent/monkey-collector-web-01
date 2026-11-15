import { Router } from "express";
import { authentifie } from "../middleware/authentifie.js";
import { equiperPerk, getPerks, tirerLoterie } from "../services/perks-service.js";

export const perksRoutes = Router();

perksRoutes.get("/perks", authentifie, async (req, res) => {
  res.json(await getPerks(req.userId));
});

perksRoutes.post("/perks/loterie", authentifie, async (req, res) => {
  res.json(await tirerLoterie(req.userId));
});

// { perk, tier, espece } ; espece null pour retirer le perk
perksRoutes.post("/perks/equiper", authentifie, async (req, res) => {
  const { perk, tier, espece = null } = req.body ?? {};
  res.json(await equiperPerk(req.userId, perk, tier, espece));
});
