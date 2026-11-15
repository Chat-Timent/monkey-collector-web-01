import { pool, transaction } from "../config/database.js";
import { DELAI_INITIAL_MS, PAS_MS } from "../constants/game.js";
import { ErreurJeu } from "../erreurs.js";
import { combat } from "../game/combat-engine.js";
import { RESSOURCES, donjonExiste, ennemisDonjon, gainDonjon, jourParis, ticketsDisponibles } from "../game/ressources.js";
import { combatEnCours, preparerEquipe } from "./combat-service.js";
import { gagnerRecompense, getStarter } from "./starter-service.js";
import { ajouterTirages } from "./tirage-service.js";

async function lireProgression(userId, db = pool) {
  const { rows } = await db.query(
    "SELECT donjon, palier, tickets, jour::text AS jour FROM donjons_progression WHERE user_id = $1",
    [userId]
  );
  return Object.fromEntries(rows.map((r) => [r.donjon, r]));
}

// Ce qu'affiche la page Ressources : pour chaque donjon, palier, gain, tickets ;
// et le combat de donjon en cours de replay s'il y en a un.
export async function getRessources(userId) {
  const [progression, enCours] = await Promise.all([lireProgression(userId), combatEnCours(userId, "ressource")]);
  const aujourdhui = jourParis();
  const donjons = Object.entries(RESSOURCES.donjons).map(([id, d]) => {
    const palier = progression[id]?.palier ?? 1;
    return {
      id,
      nom: d.nom,
      icone: d.icone,
      palier,
      gain: gainDonjon(id, palier),
      tickets: ticketsDisponibles(progression[id], aujourdhui),
      ticketsMax: RESSOURCES.ticketsParJour,
    };
  });
  return { donjons, combatEnCours: enCours };
}

// Lance le combat du palier courant d'un donjon, dans une transaction (ligne du donjon verrouillée).
// Victoire : un ticket consommé, la ressource gagnée, palier suivant. Défaite : rien n'est consommé.
export async function lancerCombatRessource(userId, donjon) {
  if (!donjonExiste(donjon)) throw new ErreurJeu("donjon inconnu");
  const regles = RESSOURCES.donjons[donjon];

  return transaction(async (db) => {
    await db.query(
      "INSERT INTO donjons_progression (user_id, donjon) VALUES ($1, $2) ON CONFLICT (user_id, donjon) DO NOTHING",
      [userId, donjon]
    );
    const { rows } = await db.query(
      "SELECT palier, tickets, jour::text AS jour FROM donjons_progression WHERE user_id = $1 AND donjon = $2 FOR UPDATE",
      [userId, donjon]
    );
    const ligne = rows[0];
    const aujourdhui = jourParis();
    const tickets = ticketsDisponibles(ligne, aujourdhui);
    if (tickets <= 0) throw new ErreurJeu("plus de ticket pour ce donjon aujourd'hui, reviens demain");

    if (await combatEnCours(userId, "ressource", db)) throw new ErreurJeu("un combat de donjon est déjà en cours");

    const equipe = await preparerEquipe(userId, db);
    if (!equipe.some(Boolean)) throw new ErreurJeu("ton équipe est vide");
    const ennemis = ennemisDonjon(donjon, ligne.palier);

    const resultat = combat(equipe, ennemis);
    resultat.equipeA = equipe;
    resultat.equipeB = ennemis;
    resultat.dureeMs = DELAI_INITIAL_MS + resultat.journal.length * PAS_MS;

    let gains = null;
    if (resultat.vainqueur === "A") {
      const quantite = gainDonjon(donjon, ligne.palier);
      let niveauxGagnes = 0;
      if (donjon === "tirages") {
        await ajouterTirages(userId, quantite, db);
      } else {
        const starter = await getStarter(userId, db, { verrouiller: true });
        if (starter) {
          const recompense = donjon === "xp" ? { xp: quantite, coins: 0 } : { xp: 0, coins: quantite };
          niveauxGagnes = (await gagnerRecompense(userId, recompense, starter, db)).niveauxGagnes;
        }
      }
      await db.query(
        "UPDATE donjons_progression SET palier = palier + 1, tickets = $3, jour = $4 WHERE user_id = $1 AND donjon = $2",
        [userId, donjon, tickets - 1, aujourdhui]
      );
      gains = { donjon, quantite, niveauxGagnes };
    }

    const { rows: insere } = await db.query(
      `INSERT INTO combats (user_a, user_b, resultat, mode, contexte)
       VALUES ($1, NULL, $2, 'ressource', $3) RETURNING id`,
      [userId, resultat, { donjon, palier: ligne.palier, titre: `${regles.nom} · Palier ${ligne.palier}`, gains }]
    );
    return insere[0].id;
  });
}
