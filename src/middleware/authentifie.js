import { userIdDepuisToken } from "../services/auth-service.js";

export async function authentifie(req, res, next) {
  try {
    const userId = await userIdDepuisToken(req.cookies.session);
    if (!userId) return res.status(401).json({ erreur: "non connecté" });
    req.userId = userId;
    next();
  } catch (err) {
    next(err);
  }
}
