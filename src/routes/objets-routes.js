import { Router } from "express";
import { authentifie } from "../middleware/authentifie.js";
import { equiperObjet, getObjets, tirerLoterieObjet } from "../services/objets-service.js";

// Routes d'un type d'objet, sous /`chemin` : état de la page, loterie, équipement.
function routesObjets(type, chemin) {
  const routes = Router();

  routes.get(`/${chemin}`, authentifie, async (req, res) => {
    res.json(await getObjets(req.userId, type));
  });

  routes.post(`/${chemin}/loterie`, authentifie, async (req, res) => {
    res.json(await tirerLoterieObjet(req.userId, type));
  });

  // { objet, tier, espece, slot } ; espece null pour retirer l'objet
  routes.post(`/${chemin}/equiper`, authentifie, async (req, res) => {
    const { objet, tier, espece = null, slot = 1 } = req.body ?? {};
    res.json(await equiperObjet(req.userId, type, objet, tier, espece, slot));
  });

  return routes;
}

export const armesRoutes = routesObjets("arme", "armes");
