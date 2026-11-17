// Fonction pure : aucun accès base de données ni Express.
// Équipes : tableaux de 6 à 9 entrées (singe préparé ou null), par groupes de 3.

const MAX_TOURS = 200;

function estVivant(s) {
  return s.pv > 0;
}

// Singes vivants du groupe actif : groupe 1 (slots 1-3) tant qu'il a des vivants,
// puis groupe 2 (4-6), puis le rang de renfort (7-9) s'il existe.
function rotationActive(camp) {
  for (let debut = 0; debut < camp.length; debut += 3) {
    const groupe = camp.slice(debut, debut + 3).filter((s) => s && estVivant(s));
    if (groupe.length > 0) return groupe;
  }
  return [];
}

function tousVivants(camp) {
  return camp.filter((s) => s && estVivant(s));
}

// Seuls les singes de la rotation active agissent : attaques, perks et compétences.
// Un singe en réserve (groupes suivants) ne déclenche rien tant que son groupe n'est pas entré en jeu.
function enRotation(camp, s) {
  return rotationActive(camp).includes(s);
}

// Perk taunt : un singe vivant du groupe actif qui le porte attire toutes les attaques.
// Sinon, tirage aléatoire parmi les vivants du groupe actif.
function choisirCible(camp, hasard) {
  const actifs = rotationActive(camp);
  if (actifs.length === 0) return null;
  const provocateur = actifs.find((s) => s.perk?.id === "taunt");
  if (provocateur) return provocateur;
  return actifs[Math.floor(hasard() * actifs.length)];
}

// Perk floraison : tous les 2 tours, chaque porteur de la rotation active soigne le singe
// le plus bas en PV de la rotation active, d'un pourcentage de ses PV max (sans dépasser le max).
function floraison(camp, tour, journal) {
  for (const porteur of camp) {
    if (!porteur || !estVivant(porteur) || porteur.perk?.id !== "blossoming" || !enRotation(camp, porteur)) continue;
    const cible = rotationActive(camp).reduce((bas, s) => (s.pv < bas.pv ? s : bas));
    const soin = Math.min(Math.round(cible.hp * (porteur.perk.soinPct / 100)), cible.hp - cible.pv);
    if (soin <= 0) continue;
    cible.pv += soin;
    journal.push({
      type: "soin", tour,
      de: porteur.nom, deCamp: porteur.camp, deSlot: porteur.slot,
      sur: cible.nom, surCamp: cible.camp, surSlot: cible.slot,
      soin, pvRestants: cible.pv,
    });
  }
}

// Compétence Présage : tous les `tousLes` tours, le porteur frappe le singe vivant le plus bas en PV
// du groupe actif adverse (même face à un taunt), sans pouvoir rater, d'un coup critique à `critMult` × les dégâts
// qui ignore `percePct` % de la défense de la cible.
function presageDeclenche(attaquant, tour) {
  const c = attaquant.competence;
  return c?.id === "presage" && tour % c.tousLes === 0;
}

function plusBasEnPv(camp) {
  const actifs = rotationActive(camp);
  if (actifs.length === 0) return null;
  return actifs.reduce((bas, s) => (s.pv < bas.pv ? s : bas));
}

// Compétence Décret royal : tous les `tousLes` tours, chaque porteur de la rotation active octroie aux singes de la rotation active
// (lui compris) +`atkPct` % d'ATK, +`hpPct` % de PV max (PV actuels augmentés d'autant) et +`defPct` % de DEF (de leur valeur de départ),
// cumulable jusqu'à `cumulMax` fois par singe. Les bonus restent acquis même si le porteur tombe.
function decretRoyal(camp, tour, journal) {
  for (const porteur of camp) {
    const c = porteur?.competence;
    if (!porteur || !estVivant(porteur) || c?.id !== "decret_royal" || tour % c.tousLes !== 0 || !enRotation(camp, porteur)) continue;
    const beneficiaires = rotationActive(camp).filter((s) => (s.decret ?? 0) < c.cumulMax);
    if (beneficiaires.length === 0) continue;
    for (const s of beneficiaires) {
      s.decret = (s.decret ?? 0) + 1;
      s.atk = Math.round(s.atkDepart * (1 + (c.atkPct * s.decret) / 100));
      s.def = Math.round(s.defDepart * (1 + (c.defPct * s.decret) / 100));
      const hp = Math.round(s.hpDepart * (1 + ((c.hpPct ?? 0) * s.decret) / 100));
      s.pv += hp - s.hp;
      s.hp = hp;
    }
    journal.push({
      type: "decret", tour,
      de: porteur.nom, deCamp: porteur.camp, deSlot: porteur.slot,
      competence: { nom: c.nom, icone: c.icone },
      atkPct: c.atkPct, hpPct: c.hpPct ?? 0, defPct: c.defPct,
      cibles: beneficiaires.map((s) => ({ slot: s.slot, cumul: s.decret, hp: s.hp, pv: s.pv })),
    });
  }
}

// Effets qui se déclenchent entre les tours, avant les attaques, toujours dans le même ordre :
// 1. buffs des singes (passifs des mythiques, ex. Décret royal), camp A puis camp B ;
// 2. perks (Floraison, tous les 2 tours), camp A puis camp B.
// Chaque effet écrit son propre événement dans le journal : aucun n'en masque un autre.
function effetsEntreTours(A, B, tour, journal) {
  decretRoyal(A, tour, journal);
  decretRoyal(B, tour, journal);
  if (tour % 2 === 0) {
    floraison(A, tour, journal);
    floraison(B, tour, journal);
  }
}

// Perk Étendard : au début du combat, chaque groupe de 3 slots reçoit +`atkGroupePct` % d'ATK par porteur
// du groupe (porteur compris), cumul plafonné à `plafondPct`. Le bonus reste acquis même si le porteur tombe.
function etendards(camp) {
  for (let debut = 0; debut < camp.length; debut += 3) {
    const groupe = camp.slice(debut, debut + 3).filter(Boolean);
    const porteurs = groupe.filter((s) => s.perk?.id === "etendard");
    if (porteurs.length === 0) continue;
    const plafond = Math.max(...porteurs.map((s) => s.perk.plafondPct ?? Infinity));
    const pct = Math.min(plafond, porteurs.reduce((t, s) => t + s.perk.atkGroupePct, 0));
    for (const s of groupe) {
      s.atk = Math.round(s.atk * (1 + pct / 100));
      s.atkDepart = s.atk;
    }
  }
}

// Perk Frénésie : ATK du porteur augmentée de `atkParCoupPct` % par coup déjà porté, jusqu'à `cumulMax` cumuls.
function atkDuCoup(attaquant) {
  const p = attaquant.perk;
  if (p?.id !== "frenesie" || !attaquant.frenesie) return attaquant.atk;
  return Math.round(attaquant.atk * (1 + (p.atkParCoupPct * Math.min(attaquant.frenesie, p.cumulMax)) / 100));
}

// Perk Second souffle : une fois par combat, le porteur qui tombe revient à `retourPvPct` % de ses PV max (100 % au plus).
function secondSouffle(cible, tour, journal) {
  const p = cible.perk;
  if (estVivant(cible) || p?.id !== "second_souffle" || cible.souffleUtilise) return;
  cible.souffleUtilise = true;
  cible.pv = Math.max(1, Math.round(cible.hp * Math.min(100, p.retourPvPct) / 100));
  journal.push({
    type: "souffle", tour,
    nom: cible.nom, camp: cible.camp, slot: cible.slot,
    perk: { nom: p.nom, icone: p.icone }, pvRestants: cible.pv,
  });
}

// Quasi toujours 100 % de toucher. La précision et l'esquive ne retirent
// qu'au maximum 15 points, donc elles n'interviennent que occasionnellement.
function chanceTouche(attaquant, cible) {
  const brut = 95 + (attaquant.prec - cible.esq) / 10;
  return Math.min(100, Math.max(85, brut));
}

// Dégâts d'une attaque : l'attaque au carré divisée par (attaque + défense).
// Une défense égale à l'attaque réduit les dégâts de moitié, le double d'un tiers…
// La défense réduit toujours les dégâts sans jamais les annuler (minimum 1).
export function degatsDe(atk, def) {
  return Math.max(1, Math.round((atk * atk) / (atk + def)));
}

export function combat(equipeA, equipeB, hasard = Math.random) {
  const preparer = (equipe, camp) =>
    equipe.map((s, slot) => (s ? { ...s, camp, slot, pv: s.hp, atkDepart: s.atk, defDepart: s.def, hpDepart: s.hp } : null));

  const A = preparer(equipeA, "A");
  const B = preparer(equipeB, "B");
  etendards(A);
  etendards(B);
  const journal = [];

  for (let tour = 1; tour <= MAX_TOURS; tour++) {
    if (tousVivants(A).length === 0 || tousVivants(B).length === 0) break;

    journal.push({ type: "tour", numero: tour });
    effetsEntreTours(A, B, tour, journal);

    // Ordre fixe : slot 1 A, slot 1 B, slot 2 A, slot 2 B, etc.
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      for (const [camp, adverses] of [[A, B], [B, A]]) {
        const attaquant = camp[i];
        if (!attaquant || !estVivant(attaquant)) continue;
        if (!enRotation(camp, attaquant)) continue;

        const presage = presageDeclenche(attaquant, tour);
        const cible = presage ? plusBasEnPv(adverses) : choisirCible(adverses, hasard);
        if (!cible) continue;

        const touche = presage || hasard() * 100 < chanceTouche(attaquant, cible);
        if (!touche) {
          journal.push({
            type: "rate", tour,
            de: attaquant.nom, deCamp: attaquant.camp, deSlot: attaquant.slot,
            sur: cible.nom, surCamp: cible.camp, surSlot: cible.slot,
          });
          continue;
        }

        const critique = presage || hasard() * 100 < attaquant.crit;
        // Part de la DEF qui compte encore : Présage et Perforant se cumulent (35 % puis 50 % ignorés → 32,5 % restants)
        let partDef = presage ? 1 - (attaquant.competence.percePct ?? 0) / 100 : 1;
        if (attaquant.perk?.id === "perforant") partDef *= 1 - Math.min(100, attaquant.perk.ignoreDefPct) / 100;
        let degats = degatsDe(atkDuCoup(attaquant), cible.def * partDef);
        if (presage) degats = Math.round(degats * attaquant.competence.critMult);
        else if (critique) degats = Math.round(degats * (attaquant.critdmg / 100));

        cible.pv = Math.max(0, cible.pv - degats);
        if (attaquant.perk?.id === "frenesie") attaquant.frenesie = (attaquant.frenesie ?? 0) + 1;
        journal.push({
          type: "degats", tour,
          de: attaquant.nom, deCamp: attaquant.camp, deSlot: attaquant.slot,
          sur: cible.nom, surCamp: cible.camp, surSlot: cible.slot,
          degats, critique, pvRestants: cible.pv,
          ...(presage && { competence: { nom: attaquant.competence.nom, icone: attaquant.competence.icone } }),
        });

        secondSouffle(cible, tour, journal);
        if (!estVivant(cible)) {
          journal.push({ type: "KO", tour, nom: cible.nom, camp: cible.camp, slot: cible.slot });
        }
      }
    }
  }

  const aVivant = tousVivants(A).length > 0;
  const bVivant = tousVivants(B).length > 0;
  let vainqueur = null;
  if (aVivant && !bVivant) vainqueur = "A";
  else if (bVivant && !aVivant) vainqueur = "B";

  return {
    vainqueur,
    tours: journal.filter((e) => e.type === "tour").length,
    journal,
  };
}
