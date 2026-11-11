import express from "express";
import { tirer, getEspece, getImageUrl, ajouterCopie, getNiveau, getMonkeydex, getCompteurRarete, getStarter, gagnerRecompense } from "./tirage.js";


const RECOMPENSES = {
  common: { xp: 5, coins: 1 },
  uncommon: { xp: 25, coins: 10 },
  rare: { xp: 100, coins: 60 },
  epic: { xp: 500, coins: 150 },
  legendary: { xp: 1250, coins: 500 },
};


const app = express();
app.use(express.json());
app.use(express.static("public"));

app.get("/tirage", async (req, res) => {
  const pseudo = req.query.pseudo;
  if (!pseudo) {
    return res.status(400).json({ erreur: "pseudo manquant" });
  }

  const id = tirer();
  const amount = await ajouterCopie(pseudo, id); 

  
  const starterAvant = await getStarter(pseudo);
  if (!starterAvant) {
    return res.status(400).json({ erreur: "aucun starter" });
  }
  const starter = await gagnerRecompense(pseudo, RECOMPENSES[getEspece(id).rarete].xp);

  res.json({
    id,
    espece: getEspece(id),
    image: getImageUrl(id),
    amount,
    niveau: getNiveau(getEspece(id).rarete, amount),
    starter,
  });
});

app.get("/monkeydex", async (req, res) => {
  const pseudo = req.query.pseudo;
  if (!pseudo) {
    return res.status(400).json({ erreur: "pseudo manquant" });
  }

  const singes = await getMonkeydex(pseudo);
  const total = singes.reduce((somme, s) => somme + s.amount, 0);
  const compteur = await getCompteurRarete(pseudo);
  res.json({ total, compteur, singes });
});

app.get("/profil", async (req, res) => {
  const pseudo = req.query.pseudo;
  if (!pseudo) return res.status(400).json({ erreur: "pseudo manquant" });
  res.json({ starter: await getStarter(pseudo) });
});

app.post("/starter", async (req, res) => {
  const { pseudo, choix } = req.body;
  if (!pseudo || !choix) return res.status(400).json({ erreur: "pseudo et choix requis" });
  try {
    res.json(await choisirStarter(pseudo, choix));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erreur: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur sur le port ${PORT}`));