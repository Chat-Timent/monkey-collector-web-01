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
  try {
    await creerCompte(req.body.pseudo, req.body.motDePasse);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

authRoutes.post("/connexion", async (req, res) => {
  try {
    const token = await connecter(req.body.pseudo, req.body.motDePasse);
    res.cookie("session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 3600 * 1000,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(401).json({ erreur: err.message });
  }
});

authRoutes.post("/deconnexion", async (req, res) => {
  await deconnecter(req.cookies.session);
  res.clearCookie("session");
  res.json({ ok: true });
});

authRoutes.get("/moi", authentifie, async (req, res) => {
  res.json({ pseudo: await getPseudo(req.userId) });
});
