import { Router } from "express";
import { authentifie } from "../middleware/authentifie.js";
import { demantelerObjet, equiperObjet, getObjets, tirerLoterieObjet } from "../services/objets-service.js";

// Routes d'un type d'objet, sous /`chemin` : état de la page, loterie, équipement et démantèlement d'un exemplaire.
function routesObjets(type, chemin) {
  const routes = Router();

  routes.get(`/${chemin}`, authentifie, async (req, res) => {
    res.json(await getObjets(req.userId, type));
  });

  routes.post(`/${chemin}/loterie`, authentifie, async (req, res) => {
    res.json(await tirerLoterieObjet(req.userId, type));
  });

  // { id, espece, slot } : exemplaire à équiper ; espece null pour le retirer
  routes.post(`/${chemin}/equiper`, authentifie, async (req, res) => {
    const { id, espece = null, slot = 1 } = req.body ?? {};
    res.json(await equiperObjet(req.userId, type, id, espece, slot));
  });

  // { id } : exemplaire (non équipé) à démanteler
  routes.post(`/${chemin}/demanteler`, authentifie, async (req, res) => {
    res.json(await demantelerObjet(req.userId, type, req.body?.id));
  });

  return routes;
}

export const armesRoutes = routesObjets("arme", "armes");
export const equipementsRoutes = routesObjets("equipement", "equipements");
