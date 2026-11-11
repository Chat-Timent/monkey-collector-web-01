import { creerApplication } from "./src/app.js";

const app = creerApplication();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur sur le port ${PORT}`));
