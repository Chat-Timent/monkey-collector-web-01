import { pool, transaction } from "../config/database.js";
import { DELAI_INITIAL_MS, PAS_MS } from "../constants/game.js";
import { ErreurJeu } from "../erreurs.js";
import { combat } from "../game/combat-engine.js";
import { SINGES, getImageUrl, getNiveau, statsFinales } from "../game/monkeys.js";
import { lireCollection } from "./collection-service.js";
import { traiterReponseDefi } from "./challenge-service.js";
import { getEquipe } from "./team-service.js";
import { effetsDuJoueur, nbSlots } from "./arbre-service.js";
import { eloDuCombat, reglerEloTermines } from "./elo-service.js";
import { perksDesSinges } from "./perks-service.js";
import { bonusDefense } from "../game/perks.js";
import { appliquerResonances } from "../game/resonances.js";

// Équipe prête pour le moteur de combat, avec les bonus PVP de l'arbre du joueur.
// `db` : la connexion de la transaction en cours, pour ne pas en ouvrir d'autres
// (le nombre de connexions simultanées à la base est limité).
export async function preparerEquipe(userId, db = pool) {
  const equipe = await getEquipe(userId, db);
  const collection = await lireCollection(userId, db);
  const effets = await effetsDuJoueur(userId, db);
  const perks = await perksDesSinges(userId, db);
  const slots = Array(nbSlots(effets)).fill(null);

  for (const { slot, espece } of equipe) {
    if (slot > slots.length) continue;
    const e = SINGES[espece];
    if (!e) continue; // espèce retirée de monkeys.json : slot laissé vide plutôt que planter
    const amount = collection.singes[espece]?.amount ?? 1;
    const niveau = getNiveau(e.rarete, amount).niveau;
    const s = statsFinales(e, niveau);
    const perk = perks[espece] ?? null;
    // Peau de fer : défense du porteur augmentée de defensePct % (de sa défense de base, sans l'arbre)
    const bonusDef = bonusDefense(perk, s.def);
    slots[slot - 1] = {
      id: espece,
      nom: e.nom,
      image: getImageUrl(espece),
      rarete: e.rarete,
      categorie: e.categorie,
      hp: Math.round(s.hp * (1 + effets.hp_pct)),
      atk: Math.round(s.atk * (1 + effets.atk_pct)),
      def: Math.round(s.def * (1 + effets.def_pct)) + bonusDef,
      spd: s.spd, prec: s.prec + effets.prec_flat, esq: s.esq + effets.esq_flat,
      crit: s.crit + effets.crit_flat, critdmg: s.critdmg + effets.critdmg_flat,
      perk,
    };
  }
  // Résonances de catégorie : tous les singes de l'équipe comptent, rotation active ou non
  return appliquerResonances(slots).equipe;
}

// Combat PVP : calcul, elo des deux joueurs, puis enregistrement (dans la transaction `db`).
// Les variations d'elo sont gardées avec le résultat : { A, B, compte, applique } ;
// elles ne touchent l'elo des joueurs qu'à la fin du replay (reglerEloTermines).
async function enregistrerCombat(db, defi, equipeA, equipeB) {
  const resultat = combat(equipeA, equipeB);
  resultat.equipeA = equipeA;
  resultat.equipeB = equipeB;
  resultat.dureeMs = DELAI_INITIAL_MS + resultat.journal.length * PAS_MS;
  resultat.elo = await eloDuCombat(db, defi.de_user, defi.vers_user, resultat.vainqueur);

  const { rows } = await db.query(
    `INSERT INTO combats (defi_id, user_a, user_b, resultat)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [defi.id, defi.de_user, defi.vers_user, resultat]
  );
  return rows[0].id;
}

// Transaction : le défi n'est marqué accepté/refusé que si tout réussit
// (équipes non vides, combat enregistré). Une double réponse simultanée
// est rejetée par traiterReponseDefi.
export async function repondreDefi(userId, defiId, accepter) {
  // Les combats déjà finis comptent dans l'elo de départ de celui-ci
  if (accepter) await reglerEloTermines();
  return transaction(async (db) => {
    const defi = await traiterReponseDefi(db, userId, defiId, accepter);
    if (!accepter) return null;

    const equipeA = await preparerEquipe(defi.de_user, db);
    const equipeB = await preparerEquipe(defi.vers_user, db);
    if (!equipeA.some(Boolean)) throw new ErreurJeu("le challenger n'a aucun singe dans son équipe");
    if (!equipeB.some(Boolean)) throw new ErreurJeu("tu n'as aucun singe dans ton équipe");

    return enregistrerCombat(db, defi, equipeA, equipeB);
  });
}

// Combat PVE du joueur (mode donné) dont le replay n'est pas terminé : id, sinon null.
export async function combatEnCours(userId, mode, db = pool) {
  const { rows } = await db.query(
    `SELECT id FROM combats
     WHERE user_a = $1 AND mode = $2
       AND created_at + (COALESCE((resultat->>'dureeMs')::int, 0) * interval '1 millisecond') > now()
     ORDER BY created_at DESC LIMIT 1`,
    [userId, mode]
  );
  return rows[0]?.id ?? null;
}

// Nom affiché du camp B : le joueur adverse en PVP, l'étage ou le donjon en PVE.
function nomAdversaire(r) {
  if (r.mode === "aventure") return `Étage ${r.contexte?.etage}`;
  if (r.mode === "ressource") return r.contexte?.titre ?? "Donjon";
  return r.pseudo_b;
}

export async function getCombat(userId, combatId) {
  const { rows } = await pool.query(
    `SELECT c.user_a, c.user_b, c.resultat, c.created_at, c.mode, c.contexte,
            u1.pseudo AS pseudo_a, u2.pseudo AS pseudo_b
     FROM combats c
     JOIN users u1 ON u1.id = c.user_a
     LEFT JOIN users u2 ON u2.id = c.user_b
     WHERE c.id = $1 AND (c.user_a = $2 OR c.user_b = $2)`,
    [combatId, userId]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  const monCamp = r.user_a === userId ? "A" : "B";
  return {
    resultat: r.resultat,
    pseudoA: r.pseudo_a,
    pseudoB: nomAdversaire(r),
    monCamp,
    mode: r.mode,
    contexte: r.contexte,
    // Variation d'elo du joueur (null pour un combat d'avant l'elo)
    eloDelta: r.resultat.elo ? r.resultat.elo[monCamp] : null,
    ecouleMs: Date.now() - new Date(r.created_at).getTime(),
    // Rythme du replay : le client s'en sert pour se caler sur le direct.
    delaiInitialMs: DELAI_INITIAL_MS,
    pasMs: PAS_MS,
  };
}

export async function combatsDuJoueur(userId) {
  const { rows } = await pool.query(
    `SELECT c.id, c.user_a, u1.pseudo AS pseudo_a, u2.pseudo AS pseudo_b,
            c.resultat->>'vainqueur' AS vainqueur,
            c.resultat->'elo' AS elo,
            (c.user_a = $1) AS lance_par_moi,
            (c.created_at + (COALESCE((c.resultat->>'dureeMs')::int, 0) * interval '1 millisecond') > now()) AS recent
     FROM combats c
     JOIN users u1 ON u1.id = c.user_a
     JOIN users u2 ON u2.id = c.user_b
     WHERE (c.user_a = $1 OR c.user_b = $1) AND c.mode = 'pvp'
     ORDER BY c.created_at DESC
     LIMIT 10`,
    [userId]
  );
  return rows.map((r) => {
    const monCamp = r.user_a === userId ? "A" : "B";
    let issue = "nul";
    if (r.vainqueur === monCamp) issue = "victoire";
    else if (r.vainqueur) issue = "défaite";
    return {
      id: r.id,
      adversaire: monCamp === "A" ? r.pseudo_b : r.pseudo_a,
      // Combat en cours : l'issue n'est pas encore publiée
      issue: r.recent ? null : issue,
      eloDelta: r.elo && !r.recent ? r.elo[monCamp] : null,
      recent: r.recent,
      lanceParMoi: !!r.lance_par_moi,
    };
  });
}

async function infosCombatPourUser(userId, combatId) {
  const { rows } = await pool.query(
    `SELECT (c.user_a = $2 OR c.user_b = $2) AS participant, c.mode,
            (c.created_at + (COALESCE((c.resultat->>'dureeMs')::int, 0) * interval '1 millisecond') > now()) AS live
     FROM combats c WHERE c.id = $1`,
    [combatId, userId]
  );
  return rows[0] ?? null;
}

export async function lireMessages(userId, combatId, apres = 0) {
  const infos = await infosCombatPourUser(userId, combatId);
  if (!infos || !infos.participant) return null;

  const { rows } = await pool.query(
    `SELECT m.id, m.texte, m.created_at, u.pseudo, (m.user_id = $3) AS moi
     FROM messages m
     JOIN users u ON u.id = m.user_id
     WHERE m.combat_id = $1 AND m.id > $2
     ORDER BY m.id
     LIMIT 200`,
    [combatId, apres, userId]
  );
  return { live: infos.live, messages: rows };
}

export async function envoyerMessage(userId, combatId, texte) {
  const propre = String(texte ?? "").trim();
  if (propre.length === 0) throw new ErreurJeu("message vide");
  if (propre.length > 200) throw new ErreurJeu("message trop long (200 caractères max)");

  const infos = await infosCombatPourUser(userId, combatId);
  if (!infos || !infos.participant) throw new ErreurJeu("combat introuvable");
  if (infos.mode !== "pvp") throw new ErreurJeu("pas de chat dans ce combat");
  if (!infos.live) throw new ErreurJeu("le combat est terminé");

  await pool.query(
    "INSERT INTO messages (combat_id, user_id, texte) VALUES ($1, $2, $3)",
    [combatId, userId, propre]
  );
  return true;
}
