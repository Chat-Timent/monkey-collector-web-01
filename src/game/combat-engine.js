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

// Compétence Lumière rasante (passive) : quand le porteur attaque la même cible que lors de sa précédente attaque,
// le coup gagne +`degatsPct` % de dégâts par cumul, jusqu'à `cumulMax` cumuls. Une nouvelle cible (ou la mort de la
// précédente) remet le cumul à zéro : la première attaque sur une cible n'a aucun bonus et démarre le cumul à 1 pour
// la suivante. État par singe : `lumiere = { cible, cumul }` ; l'ATK du porteur n'est pas modifiée (pas de conflit
// avec Décret royal). Seule l'attaque principale compte : la seconde frappe de Chaos ne touche pas à l'état.
// Le porteur agit forcément depuis la rotation active, vivant : la compétence ne se déclenche jamais depuis la réserve.
// Renvoie le bonus du coup ({ cumul, pct }, pct = bonus total en %) ou null.
function lumiereRasante(attaquant, cible) {
  const c = attaquant.competence;
  if (c?.id !== "lumiere_rasante") return null;
  const etat = attaquant.lumiere;
  if (!etat || etat.cible !== cible || !estVivant(etat.cible)) {
    attaquant.lumiere = { cible, cumul: 1 };
    return null;
  }
  const cumul = Math.min(etat.cumul, c.cumulMax);
  etat.cumul = Math.min(etat.cumul + 1, c.cumulMax);
  return { cumul, pct: cumul * c.degatsPct };
}

// Attaque ratée d'un porteur de Lumière rasante : sur une autre cible, le cumul retombe à zéro ;
// sur la même cible, il est gardé tel quel (un raté ne le fait pas monter).
function lumiereRatee(attaquant, cible) {
  if (attaquant.competence?.id === "lumiere_rasante" && attaquant.lumiere?.cible !== cible) attaquant.lumiere = null;
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

// Compétence Arc-en-ciel protecteur : tous les `tousLes` tours, chaque porteur vivant de la rotation active donne à chaque singe
// vivant de la rotation active (lui compris) un bouclier de `bouclierPct` % de ses propres PV max. Le bouclier remplace
// l'ancien (pas de cumul) et dure jusqu'à ce qu'il soit consommé (voir frapper).
function arcEnCiel(camp, tour, journal) {
  for (const porteur of camp) {
    const c = porteur?.competence;
    if (!porteur || !estVivant(porteur) || c?.id !== "arc_en_ciel" || tour % c.tousLes !== 0 || !enRotation(camp, porteur)) continue;
    const cibles = rotationActive(camp);
    for (const s of cibles) s.bouclier = Math.max(0, Math.round((s.hp * c.bouclierPct) / 100));
    journal.push({
      type: "bouclier", tour,
      de: porteur.nom, deCamp: porteur.camp, deSlot: porteur.slot,
      competence: { nom: c.nom, icone: c.icone },
      bouclierPct: c.bouclierPct,
      cibles: cibles.map((s) => ({ slot: s.slot, bouclier: s.bouclier })),
    });
  }
}

// ---------- Traits (résonances d'équipe) ----------
// Valeurs du trait `id` pour ce singe s'il le porte et que la résonance est active (voir resonances.js), sinon null.
// Un effet de combat exige un porteur vivant et dans la rotation active ; seul Sacrifice récompense aussi la réserve.
function trait(s, id) {
  return s?.effetsTraits?.[id] ?? null;
}

// Trait Euphorie : au début de chaque tour, chaque porteur vivant de la rotation active cumule +`atkParTour` % d'ATK,
// jusqu'à `atkPlafond` %. Le bonus s'ajoute à celui de Frénésie dans l'ATK du coup (atkDuCoup) ; pas d'événement.
function euphorie(camp) {
  for (const s of rotationActive(camp)) {
    const t = trait(s, "euphorie");
    if (t) s.euphorie = Math.min(t.atkPlafond, Math.round(((s.euphorie ?? 0) + t.atkParTour) * 10) / 10);
  }
}

// Trait Malédiction : au début de chaque tour, si au moins un porteur est vivant dans la rotation active, l'ennemi
// de la rotation active adverse qui a le plus de PV actuels (à égalité : le premier slot) perd `parTour` % de DEF
// et autant d'ATK, cumulable sur lui jusqu'à `plafond` %. Une seule malédiction par camp et par tour, même avec
// plusieurs porteurs. Le cumul est gardé à part (`cible.malediction`) et appliqué au calcul de chaque coup (DEF de la
// cible, ATK de l'attaquant) : Décret royal, qui recalcule `atk` et `def` depuis leurs valeurs de départ, ne l'efface pas.
// Événement seulement quand le cumul augmente (rien sur une cible au plafond).
function malediction(camp, adverses, tour, journal) {
  const porteur = rotationActive(camp).find((s) => trait(s, "malediction"));
  if (!porteur) return;
  const t = trait(porteur, "malediction");
  const actifs = rotationActive(adverses);
  if (actifs.length === 0) return;
  const cible = actifs.reduce((haut, s) => (s.pv > haut.pv ? s : haut));
  const avant = cible.malediction ?? 0;
  const cumul = Math.round(Math.min(100, t.plafond, avant + t.parTour) * 10) / 10;
  if (cumul <= avant) return;
  cible.malediction = cumul;
  journal.push({
    type: "malediction", tour,
    de: porteur.nom, deCamp: porteur.camp, deSlot: porteur.slot,
    sur: cible.nom, surCamp: cible.camp, surSlot: cible.slot,
    pct: Math.round((cumul - avant) * 10) / 10, cumul,
  });
}

// Trait Rempart : réduction (en %) des dégâts reçus par un porteur, plus forte quand ses PV baissent
// (PV au moment du coup) : base + bonus × (1 − PV / PV max). S'applique à tous les dégâts : coups, Présage, seconde frappe.
function reductionRempart(cible) {
  const t = trait(cible, "rempart");
  if (!t) return 0;
  return Math.min(100, t.reductionBase + t.reductionBonus * (1 - cible.pv / cible.hp));
}

// Trait Dévouement : chaque coup d'un porteur soigne l'allié vivant de sa rotation active qui a le plus petit ratio
// PV / PV max (à égalité : le premier slot ; le porteur peut se soigner lui-même), de `soinPct` % des dégâts réellement
// infligés aux PV (sans la part absorbée par un bouclier), sans dépasser ses PV max. Le soin est rangé dans l'événement de dégâts (`devouement`) : pas de pas de replay en plus.
function devouement(attaquant, campAttaquant, inflige) {
  const t = trait(attaquant, "devouement");
  if (!t || inflige <= 0) return null;
  const allies = rotationActive(campAttaquant);
  if (allies.length === 0) return null;
  const cible = allies.reduce((bas, s) => (s.pv / s.hp < bas.pv / bas.hp ? s : bas));
  const soin = Math.min(Math.round((inflige * t.soinPct) / 100), cible.hp - cible.pv);
  if (soin <= 0) return null;
  cible.pv += soin;
  return { sur: cible.nom, surSlot: cible.slot, soin, pvRestants: cible.pv };
}

// Trait Sacrifice : quand un porteur meurt pour de bon (après un éventuel Second souffle), tous les autres porteurs
// vivants de son camp, réserve comprise, gagnent `partStats` % de ses PV max, ATK et DEF (valeurs au moment de sa mort),
// cumulable à chaque mort. Les valeurs de départ (`hpDepart`…) suivent, pour que Décret royal ne les écrase pas.
function sacrifice(mort, camp, tour, journal) {
  const t = trait(mort, "sacrifice");
  if (!t || estVivant(mort) || mort.sacrifie) return;
  mort.sacrifie = true;
  const beneficiaires = tousVivants(camp).filter((s) => s !== mort && trait(s, "sacrifice"));
  if (beneficiaires.length === 0) return;
  const gain = {
    hp: Math.round((mort.hp * t.partStats) / 100),
    atk: Math.round((mort.atk * t.partStats) / 100),
    def: Math.round((mort.def * t.partStats) / 100),
  };
  for (const s of beneficiaires) {
    s.hp += gain.hp; s.hpDepart += gain.hp; s.pv += gain.hp;
    s.atk += gain.atk; s.atkDepart += gain.atk;
    s.def += gain.def; s.defDepart += gain.def;
  }
  journal.push({
    type: "sacrifice", tour,
    nom: mort.nom, camp: mort.camp, slot: mort.slot,
    partStats: t.partStats, ...gain,
    cibles: beneficiaires.map((s) => ({ slot: s.slot, hp: s.hp, pv: s.pv })),
  });
}

// Effets qui se déclenchent entre les tours, avant les attaques, toujours dans le même ordre :
// 1. buffs des singes (passifs des mythiques) : Décret royal (camp A puis B), puis Arc-en-ciel protecteur (camp A puis B),
//    pour que le bouclier se base sur les PV max déjà augmentés par le Décret ;
// 2. traits : Euphorie (camp A puis B), puis Malédiction (camp A puis B) ;
// 3. perks (Floraison, tous les 2 tours), camp A puis camp B.
// Chaque effet écrit son propre événement dans le journal : aucun n'en masque un autre.
function effetsEntreTours(A, B, tour, journal) {
  decretRoyal(A, tour, journal);
  decretRoyal(B, tour, journal);
  arcEnCiel(A, tour, journal);
  arcEnCiel(B, tour, journal);
  euphorie(A);
  euphorie(B);
  malediction(A, B, tour, journal);
  malediction(B, A, tour, journal);
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

// ATK d'un coup : ATK × (1 + Frénésie + Euphorie) × (1 − Malédiction subie) ; Frénésie et Euphorie s'additionnent.
// Perk Frénésie : +`atkParCoupPct` % par coup déjà porté, jusqu'à `cumulMax` cumuls ; trait Euphorie : cumul du porteur ;
// trait Malédiction : cumul posé sur l'attaquant par les porteurs adverses.
function atkDuCoup(attaquant) {
  const p = attaquant.perk;
  const frenesie = p?.id === "frenesie" && attaquant.frenesie ? p.atkParCoupPct * Math.min(attaquant.frenesie, p.cumulMax) : 0;
  const bonus = frenesie + (attaquant.euphorie ?? 0);
  const maudit = Math.min(100, attaquant.malediction ?? 0);
  if (!bonus && !maudit) return attaquant.atk;
  return Math.round(attaquant.atk * (1 + bonus / 100) * (1 - maudit / 100));
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

// Applique un coup déjà calculé (`degats` avant Rempart) : Rempart de la cible, bouclier, PV, soin de Dévouement,
// événement de dégâts (`extra` : critique, compétence, seconde frappe), Second souffle, K.O. puis Sacrifice.
// Bouclier (Arc-en-ciel protecteur) : il absorbe les dégâts restant après Rempart, seul le reliquat retire des PV.
// L'événement garde `degats` = dégâts après Rempart (bouclier compris) ; s'il a absorbé quelque chose,
// il porte aussi `absorbe` (part prise par le bouclier) et `bouclierRestant`.
function frapper(attaquant, campAttaquant, cible, campCible, degats, extra, tour, journal) {
  const reduction = reductionRempart(cible);
  const finaux = reduction ? Math.max(1, Math.round(degats * (1 - reduction / 100))) : Math.max(1, degats);
  const absorbe = Math.min(cible.bouclier ?? 0, finaux);
  if (absorbe > 0) cible.bouclier -= absorbe;
  const avant = cible.pv;
  cible.pv = Math.max(0, cible.pv - (finaux - absorbe));
  // Dévouement : seuls les PV réellement retirés comptent (pas la part absorbée par le bouclier)
  const soin = devouement(attaquant, campAttaquant, avant - cible.pv);
  const { critique, ...reste } = extra;
  journal.push({
    type: "degats", tour,
    de: attaquant.nom, deCamp: attaquant.camp, deSlot: attaquant.slot,
    sur: cible.nom, surCamp: cible.camp, surSlot: cible.slot,
    degats: finaux, critique, pvRestants: cible.pv,
    ...reste,
    ...(absorbe > 0 && { absorbe, bouclierRestant: cible.bouclier }),
    ...(soin && { devouement: soin }),
  });

  secondSouffle(cible, tour, journal);
  if (!estVivant(cible)) {
    journal.push({ type: "KO", tour, nom: cible.nom, camp: cible.camp, slot: cible.slot });
    sacrifice(cible, campCible, tour, journal);
  }
}

export function combat(equipeA, equipeB, hasard = Math.random) {
  const preparer = (equipe, camp) =>
    equipe.map((s, slot) => (s ? { ...s, camp, slot, pv: s.hp, bouclier: 0, atkDepart: s.atk, defDepart: s.def, hpDepart: s.hp } : null));

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
          lumiereRatee(attaquant, cible);
          journal.push({
            type: "rate", tour,
            de: attaquant.nom, deCamp: attaquant.camp, deSlot: attaquant.slot,
            sur: cible.nom, surCamp: cible.camp, surSlot: cible.slot,
          });
          continue;
        }

        // Ordre de calcul d'un coup :
        // 1. ATK du coup = ATK × (1 + Frénésie + Euphorie) × (1 − Malédiction de l'attaquant) ;
        // 2. DEF de la cible = DEF × part gardée (Présage, Perforant) × (1 − Malédiction) ;
        // 3. degatsDe, puis critique ou Présage ;
        // 4. × (1 + Lumière rasante) ;
        // 5. + bonus Tueurs de géant (non multiplié par le critique ni par Lumière rasante) ;
        // 6. frapper : × (1 − Rempart de la cible), bouclier de la cible (absorbe d'abord), reliquat sur les PV,
        //    Dévouement (sur les PV retirés), Second souffle, K.O., Sacrifice ;
        // 7. jet de Chaos : seconde frappe éventuelle (passe aussi par frapper : Rempart puis bouclier de sa cible).
        const critique = presage || hasard() * 100 < attaquant.crit;
        // Part de la DEF qui compte encore : Présage et Perforant se cumulent (35 % puis 50 % ignorés → 32,5 % restants)
        let partDef = presage ? 1 - (attaquant.competence.percePct ?? 0) / 100 : 1;
        if (attaquant.perk?.id === "perforant") partDef *= 1 - Math.min(100, attaquant.perk.ignoreDefPct) / 100;
        if (cible.malediction) partDef *= 1 - Math.min(100, cible.malediction) / 100;
        const atk = atkDuCoup(attaquant);
        let degats = degatsDe(atk, cible.def * partDef);
        if (presage) degats = Math.round(degats * attaquant.competence.critMult);
        else if (critique) degats = Math.round(degats * (attaquant.critdmg / 100));
        const lumiere = lumiereRasante(attaquant, cible);
        if (lumiere) degats = Math.round(degats * (1 + lumiere.pct / 100));

        // Trait Tueurs de géant : + `pvMaxPct` % des PV max de la cible, au plus `plafondAtkPct` % de l'ATK du coup
        const geant = trait(attaquant, "tueurs_de_geant");
        if (geant) degats += Math.round(Math.min((cible.hp * geant.pvMaxPct) / 100, (atk * geant.plafondAtkPct) / 100));

        if (attaquant.perk?.id === "frenesie") attaquant.frenesie = (attaquant.frenesie ?? 0) + 1;
        frapper(attaquant, camp, cible, adverses, degats, {
          critique,
          ...(presage && { competence: { nom: attaquant.competence.nom, icone: attaquant.competence.icone } }),
          ...(lumiere && { lumiere }),
        }, tour, journal);

        // Trait Chaos : chance de seconde frappe sur un ennemi vivant au hasard de la rotation active (taunt ignoré,
        // sans jet de toucher ni critique), de `partDegats` % des dégâts de la première (Lumière rasante comprise), pris
        // avant le Rempart de la première cible ; seul le Rempart de sa propre cible s'applique. Elle ne relance ni Frénésie ni Chaos,
        // compte pour Dévouement et peut mettre K.O. (Second souffle, Sacrifice).
        const chaos = trait(attaquant, "chaos");
        if (chaos) {
          const actifs = rotationActive(adverses);
          if (actifs.length > 0 && hasard() * 100 < chaos.chance) {
            const seconde = actifs[Math.floor(hasard() * actifs.length)];
            frapper(attaquant, camp, seconde, adverses, Math.round((degats * chaos.partDegats) / 100),
              { critique: false, doubleFrappe: true }, tour, journal);
          }
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
