import { pool, transaction } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";
import { getEspece, getImageUrl, getNiveau, statsFinales, tirer } from "../game/monkeys.js";
import { TIRAGES_PAR_RESET } from "../constants/game.js";
import { gainsDuTirage } from "../game/progression.js";
import { consommerTirage, etatQuota, quotaPublic } from "../game/quota.js";
import { agregerEffets, pointsDepenses, pointsDisponibles } from "../game/starter-arbre.js";
import { effetsDuJoueur, lireNoeudsPris } from "./arbre-service.js";
import { ajouterCopie } from "./collection-service.js";
import { gagnerRecompense, getStarter } from "./starter-service.js";

async function lireLigneQuota(userId, db) {
  const { rows } = await db.query(
    "SELECT tirages_restants, dernier_reset, tirages_bonus FROM tirages_etat WHERE user_id = $1",
    [userId]
  );
  return rows[0] ?? null;
}

// Ajoute des tirages bonus au stock du joueur (dans la transaction `db`).
// Ligne de quota absente : créée avec une fenêtre passée, donc un quota gratuit plein.
export async function ajouterTiragesBonus(userId, nombre, db) {
  await db.query(
    `INSERT INTO tirages_etat (user_id, tirages_restants, dernier_reset, tirages_bonus)
     VALUES ($1, 0, 'epoch', $2)
     ON CONFLICT (user_id) DO UPDATE SET tirages_bonus = tirages_etat.tirages_bonus + EXCLUDED.tirages_bonus`,
    [userId, nombre]
  );
}

// Quota actuel du joueur, pour l'afficher sans tirer (bonus de l'arbre compris).
export async function getQuota(userId) {
  const [ligne, effets] = await Promise.all([lireLigneQuota(userId, pool), effetsDuJoueur(userId)]);
  return quotaPublic(etatQuota(ligne, Date.now(), TIRAGES_PAR_RESET + effets.reset_bonus));
}

// Un tirage complet (quota + copie + récompense du starter, effets de l'arbre compris)
// dans une seule transaction.
// La ligne du starter est verrouillée : deux tirages simultanés du même joueur
// s'exécutent l'un après l'autre, aucun gain n'est perdu et le quota ne peut pas être dépassé.
export async function effectuerTirage(userId) {
  return transaction(async (db) => {
    const starterAvant = await getStarter(userId, db, { verrouiller: true });
    if (!starterAvant) throw new ErreurJeu("aucun starter, choisis-en un d'abord");

    const pris = await lireNoeudsPris(userId, db);
    const effets = agregerEffets(pris);
    const quota = etatQuota(await lireLigneQuota(userId, db), Date.now(), TIRAGES_PAR_RESET + effets.reset_bonus);
    if (!consommerTirage(quota)) {
      throw new ErreurJeu("plus de tirages disponibles avant le prochain reset", 429, {
        quota: quotaPublic(quota),
      });
    }

    const id = tirer();
    const espece = getEspece(id);
    if (!espece) throw new Error(`tirage impossible : aucune espèce pour ${id}`);

    const gains = gainsDuTirage(espece.rarete, effets);
    let amount = await ajouterCopie(userId, id, db);
    if (gains.copieBonus) amount = await ajouterCopie(userId, id, db);
    const niveau = getNiveau(espece.rarete, amount);
    const starter = await gagnerRecompense(userId, gains, starterAvant, db);

    await db.query(
      `INSERT INTO tirages_etat (user_id, tirages_restants, dernier_reset, tirages_bonus)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
       SET tirages_restants = EXCLUDED.tirages_restants, dernier_reset = EXCLUDED.dernier_reset,
           tirages_bonus = EXCLUDED.tirages_bonus`,
      [userId, quota.restants, new Date(quota.debutFenetre), quota.bonus]
    );

    return {
      id,
      espece,
      image: getImageUrl(id),
      amount,
      niveau,
      stats: statsFinales(espece, niveau.niveau),
      starter,
      gains,
      pointsArbre: pointsDisponibles(starter.niveau, pointsDepenses(pris)),
      quota: quotaPublic(quota),
    };
  });
}
