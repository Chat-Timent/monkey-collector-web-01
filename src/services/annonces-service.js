import { pool } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";

// Seul ce compte peut publier et supprimer des annonces. Les pseudos sont uniques,
// sensibles à la casse et non modifiables : le pseudo suffit à identifier l'admin.
export const PSEUDO_ADMIN = "Noam";
export const TEXTE_MAX = 500;
const NOMBRE_AFFICHE = 30;

export async function estAdmin(userId) {
  const { rows } = await pool.query("SELECT pseudo FROM users WHERE id = $1", [userId]);
  return rows[0]?.pseudo === PSEUDO_ADMIN;
}

async function exigerAdmin(userId) {
  if (!(await estAdmin(userId))) throw new ErreurJeu("réservé à l'admin", 403);
}

// Les 30 annonces les plus récentes (de la plus récente à la plus ancienne),
// le nombre d'annonces non lues par ce joueur et s'il est admin.
export async function lireAnnonces(userId) {
  const { rows: annonces } = await pool.query(
    `SELECT a.id, a.texte, a.created_at
     FROM annonces a
     ORDER BY a.id DESC
     LIMIT $1`,
    [NOMBRE_AFFICHE]
  );
  const { rows } = await pool.query(
    `SELECT u.pseudo,
            (SELECT count(*)::int FROM annonces a WHERE a.id > u.annonces_lues) AS non_lues
     FROM users u WHERE u.id = $1`,
    [userId]
  );
  return {
    annonces: annonces.map((a) => ({ ...a, id: Number(a.id) })),
    nonLues: rows[0]?.non_lues ?? 0,
    admin: rows[0]?.pseudo === PSEUDO_ADMIN,
  };
}

// Tout ce qui est publié jusqu'ici devient lu (jamais de retour en arrière).
export async function marquerAnnoncesLues(userId) {
  await pool.query(
    `UPDATE users
     SET annonces_lues = GREATEST(annonces_lues, (SELECT COALESCE(MAX(id), 0) FROM annonces))
     WHERE id = $1`,
    [userId]
  );
}

export async function publierAnnonce(userId, texte) {
  await exigerAdmin(userId);
  const propre = String(texte ?? "").trim();
  if (propre.length === 0) throw new ErreurJeu("annonce vide");
  if (propre.length > TEXTE_MAX) throw new ErreurJeu(`annonce trop longue (${TEXTE_MAX} caractères max)`);
  // L'auteur a forcément lu sa propre annonce : pas de pastille pour lui.
  const { rows } = await pool.query(
    "INSERT INTO annonces (user_id, texte) VALUES ($1, $2) RETURNING id",
    [userId, propre]
  );
  await marquerAnnoncesLues(userId);
  return Number(rows[0].id);
}

export async function supprimerAnnonce(userId, id) {
  await exigerAdmin(userId);
  const { rowCount } = await pool.query("DELETE FROM annonces WHERE id = $1", [id]);
  if (rowCount === 0) throw new ErreurJeu("annonce introuvable", 404);
}
