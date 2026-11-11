// Façade de compatibilité : les fonctionnalités sont maintenant réparties par domaine dans src/.
export { tirer, getEspece, getImageUrl, getNiveau, statsFinales } from "./src/game/monkeys.js";

export {
  ajouterCopie,
  getCompteurRarete,
  getMonkeydex,
  lireCollection,
} from "./src/services/collection-service.js";

export {
  choisirStarter,
  gagnerRecompense,
  getStarter,
} from "./src/services/starter-service.js";

export { definirEquipe, getEquipe } from "./src/services/team-service.js";

export {
  defisDuJoueur,
  envoyerDefi,
  listerJoueurs,
  marquerPresence,
} from "./src/services/challenge-service.js";

export {
  combatsDuJoueur,
  envoyerMessage,
  getCombat,
  lireMessages,
  repondreDefi,
} from "./src/services/combat-service.js";

export {
  connecter,
  creerCompte,
  deconnecter,
  getPseudo,
  userIdDepuisToken,
} from "./src/services/auth-service.js";
