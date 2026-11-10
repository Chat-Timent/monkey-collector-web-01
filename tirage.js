import fs from "node:fs";
import pg from "pg";
import "dotenv/config";

const SINGES = JSON.parse(fs.readFileSync("./monkeys.json", "utf8"));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const PALIERS = {
  common: 5,
  uncommon: 4,
  rare: 3,
  epic: 2,
  legendary: 1,
};

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
  return espece;
}

export function getEspece(id) {
  return SINGES[id] ?? null;
}

export function getImageUrl(id) {
  return `/images/${id}.png`;
}

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

// Renvoie { pseudo, singes: { espece: { amount } } }, comme avant
export async function lireCollection(pseudo) {
  const { rows } = await pool.query(
    "SELECT espece, amount FROM collections WHERE pseudo = $1",
    [pseudo]
  );
  const singes = {};
  for (const r of rows) {
    singes[r.espece] = { amount: r.amount };
  }
  return { pseudo, singes };
}

// Incrémente la copie et renvoie le nouveau total
export async function ajouterCopie(pseudo, id) {
  const { rows } = await pool.query(
    `INSERT INTO collections (pseudo, espece, amount)
     VALUES ($1, $2, 1)
     ON CONFLICT (pseudo, espece)
     DO UPDATE SET amount = collections.amount + 1
     RETURNING amount`,
    [pseudo, id]
  );
  return rows[0].amount;
}

export async function getMonkeydex(pseudo) {
  const collection = await lireCollection(pseudo);
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

export async function getCompteurRarete(pseudo) {
  const collection = await lireCollection(pseudo);
  const compteur = {};

  for (const [id, { amount }] of Object.entries(collection.singes)) {
    const espece = SINGES[id];
    if (!espece) continue;
    compteur[espece.rarete] = (compteur[espece.rarete] ?? 0) + amount;
  }

  return RARETES.map((r) => ({
    nom: r.nom,
    total: compteur[r.nom] ?? 0,
  }));
}