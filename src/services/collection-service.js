import { pool } from "../config/database.js";
import { RARETES } from "../constants/game.js";
import { SINGES } from "../monkeys.js";
import { getImageUrl, getNiveau, statsFinales } from "../game/monkeys.js";

export async function lireCollection(userId) {
  const { rows } = await pool.query(
    "SELECT espece, amount FROM collections WHERE user_id = $1",
    [userId]
  );
  const singes = {};
  for (const r of rows) singes[r.espece] = { amount: r.amount };
  return { userId, singes };
}

export async function ajouterCopie(userId, id, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO collections (user_id, espece, amount)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, espece)
     DO UPDATE SET amount = collections.amount + 1
     RETURNING amount`,
    [userId, id]
  );
  return rows[0].amount;
}

function construireMonkeydex(collection) {
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

function compterRaretes(collection) {
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

export async function getMonkeydex(userId) {
  return construireMonkeydex(await lireCollection(userId));
}

export async function getCompteurRarete(userId) {
  return compterRaretes(await lireCollection(userId));
}

// Le Monkeydex affiche ces trois informations simultanément : une seule lecture suffit.
export async function getResumeMonkeydex(userId) {
  const collection = await lireCollection(userId);
  const singes = construireMonkeydex(collection);
  return {
    total: singes.reduce((somme, singe) => somme + singe.amount, 0),
    compteur: compterRaretes(collection),
    singes,
  };
}


export async function getClassement(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.pseudo, COALESCE(SUM(c.amount), 0)::int AS total
     FROM users u
     LEFT JOIN collections c ON c.user_id = u.id
     GROUP BY u.id, u.pseudo
     ORDER BY total DESC, u.pseudo
     LIMIT 50`
  );
  return rows.map((r) => ({
    pseudo: r.pseudo,
    total: r.total,
    moi: r.id === userId,
  }));
}