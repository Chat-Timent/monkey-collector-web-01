import express from "express";
import cookieParser from "cookie-parser";
import { authRoutes } from "./routes/auth-routes.js";
import { gameRoutes } from "./routes/game-routes.js";
import { socialRoutes } from "./routes/social-routes.js";
import { aventureRoutes } from "./routes/aventure-routes.js";
import { gererErreurs } from "./erreurs.js";

export function creerApplication() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static("public", {
    setHeaders(res, fichier) {
      if (/\.(png|jpe?g|gif|webp|svg|ico)$/i.test(fichier)) {
        res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      }
    },
  }));
  app.use(authRoutes);
  app.use(gameRoutes);
  app.use(socialRoutes);
  app.use(aventureRoutes);
  app.use(gererErreurs);
  return app;
}
