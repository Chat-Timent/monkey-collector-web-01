// Fonction pure : aucun accès base de données ni Express.
// Les équipes sont des tableaux de 6 entrées : un singe préparé ou null.
// Un singe préparé : { nom, hp, atk, def, spd, prec, esq, crit, critdmg, perk? }

const MAX_TOURS = 200;

function estVivant(s) {
  return s.pv > 0;
}

// Singes vivants du groupe actif d'un camp.
// Groupe 1 (slots 1-3) tant qu'il a des vivants, sinon groupe 2 (slots 4-6).
function rotationActive(camp) {
  const groupe1 = camp.slice(0, 3).filter((s) => s && estVivant(s));
  if (groupe1.length > 0) return groupe1;
  return camp.slice(3, 6).filter((s) => s && estVivant(s));
}

function tousVivants(camp) {
  return camp.filter((s) => s && estVivant(s));
}

// Cible : taunt si un singe du groupe actif le possède (le tank du slot 1 est forcé),
// sinon tirage aléatoire parmi les vivants du groupe actif.
function choisirCible(camp, hasard) {
  const actifs = rotationActive(camp);
  if (actifs.length === 0) return null;

  const taunt = actifs.find((s) => s.perk?.name === "taunt");
  const slot1 = actifs[0];
  if (taunt && slot1.perk?.name !== "taunt" && estVivant(taunt)) {
    return slot1;
  }
  if (taunt) return taunt;

  return actifs[Math.floor(hasard() * actifs.length)];
}

function chanceTouche(attaquant, cible) {
  const brut = 50 + (attaquant.prec - cible.esq) / 2;
  return Math.min(95, Math.max(5, brut));
}

export function combat(equipeA, equipeB, hasard = Math.random) {
  const preparer = (equipe, camp) =>
    equipe.map((s, slot) => (s ? { ...s, camp, slot, pv: s.hp } : null));

  const A = preparer(equipeA, "A");
  const B = preparer(equipeB, "B");
  const journal = [];

  for (let tour = 1; tour <= MAX_TOURS; tour++) {
    if (tousVivants(A).length === 0 || tousVivants(B).length === 0) break;

    // Seuls les singes des groupes actifs agissent, triés par SPD décroissant
    const ordre = [...rotationActive(A), ...rotationActive(B)].sort(
      (x, y) => y.spd - x.spd || x.slot - y.slot
    );

    journal.push({ type: "tour", numero: tour });

    for (const attaquant of ordre) {
      if (!estVivant(attaquant)) continue;

      const adverses = attaquant.camp === "A" ? B : A;
      const cible = choisirCible(adverses, hasard);
      if (!cible) break;

      const touche = hasard() * 100 < chanceTouche(attaquant, cible);
      if (!touche) {
        journal.push({ type: "rate", tour, de: attaquant.nom, sur: cible.nom });
        continue;
      }

      const critique = hasard() * 100 < attaquant.crit;
      let degats = Math.max(1, attaquant.atk - cible.def);
      if (critique) degats = Math.round(degats * (attaquant.critdmg / 100));

      cible.pv = Math.max(0, cible.pv - degats);
      journal.push({
        type: "degats",
        tour,
        de: attaquant.nom,
        sur: cible.nom,
        degats,
        critique,
        pvRestants: cible.pv,
      });

      if (!estVivant(cible)) {
        journal.push({ type: "KO", tour, nom: cible.nom, camp: cible.camp });
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