// Éveil : donjon d'éveil (essence) et montée du niveau d'éveil des singes légendaires et mythiques.
import { transaction } from "../config/database.js";
import { RARETES } from "../constants/game.js";
import { ErreurJeu } from "../erreurs.js";
import { competenceDe } from "../game/competences.js";
import { EVEIL, ameliorationCompetence, bonusEveilPct, coutEveil, peutEveiller } from "../game/eveil.js";
import { SINGES, getImageUrl } from "../game/monkeys.js";
import { DONJON_EVEIL, jourParis } from "../game/ressources.js";
import { effetsDuJoueur } from "./arbre-service.js";
import { lireCollection } from "./collection-service.js";
import { combatEnCours } from "./combat-service.js";
import { depenserRessource, lireRessources } from "./ressources-joueur-service.js";
import { balayerDonjon, combattreDonjon, etatDonjon, lireProgression } from "./ressources-service.js";

const DONJON = "eveil";
const MODE = "eveil";
const RESSOURCE = EVEIL.ressource;
const RANG = Object.fromEntries(RARETES.map((r, i) => [r.nom, i]));

// Singe éveillable tel qu'affiché : niveau, bonus actuel et suivant, coût, compétence (valeurs éveillées).
function singeEveil(id, niveau) {
  const e = SINGES[id];
  const c = competenceDe(e, niveau);
  return {
    id,
    nom: e.nom,
    image: getImageUrl(id),
    rarete: e.rarete,
    eveil: niveau,
    eveilMax: EVEIL.niveauMax,
    bonusPct: bonusEveilPct(niveau),
    prochainBonusPct: niveau < EVEIL.niveauMax ? bonusEveilPct(niveau + 1) : null,
    cout: coutEveil(e.rarete, niveau),
    competence: c ? { nom: c.nom, icone: c.icone } : null,
    competenceAmelioree: niveau < EVEIL.niveauMax && ameliorationCompetence(e, niveau + 1),
  };
}

// Ce qu'affiche la page Éveil : le donjon, le combat en cours, le stock d'essence et les singes éveillables.
export async function getEveil(userId) {
  const [progression, enCours, effets, ressources, collection] = await Promise.all([
    lireProgression(userId), combatEnCours(userId, MODE), effetsDuJoueur(userId), lireRessources(userId), lireCollection(userId),
  ]);
  const singes = Object.entries(collection.singes)
    .filter(([id]) => peutEveiller(SINGES[id]?.rarete))
    .map(([id, s]) => singeEveil(id, s.eveil))
    .sort((a, b) => RANG[b.rarete] - RANG[a.rarete] || b.eveil - a.eveil || a.nom.localeCompare(b.nom));
  return {
    donjon: etatDonjon(DONJON, progression[DONJON], DONJON_EVEIL, effets, jourParis()),
    combatEnCours: enCours,
    essence: ressources[RESSOURCE] ?? 0,
    singes,
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
export async function eveiller(userId, espece) {
  if (typeof espece !== "string" || !Object.hasOwn(SINGES, espece)) throw new ErreurJeu("singe inconnu");
  const rarete = SINGES[espece].rarete;
  if (!peutEveiller(rarete)) throw new ErreurJeu("seuls les singes légendaires et mythiques peuvent s'éveiller");

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

  return getEveil(userId);
}
