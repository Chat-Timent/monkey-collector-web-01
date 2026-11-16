export const RARETES = [
  { id: 1, nom: "common", poids: 1 },
  { id: 2, nom: "uncommon", poids: 1 / 5 },
  { id: 3, nom: "rare", poids: 1 / 15 },
  { id: 4, nom: "epic", poids: 1 / 50 },
  { id: 5, nom: "legendary", poids: 1 / 140 },
  { id: 6, nom: "mythic", poids: 1 / 1000 },
];

export const PALIERS = {
  common: 5,
  uncommon: 4,
  rare: 3,
  epic: 2,
  legendary: 1,
  mythic: 1,
};

export const RECOMPENSES = {
  common: { xp: 5, coins: 1 },
  uncommon: { xp: 25, coins: 10 },
  rare: { xp: 100, coins: 60 },
  epic: { xp: 500, coins: 150 },
  legendary: { xp: 1250, coins: 500 },
  mythic: { xp: 3000, coins: 1500 },
};

export const STARTERS = {
  fire: { nom: "Fire monkey" },
  ice: { nom: "Ice monkey" },
};

export const DUREE_DEFI_SEC = 60;
export const SEUIL_EN_LIGNE_SEC = 45;
export const DELAI_INITIAL_MS = 1000;
export const PAS_MS = 700;

// Tirages : +1 toutes les RECHARGE_TIRAGE_MS tant que le stock est sous TIRAGES_MAX.
// Les récompenses (donjon, Aventure…) peuvent dépasser ce plafond ; la recharge s'arrête alors.
export const TIRAGES_MAX = 100;
export const RECHARGE_TIRAGE_MS = 30 * 1000;
// Délai minimal, quels que soient les bonus de l'arbre
export const RECHARGE_TIRAGE_MIN_MS = 5 * 1000;

// Arbre du starter
// Chance de base qu'un tirage rapporte des coins une fois « Loterie rentable » débloquée
// (« Valeur marchande » s'y ajoute). Sans ce nœud, un tirage ne rapporte aucun coin.
export const LOTERIE_CHANCE_BASE = 0.25;
// Emplacements d'équipe sans bonus (les Rangs de renfort, d'élite et suprême en ajoutent)
export const NB_SLOTS_BASE = 6;
// Étincelle : après ce nombre de tirages d'affilée sans rare ou mieux, le suivant en est un
export const ETINCELLE_SEUIL = 50;

// Elo PVP : facteur K, et nombre de combats qui comptent contre un même adversaire sur 24 h
export const ELO_K = 32;
export const ELO_COMBATS_PAR_JOUR = 3;
