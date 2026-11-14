import { Router } from "express";
import {
  connecter,
  creerCompte,
  deconnecter,
  getPseudo,
} from "../services/auth-service.js";
import { authentifie } from "../middleware/authentifie.js";

export const authRoutes = Router();

authRoutes.post("/inscription", async (req, res) => {
  const { pseudo, motDePasse } = req.body ?? {};
  await creerCompte(pseudo, motDePasse);
  res.json({ ok: true });
});

authRoutes.post("/connexion", async (req, res) => {
  const { pseudo, motDePasse } = req.body ?? {};
  const token = await connecter(pseudo, motDePasse);
  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 3600 * 1000,
  });
  res.json({ ok: true });
});

authRoutes.post("/deconnexion", async (req, res) => {
  if (req.cookies.session) await deconnecter(req.cookies.session);
  res.clearCookie("session");
  res.json({ ok: true });
});

authRoutes.get("/moi", authentifie, async (req, res) => {
  res.json({ pseudo: await getPseudo(req.userId) });
});
