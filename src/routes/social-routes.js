import { Router } from "express";
import { authentifie } from "../middleware/authentifie.js";
import { defisDuJoueur, envoyerDefi, listerJoueurs, marquerPresence } from "../services/challenge-service.js";
import {
  combatsDuJoueur,
  envoyerMessage,
  getCombat,
  lireMessages,
  repondreDefi,
} from "../services/combat-service.js";
import { envoyerChatGlobal, lireChatGlobal } from "../services/chat-service.js";

export const socialRoutes = Router();

socialRoutes.post("/presence", authentifie, async (req, res) => {
  await marquerPresence(req.userId);
  res.json({ ok: true });
});

socialRoutes.get("/joueurs", authentifie, async (req, res) => {
  res.json({ joueurs: await listerJoueurs(req.userId) });
});

socialRoutes.get("/defis", authentifie, async (req, res) => {
  res.json(await defisDuJoueur(req.userId));
});

socialRoutes.post("/defis", authentifie, async (req, res) => {
  try {
    const id = await envoyerDefi(req.userId, req.body.versUserId);
    res.json({ id });
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

socialRoutes.post("/defis/:id/repondre", authentifie, async (req, res) => {
  try {
    const combatId = await repondreDefi(req.userId, req.params.id, !!req.body.accepter);
    res.json({ ok: true, combatId });
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

socialRoutes.get("/combats", authentifie, async (req, res) => {
  res.json({ combats: await combatsDuJoueur(req.userId) });
});

socialRoutes.get("/combats/:id", authentifie, async (req, res) => {
  const combat = await getCombat(req.userId, req.params.id);
  if (!combat) return res.status(404).json({ erreur: "combat introuvable" });
  res.json(combat);
});

socialRoutes.get("/chat", authentifie, async (req, res) => {
  const apres = Number(req.query.apres) || 0;
  res.json(await lireChatGlobal(req.userId, apres));
});

socialRoutes.post("/chat", authentifie, async (req, res) => {
  try {
    await envoyerChatGlobal(req.userId, req.body.texte);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

socialRoutes.get("/combats/:id/messages", authentifie, async (req, res) => {
  const apres = Number(req.query.apres) || 0;
  const data = await lireMessages(req.userId, req.params.id, apres);
  if (!data) return res.status(404).json({ erreur: "combat introuvable" });
  res.json(data);
});

socialRoutes.post("/combats/:id/messages", authentifie, async (req, res) => {
  try {
    await envoyerMessage(req.userId, req.params.id, req.body.texte);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});