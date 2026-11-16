import { Router } from "express";
import { authentifie } from "../middleware/authentifie.js";
import { balayerEveil, eveiller, getEveil, lancerCombatEveil } from "../services/eveil-service.js";

export const eveilRoutes = Router();

eveilRoutes.get("/eveil", authentifie, async (req, res) => {
  res.json(await getEveil(req.userId));
});

// Lance le combat du palier courant du donjon d'éveil ; le client ouvre ensuite le combat en direct.
eveilRoutes.post("/eveil/combat", authentifie, async (req, res) => {
  res.json({ combatId: await lancerCombatEveil(req.userId) });
});

// Balayage du dernier palier battu : un ticket contre son gain, sans combat.
eveilRoutes.post("/eveil/balayer", authentifie, async (req, res) => {
  res.json(await balayerEveil(req.userId));
});

// { espece } : monte d'un niveau l'éveil du singe ; renvoie l'état à jour de la page.
eveilRoutes.post("/eveil/eveiller", authentifie, async (req, res) => {
  res.json(await eveiller(req.userId, req.body?.espece));
});
