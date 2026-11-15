import { RECHARGE_TIRAGE_MS, RECHARGE_TIRAGE_MIN_MS, TIRAGES_MAX } from "../constants/game.js";

// Plafond de recharge et délai entre deux tirages, bonus de l'arbre compris (Ressourcement).
export function parametresQuota(effets) {
  return {
    max: TIRAGES_MAX + (effets?.tirages_max ?? 0),
    intervalleMs: Math.max(RECHARGE_TIRAGE_MIN_MS, RECHARGE_TIRAGE_MS - (effets?.recharge_sec ?? 0) * 1000),
  };
}

// Stock de tirages d'un joueur à partir de sa ligne `tirages_etat` (null s'il n'a jamais tiré).
// - `tirages_restants` : stock au moment `dernier_reset` (début de la recharge en cours)
// - `tirages_bonus` : ancien stock séparé, désormais ajouté au stock (remis à 0 à la prochaine écriture)
// Le stock gagne +1 tous les `intervalleMs` tant qu'il est sous `max`. Les récompenses
// (donjon, Aventure…) peuvent le faire dépasser `max` : la recharge s'arrête alors,
// et repart du moment où le stock repasse sous `max`.
export function etatQuota(ligne, maintenant, { max = TIRAGES_MAX, intervalleMs = RECHARGE_TIRAGE_MS } = {}) {
  let stock = max;
  let debut = maintenant;
  if (ligne) {
    stock = ligne.tirages_restants + (ligne.tirages_bonus ?? 0);
    debut = new Date(ligne.dernier_reset).getTime();
    if (stock < max) {
      const gagnes = Math.max(0, Math.floor((maintenant - debut) / intervalleMs));
      stock = Math.min(max, stock + gagnes);
      debut += gagnes * intervalleMs;
    }
  }
  // Plein (ou au-delà) : pas de recharge en cours, elle repartira de maintenant
  if (stock >= max) debut = maintenant;
  return { stock, max, intervalleMs, debutRecharge: debut, maintenant };
}

// Vue envoyée au client. `msAvantProchain` est calculé par le serveur :
// le client n'a pas à faire confiance à sa propre horloge. null quand la recharge est arrêtée.
export function quotaPublic({ stock, max, intervalleMs, debutRecharge, maintenant }) {
  return {
    restants: stock,
    max,
    intervalleMs,
    msAvantProchain: stock < max ? debutRecharge + intervalleMs - maintenant : null,
  };
}

// Consomme un tirage. Renvoie false s'il n'y en a plus (l'état n'est pas modifié).
export function consommerTirage(quota) {
  if (quota.stock <= 0) return false;
  quota.stock -= 1;
  return true;
}

// Ajoute des tirages gagnés (donjon, Aventure, quêtes…), sans plafond.
export function ajouterAuQuota(quota, nombre) {
  quota.stock += nombre;
  if (quota.stock >= quota.max) quota.debutRecharge = quota.maintenant;
}
