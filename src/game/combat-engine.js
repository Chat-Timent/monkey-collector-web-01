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

// Taunt présent dans le groupe actif : la cible est forcée sur le slot 1 du groupe.
// Sinon, tirage aléatoire parmi les vivants du groupe actif.
function choisirCible(camp, hasard) {
  const actifs = rotationActive(camp);
  if (actifs.length === 0) return null;
  if (actifs.some((s) => s.perk?.name === "taunt")) return actifs[0];
  return actifs[Math.floor(hasard() * actifs.length)];
}

// Quasi toujours 100 % de toucher. La précision et l'esquive ne retirent
// qu'au maximum 15 points, donc elles n'interviennent que occasionnellement.
function chanceTouche(attaquant, cible) {
  const brut = 95 + (attaquant.prec - cible.esq) / 10;
  return Math.min(100, Math.max(85, brut));
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

    // Ordre fixe : slot 1 A, slot 1 B, slot 2 A, slot 2 B, etc.
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      for (const [camp, adverses] of [[A, B], [B, A]]) {
        const attaquant = camp[i];
        if (!attaquant || !estVivant(attaquant)) continue;
        if (!rotationActive(camp).includes(attaquant)) continue;

        const cible = choisirCible(adverses, hasard);
        if (!cible) continue;

        const touche = hasard() * 100 < chanceTouche(attaquant, cible);
        if (!touche) {
          journal.push({
            type: "rate", tour,
            de: attaquant.nom, deCamp: attaquant.camp, deSlot: attaquant.slot,
            sur: cible.nom, surCamp: cible.camp, surSlot: cible.slot,
          });
          continue;
        }

        const critique = hasard() * 100 < attaquant.crit;
        let degats = Math.max(1, attaquant.atk - cible.def);
        if (critique) degats = Math.round(degats * (attaquant.critdmg / 100));

        cible.pv = Math.max(0, cible.pv - degats);
        journal.push({
          type: "degats", tour,
          de: attaquant.nom, deCamp: attaquant.camp, deSlot: attaquant.slot,
          sur: cible.nom, surCamp: cible.camp, surSlot: cible.slot,
          degats, critique, pvRestants: cible.pv,
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
