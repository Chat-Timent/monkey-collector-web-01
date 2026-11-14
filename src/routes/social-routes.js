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
import { ErreurJeu } from "../erreurs.js";

export const socialRoutes = Router();

// Les défis, combats et joueurs sont identifiés par des UUID : un identifiant mal formé
// est refusé ici plutôt que de provoquer une erreur PostgreSQL.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Paramètre de pagination ?apres=<id> : entier positif, 0 sinon.
function lireApres(req) {
  const n = Number(req.query.apres);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

socialRoutes.param("id", (req, res, next, id) => {
  if (!UUID.test(id)) return next(new ErreurJeu("identifiant invalide"));
  next();
});

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
  const versUserId = req.body?.versUserId;
  if (typeof versUserId !== "string" || !UUID.test(versUserId)) {
    throw new ErreurJeu("joueur invalide");
  }
  const id = await envoyerDefi(req.userId, versUserId);
  res.json({ id });
});

socialRoutes.post("/defis/:id/repondre", authentifie, async (req, res) => {
  const combatId = await repondreDefi(req.userId, req.params.id, !!req.body?.accepter);
  res.json({ ok: true, combatId });
});

socialRoutes.get("/combats", authentifie, async (req, res) => {
  res.json({ combats: await combatsDuJoueur(req.userId) });
});

socialRoutes.get("/combats/:id", authentifie, async (req, res) => {
  const combat = await getCombat(req.userId, req.params.id);
  if (!combat) throw new ErreurJeu("combat introuvable", 404);
  res.json(combat);
});

socialRoutes.get("/chat", authentifie, async (req, res) => {
  const apres = lireApres(req);
  res.json(await lireChatGlobal(req.userId, apres));
});

socialRoutes.post("/chat", authentifie, async (req, res) => {
  await envoyerChatGlobal(req.userId, req.body?.texte);
  res.json({ ok: true });
});

socialRoutes.get("/combats/:id/messages", authentifie, async (req, res) => {
  const apres = lireApres(req);
  const data = await lireMessages(req.userId, req.params.id, apres);
  if (!data) throw new ErreurJeu("combat introuvable", 404);
  res.json(data);
});

socialRoutes.post("/combats/:id/messages", authentifie, async (req, res) => {
  await envoyerMessage(req.userId, req.params.id, req.body?.texte);
  res.json({ ok: true });
});
