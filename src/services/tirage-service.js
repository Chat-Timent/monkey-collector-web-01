import { pool, transaction } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";
import { getEspece, getImageUrl, getNiveau, statsFinales, tirer } from "../game/monkeys.js";
import { etatQuota, quotaPublic } from "../game/quota.js";
import { ajouterCopie } from "./collection-service.js";
import { gagnerRecompense, getStarter } from "./starter-service.js";

async function lireLigneQuota(userId, db) {
  const { rows } = await db.query(
    "SELECT tirages_restants, dernier_reset FROM tirages_etat WHERE user_id = $1",
    [userId]
  );
  return rows[0] ?? null;
}

// Quota actuel du joueur, pour l'afficher sans tirer.
export async function getQuota(userId) {
  return quotaPublic(etatQuota(await lireLigneQuota(userId, pool), Date.now()));
}

// Un tirage complet (quota + copie + récompense du starter) dans une seule transaction.
// La ligne du starter est verrouillée : deux tirages simultanés du même joueur
// s'exécutent l'un après l'autre, aucun gain n'est perdu et le quota ne peut pas être dépassé.
export async function effectuerTirage(userId) {
  return transaction(async (db) => {
    const starterAvant = await getStarter(userId, db, { verrouiller: true });
    if (!starterAvant) throw new ErreurJeu("aucun starter, choisis-en un d'abord");

    const quota = etatQuota(await lireLigneQuota(userId, db), Date.now());
    if (quota.restants <= 0) {
      throw new ErreurJeu("plus de tirages disponibles avant le prochain reset", 429, {
        quota: quotaPublic(quota),
      });
    }

    const id = tirer();
    const espece = getEspece(id);
    if (!espece) throw new Error(`tirage impossible : aucune espèce pour ${id}`);

    const amount = await ajouterCopie(userId, id, db);
    const niveau = getNiveau(espece.rarete, amount);
    const starter = await gagnerRecompense(userId, espece.rarete, starterAvant, db);

    quota.restants -= 1;
    await db.query(
      `INSERT INTO tirages_etat (user_id, tirages_restants, dernier_reset)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
       SET tirages_restants = EXCLUDED.tirages_restants, dernier_reset = EXCLUDED.dernier_reset`,
      [userId, quota.restants, new Date(quota.debutFenetre)]
    );

    return {
      id,
      espece,
      image: getImageUrl(id),
      amount,
      niveau,
      stats: statsFinales(espece, niveau.niveau),
      starter,
      quota: quotaPublic(quota),
    };
  });
}
