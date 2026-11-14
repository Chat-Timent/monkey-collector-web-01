import { DUREE_RESET_MS, TIRAGES_PAR_RESET } from "../constants/game.js";

// Début de la fenêtre de reset contenant `maintenant` (ms) : multiple de DUREE_RESET_MS
// depuis l'epoch, donc le même instant pour tous les joueurs.
export function debutFenetre(maintenant) {
  return Math.floor(maintenant / DUREE_RESET_MS) * DUREE_RESET_MS;
}

// État du quota d'un joueur à partir de sa ligne `tirages_etat` (ou null s'il n'a jamais tiré).
// Une ligne d'une fenêtre précédente compte comme un quota plein.
export function etatQuota(ligne, maintenant) {
  const debut = debutFenetre(maintenant);
  const aJour = ligne && new Date(ligne.dernier_reset).getTime() >= debut;
  const prochain = debut + DUREE_RESET_MS;
  return {
    restants: aJour ? ligne.tirages_restants : TIRAGES_PAR_RESET,
    max: TIRAGES_PAR_RESET,
    prochainReset: new Date(prochain).toISOString(),
    // Délai calculé par le serveur : le client n'a pas à faire confiance à sa propre horloge
    msAvantReset: prochain - maintenant,
    debutFenetre: debut,
  };
}

// Vue envoyée au client (sans le détail interne).
export function quotaPublic({ restants, max, prochainReset, msAvantReset }) {
  return { restants, max, prochainReset, msAvantReset };
}
