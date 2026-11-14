import { LOTERIE_CHANCE_BASE, RECOMPENSES } from "../constants/game.js";

// Progression du starter : fonction pure, sans base de données.
// Il faut `niveau * 100` XP pour passer du niveau courant au suivant.
export function appliquerGains(starter, gains) {
  let niveau = starter.niveau;
  let xp = starter.xp + gains.xp;
  const coins = starter.coins + gains.coins;
  let niveauxGagnes = 0;

  while (xp >= niveau * 100) {
    xp -= niveau * 100;
    niveau += 1;
    niveauxGagnes += 1;
  }

  return { niveau, xp, coins, niveauxGagnes };
}

// Gains d'un tirage selon la rareté et les effets de l'arbre du joueur.
// - XP : de base, augmentée de xp_pct
// - coins : aucun par défaut ; avec lottery_coins, chance LOTERIE_CHANCE_BASE + valeur_or_pct
//   de recevoir les coins de la rareté, augmentés de coins_pct
// - copie_bonus : chance d'obtenir une copie supplémentaire du singe tiré
// `hasard` est injectable pour les tests.
export function gainsDuTirage(rarete, effets, hasard = Math.random) {
  const base = RECOMPENSES[rarete] ?? { xp: 0, coins: 0 };
  const xp = Math.round(base.xp * (1 + effets.xp_pct));

  let coins = 0;
  if (effets.lottery_coins && hasard() < LOTERIE_CHANCE_BASE + effets.valeur_or_pct) {
    coins = Math.round(base.coins * (1 + effets.coins_pct));
  }

  const copieBonus = effets.copie_bonus > 0 && hasard() < effets.copie_bonus;
  return { xp, coins, copieBonus };
}
