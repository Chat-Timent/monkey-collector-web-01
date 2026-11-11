import express from "express";
import cookieParser from "cookie-parser";
import { authRoutes } from "./routes/auth-routes.js";
import { gameRoutes } from "./routes/game-routes.js";
import { socialRoutes } from "./routes/social-routes.js";

export function creerApplication() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static("public"));
  app.use(authRoutes);
  app.use(gameRoutes);
  app.use(socialRoutes);
  return app;
}
