import { pool, transaction } from "../config/database.js";
import { DELAI_INITIAL_MS, PAS_MS } from "../constants/game.js";
import { ErreurJeu } from "../erreurs.js";
import { combat } from "../game/combat-engine.js";
import { ennemisEtage, recompensesAvecBonus, recompensesEtage, singeBonus } from "../game/aventure.js";
import { effetsDuJoueur } from "./arbre-service.js";
import { ajouterCopie } from "./collection-service.js";
import { combatEnCours, preparerEquipe } from "./combat-service.js";
import { ajouterTirages } from "./tirage-service.js";
import { gagnerRecompense, getStarter } from "./starter-service.js";

async function lireEtage(userId, db = pool) {
  const { rows } = await db.query("SELECT etage FROM aventure WHERE user_id = $1", [userId]);
  return rows[0]?.etage ?? 1;
}

async function classementAventure(userId) {
  const { rows } = await pool.query(
    `SELECT a.user_id, u.pseudo, a.etage - 1 AS record
     FROM aventure a JOIN users u ON u.id = a.user_id
     WHERE a.etage > 1
     ORDER BY a.etage DESC, a.updated_at
     LIMIT 10`
  );
  return rows.map((r) => ({ pseudo: r.pseudo, record: r.record, moi: r.user_id === userId }));
}

// Ce qu'affiche la page Aventure : étage courant, ennemis, récompenses, classement,
// et le combat en cours s'il y en a un.
export async function getAventure(userId) {
  const [etage, enCours, classement, effets] = await Promise.all([
    lireEtage(userId), combatEnCours(userId, "aventure"), classementAventure(userId), effetsDuJoueur(userId),
  ]);
  const ennemis = ennemisEtage(etage).filter(Boolean).map(({ id, nom, image, rarete, niveau }) => ({ id, nom, image, rarete, niveau }));
  return { etage, ennemis, recompenses: recompensesAvecBonus(recompensesEtage(etage), effets), classement, combatEnCours: enCours };
}

// Lance le combat de l'étage courant. Tout se fait dans une transaction :
// combat enregistré, et en cas de victoire étage suivant + récompenses (XP, coins, tirages bonus, singe).
// La ligne Aventure du joueur est verrouillée : deux combats simultanés ne peuvent pas passer le même étage.
export async function lancerCombatAventure(userId) {
  return transaction(async (db) => {
    await db.query("INSERT INTO aventure (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
    const { rows } = await db.query("SELECT etage FROM aventure WHERE user_id = $1 FOR UPDATE", [userId]);
    const etage = rows[0].etage;

    if (await combatEnCours(userId, "aventure", db)) throw new ErreurJeu("un combat d'Aventure est déjà en cours");

    const equipe = await preparerEquipe(userId, db);
    if (!equipe.some(Boolean)) throw new ErreurJeu("ton équipe est vide");
    const ennemis = ennemisEtage(etage);

    const resultat = combat(equipe, ennemis);
    resultat.equipeA = equipe;
    resultat.equipeB = ennemis;
    resultat.dureeMs = DELAI_INITIAL_MS + resultat.journal.length * PAS_MS;

    let gains = null;
    if (resultat.vainqueur === "A") {
      const recompenses = recompensesAvecBonus(recompensesEtage(etage), await effetsDuJoueur(userId, db));
      const starter = await getStarter(userId, db, { verrouiller: true });
      const apres = starter
        ? await gagnerRecompense(userId, { xp: recompenses.xp, coins: recompenses.coins }, starter, db)
        : null;

      if (recompenses.tirages > 0) await ajouterTirages(userId, recompenses.tirages, db);

      const singe = singeBonus(ennemis);
      if (singe) await ajouterCopie(userId, singe, db);

      await db.query("UPDATE aventure SET etage = etage + 1, updated_at = now() WHERE user_id = $1", [userId]);
      gains = { ...recompenses, singe, niveauxGagnes: apres?.niveauxGagnes ?? 0 };
    }

    const { rows: insere } = await db.query(
      `INSERT INTO combats (user_a, user_b, resultat, mode, contexte)
       VALUES ($1, NULL, $2, 'aventure', $3) RETURNING id`,
      [userId, resultat, { etage, gains }]
    );
    return insere[0].id;
  });
}
