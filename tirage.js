import "dotenv/config";
import fs from "node:fs";
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

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

const RECOMPENSES = {
  common: { xp: 5, coins: 1 },
  uncommon: { xp: 25, coins: 10 },
  rare: { xp: 100, coins: 60 },
  epic: { xp: 500, coins: 150 },
  legendary: { xp: 1250, coins: 500 },
};

const STARTERS = {
  fire: { nom: "Fire monkey" },
  ice: { nom: "Ice monkey" },
};

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
  return `/images/MonkeysIcons/${id}.png`;
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

export function statsFinales(espece, niveau) {
  const n = niveau - 1;
  const s = {};
  for (const k of Object.keys(espece.base)) {
    s[k] = espece.base[k] + (espece.croissance[k] ?? 0) * n;
  }
  return s;
}

// Collection

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
      return {
        id,
        espece,
        amount,
        niveau,
        stats: statsFinales(espece, niveau.niveau),
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

// Starter

export async function getStarter(pseudo) {
  const { rows } = await pool.query(
    "SELECT nom, niveau, xp, coins FROM starter WHERE pseudo = $1",
    [pseudo]
  );
  return rows[0] ?? null;
}

export async function choisirStarter(pseudo, choix) {
  if (!STARTERS[choix]) throw new Error("starter inconnu");
  await pool.query(
    `INSERT INTO starter (pseudo, nom) VALUES ($1, $2)
     ON CONFLICT (pseudo) DO NOTHING`,
    [pseudo, STARTERS[choix].nom]
  );
  return getStarter(pseudo);
}

export async function gagnerRecompense(pseudo, rarete) {
  const gains = RECOMPENSES[rarete];
  if (!gains) return null;

  const starter = await getStarter(pseudo);
  if (!starter) return null;

  let niveau = starter.niveau;
  let xp = starter.xp + gains.xp;
  let coins = starter.coins + gains.coins;

  let niveauxGagnes = 0;
  while (xp >= niveau * 100) {
    xp -= niveau * 100;
    niveau += 1;
    niveauxGagnes += 1;
  }

  await pool.query(
    "UPDATE starter SET niveau = $2, xp = $3, coins = $4 WHERE pseudo = $1",
    [pseudo, niveau, xp, coins]
  );

  return { nom: starter.nom, niveau, xp, coins, niveauxGagnes };
}

// Équipe

export async function getEquipe(pseudo) {
  const { rows } = await pool.query(
    "SELECT slot, espece FROM equipe WHERE pseudo = $1 ORDER BY slot",
    [pseudo]
  );
  return rows;
}

export async function definirEquipe(pseudo, especes) {
  // especes : tableau de 6 entrées, un identifiant ou null (slot vide)
  if (!Array.isArray(especes) || especes.length !== 6) {
    throw new Error("6 emplacements attendus");
  }

  const choisis = especes.filter((e) => e !== null);
  if (new Set(choisis).size !== choisis.length) throw new Error("singe en double");

  const possedes = await lireCollection(pseudo);
  for (const e of choisis) {
    if (!possedes.singes[e]) throw new Error(`singe non possédé : ${e}`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM equipe WHERE pseudo = $1", [pseudo]);
    for (let i = 0; i < especes.length; i++) {
      if (especes[i] === null) continue;
      await client.query(
        "INSERT INTO equipe (pseudo, slot, espece) VALUES ($1, $2, $3)",
        [pseudo, i + 1, especes[i]]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return getEquipe(pseudo);
}

export async function creerCompte(pseudo, motDePasse) {
  if (!/^[\w-]{3,20}$/.test(pseudo)) throw new Error("pseudo invalide (3-20 caractères, lettres, chiffres, - ou _)");
  if (motDePasse.length < 6) throw new Error("mot de passe trop court (6 caractères minimum)");
  const hash = await bcrypt.hash(motDePasse, 10);
  try {
    await pool.query("INSERT INTO users (pseudo, password_hash) VALUES ($1, $2)", [pseudo, hash]);
  } catch (err) {
    if (err.code === "23505") throw new Error("ce pseudo est déjà pris");
    throw err;
  }
}

export async function connecter(pseudo, motDePasse) {
  const { rows } = await pool.query("SELECT password_hash FROM users WHERE pseudo = $1", [pseudo]);
  const ok = rows[0] && (await bcrypt.compare(motDePasse, rows[0].password_hash));
  if (!ok) throw new Error("pseudo ou mot de passe incorrect");

  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO sessions (token, pseudo, expires_at) VALUES ($1, $2, now() + interval '30 days')",
    [token, pseudo]
  );
  return token;
}

export async function pseudoDepuisToken(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    "SELECT pseudo FROM sessions WHERE token = $1 AND expires_at > now()",
    [token]
  );
  return rows[0]?.pseudo ?? null;
}

export async function deconnecter(token) {
  await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
}