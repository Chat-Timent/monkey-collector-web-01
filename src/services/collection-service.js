import { pool } from "../config/database.js";
import { RARETES } from "../constants/game.js";
import { SINGES, getImageUrl, getNiveau, statsFinales } from "../game/monkeys.js";
import { competenceDe } from "../game/competences.js";
import { EVEIL, bonusEveil, bonusEveilPct, peutEveiller } from "../game/eveil.js";

export async function lireCollection(userId, db = pool) {
  const { rows } = await db.query(
    "SELECT espece, amount, eveil FROM collections WHERE user_id = $1",
    [userId]
  );
  const singes = {};
  for (const r of rows) singes[r.espece] = { amount: r.amount, eveil: r.eveil };
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
    .map(([id, { amount, eveil = 1 }]) => {
      const espece = SINGES[id];
      const niveau = getNiveau(espece.rarete, amount);
      // Stats actuelles : niveau et éveil (les bonus de l'arbre et des perks dépendent du joueur, pas du singe)
      const stats = statsFinales(espece, niveau.niveau);
      const pct = bonusEveilPct(eveil);
      for (const k of ["hp", "atk", "def"]) stats[k] += bonusEveil(stats[k], pct);
      return {
        id,
        espece,
        amount,
        niveau,
        stats,
        image: getImageUrl(id),
        rang: ordre[espece.rarete] ?? 0,
        competence: competenceDe(espece, eveil),
        eveil: peutEveiller(espece.rarete) ? { niveau: eveil, max: EVEIL.niveauMax } : null,
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