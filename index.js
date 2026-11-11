import express from "express";
import cookieParser from "cookie-parser";
import {
  tirer,
  getEspece,
  getImageUrl,
  getNiveau,
  statsFinales,
  ajouterCopie,
  getMonkeydex,
  getCompteurRarete,
  getStarter,
  choisirStarter,
  gagnerRecompense,
  getEquipe,
  definirEquipe,
  creerCompte,
  connecter,
  userIdDepuisToken,
  getPseudo,
  deconnecter,
  marquerPresence,
  listerJoueurs,
  envoyerDefi,
  defisDuJoueur,
  repondreDefi,
  getCombat,
  combatsDuJoueur,
} from "./tirage.js";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static("public"));

// Middleware : vérifie la session et remplit req.userId
async function authentifie(req, res, next) {
  try {
    const userId = await userIdDepuisToken(req.cookies.session);
    if (!userId) return res.status(401).json({ erreur: "non connecté" });
    req.userId = userId;
    next();
  } catch (err) {
    next(err);
  }
}

// Auth

app.post("/inscription", async (req, res) => {
  try {
    await creerCompte(req.body.pseudo, req.body.motDePasse);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

app.post("/connexion", async (req, res) => {
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

app.post("/deconnexion", async (req, res) => {
  await deconnecter(req.cookies.session);
  res.clearCookie("session");
  res.json({ ok: true });
});

app.get("/moi", authentifie, async (req, res) => {
  res.json({ pseudo: await getPseudo(req.userId) });
});

// Tirage

app.get("/tirage", authentifie, async (req, res) => {
  const userId = req.userId;

  const starterAvant = await getStarter(userId);
  if (!starterAvant) {
    return res.status(400).json({ erreur: "aucun starter, choisis-en un d'abord" });
  }

  const id = tirer();
  const amount = await ajouterCopie(userId, id);
  const espece = getEspece(id);
  const niveau = getNiveau(espece.rarete, amount);
  const starter = await gagnerRecompense(userId, espece.rarete);

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

// Collection

app.get("/monkeydex", authentifie, async (req, res) => {
  const singes = await getMonkeydex(req.userId);
  const total = singes.reduce((somme, s) => somme + s.amount, 0);
  const compteur = await getCompteurRarete(req.userId);
  res.json({ total, compteur, singes });
});

// Starter

app.get("/profil", authentifie, async (req, res) => {
  res.json({ starter: await getStarter(req.userId) });
});

app.post("/starter", authentifie, async (req, res) => {
  const { choix } = req.body;
  if (!choix) return res.status(400).json({ erreur: "choix requis" });
  try {
    res.json(await choisirStarter(req.userId, choix));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erreur: err.message });
  }
});

// Équipe

app.get("/equipe", authentifie, async (req, res) => {
  res.json({ equipe: await getEquipe(req.userId) });
});

app.post("/equipe", authentifie, async (req, res) => {
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

app.post("/presence", authentifie, async (req, res) => {
  await marquerPresence(req.userId);
  res.json({ ok: true });
});

app.get("/joueurs", authentifie, async (req, res) => {
  res.json({ joueurs: await listerJoueurs(req.userId) });
});

app.get("/defis", authentifie, async (req, res) => {
  res.json(await defisDuJoueur(req.userId));
});

app.post("/defis", authentifie, async (req, res) => {
  try {
    const id = await envoyerDefi(req.userId, req.body.versUserId);
    res.json({ id });
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

app.post("/defis/:id/repondre", authentifie, async (req, res) => {
  try {
    const combatId = await repondreDefi(req.userId, req.params.id, !!req.body.accepter);
    res.json({ ok: true, combatId });
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

app.get("/combats", authentifie, async (req, res) => {
  res.json({ combats: await combatsDuJoueur(req.userId) });
});

app.get("/combats/:id", authentifie, async (req, res) => {
  const combat = await getCombat(req.userId, req.params.id);
  if (!combat) return res.status(404).json({ erreur: "combat introuvable" });
  res.json(combat);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur sur le port ${PORT}`));