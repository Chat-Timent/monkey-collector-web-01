// Erreur « métier » : son message est destiné au joueur et renvoyé tel quel.
// Toute autre erreur est considérée comme technique : journalisée, message générique.
// `details` : champs supplémentaires renvoyés avec le message (ex. { quota }).
export class ErreurJeu extends Error {
  constructor(message, statut = 400, details = {}) {
    super(message);
    this.statut = statut;
    this.details = details;
  }
}

// Middleware Express placé en dernier : les erreurs des routes (y compris
// les promesses rejetées, gérées nativement par Express 5) arrivent ici.
// Réponse toujours en JSON au format { erreur } (+ détails éventuels d'une ErreurJeu).
export function gererErreurs(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ErreurJeu) {
    return res.status(err.statut).json({ ...err.details, erreur: err.message });
  }
  // Corps JSON mal formé ou trop gros (express.json)
  if (err.type === "entity.parse.failed" || err.type === "entity.too.large") {
    return res.status(400).json({ erreur: "requête invalide" });
  }

  console.error(`${req.method} ${req.originalUrl} :`, err);
  res.status(500).json({ erreur: "erreur serveur, réessaie plus tard" });
}
