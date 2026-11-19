import { pool } from "../config/database.js";
import { chancesRaretes, getEspece, getImageUrl } from "../game/monkeys.js";
import { effetsDuJoueur } from "./arbre-service.js";

// Taille du flux affiché sur la page Tirage.
const TAILLE_FLUX = 12;

// Un légendaire, un mythique ou un prismatique vient d'être tiré : tout le monde le verra dans le flux.
// Appelé dans la transaction du tirage (`db`), donc annulé si le tirage échoue.
export async function enregistrerTirageNotable(userId, espece, rarete, db) {
  await db.query(
    "INSERT INTO tirages_notables (user_id, espece, rarete) VALUES ($1, $2, $3)",
    [userId, espece, rarete]
  );
}

// Les derniers légendaires, mythiques et prismatiques tirés, tous joueurs confondus, du plus récent au plus ancien.
// Les espèces disparues du catalogue sont ignorées plutôt que d'afficher une ligne vide.
export async function lireTiragesNotables(userId) {
  const { rows } = await pool.query(
    `SELECT t.id, t.espece, t.rarete, t.created_at, u.pseudo, (t.user_id = $1) AS moi
     FROM tirages_notables t
     JOIN users u ON u.id = t.user_id
     ORDER BY t.created_at DESC, t.id DESC
     LIMIT $2`,
    [userId, TAILLE_FLUX]
  );
  return rows
    .filter((ligne) => getEspece(ligne.espece))
    .map((ligne) => ({
      id: Number(ligne.id),
      pseudo: ligne.pseudo,
      moi: ligne.moi,
      nom: getEspece(ligne.espece).nom,
      rarete: ligne.rarete,
      image: getImageUrl(ligne.espece),
      date: ligne.created_at,
    }));
}

// Tout ce que le bas de la page Tirage affiche : les probabilités du joueur (Flair compris),
// les probabilités de base pour comparer, et le flux des tirages notables.
export async function etatLoterie(userId) {
  const [effets, notables] = await Promise.all([effetsDuJoueur(userId), lireTiragesNotables(userId)]);
  return {
    chances: chancesRaretes(effets),
    chancesBase: chancesRaretes(),
    notables,
  };
}
