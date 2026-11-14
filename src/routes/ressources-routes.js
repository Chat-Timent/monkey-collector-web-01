import { Router } from "express";
import { authentifie } from "../middleware/authentifie.js";
import { getRessources, lancerCombatRessource } from "../services/ressources-service.js";

export const ressourcesRoutes = Router();

ressourcesRoutes.get("/ressources", authentifie, async (req, res) => {
  res.json(await getRessources(req.userId));
});

// Lance le combat du palier courant d'un donjon ; le client ouvre ensuite le combat en direct.
ressourcesRoutes.post("/ressources/combat", authentifie, async (req, res) => {
  res.json({ combatId: await lancerCombatRessource(req.userId, req.body?.donjon) });
});
