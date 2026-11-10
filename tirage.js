import fs from "node:fs";
import path from "node:path";

const SINGES = JSON.parse(fs.readFileSync("./monkeys.json", "utf8"));
const DOSSIER_DATA = "./data";

// Probabilités relatives par rareté (même valeurs que ton bot)
const RARETES = [
  { id: 1, nom: "common", poids: 1 },
  { id: 2, nom: "uncommon", poids: 1 / 5 },
  { id: 3, nom: "rare", poids: 1 / 15 },
  { id: 4, nom: "epic", poids: 1 / 50 },
  { id: 5, nom: "legendary", poids: 1 / 140 },
];

function tirerPondere(items) {
  const total = items.reduce((somme, it) => somme + it.poids, 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.poids;
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

export function tirer() {
  const rarete = tirerPondere(RARETES).nom;
  const candidats = Object.entries(SINGES).filter(([, s]) => s.rarete === rarete);
  if (candidats.length === 0) return null;
  const [espece] = candidats[Math.floor(Math.random() * candidats.length)];
  console.log(espece);
  return espece;
}

export function getMonkeyInfos(monkey) {
  return SINGES[monkey] ?? null;
}

export function getImageUrl(id) {
  return `/images/MonkeysIcons/${id}.png`;
}

export function lireCollection(pseudo) {
  const fichier = path.join(DOSSIER_DATA, `${pseudo}.json`);
  if (!fs.existsSync(fichier)) {
    return { pseudo, singes: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(fichier, "utf8"));
  } catch {
    // fichier vide ou corrompu : on repart d'une collection propre
    return { pseudo, singes: {} };
  }
}

export function ajouterCopie(pseudo, id) {
  fs.mkdirSync(DOSSIER_DATA, { recursive: true });
  const collection = lireCollection(pseudo);

  if (!collection.singes[id]) {
    collection.singes[id] = { amount: 0 };
  }
  collection.singes[id].amount += 1;

  const fichier = path.join(DOSSIER_DATA, `${pseudo}.json`);
  fs.writeFileSync(fichier, JSON.stringify(collection, null, 2));

  return collection.singes[id].amount;
}

const PALIERS = {
  common: 5,
  uncommon: 4,
  rare: 3,
  epic: 2,
  legendary: 1,
};

export function getNiveau(rarete, amount) {
  const palier = PALIERS[rarete];
  let niveau = 1;
  let restant = amount;
  let prochain = palier + 1;

  while (restant >= prochain) {
    restant -= prochain;
    niveau += 1;
    prochain = palier * niveau + 1;
  }

  return { niveau, progression: restant, prochain };
}

export function getMonkeydex(pseudo) {
  const collection = lireCollection(pseudo);
  const ordre = Object.fromEntries(RARETES.map((r) => [r.nom, r.id]));

  return Object.entries(collection.singes)
    .filter(([id]) => SINGES[id])
    .map(([id, { amount }]) => {
      const espece = SINGES[id];
      const niveau = getNiveau(espece.rarete, amount);
      const stats = {};
      for (const k of ["hp", "atk", "def"]) {
        stats[k] = espece.base[k] + espece.croissance[k] * (niveau.niveau - 1);
      }
      return {
        id,
        espece,
        amount,
        niveau,
        stats,
        image: getImageUrl(id),
        rang: ordre[espece.rarete] ?? 0,
      };
    })
    .sort((a, b) => b.rang - a.rang);
}