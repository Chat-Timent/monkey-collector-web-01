import { transaction } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";
import { getEspece, getImageUrl, getNiveau, statsFinales, tirer } from "../game/monkeys.js";
import { ajouterCopie } from "./collection-service.js";
import { gagnerRecompense, getStarter } from "./starter-service.js";

// Un tirage complet (copie + récompense du starter) dans une seule transaction.
// La ligne du starter est verrouillée : deux tirages simultanés du même joueur
// s'exécutent l'un après l'autre et aucun gain n'est perdu.
export async function effectuerTirage(userId) {
  return transaction(async (db) => {
    const starterAvant = await getStarter(userId, db, { verrouiller: true });
    if (!starterAvant) throw new ErreurJeu("aucun starter, choisis-en un d'abord");

    const id = tirer();
    const espece = getEspece(id);
    if (!espece) throw new Error(`tirage impossible : aucune espèce pour ${id}`);

    const amount = await ajouterCopie(userId, id, db);
    const niveau = getNiveau(espece.rarete, amount);
    const starter = await gagnerRecompense(userId, espece.rarete, starterAvant, db);

    return {
      id,
      espece,
      image: getImageUrl(id),
      amount,
      niveau,
      stats: statsFinales(espece, niveau.niveau),
      starter,
    };
  });
}
