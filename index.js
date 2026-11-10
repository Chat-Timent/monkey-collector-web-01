import express from "express";
import { tirer, getEspece, getImageUrl, ajouterCopie, getNiveau, getMonkeydex, getCompteurRarete } from "./tirage.js";


const app = express();
app.use(express.static("public"));

app.get("/tirage", async (req, res) => {
  const pseudo = req.query.pseudo;
  if (!pseudo) {
    return res.status(400).json({ erreur: "pseudo manquant" });
  }

  const id = tirer();
  const amount = await ajouterCopie(pseudo, id);

  res.json({
    id,
    espece: getEspece(id),
    image: getImageUrl(id),
    amount,
    niveau: getNiveau(getEspece(id).rarete, amount),
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur sur le port ${PORT}`));