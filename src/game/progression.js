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
