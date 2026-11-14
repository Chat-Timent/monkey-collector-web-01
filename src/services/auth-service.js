import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";

export async function creerCompte(pseudo, motDePasse) {
  if (typeof pseudo !== "string" || !/^[\w-]{3,20}$/.test(pseudo)) {
    throw new ErreurJeu("pseudo invalide (3-20 caractères, lettres, chiffres, - ou _)");
  }
  if (typeof motDePasse !== "string" || motDePasse.length < 6) {
    throw new ErreurJeu("mot de passe trop court (6 caractères minimum)");
  }

  const hash = await bcrypt.hash(motDePasse, 10);
  try {
    const { rows } = await pool.query(
      "INSERT INTO users (pseudo, password_hash) VALUES ($1, $2) RETURNING id",
      [pseudo, hash]
    );
    return rows[0].id;
  } catch (err) {
    if (err.code === "23505") throw new ErreurJeu("ce pseudo est déjà pris");
    throw err;
  }
}

export async function connecter(pseudo, motDePasse) {
  if (typeof pseudo !== "string" || typeof motDePasse !== "string") {
    throw new ErreurJeu("pseudo ou mot de passe incorrect", 401);
  }
  const { rows } = await pool.query(
    "SELECT id, password_hash FROM users WHERE pseudo = $1",
    [pseudo]
  );
  const ok = rows[0] && (await bcrypt.compare(motDePasse, rows[0].password_hash));
  if (!ok) throw new ErreurJeu("pseudo ou mot de passe incorrect", 401);

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
