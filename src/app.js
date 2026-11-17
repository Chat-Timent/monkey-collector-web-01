import express from "express";
import cookieParser from "cookie-parser";
import fs from "node:fs";
import path from "node:path";
import { authRoutes } from "./routes/auth-routes.js";
import { gameRoutes } from "./routes/game-routes.js";
import { socialRoutes } from "./routes/social-routes.js";
import { aventureRoutes } from "./routes/aventure-routes.js";
import { ressourcesRoutes } from "./routes/ressources-routes.js";
import { perksRoutes } from "./routes/perks-routes.js";
import { eveilRoutes } from "./routes/eveil-routes.js";
import { armesRoutes, equipementsRoutes } from "./routes/objets-routes.js";
import { quotidienRoutes } from "./routes/quotidien-routes.js";
import { gererErreurs } from "./erreurs.js";
import { VERSION, versionnerHtml } from "./version.js";

const DOSSIER_PUBLIC = path.resolve("public");

// Pages HTML : jamais mises en cache (toujours revalidées), et réécrites pour la version en cours
// (?v= sur les scripts, styles et images). Gardées en mémoire : elles ne changent qu'au redémarrage.
const pagesPretes = new Map();
function servirPage(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const chemin = req.path === "/" ? "/index.html" : req.path;
  if (!chemin.endsWith(".html")) return next();
  const fichier = path.join(DOSSIER_PUBLIC, path.normalize(chemin));
  if (!fichier.startsWith(DOSSIER_PUBLIC + path.sep)) return next();
  let page = pagesPretes.get(fichier);
  if (page === undefined) {
    try {
      page = versionnerHtml(fs.readFileSync(fichier, "utf8"));
    } catch {
      return next(); // fichier absent : laissé à la suite (404)
    }
    pagesPretes.set(fichier, page);
  }
  res.setHeader("Cache-Control", "no-cache");
  res.type("html").send(page);
}

export function creerApplication() {
  const app = express();
  // Chaque réponse annonce la version : un onglet resté sur une ancienne version se recharge.
  app.use((req, res, next) => {
    res.setHeader("X-Version", VERSION);
    next();
  });
  app.use(express.json());
  app.use(cookieParser());
  app.use(servirPage);
  app.use(express.static("public", {
    setHeaders(res, fichier) {
      if (/\.(png|jpe?g|gif|webp|svg|ico)$/i.test(fichier)) {
        // Les URLs d'images portent ?v=VERSION : une nouvelle version change l'URL, donc le cache
        res.setHeader("Cache-Control", "public, max-age=86400");
      } else {
        // Scripts et styles : toujours revalidés (réponse 304 légère si rien n'a changé)
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }));
  app.use(authRoutes);
  app.use(gameRoutes);
  app.use(socialRoutes);
  app.use(aventureRoutes);
  app.use(ressourcesRoutes);
  app.use(perksRoutes);
  app.use(eveilRoutes);
  app.use(armesRoutes);
  app.use(equipementsRoutes);
  app.use(quotidienRoutes);
  app.use(gererErreurs);
  return app;
}
