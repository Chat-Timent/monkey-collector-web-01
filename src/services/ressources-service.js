import { pool, transaction } from "../config/database.js";
import { ErreurJeu } from "../erreurs.js";
import { combat } from "../game/combat-engine.js";
import {
  RESSOURCES, donjonExiste, ennemisDonjon, gainDonjon, infoRecompense, jourParis, ticketsDisponibles, ticketsParJour,
} from "../game/ressources.js";
import { effetsDuJoueur } from "./arbre-service.js";
import { combatEnCours, dureeReplayMs, preparerEquipe } from "./combat-service.js";
import { ajouterRessource } from "./ressources-joueur-service.js";
import { gagnerRecompense, getStarter } from "./starter-service.js";
import { ajouterTirages } from "./tirage-service.js";

export async function lireProgression(userId, db = pool) {
  const { rows } = await db.query(
    "SELECT donjon, palier, tickets, jour::text AS jour FROM donjons_progression WHERE user_id = $1",
    [userId]
  );
  return Object.fromEntries(rows.map((r) => [r.donjon, r]));
}

// État d'un donjon pour l'affichage : palier, gain et récompense (nom, icône), tickets (Clé de donjon comprise),
// et gain du balayage (dernier palier battu) : null si le donjon n'a pas de balayage ou qu'aucun palier n'est battu.
export function etatDonjon(id, ligne, regles, effets, aujourdhui = jourParis()) {
  const d = regles.donjons[id];
  const palier = ligne?.palier ?? 1;
  return {
    id,
    nom: d.nom,
    icone: d.icone,
    recompense: infoRecompense(d.recompense),
    palier,
    gain: gainDonjon(id, palier, regles),
    balayage: d.balayage && palier > 1 ? gainDonjon(id, palier - 1, regles) : null,
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
// Une ligne neuve est datée d'un jour passé : ses tickets sont alors pleins, Clé de donjon comprise
// (les valeurs par défaut de la table, 2 tickets datés du jour, faisaient perdre le ticket de la Clé).
async function verrouillerProgression(userId, donjon, db) {
  await db.query(
    `INSERT INTO donjons_progression (user_id, donjon, jour) VALUES ($1, $2, DATE '2000-01-01')
     ON CONFLICT (user_id, donjon) DO NOTHING`,
    [userId, donjon]
  );
  const { rows } = await db.query(
    "SELECT palier, tickets, jour::text AS jour FROM donjons_progression WHERE user_id = $1 AND donjon = $2 FOR UPDATE",
    [userId, donjon]
  );
  return rows[0];
}

// Donne la récompense d'un donjon (dans la transaction `db`) et renvoie les gains à enregistrer :
// { donjon, quantite, recompense, nom, icone } (+ niveauxGagnes pour l'XP et les coins).
// Tirages, coins et XP ont leur propre traitement ; toute autre récompense est une ressource de ressources_joueur.
async function donnerRecompense(userId, donjon, regles, quantite, db) {
  const info = infoRecompense(regles.donjons[donjon].recompense);
  const gains = { donjon, quantite, recompense: info.id, nom: info.nom, icone: info.icone };
  if (info.id === "tirages") {
    await ajouterTirages(userId, quantite, db);
  } else if (info.id === "xp" || info.id === "coins") {
    const starter = await getStarter(userId, db, { verrouiller: true });
    const recompense = info.id === "xp" ? { xp: quantite, coins: 0 } : { xp: 0, coins: quantite };
    gains.niveauxGagnes = starter ? (await gagnerRecompense(userId, recompense, starter, db)).niveauxGagnes : 0;
  } else {
    await ajouterRessource(userId, info.id, quantite, db);
  }
  return gains;
}

// Combat du palier courant d'un donjon, dans une transaction (ligne du donjon verrouillée).
// Victoire : un ticket consommé, la récompense du donjon donnée, palier suivant. Défaite : rien n'est consommé.
// `regles` : groupe de donjons (RESSOURCES, DONJON_EVEIL) ; `mode` : mode du combat enregistré.
export async function combattreDonjon(userId, { regles, donjon, mode }) {
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
    resultat.dureeMs = dureeReplayMs(resultat.journal);

    let gains = null;
    if (resultat.vainqueur === "A") {
      gains = await donnerRecompense(userId, donjon, regles, gainDonjon(donjon, ligne.palier, regles), db);
      await db.query(
        "UPDATE donjons_progression SET palier = palier + 1, tickets = $3, jour = $4 WHERE user_id = $1 AND donjon = $2",
        [userId, donjon, tickets - 1, aujourdhui]
      );
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
// le palier ne change pas. Seulement pour un donjon dont "balayage" vaut true, et une fois le palier 1 battu.
export async function balayerDonjon(userId, { regles, donjon }) {
  if (!regles.donjons[donjon]?.balayage) throw new ErreurJeu("ce donjon ne se balaye pas");
  return transaction(async (db) => {
    const ligne = await verrouillerProgression(userId, donjon, db);
    if (ligne.palier <= 1) throw new ErreurJeu("bats d'abord le palier 1 pour pouvoir balayer");
    const aujourdhui = jourParis();
    const tickets = ticketsDisponibles(ligne, aujourdhui, regles, await effetsDuJoueur(userId, db));
    if (tickets <= 0) throw new ErreurJeu("plus de ticket pour ce donjon aujourd'hui, reviens demain");

    const palier = ligne.palier - 1;
    const gains = await donnerRecompense(userId, donjon, regles, gainDonjon(donjon, palier, regles), db);
    await db.query(
      "UPDATE donjons_progression SET tickets = $3, jour = $4 WHERE user_id = $1 AND donjon = $2",
      [userId, donjon, tickets - 1, aujourdhui]
    );
    return { ...gains, palier };
  });
}

// Lance le combat du palier courant d'un donjon de ressources.
export async function lancerCombatRessource(userId, donjon) {
  if (!donjonExiste(donjon)) throw new ErreurJeu("donjon inconnu");
  return combattreDonjon(userId, { regles: RESSOURCES, donjon, mode: "ressource" });
}

// Balayage d'un donjon de ressources ; renvoie les gains et l'état à jour de la page.
export async function balayerRessource(userId, donjon) {
  if (!donjonExiste(donjon)) throw new ErreurJeu("donjon inconnu");
  const gains = await balayerDonjon(userId, { regles: RESSOURCES, donjon });
  return { gains, ...(await getRessources(userId)) };
}
