import { pool, transaction } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";
import { ETINCELLE_SEUIL } from "../constants/game.js";
import { estRare, getEspece, getImageUrl, getNiveau, statsFinales, tirer } from "../game/monkeys.js";
import { gainsDuTirage } from "../game/progression.js";
import { ajouterAuQuota, consommerTirage, etatQuota, parametresQuota, quotaPublic } from "../game/quota.js";
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

// Ligne de quota verrouillée jusqu'à la fin de la transaction `db` : un tirage et une récompense
// simultanés s'exécutent l'un après l'autre, aucun tirage n'est perdu.
// Ligne absente : créée avec une recharge partie de loin, donc un stock plein.
async function lireLigneVerrouillee(userId, db) {
  await db.query(
    `INSERT INTO tirages_etat (user_id, tirages_restants, dernier_reset, tirages_bonus)
     VALUES ($1, 0, 'epoch', 0) ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  const { rows } = await db.query(
    "SELECT tirages_restants, dernier_reset, tirages_bonus, tirages_sans_rare FROM tirages_etat WHERE user_id = $1 FOR UPDATE",
    [userId]
  );
  return rows[0];
}

// L'ancien stock bonus est désormais compris dans le stock : remis à 0.
// `sansRare` : nouveau compteur d'Étincelle (inchangé s'il est omis).
async function enregistrerQuota(userId, quota, db, sansRare = null) {
  await db.query(
    `UPDATE tirages_etat SET tirages_restants = $2, dernier_reset = $3, tirages_bonus = 0,
       tirages_sans_rare = COALESCE($4, tirages_sans_rare)
     WHERE user_id = $1`,
    [userId, quota.stock, new Date(quota.debutRecharge), sansRare]
  );
}

// Étincelle : la rareté est forcée si le joueur a le nœud et a enchaîné assez de tirages sans rare.
export function etincelleDeclenchee(effets, sansRare, seuil = ETINCELLE_SEUIL) {
  return Boolean(effets.etincelle) && sansRare >= seuil;
}

// Compteur de tirages d'affilée sans rare ou mieux : il avance à chaque tirage, nœud pris ou non,
// et repart à 0 sur un rare, un épique ou un légendaire.
export function compteurSansRare(sansRare, rarete) {
  return estRare(rarete) ? 0 : sansRare + 1;
}

// Ajoute des tirages gagnés (donjon, Aventure…) au stock du joueur, sans plafond
// (dans la transaction `db`).
export async function ajouterTirages(userId, nombre, db) {
  const effets = agregerEffets(await lireNoeudsPris(userId, db));
  const quota = etatQuota(await lireLigneVerrouillee(userId, db), Date.now(), parametresQuota(effets));
  ajouterAuQuota(quota, nombre);
  await enregistrerQuota(userId, quota, db);
}

// Quota actuel du joueur, pour l'afficher sans tirer (bonus de l'arbre compris).
export async function getQuota(userId) {
  const [ligne, effets] = await Promise.all([lireLigneQuota(userId, pool), effetsDuJoueur(userId)]);
  return quotaPublic(etatQuota(ligne, Date.now(), parametresQuota(effets)));
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
    const ligne = await lireLigneVerrouillee(userId, db);
    const quota = etatQuota(ligne, Date.now(), parametresQuota(effets));
    if (!consommerTirage(quota)) {
      throw new ErreurJeu("plus de tirages disponibles, attends la recharge", 429, {
        quota: quotaPublic(quota),
      });
    }

    const etincelle = etincelleDeclenchee(effets, ligne.tirages_sans_rare);
    const id = tirer(effets, { forcerRare: etincelle });
    const espece = getEspece(id);
    if (!espece) throw new Error(`tirage impossible : aucune espèce pour ${id}`);

    const gains = { ...gainsDuTirage(espece.rarete, effets), etincelle };
    let amount = await ajouterCopie(userId, id, db);
    if (gains.copieBonus) amount = await ajouterCopie(userId, id, db);
    const niveau = getNiveau(espece.rarete, amount);
    const starter = await gagnerRecompense(userId, gains, starterAvant, db);

    await enregistrerQuota(userId, quota, db, compteurSansRare(ligne.tirages_sans_rare, espece.rarete));

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
