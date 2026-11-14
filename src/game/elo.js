import { ELO_K } from "../constants/game.js";

// Variations d'elo après un combat PVP (formule elo classique).
// `vainqueur` : "A", "B" ou null (match nul). Renvoie { A, B } : ce que gagne (ou perd) chaque camp.
// Le total est toujours nul : ce que gagne l'un, l'autre le perd.
export function calculerElo(eloA, eloB, vainqueur) {
  const attenduA = 1 / (1 + 10 ** ((eloB - eloA) / 400));
  const scoreA = vainqueur === "A" ? 1 : vainqueur === "B" ? 0 : 0.5;
  const deltaA = Math.round(ELO_K * (scoreA - attenduA));
  // `|| 0` évite un « -0 » quand la variation est nulle
  return { A: deltaA || 0, B: -deltaA || 0 };
}
