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

// Perk taunt : un singe vivant du groupe actif qui le porte attire toutes les attaques.
// Sinon, tirage aléatoire parmi les vivants du groupe actif.
function choisirCible(camp, hasard) {
  const actifs = rotationActive(camp);
  if (actifs.length === 0) return null;
  const provocateur = actifs.find((s) => s.perk?.id === "taunt");
  if (provocateur) return provocateur;
  return actifs[Math.floor(hasard() * actifs.length)];
}

// Perk floraison : tous les 2 tours, chaque porteur vivant soigne le singe vivant
// le plus bas en PV de son équipe, d'un pourcentage de ses PV max (sans dépasser le max).
function floraison(camp, tour, journal) {
  for (const porteur of camp) {
    if (!porteur || !estVivant(porteur) || porteur.perk?.id !== "blossoming") continue;
    const cible = tousVivants(camp).reduce((bas, s) => (s.pv < bas.pv ? s : bas));
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
// du groupe actif adverse (même face à un taunt), sans pouvoir rater, d'un coup critique à `critMult` × les dégâts.
function presageDeclenche(attaquant, tour) {
  const c = attaquant.competence;
  return c?.id === "presage" && tour % c.tousLes === 0;
}

function plusBasEnPv(camp) {
  const actifs = rotationActive(camp);
  if (actifs.length === 0) return null;
  return actifs.reduce((bas, s) => (s.pv < bas.pv ? s : bas));
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
    equipe.map((s, slot) => (s ? { ...s, camp, slot, pv: s.hp } : null));

  const A = preparer(equipeA, "A");
  const B = preparer(equipeB, "B");
  const journal = [];

  for (let tour = 1; tour <= MAX_TOURS; tour++) {
    if (tousVivants(A).length === 0 || tousVivants(B).length === 0) break;

    journal.push({ type: "tour", numero: tour });
    if (tour % 2 === 0) {
      floraison(A, tour, journal);
      floraison(B, tour, journal);
    }

    // Ordre fixe : slot 1 A, slot 1 B, slot 2 A, slot 2 B, etc.
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      for (const [camp, adverses] of [[A, B], [B, A]]) {
        const attaquant = camp[i];
        if (!attaquant || !estVivant(attaquant)) continue;
        if (!rotationActive(camp).includes(attaquant)) continue;

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
        let degats = degatsDe(attaquant.atk, cible.def);
        if (presage) degats = Math.round(degats * attaquant.competence.critMult);
        else if (critique) degats = Math.round(degats * (attaquant.critdmg / 100));

        cible.pv = Math.max(0, cible.pv - degats);
        journal.push({
          type: "degats", tour,
          de: attaquant.nom, deCamp: attaquant.camp, deSlot: attaquant.slot,
          sur: cible.nom, surCamp: cible.camp, surSlot: cible.slot,
          degats, critique, pvRestants: cible.pv,
          ...(presage && { competence: { nom: attaquant.competence.nom, icone: attaquant.competence.icone } }),
        });

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
