import express from "express";
import {
  tirer,
  getEspece,
  getImageUrl,
  getNiveau,
  ajouterCopie,
  getMonkeydex,
  getCompteurRarete,
  getStarter,
  choisirStarter,
  gagnerRecompense,
  getEquipe,
  definirEquipe,
} from "./tirage.js";

const app = express();
app.use(express.json());
app.use(express.static("public"));

app.get("/tirage", async (req, res) => {
  const pseudo = req.query.pseudo;
  if (!pseudo) return res.status(400).json({ erreur: "pseudo manquant" });

  const starterAvant = await getStarter(pseudo);
  if (!starterAvant) {
    return res.status(400).json({ erreur: "aucun starter, choisis-en un d'abord" });
  }

  const id = tirer();
  const amount = await ajouterCopie(pseudo, id);
  const espece = getEspece(id);
  const starter = await gagnerRecompense(pseudo, espece.rarete);

  res.json({
    id,
    espece,
    image: getImageUrl(id),
    amount,
    niveau: getNiveau(espece.rarete, amount),
    starter,
  });
});

app.get("/monkeydex", async (req, res) => {
  const pseudo = req.query.pseudo;
  if (!pseudo) return res.status(400).json({ erreur: "pseudo manquant" });

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
  if (!pseudo || !choix) {
    return res.status(400).json({ erreur: "pseudo et choix requis" });
  }
  try {
    res.json(await choisirStarter(pseudo, choix));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erreur: err.message });
  }
});

app.get("/equipe", async (req, res) => {
  const pseudo = req.query.pseudo;
  if (!pseudo) return res.status(400).json({ erreur: "pseudo manquant" });
  res.json({ equipe: await getEquipe(pseudo) });
});

app.post("/equipe", async (req, res) => {
  const { pseudo, especes } = req.body;
  if (!pseudo || !Array.isArray(especes)) {
    return res.status(400).json({ erreur: "pseudo et especes requis" });
  }
  try {
    res.json({ equipe: await definirEquipe(pseudo, especes) });
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur sur le port ${PORT}`));