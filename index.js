import express from "express";
import { tirer, getMonkeyInfos, getImageUrl, ajouterCopie, getNiveau, getMonkeydex } from "./tirage.js";


const app = express();
app.use(express.static("public"));

app.get("/tirage", (req, res) => {
  const pseudo = req.query.pseudo;
  if (!pseudo) {
    return res.status(400).json({ erreur: "pseudo manquant"});
  }

  const id = tirer();
  console.log("tiré :", id, "| pseudo :", pseudo);
  const amount = ajouterCopie(pseudo, id);

  const espece = getMonkeyInfos(id);
  const niveau = getNiveau(espece.rarete, amount);

  res.json({ 
    id, 
    espece: getMonkeyInfos(id), 
    image: getImageUrl(id),
    amount,
    niveau,
  });
});

app.get("/monkeydex", (req, res) => {
  const pseudo = req.query.pseudo;
  if (!pseudo) {
    return res.status(400).json({ erreur: "pseudo manquant" });
  }

  const singes = getMonkeydex(pseudo);
  const total = singes.reduce((somme, s) => somme + s.amount, 0);
  const compteur = getCompteurRarete(pseudo);
  res.json({ total, compteur, singes });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur sur le port ${PORT}`));