// Arbre de compétences du starter (page de tirage).
// Nécessite commun.js. Utilisation : initArbre({ onChangement }) puis ouvrirArbre().

const TITRES_BRANCHES = { pvp: "PVP", farm: "Farming" };

// Texte affiché pour chaque effet ; `chanceLoterie` vient du serveur.
function decrireEffet(cle, valeur, chanceLoterie) {
  const pct = (v) => `${Math.round(v * 1000) / 10} %`;
  switch (cle) {
    case "xp_pct": return `+${pct(valeur)} d'XP par tirage`;
    case "coins_pct": return `+${pct(valeur)} de coins gagnés`;
    case "lottery_coins": return `Les tirages peuvent rapporter des coins (${pct(chanceLoterie)} de chance)`;
    case "valeur_or_pct": return `+${pct(valeur)} de chance de coins au tirage`;
    case "reset_bonus": return `+${valeur} tirages par reset`;
    case "copie_bonus": return `${pct(valeur)} de chance d'obtenir une copie en plus`;
    case "atk_pct": return `+${pct(valeur)} d'ATK en combat`;
    case "prec_flat": return `+${valeur} de précision en combat`;
    case "esq_flat": return `+${valeur} d'esquive en combat`;
    case "crit_flat": return `+${valeur} % de chance de critique`;
    case "critdmg_flat": return `+${valeur} % de dégâts critiques`;
    case "slots_bonus": return `+${valeur} emplacement d'équipe (rang de renfort)`;
    default: return `${cle} : ${valeur}`;
  }
}

// Profondeur d'un nœud = longueur du plus long chemin de prérequis jusqu'à une racine.
function calculerProfondeurs(noeuds) {
  const parId = Object.fromEntries(noeuds.map((n) => [n.id, n]));
  const memo = {};
  const profondeur = (id) => {
    if (memo[id] !== undefined) return memo[id];
    const n = parId[id];
    memo[id] = n.prerequis.length === 0 ? 0 : 1 + Math.max(...n.prerequis.map(profondeur));
    return memo[id];
  };
  for (const n of noeuds) profondeur(n.id);
  return memo;
}

const Arbre = {
  etat: null,
  onChangement: () => {},
  enCours: false,
};

function initArbre({ onChangement } = {}) {
  if (onChangement) Arbre.onChangement = onChangement;
  const fenetre = document.getElementById("arbre");
  document.getElementById("arbre-fermer").addEventListener("click", fermerArbre);
  fenetre.addEventListener("click", (e) => { if (e.target === fenetre) fermerArbre(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermerArbre(); });
  window.addEventListener("resize", () => { if (Arbre.etat) tracerLiens(); });
}

async function ouvrirArbre() {
  document.getElementById("arbre").classList.add("ouverte");
  document.getElementById("arbre-message").textContent = "Chargement…";
  try {
    const { ok, data } = await api("/arbre");
    if (!ok) {
      document.getElementById("arbre-message").textContent = data.erreur;
      return;
    }
    document.getElementById("arbre-message").textContent = "";
    afficherArbre(data);
  } catch {
    document.getElementById("arbre-message").textContent = "Erreur réseau, réessaie.";
  }
}

function fermerArbre() {
  document.getElementById("arbre").classList.remove("ouverte");
}

async function debloquer(id) {
  if (Arbre.enCours) return;
  Arbre.enCours = true;
  const message = document.getElementById("arbre-message");
  try {
    const { ok, data } = await api("/arbre/noeuds", { corps: { noeud: id } });
    if (!ok) {
      message.textContent = data.erreur;
      return;
    }
    const nom = data.noeuds.find((n) => n.id === id)?.nom ?? id;
    message.textContent = `« ${nom} » débloqué !`;
    afficherArbre(data);
    Arbre.onChangement(data);
  } catch {
    message.textContent = "Erreur réseau, réessaie.";
  } finally {
    Arbre.enCours = false;
  }
}

function texteVerrou(n, parId) {
  if (n.raison === "points insuffisants") return `Coût : ${n.cout} point${n.cout > 1 ? "s" : ""}`;
  const noms = n.prerequis.map((p) => parId[p]?.nom ?? p);
  return n.mode === "au_moins_un" ? `Requiert : ${noms.join(" ou ")}` : `Requiert : ${noms.join(" + ")}`;
}

function afficherArbre(etat) {
  Arbre.etat = etat;
  const parId = Object.fromEntries(etat.noeuds.map((n) => [n.id, n]));
  const profondeurs = calculerProfondeurs(etat.noeuds);

  document.getElementById("arbre-points").textContent =
    `Niv. ${etat.niveau} · ${etat.points} point${etat.points > 1 ? "s" : ""} à dépenser`;
  document.getElementById("arbre-points").classList.toggle("a-depenser", etat.points > 0);

  const zone = document.getElementById("arbre-branches");
  zone.innerHTML = "";

  for (const branche of Object.keys(TITRES_BRANCHES)) {
    const noeuds = etat.noeuds.filter((n) => n.branche === branche);
    if (noeuds.length === 0) continue;

    const colonne = document.createElement("section");
    colonne.className = `branche branche-${branche}`;
    const titre = document.createElement("h3");
    titre.textContent = TITRES_BRANCHES[branche];
    const grille = document.createElement("div");
    grille.className = "branche-grille";
    const liens = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    liens.classList.add("liens");
    grille.appendChild(liens);

    const max = Math.max(...noeuds.map((n) => profondeurs[n.id]));
    for (let p = 0; p <= max; p++) {
      const rangee = document.createElement("div");
      rangee.className = "rangee";
      for (const n of noeuds.filter((x) => profondeurs[x.id] === p)) {
        rangee.appendChild(carteNoeud(n, parId, etat.chanceLoterie));
      }
      grille.appendChild(rangee);
    }

    colonne.append(titre, grille);
    zone.appendChild(colonne);
  }
  tracerLiens();
}

function carteNoeud(n, parId, chanceLoterie) {
  const carte = document.createElement("button");
  carte.type = "button";
  carte.className = `noeud ${n.etat}`;
  carte.dataset.id = n.id;
  carte.disabled = n.etat !== "disponible";

  const nom = document.createElement("strong");
  nom.textContent = n.nom;
  const effet = document.createElement("span");
  effet.className = "effet";
  const effets = Object.entries(n.effet);
  effet.textContent = effets.length
    ? effets.map(([cle, v]) => decrireEffet(cle, v, chanceLoterie)).join(" · ")
    : "Point de départ de la branche";
  const statut = document.createElement("span");
  statut.className = "statut";
  statut.textContent = n.etat === "pris" ? "✓ Débloqué"
    : n.etat === "disponible" ? `Débloquer (${n.cout} pt)`
    : texteVerrou(n, parId);

  carte.append(nom, effet, statut);
  if (n.etat === "disponible") carte.addEventListener("click", () => debloquer(n.id));
  return carte;
}

// Traits entre chaque nœud et ses prérequis, mesurés sur la mise en page réelle.
function tracerLiens() {
  const etat = Arbre.etat;
  for (const grille of document.querySelectorAll("#arbre-branches .branche-grille")) {
    const svg = grille.querySelector("svg.liens");
    const boite = grille.getBoundingClientRect();
    svg.setAttribute("width", boite.width);
    svg.setAttribute("height", boite.height);
    svg.innerHTML = "";

    for (const carte of grille.querySelectorAll(".noeud")) {
      const n = etat.noeuds.find((x) => x.id === carte.dataset.id);
      const b = carte.getBoundingClientRect();
      for (const p of n.prerequis) {
        const parent = grille.querySelector(`.noeud[data-id="${CSS.escape(p)}"]`);
        if (!parent) continue;
        const a = parent.getBoundingClientRect();
        const ligne = document.createElementNS("http://www.w3.org/2000/svg", "line");
        ligne.setAttribute("x1", a.left + a.width / 2 - boite.left);
        ligne.setAttribute("y1", a.bottom - boite.top);
        ligne.setAttribute("x2", b.left + b.width / 2 - boite.left);
        ligne.setAttribute("y2", b.top - boite.top);
        const prerequisPris = parent.classList.contains("pris");
        ligne.setAttribute("class", prerequisPris ? "actif" : "");
        if (n.mode === "au_moins_un") ligne.setAttribute("stroke-dasharray", "5 4");
        svg.appendChild(ligne);
      }
    }
  }
}
