import "dotenv/config";
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import bcrypt from "bcryptjs";
import { combat } from "./combat.js";

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

// Comptes et sessions

export async function creerCompte(pseudo, motDePasse) {
  if (!/^[\w-]{3,20}$/.test(pseudo)) {
    throw new Error("pseudo invalide (3-20 caractères, lettres, chiffres, - ou _)");
  }
  if (!motDePasse || motDePasse.length < 6) {
    throw new Error("mot de passe trop court (6 caractères minimum)");
  }
  const hash = await bcrypt.hash(motDePasse, 10);
  try {
    const { rows } = await pool.query(
      "INSERT INTO users (pseudo, password_hash) VALUES ($1, $2) RETURNING id",
      [pseudo, hash]
    );
    return rows[0].id;
  } catch (err) {
    if (err.code === "23505") throw new Error("ce pseudo est déjà pris");
    throw err;
  }
}

export async function connecter(pseudo, motDePasse) {
  const { rows } = await pool.query(
    "SELECT id, password_hash FROM users WHERE pseudo = $1",
    [pseudo]
  );
  const ok = rows[0] && (await bcrypt.compare(motDePasse, rows[0].password_hash));
  if (!ok) throw new Error("pseudo ou mot de passe incorrect");

  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, now() + interval '30 days')",
    [token, rows[0].id]
  );
  return token;
}

export async function userIdDepuisToken(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    "SELECT user_id FROM sessions WHERE token = $1 AND expires_at > now()",
    [token]
  );
  return rows[0]?.user_id ?? null;
}

export async function getPseudo(userId) {
  const { rows } = await pool.query("SELECT pseudo FROM users WHERE id = $1", [userId]);
  return rows[0]?.pseudo ?? null;
}

export async function deconnecter(token) {
  await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
}

// Collection

export async function lireCollection(userId) {
  const { rows } = await pool.query(
    "SELECT espece, amount FROM collections WHERE user_id = $1",
    [userId]
  );
  const singes = {};
  for (const r of rows) singes[r.espece] = { amount: r.amount };
  return { userId, singes };
}

export async function ajouterCopie(userId, id) {
  const { rows } = await pool.query(
    `INSERT INTO collections (user_id, espece, amount)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, espece)
     DO UPDATE SET amount = collections.amount + 1
     RETURNING amount`,
    [userId, id]
  );
  return rows[0].amount;
}

export async function getMonkeydex(userId) {
  const collection = await lireCollection(userId);
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

export async function getCompteurRarete(userId) {
  const collection = await lireCollection(userId);
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

export async function getStarter(userId) {
  const { rows } = await pool.query(
    "SELECT nom, niveau, xp, coins FROM starter WHERE user_id = $1",
    [userId]
  );
  return rows[0] ?? null;
}

export async function choisirStarter(userId, choix) {
  if (!STARTERS[choix]) throw new Error("starter inconnu");
  await pool.query(
    `INSERT INTO starter (user_id, nom) VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, STARTERS[choix].nom]
  );
  return getStarter(userId);
}

export async function gagnerRecompense(userId, rarete) {
  const gains = RECOMPENSES[rarete];
  if (!gains) return null;

  const starter = await getStarter(userId);
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
    "UPDATE starter SET niveau = $2, xp = $3, coins = $4 WHERE user_id = $1",
    [userId, niveau, xp, coins]
  );

  return { nom: starter.nom, niveau, xp, coins, niveauxGagnes };
}

// Équipe

export async function getEquipe(userId) {
  const { rows } = await pool.query(
    "SELECT slot, espece FROM equipe WHERE user_id = $1 ORDER BY slot",
    [userId]
  );
  return rows;
}

export async function definirEquipe(userId, especes) {
  if (!Array.isArray(especes) || especes.length !== 6) {
    throw new Error("6 emplacements attendus");
  }

  const choisis = especes.filter((e) => e !== null);
  if (new Set(choisis).size !== choisis.length) throw new Error("singe en double");

  const possedes = await lireCollection(userId);
  for (const e of choisis) {
    if (!possedes.singes[e]) throw new Error(`singe non possédé : ${e}`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM equipe WHERE user_id = $1", [userId]);
    for (let i = 0; i < especes.length; i++) {
      if (especes[i] === null) continue;
      await client.query(
        "INSERT INTO equipe (user_id, slot, espece) VALUES ($1, $2, $3)",
        [userId, i + 1, especes[i]]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return getEquipe(userId);
}

const DUREE_DEFI_SEC = 60;        // un défi expire après 60 s sans réponse
const SEUIL_EN_LIGNE_SEC = 45;    // considéré en ligne si dernier signe < 45 s

async function expirerDefis() {
  await pool.query(
    "UPDATE defis SET statut = 'expire' WHERE statut = 'en_attente' AND expires_at <= now()"
  );
}

export async function marquerPresence(userId) {
  await pool.query(
    `INSERT INTO presence (user_id, last_seen) VALUES ($1, now())
     ON CONFLICT (user_id) DO UPDATE SET last_seen = now()`,
    [userId]
  );
}

export async function listerJoueurs(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.pseudo,
            COALESCE(p.last_seen > now() - make_interval(secs => $2), false) AS en_ligne
     FROM users u
     LEFT JOIN presence p ON p.user_id = u.id
     WHERE u.id <> $1
     ORDER BY en_ligne DESC, u.pseudo`,
    [userId, SEUIL_EN_LIGNE_SEC]
  );
  return rows;
}

export async function envoyerDefi(deUser, versUser) {
  await expirerDefis();
  if (deUser === versUser) throw new Error("tu ne peux pas te défier toi-même");

  const { rows: cible } = await pool.query(
    "SELECT 1 FROM presence WHERE user_id = $1 AND last_seen > now() - make_interval(secs => $2)",
    [versUser, SEUIL_EN_LIGNE_SEC]
  );
  if (cible.length === 0) throw new Error("ce joueur n'est pas en ligne");

  try {
    const { rows } = await pool.query(
      `INSERT INTO defis (de_user, vers_user, expires_at)
       VALUES ($1, $2, now() + make_interval(secs => $3))
       RETURNING id`,
      [deUser, versUser, DUREE_DEFI_SEC]
    );
    return rows[0].id;
  } catch (err) {
    if (err.code === "23505") throw new Error("un défi est déjà en attente pour ce joueur");
    throw err;
  }
}

export async function defisDuJoueur(userId) {
  await expirerDefis();
  const { rows } = await pool.query(
    `SELECT d.id, d.de_user, d.vers_user, u1.pseudo AS de_pseudo, u2.pseudo AS vers_pseudo,
            GREATEST(0, CEIL(EXTRACT(EPOCH FROM (d.expires_at - now())))) AS secondes_restantes
     FROM defis d
     JOIN users u1 ON u1.id = d.de_user
     JOIN users u2 ON u2.id = d.vers_user
     WHERE d.statut = 'en_attente' AND (d.de_user = $1 OR d.vers_user = $1)`,
    [userId]
  );
  return {
    envoyes: rows.filter((d) => d.de_user === userId),
    recus: rows.filter((d) => d.vers_user === userId),
  };
}

// Combats

// Prépare les 6 slots d'un joueur au format attendu par combat()
async function preparerEquipe(userId) {
  const equipe = await getEquipe(userId);
  const collection = await lireCollection(userId);
  const slots = Array(6).fill(null);

  for (const { slot, espece } of equipe) {
    const e = SINGES[espece];
    const amount = collection.singes[espece]?.amount ?? 1;
    const niveau = getNiveau(e.rarete, amount).niveau;
    const s = statsFinales(e, niveau);
    slots[slot - 1] = {
      id: espece,
      nom: e.nom,
      image: getImageUrl(espece),
      rarete: e.rarete,
      hp: s.hp, atk: s.atk, def: s.def,
      spd: s.spd, prec: s.prec, esq: s.esq,
      crit: s.crit, critdmg: s.critdmg,
      perk: null,
    };
  }
  return slots;
}

async function lancerCombat(defi, equipeA, equipeB) {
  const resultat = combat(equipeA, equipeB);
  resultat.equipeA = equipeA;
  resultat.equipeB = equipeB;

  const { rows } = await pool.query(
    `INSERT INTO combats (defi_id, user_a, user_b, resultat)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [defi.id, defi.de_user, defi.vers_user, resultat]
  );
  return rows[0].id;
}

export async function repondreDefi(userId, defiId, accepter) {
  await expirerDefis();

  const { rows } = await pool.query(
    "SELECT id, de_user, vers_user FROM defis WHERE id = $1 AND vers_user = $2 AND statut = 'en_attente'",
    [defiId, userId]
  );
  if (rows.length === 0) throw new Error("défi introuvable, expiré ou déjà traité");
  const defi = rows[0];

  let equipeA, equipeB;
  if (accepter) {
    // On vérifie les équipes avant de figer le défi
    equipeA = await preparerEquipe(defi.de_user);
    equipeB = await preparerEquipe(defi.vers_user);
    if (!equipeA.some(Boolean)) throw new Error("le challenger n'a aucun singe dans son équipe");
    if (!equipeB.some(Boolean)) throw new Error("tu n'as aucun singe dans ton équipe");
  }

  await pool.query("UPDATE defis SET statut = $2 WHERE id = $1", [
    defi.id,
    accepter ? "accepte" : "refuse",
  ]);
  if (!accepter) return null;

  return lancerCombat(defi, equipeA, equipeB);
}

export async function getCombat(userId, combatId) {
  const { rows } = await pool.query(
    `SELECT c.user_a, c.user_b, c.resultat, u1.pseudo AS pseudo_a, u2.pseudo AS pseudo_b
     FROM combats c
     JOIN users u1 ON u1.id = c.user_a
     JOIN users u2 ON u2.id = c.user_b
     WHERE c.id = $1 AND (c.user_a = $2 OR c.user_b = $2)`,
    [combatId, userId]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    resultat: r.resultat,
    pseudoA: r.pseudo_a,
    pseudoB: r.pseudo_b,
    monCamp: r.user_a === userId ? "A" : "B",
  };
}

export async function combatsDuJoueur(userId) {
  const { rows } = await pool.query(
    `SELECT c.id, c.user_a, u1.pseudo AS pseudo_a, u2.pseudo AS pseudo_b,
            c.resultat->>'vainqueur' AS vainqueur,
            c.created_at > now() - interval '3 minutes' AS recent
     FROM combats c
     JOIN users u1 ON u1.id = c.user_a
     JOIN users u2 ON u2.id = c.user_b
     WHERE c.user_a = $1 OR c.user_b = $1
     ORDER BY c.created_at DESC
     LIMIT 10`,
    [userId]
  );

  return rows.map((r) => {
    const monCamp = r.user_a === userId ? "A" : "B";
    let issue = "nul";
    if (r.vainqueur === monCamp) issue = "victoire";
    else if (r.vainqueur) issue = "défaite";
    return {
      id: r.id,
      adversaire: monCamp === "A" ? r.pseudo_b : r.pseudo_a,
      issue,
      recent: r.recent,
    };
  });
}