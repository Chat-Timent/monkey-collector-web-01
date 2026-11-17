import { pool, transaction } from "../config/database.js";
import { DELAI_INITIAL_MS, PAS_MS, PAS_SOUFFLE, VITESSE_REPLAY_MAX } from "../constants/game.js";
import { ErreurJeu } from "../erreurs.js";
import { combat } from "../game/combat-engine.js";
import { SINGES, getImageUrl, getNiveau, statsFinales } from "../game/monkeys.js";
import { lireCollection } from "./collection-service.js";
import { traiterReponseDefi } from "./challenge-service.js";
import { getEquipe } from "./team-service.js";
import { effetsDuJoueur, nbSlots } from "./arbre-service.js";
import { eloDuCombat, reglerEloTermines } from "./elo-service.js";
import { perksDesSinges } from "./perks-service.js";
import { bonusDefense, bonusPv, renforcerPerk } from "../game/perks.js";
import { appliquerResonances, resonancesAvecBonus } from "../game/resonances.js";
import { competenceDe } from "../game/competences.js";
import { bonusEveil, bonusEveilPct } from "../game/eveil.js";
import { bonusObjets } from "../game/objets.js";
import { objetsDesSinges } from "./objets-service.js";
import { progresserQuete } from "./quetes-service.js";

// Durée du replay d'un journal : un pas par événement, PAS_SOUFFLE pas pour un Second souffle (pause de la relève).
// Le client (combat-live.html) suit le même rythme pour se caler sur le direct.
export function dureeReplayMs(journal) {
  const pas = journal.reduce((t, e) => t + (e.type === "souffle" ? PAS_SOUFFLE : 1), 0);
  return DELAI_INITIAL_MS + pas * PAS_MS;
}

// Singe d'un joueur prêt pour le moteur de combat (fonction pure) : stats de son niveau, bonus de l'arbre (`effets`),
// perk porté (`perk`, effet brut), niveau d'éveil (`eveil`) et objets portés (`objets`, effets à leur niveau).
// Les bonus du perk, de l'éveil et des objets sont des pourcentages des stats de base (sans l'arbre) ;
// ils s'ajoutent sans se multiplier entre eux. Crit et dégâts crit des objets : en points.
export function singeDeCombat(espece, e, niveau, { effets, perk = null, eveil = 1, objets = [] }) {
  const s = statsFinales(e, niveau);
  // Maître des perks : valeurs du perk augmentées
  const perkPorte = renforcerPerk(perk, effets.perk_pct);
  // Éveil : +x % de PV, d'ATK et de DEF
  const pctEveil = bonusEveilPct(eveil);
  // Armes (et équipements) : PV, ATK, DEF en %, critique et dégâts crit en points
  const obj = bonusObjets(objets, s);
  return {
    id: espece,
    nom: e.nom,
    image: getImageUrl(espece),
    rarete: e.rarete,
    categorie: e.categorie,
    // Taunt : PV du porteur augmentés de pvPct % ; Peau de fer : défense augmentée de defensePct %
    hp: Math.round(s.hp * (1 + effets.hp_pct)) + bonusPv(perkPorte, s.hp) + bonusEveil(s.hp, pctEveil) + obj.hp,
    atk: Math.round(s.atk * (1 + effets.atk_pct)) + bonusEveil(s.atk, pctEveil) + obj.atk,
    def: Math.round(s.def * (1 + effets.def_pct)) + bonusDefense(perkPorte, s.def) + bonusEveil(s.def, pctEveil) + obj.def,
    spd: s.spd, prec: s.prec + effets.prec_flat, esq: s.esq + effets.esq_flat,
    crit: s.crit + effets.crit_flat + obj.crit, critdmg: s.critdmg + effets.critdmg_flat + obj.critdmg,
    perk: perkPorte,
    competence: competenceDe(e, eveil),
  };
}

// Équipe prête pour le moteur de combat, avec les bonus PVP de l'arbre du joueur.
// `db` : la connexion de la transaction en cours, pour ne pas en ouvrir d'autres
// (le nombre de connexions simultanées à la base est limité).
export async function preparerEquipe(userId, db = pool) {
  const equipe = await getEquipe(userId, db);
  const collection = await lireCollection(userId, db);
  const effets = await effetsDuJoueur(userId, db);
  const perks = await perksDesSinges(userId, db);
  const objets = await objetsDesSinges(userId, db);
  const slots = Array(nbSlots(effets)).fill(null);

  for (const { slot, espece } of equipe) {
    if (slot > slots.length) continue;
    const e = SINGES[espece];
    if (!e) continue; // espèce retirée de monkeys.json : slot laissé vide plutôt que planter
    const possede = collection.singes[espece];
    const niveau = getNiveau(e.rarete, possede?.amount ?? 1).niveau;
    slots[slot - 1] = singeDeCombat(espece, e, niveau, {
      effets, perk: perks[espece] ?? null, eveil: possede?.eveil ?? 1, objets: objets[espece] ?? [],
    });
  }
  // Résonances de catégorie : tous les singes de l'équipe comptent, rotation active ou non ;
  // bonus augmentés par Harmonie et Chœur
  return appliquerResonances(slots, resonancesAvecBonus(effets.resonance_pct)).equipe;
}

// Combat PVP : calcul, elo des deux joueurs, puis enregistrement (dans la transaction `db`).
// Les variations d'elo sont gardées avec le résultat : { A, B, compte, applique } ;
// elles ne touchent l'elo des joueurs qu'à la fin du replay (reglerEloTermines).
async function enregistrerCombat(db, defi, equipeA, equipeB) {
  const resultat = combat(equipeA, equipeB);
  resultat.equipeA = equipeA;
  resultat.equipeB = equipeB;
  resultat.dureeMs = dureeReplayMs(resultat.journal);
  resultat.elo = await eloDuCombat(db, defi.de_user, defi.vers_user, resultat.vainqueur);

  const { rows } = await db.query(
    `INSERT INTO combats (defi_id, user_a, user_b, resultat)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [defi.id, defi.de_user, defi.vers_user, resultat]
  );
  // Quête PVP : seuls les combats qui comptent pour l'elo avancent (même anti-farm, voir eloDuCombat).
  // Joueurs pris dans un ordre fixe : deux combats croisés simultanés verrouillent leurs lignes dans le même ordre.
  if (resultat.elo.compte) {
    for (const joueur of [defi.de_user, defi.vers_user].sort()) await progresserQuete(joueur, "pvp", 1, db);
  }
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

// Replay PVE regardé en accéléré : le joueur l'a fini avant l'horloge du serveur.
// On avance la fin du combat à maintenant, pour qu'il puisse enchaîner (étage suivant, donjon),
// sans jamais descendre sous la durée du replay à la vitesse maximale. Ne fait que raccourcir.
export async function terminerReplay(userId, combatId) {
  await pool.query(
    `UPDATE combats
     SET resultat = jsonb_set(resultat, '{dureeMs}', to_jsonb(GREATEST(
       floor(extract(epoch FROM now() - created_at) * 1000)::int,
       jsonb_array_length(resultat->'journal') * $3::int / $4::int
     )))
     WHERE id = $1 AND user_a = $2 AND mode <> 'pvp'
       AND created_at + (COALESCE((resultat->>'dureeMs')::int, 0) * interval '1 millisecond') > now()`,
    [combatId, userId, PAS_MS, VITESSE_REPLAY_MAX]
  );
}

// Nom affiché du camp B : le joueur adverse en PVP, l'étage ou le donjon en PVE.
function nomAdversaire(r) {
  if (r.mode === "aventure") return `Étage ${r.contexte?.etage}`;
  if (r.mode === "ressource" || r.mode === "eveil") return r.contexte?.titre ?? "Donjon";
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
    pasSouffle: PAS_SOUFFLE,
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
