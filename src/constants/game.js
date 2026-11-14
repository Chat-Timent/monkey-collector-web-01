export const RARETES = [
  { id: 1, nom: "common", poids: 1 },
  { id: 2, nom: "uncommon", poids: 1 / 5 },
  { id: 3, nom: "rare", poids: 1 / 15 },
  { id: 4, nom: "epic", poids: 1 / 50 },
  { id: 5, nom: "legendary", poids: 1 / 140 },
];

export const PALIERS = {
  common: 5,
  uncommon: 4,
  rare: 3,
  epic: 2,
  legendary: 1,
};

export const RECOMPENSES = {
  common: { xp: 5, coins: 1 },
  uncommon: { xp: 25, coins: 10 },
  rare: { xp: 100, coins: 60 },
  epic: { xp: 500, coins: 150 },
  legendary: { xp: 1250, coins: 500 },
};

export const STARTERS = {
  fire: { nom: "Fire monkey" },
  ice: { nom: "Ice monkey" },
};

export const DUREE_DEFI_SEC = 60;
export const SEUIL_EN_LIGNE_SEC = 45;
export const DELAI_INITIAL_MS = 1000;
export const PAS_MS = 700;

// Tirages limités : TIRAGES_PAR_RESET par fenêtre de DUREE_RESET_MS.
// Les fenêtres sont calées sur l'horloge (:00, :10, :20…), identiques pour tous les joueurs.
export const TIRAGES_PAR_RESET = 20;
export const DUREE_RESET_MS = 10 * 60 * 1000;

// Arbre du starter
// Chance de base qu'un tirage rapporte des coins une fois « Loterie rentable » débloquée
// (« Valeur marchande » s'y ajoute). Sans ce nœud, un tirage ne rapporte aucun coin.
export const LOTERIE_CHANCE_BASE = 0.25;
// Emplacements d'équipe sans bonus (le nœud « Rang de renfort » en ajoute)
export const NB_SLOTS_BASE = 6;
