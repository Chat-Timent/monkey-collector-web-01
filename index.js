import { creerApplication } from "./src/app.js";

const app = creerApplication();

const PORT = process.env.PORT || 3000;
const serveur = app.listen(PORT, () => console.log(`Serveur sur le port ${PORT}`));
serveur.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Le port ${PORT} est déjà utilisé. Ferme l'autre node/nodemon, puis relance.`);
    process.exit(1);
  }
  throw err;
});
