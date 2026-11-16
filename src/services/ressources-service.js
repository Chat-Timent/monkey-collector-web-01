import { pool, transaction } from "../config/database.js";
import { DELAI_INITIAL_MS, PAS_MS } from "../constants/game.js";
import { ErreurJeu } from "../erreurs.js";
import { combat } from "../game/combat-engine.js";
import { RESSOURCES, donjonExiste, ennemisDonjon, gainDonjon, jourParis, ticketsDisponibles, ticketsParJour } from "../game/ressources.js";
import { effetsDuJoueur } from "./arbre-service.js";
import { combatEnCours, preparerEquipe } from "./combat-service.js";
import { gagnerRecompense, getStarter } from "./starter-service.js";
import { ajouterTirages } from "./tirage-service.js";

export async function lireProgression(userId, db = pool) {
  const { rows } = await db.query(
    "SELECT donjon, palier, tickets, jour::text AS jour FROM donjons_progression WHERE user_id = $1",
    [userId]
  );
  return Object.fromEntries(rows.map((r) => [r.donjon, r]));
}

// État d'un donjon pour l'affichage : palier, gain, tickets (Clé de donjon comprise),
// et gain du balayage (dernier palier battu), null tant qu'aucun palier n'est battu.
export function etatDonjon(id, ligne, regles, effets, aujourdhui = jourParis()) {
  const d = regles.donjons[id];
  const palier = ligne?.palier ?? 1;
  return {
    id,
    nom: d.nom,
    icone: d.icone,
    ressource: d.ressource ?? null,
    palier,
    gain: gainDonjon(id, palier, regles),
    balayage: palier > 1 ? gainDonjon(id, palier - 1, regles) : null,
    tickets: ticketsDisponibles(ligne, aujourdhui, regles, effets),
    ticketsMax: ticketsParJour(effets, regles),
  };
}

// Ce qu'affiche la page Ressources : l'état de chaque donjon, et le combat de donjon en cours de replay s'il y en a un.
export async function getRessources(userId) {
  const [progression, enCours, effets] = await Promise.all([
    lireProgression(userId), combatEnCours(userId, "ressource"), effetsDuJoueur(userId),
  ]);
  const aujourdhui = jourParis();
  const donjons = Object.keys(RESSOURCES.donjons).map((id) => etatDonjon(id, progression[id], RESSOURCES, effets, aujourdhui));
  return { donjons, combatEnCours: enCours };
}

// Ligne de progression d'un donjon, créée si besoin et verrouillée (dans la transaction `db`).
async function verrouillerProgression(userId, donjon, db) {
  await db.query(
    "INSERT INTO donjons_progression (user_id, donjon) VALUES ($1, $2) ON CONFLICT (user_id, donjon) DO NOTHING",
    [userId, donjon]
  );
  const { rows } = await db.query(
    "SELECT palier, tickets, jour::text AS jour FROM donjons_progression WHERE user_id = $1 AND donjon = $2 FOR UPDATE",
    [userId, donjon]
  );
  return rows[0];
}

// Combat du palier courant d'un donjon, dans une transaction (ligne du donjon verrouillée).
// Victoire : un ticket consommé, `recompenser(db, quantite)` donne la ressource (et renvoie des détails
// ajoutés aux gains), palier suivant. Défaite : rien n'est consommé.
// `regles` : groupe de donjons (RESSOURCES, DONJON_EVEIL) ; `mode` : mode du combat enregistré.
export async function combattreDonjon(userId, { regles, donjon, mode, recompenser }) {
  return transaction(async (db) => {
    const ligne = await verrouillerProgression(userId, donjon, db);
    const aujourdhui = jourParis();
    const tickets = ticketsDisponibles(ligne, aujourdhui, regles, await effetsDuJoueur(userId, db));
    if (tickets <= 0) throw new ErreurJeu("plus de ticket pour ce donjon aujourd'hui, reviens demain");

    if (await combatEnCours(userId, mode, db)) throw new ErreurJeu("un combat de donjon est déjà en cours");

    const equipe = await preparerEquipe(userId, db);
    if (!equipe.some(Boolean)) throw new ErreurJeu("ton équipe est vide");
    const ennemis = ennemisDonjon(donjon, ligne.palier, regles);

    const resultat = combat(equipe, ennemis);
    resultat.equipeA = equipe;
    resultat.equipeB = ennemis;
    resultat.dureeMs = DELAI_INITIAL_MS + resultat.journal.length * PAS_MS;

    let gains = null;
    if (resultat.vainqueur === "A") {
      const quantite = gainDonjon(donjon, ligne.palier, regles);
      const details = await recompenser(db, quantite);
      await db.query(
        "UPDATE donjons_progression SET palier = palier + 1, tickets = $3, jour = $4 WHERE user_id = $1 AND donjon = $2",
        [userId, donjon, tickets - 1, aujourdhui]
      );
      gains = { donjon, quantite, ...details };
    }

    const { rows: insere } = await db.query(
      `INSERT INTO combats (user_a, user_b, resultat, mode, contexte)
       VALUES ($1, NULL, $2, $3, $4) RETURNING id`,
      [userId, resultat, mode, { donjon, palier: ligne.palier, titre: `${regles.donjons[donjon].nom} · Palier ${ligne.palier}`, gains }]
    );
    return insere[0].id;
  });
}

// Balayage : un ticket contre le gain du dernier palier battu, tout de suite et sans combat ;
// le palier ne change pas. Impossible tant qu'aucun palier n'est battu.
export async function balayerDonjon(userId, { regles, donjon, recompenser }) {
  return transaction(async (db) => {
    const ligne = await verrouillerProgression(userId, donjon, db);
    if (ligne.palier <= 1) throw new ErreurJeu("bats d'abord le palier 1 pour pouvoir balayer");
    const aujourdhui = jourParis();
    const tickets = ticketsDisponibles(ligne, aujourdhui, regles, await effetsDuJoueur(userId, db));
    if (tickets <= 0) throw new ErreurJeu("plus de ticket pour ce donjon aujourd'hui, reviens demain");

    const palier = ligne.palier - 1;
    const quantite = gainDonjon(donjon, palier, regles);
    const details = await recompenser(db, quantite);
    await db.query(
      "UPDATE donjons_progression SET tickets = $3, jour = $4 WHERE user_id = $1 AND donjon = $2",
      [userId, donjon, tickets - 1, aujourdhui]
    );
    return { donjon, palier, quantite, ...details };
  });
}

// Lance le combat du palier courant d'un donjon de ressources.
export async function lancerCombatRessource(userId, donjon) {
  if (!donjonExiste(donjon)) throw new ErreurJeu("donjon inconnu");
  return combattreDonjon(userId, {
    regles: RESSOURCES,
    donjon,
    mode: "ressource",
    async recompenser(db, quantite) {
      if (donjon === "tirages") {
        await ajouterTirages(userId, quantite, db);
        return { niveauxGagnes: 0 };
      }
      const starter = await getStarter(userId, db, { verrouiller: true });
      if (!starter) return { niveauxGagnes: 0 };
      const recompense = donjon === "xp" ? { xp: quantite, coins: 0 } : { xp: 0, coins: quantite };
      return { niveauxGagnes: (await gagnerRecompense(userId, recompense, starter, db)).niveauxGagnes };
    },
  });
}
