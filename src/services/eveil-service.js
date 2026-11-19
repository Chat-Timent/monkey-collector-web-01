// Éveil : donjon d'éveil (essence, page Éveil) et montée du niveau d'éveil des singes légendaires, mythiques et prismatiques
// (depuis la fiche du Monkeydex).
import { transaction } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";
import { EVEIL, coutEveil, peutEveiller } from "../game/eveil.js";
import { SINGES } from "../game/monkeys.js";
import { DONJON_EVEIL, jourParis } from "../game/ressources.js";
import { effetsDuJoueur } from "./arbre-service.js";
import { getResumeMonkeydex } from "./collection-service.js";
import { combatEnCours } from "./combat-service.js";
import { depenserRessource, lireRessources } from "./ressources-joueur-service.js";
import { balayerDonjon, combattreDonjon, etatDonjon, lireProgression } from "./ressources-service.js";

const DONJON = "eveil";
const MODE = "eveil";
const RESSOURCE = EVEIL.ressource;

// Ce qu'affiche la page Éveil : le donjon, le combat en cours et le stock d'essence.
export async function getEveil(userId) {
  const [progression, enCours, effets, ressources] = await Promise.all([
    lireProgression(userId), combatEnCours(userId, MODE), effetsDuJoueur(userId), lireRessources(userId),
  ]);
  return {
    donjon: etatDonjon(DONJON, progression[DONJON], DONJON_EVEIL, effets, jourParis()),
    combatEnCours: enCours,
    essence: ressources[RESSOURCE] ?? 0,
  };
}

// Combat du palier courant du donjon d'éveil ; renvoie l'id du combat.
export async function lancerCombatEveil(userId) {
  return combattreDonjon(userId, { regles: DONJON_EVEIL, donjon: DONJON, mode: MODE });
}

// Balayage du dernier palier battu ; renvoie l'essence gagnée et l'état à jour de la page.
export async function balayerEveil(userId) {
  const gains = await balayerDonjon(userId, { regles: DONJON_EVEIL, donjon: DONJON });
  return { gains, ...(await getEveil(userId)) };
}

// Monte d'un niveau l'éveil d'un singe possédé, contre de l'essence (ligne du singe verrouillée :
// deux éveils simultanés paient chacun leur niveau ; l'essence ne peut pas passer sous 0).
// Renvoie le Monkeydex à jour (la fiche et la carte du singe se redessinent avec).
export async function eveiller(userId, espece) {
  if (typeof espece !== "string" || !Object.hasOwn(SINGES, espece)) throw new ErreurJeu("singe inconnu");
  const rarete = SINGES[espece].rarete;
  if (!peutEveiller(rarete)) throw new ErreurJeu("seuls les singes légendaires, mythiques et prismatiques peuvent s'éveiller");

  await transaction(async (db) => {
    const { rows } = await db.query(
      "SELECT eveil FROM collections WHERE user_id = $1 AND espece = $2 FOR UPDATE",
      [userId, espece]
    );
    if (rows.length === 0) throw new ErreurJeu("singe non possédé");
    const cout = coutEveil(rarete, rows[0].eveil);
    if (cout === null) throw new ErreurJeu("ce singe a atteint l'éveil maximal");
    if ((await depenserRessource(userId, RESSOURCE, cout, db)) === null) {
      throw new ErreurJeu(`il faut ${cout} essences pour cet éveil`);
    }
    await db.query("UPDATE collections SET eveil = eveil + 1 WHERE user_id = $1 AND espece = $2", [userId, espece]);
  });

  return getResumeMonkeydex(userId);
}
