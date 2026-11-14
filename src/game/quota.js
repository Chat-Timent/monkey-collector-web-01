import { DUREE_RESET_MS, TIRAGES_PAR_RESET } from "../constants/game.js";

// Début de la fenêtre de reset contenant `maintenant` (ms) : multiple de DUREE_RESET_MS
// depuis l'epoch, donc le même instant pour tous les joueurs.
export function debutFenetre(maintenant) {
  return Math.floor(maintenant / DUREE_RESET_MS) * DUREE_RESET_MS;
}

// État du quota d'un joueur à partir de sa ligne `tirages_etat` (ou null s'il n'a jamais tiré).
// Une ligne d'une fenêtre précédente compte comme un quota plein (`max`, bonus de l'arbre compris).
// `bonus` : stock de tirages gagnés en Aventure, utilisé une fois le quota gratuit épuisé.
export function etatQuota(ligne, maintenant, max = TIRAGES_PAR_RESET) {
  const debut = debutFenetre(maintenant);
  const aJour = ligne && new Date(ligne.dernier_reset).getTime() >= debut;
  const prochain = debut + DUREE_RESET_MS;
  return {
    restants: aJour ? ligne.tirages_restants : max,
    max,
    bonus: ligne?.tirages_bonus ?? 0,
    prochainReset: new Date(prochain).toISOString(),
    // Délai calculé par le serveur : le client n'a pas à faire confiance à sa propre horloge
    msAvantReset: prochain - maintenant,
    debutFenetre: debut,
  };
}

// Vue envoyée au client (sans le détail interne).
export function quotaPublic({ restants, max, bonus, prochainReset, msAvantReset }) {
  return { restants, max, bonus, prochainReset, msAvantReset };
}

// Consomme un tirage : d'abord le quota gratuit, puis le stock bonus.
// Renvoie false s'il n'y a plus rien à consommer (l'état n'est pas modifié).
export function consommerTirage(quota) {
  if (quota.restants > 0) quota.restants -= 1;
  else if (quota.bonus > 0) quota.bonus -= 1;
  else return false;
  return true;
}
