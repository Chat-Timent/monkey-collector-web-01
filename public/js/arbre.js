// Arbre de compétences du starter : un seul graphe en SVG (glisser pour se déplacer,
// molette ou pincement pour zoomer). Un clic sur un nœud ouvre son infobulle,
// d'où on le débloque. Nécessite commun.js. Utilisation : initArbre({ onChangement }) puis ouvrirArbre().

const SVG_NS = "http://www.w3.org/2000/svg";
const RAYON = 20;          // nœud payant
const RAYON_GRATUIT = 14;  // centre et racines des bras
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.5;
const SEUIL_GLISSER = 6;   // px : au-delà, un appui devient un déplacement, pas un clic
const ZOOM_NOMS = 0.45;    // en dessous, les noms des nœuds payants sont masqués

// Texte affiché pour chaque effet ; `chanceLoterie` et `seuilEtincelle` viennent du serveur.
function decrireEffet(cle, valeur, { chanceLoterie, seuilEtincelle }) {
  const pct = (v) => `${Math.round(v * 1000) / 10} %`;
  switch (cle) {
    case "xp_pct": return `+${pct(valeur)} d'XP par tirage`;
    case "coins_pct": return `+${pct(valeur)} de coins gagnés`;
    case "lottery_coins": return `Les tirages peuvent rapporter des coins (${pct(chanceLoterie)} de chance)`;
    case "valeur_or_pct": return `+${pct(valeur)} de chance de coins au tirage`;
    case "tirages_max": return `+${valeur} tirages stockés au maximum`;
    case "recharge_sec": return `Recharge plus rapide : -${valeur} s par tirage`;
    case "copie_bonus": return `${pct(valeur)} de chance d'obtenir une copie en plus`;
    case "atk_pct": return `+${pct(valeur)} d'ATK en combat`;
    case "hp_pct": return `+${pct(valeur)} de PV en combat`;
    case "def_pct": return `+${pct(valeur)} de DEF en combat`;
    case "prec_flat": return `+${valeur} de précision en combat`;
    case "esq_flat": return `+${valeur} d'esquive en combat`;
    case "crit_flat": return `+${valeur} % de chance de critique`;
    case "critdmg_flat": return `+${valeur} % de dégâts critiques`;
    case "slots_bonus": return `+${valeur} emplacement d'équipe`;
    case "tickets_donjon": return `+${valeur} ticket par jour dans chaque donjon`;
    case "rarete_pct": return `Singes rares, épiques et légendaires ${pct(valeur)} plus fréquents`;
    case "etincelle": return `Après ${seuilEtincelle} tirages sans rare ou mieux, le suivant en est un`;
    case "elo_combats_bonus": return `+${valeur} combat classé par jour contre un même adversaire`;
    case "aventure_pct": return `+${pct(valeur)} d'XP et de coins en Aventure`;
    case "resonance_pct": return `Bonus de résonance +${pct(valeur)}`;
    case "perk_pct": return `Perks ${pct(valeur)} plus efficaces (Peau de fer, Floraison, Taunt)`;
    default: return `${cle} : ${valeur}`;
  }
}

const Arbre = {
  etat: null,
  parId: {},
  onChangement: () => {},
  enCours: false,
  vue: { x: 0, y: 0, k: 1 },  // écran = monde × k + (x, y)
  selection: null,            // nœud dont l'infobulle est ouverte par un clic
  survol: null,               // nœud survolé à la souris
  minuteurSurvol: null,
  pointeurs: new Map(),       // appuis en cours (souris, doigts)
  geste: null,
};

function initArbre({ onChangement } = {}) {
  if (onChangement) Arbre.onChangement = onChangement;
  const fenetre = document.getElementById("arbre");
  document.getElementById("arbre-fermer").addEventListener("click", fermerArbre);
  document.getElementById("arbre-recentrer").addEventListener("click", recentrer);
  fenetre.addEventListener("click", (e) => { if (e.target === fenetre) fermerArbre(); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !fenetre.classList.contains("ouverte")) return;
    if (Arbre.selection) choisir(null);
    else fermerArbre();
  });

  const svg = document.getElementById("arbre-svg");
  svg.addEventListener("pointerdown", appuiDebut);
  svg.addEventListener("pointermove", appuiMouvement);
  svg.addEventListener("pointerup", appuiFin);
  svg.addEventListener("pointercancel", appuiFin);
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const [px, py] = positionLocale(e);
    zoomerAutour(px, py, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  // Survol à la souris : infobulle immédiate ; elle reste un instant après la sortie du nœud
  // pour laisser le temps d'atteindre son bouton.
  svg.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse" || Arbre.geste) return;
    const id = e.target.closest?.(".noeud")?.dataset.id ?? null;
    if (id) survoler(id);
    else finSurvol();
  });
  svg.addEventListener("pointerleave", finSurvol);
  const bulle = document.getElementById("arbre-bulle");
  bulle.addEventListener("pointerenter", () => clearTimeout(Arbre.minuteurSurvol));
  bulle.addEventListener("pointerleave", finSurvol);
  svg.addEventListener("keydown", (e) => {
    const id = e.target.closest?.(".noeud")?.dataset.id;
    if (id && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); choisir(id); }
  });
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
    Arbre.selection = null;
    afficherArbre(data);
    recentrer();
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
    // Infobulle fermée : elle masquerait les nœuds voisins, désormais disponibles
    Arbre.selection = null;
    Arbre.survol = null;
    afficherArbre(data);
    Arbre.onChangement(data);
  } catch {
    message.textContent = "Erreur réseau, réessaie.";
  } finally {
    Arbre.enCours = false;
  }
}

// ---------- Dessin ----------

function elementSvg(nom, attributs = {}) {
  const el = document.createElementNS(SVG_NS, nom);
  for (const [cle, valeur] of Object.entries(attributs)) el.setAttribute(cle, valeur);
  return el;
}

function afficherArbre(etat) {
  Arbre.etat = etat;
  Arbre.parId = Object.fromEntries(etat.noeuds.map((n) => [n.id, n]));

  const points = document.getElementById("arbre-points");
  points.textContent = `Niv. ${etat.niveau} · ${etat.points} point${etat.points > 1 ? "s" : ""}`;
  points.classList.toggle("a-depenser", etat.points > 0);

  const monde = document.getElementById("arbre-monde");
  monde.innerHTML = "";
  const calqueLiens = elementSvg("g");
  const calqueNoeuds = elementSvg("g");
  monde.append(calqueLiens, calqueNoeuds);

  // Chaque lien une seule fois : doré entre deux nœuds pris, orangé vers un nœud disponible
  for (const n of etat.noeuds) {
    for (const autreId of n.liens) {
      const autre = Arbre.parId[autreId];
      if (!autre || autreId < n.id) continue;
      const etats = [n.etat, autre.etat];
      const classe = etats.every((e) => e === "pris") ? "actif"
        : etats.includes("pris") && etats.includes("disponible") ? "ouvert" : "";
      calqueLiens.appendChild(elementSvg("line", { x1: n.x, y1: n.y, x2: autre.x, y2: autre.y, class: classe }));
    }
  }

  for (const n of etat.noeuds) {
    const gratuit = n.cout === 0;
    const g = elementSvg("g", {
      class: `noeud ${n.etat} branche-${n.branche}${gratuit ? " gratuit" : ""}`,
      transform: `translate(${n.x} ${n.y})`,
      "data-id": n.id,
      tabindex: gratuit ? "-1" : "0",
    });
    g.appendChild(elementSvg("circle", { r: gratuit ? RAYON_GRATUIT : RAYON }));
    if (!gratuit) {
      const marque = elementSvg("text", { class: "marque", dy: "0.35em" });
      marque.textContent = n.etat === "pris" ? "✓" : n.cout;
      g.appendChild(marque);
    }
    const nom = elementSvg("text", { class: "nom", y: (gratuit ? RAYON_GRATUIT : RAYON) + 15 });
    nom.textContent = n.nom;
    g.appendChild(nom);
    calqueNoeuds.appendChild(g);
  }

  appliquerVue();
}

// ---------- Vue : déplacement et zoom ----------

function appliquerVue() {
  const { x, y, k } = Arbre.vue;
  document.getElementById("arbre-monde").setAttribute("transform", `translate(${x} ${y}) scale(${k})`);
  document.getElementById("arbre-svg").classList.toggle("loin", k < ZOOM_NOMS);
  afficherBulle();
}

function positionLocale(e) {
  const r = document.getElementById("arbre-svg").getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function zoomerAutour(px, py, facteur) {
  const v = Arbre.vue;
  const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.k * facteur));
  const f = k / v.k;
  v.x = px - (px - v.x) * f;
  v.y = py - (py - v.y) * f;
  v.k = k;
  appliquerVue();
}

// Tout l'arbre visible et centré
function recentrer() {
  const noeuds = Arbre.etat?.noeuds;
  if (!noeuds?.length) return;
  const svg = document.getElementById("arbre-svg");
  const largeur = svg.clientWidth, hauteur = svg.clientHeight;
  const marge = 50;
  const xs = noeuds.map((n) => n.x), ys = noeuds.map((n) => n.y);
  const [x0, x1] = [Math.min(...xs) - marge, Math.max(...xs) + marge];
  const [y0, y1] = [Math.min(...ys) - marge, Math.max(...ys) + marge + 20];
  const k = Math.min(1, Math.max(ZOOM_MIN, Math.min(largeur / (x1 - x0), hauteur / (y1 - y0))));
  Arbre.vue = { k, x: largeur / 2 - ((x0 + x1) / 2) * k, y: hauteur / 2 - ((y0 + y1) / 2) * k };
  appliquerVue();
}

function appuiDebut(e) {
  const svg = e.currentTarget;
  svg.setPointerCapture(e.pointerId);
  const [px, py] = positionLocale(e);
  Arbre.pointeurs.set(e.pointerId, { px, py });
  if (Arbre.pointeurs.size === 1) {
    // Appui simple : clic sur un nœud (ou dans le vide) tant qu'il ne bouge pas
    Arbre.geste = { type: "appui", depart: [px, py], noeud: e.target.closest?.(".noeud")?.dataset.id ?? null };
  } else if (Arbre.pointeurs.size === 2) {
    Arbre.geste = { type: "pincement", ...mesurePincement() };
  }
}

function mesurePincement() {
  const [a, b] = [...Arbre.pointeurs.values()];
  return { distance: Math.hypot(a.px - b.px, a.py - b.py) || 1, milieu: [(a.px + b.px) / 2, (a.py + b.py) / 2] };
}

function appuiMouvement(e) {
  if (!Arbre.pointeurs.has(e.pointerId)) return;
  const [px, py] = positionLocale(e);
  const avant = Arbre.pointeurs.get(e.pointerId);
  Arbre.pointeurs.set(e.pointerId, { px, py });
  const geste = Arbre.geste;
  if (!geste) return;

  if (geste.type === "appui" && Math.hypot(px - geste.depart[0], py - geste.depart[1]) > SEUIL_GLISSER) {
    geste.type = "glisser";
    Arbre.survol = null;
    document.getElementById("arbre-svg").classList.add("glisse");
  }
  if (geste.type === "glisser") {
    Arbre.vue.x += px - avant.px;
    Arbre.vue.y += py - avant.py;
    appliquerVue();
  } else if (geste.type === "pincement" && Arbre.pointeurs.size === 2) {
    const { distance, milieu } = mesurePincement();
    Arbre.vue.x += milieu[0] - geste.milieu[0];
    Arbre.vue.y += milieu[1] - geste.milieu[1];
    zoomerAutour(milieu[0], milieu[1], distance / geste.distance);
    geste.distance = distance;
    geste.milieu = milieu;
  }
}

function appuiFin(e) {
  if (!Arbre.pointeurs.delete(e.pointerId)) return;
  const geste = Arbre.geste;
  if (geste?.type === "appui" && e.type === "pointerup") choisir(geste.noeud);
  if (Arbre.pointeurs.size === 0) {
    Arbre.geste = null;
    document.getElementById("arbre-svg").classList.remove("glisse");
  } else if (geste?.type === "pincement") {
    // Un doigt reste posé : il continue en déplacement simple
    const [restant] = Arbre.pointeurs.values();
    Arbre.geste = { type: "glisser", depart: [restant.px, restant.py] };
  }
}

// ---------- Infobulle ----------

function survoler(id) {
  clearTimeout(Arbre.minuteurSurvol);
  if (id !== Arbre.survol) { Arbre.survol = id; afficherBulle(); }
}

function finSurvol() {
  clearTimeout(Arbre.minuteurSurvol);
  if (!Arbre.survol) return;
  Arbre.minuteurSurvol = setTimeout(() => { Arbre.survol = null; afficherBulle(); }, 300);
}

function choisir(id) {
  Arbre.selection = id;
  for (const g of document.querySelectorAll("#arbre-monde .noeud")) {
    g.classList.toggle("selection", g.dataset.id === id);
  }
  afficherBulle();
}

function texteEtat(n) {
  if (n.etat === "pris") return n.cout === 0 ? "Point de départ" : "✓ Débloqué";
  if (n.etat === "disponible") return null;
  if (n.raison === "points insuffisants") {
    const manque = n.cout - Arbre.etat.points;
    return `Il te manque ${manque} point${manque > 1 ? "s" : ""}`;
  }
  return "Débloque d'abord un nœud relié";
}

// Infobulle du nœud survolé, sinon de celui choisi au clic, placée au-dessus du nœud.
function afficherBulle() {
  const bulle = document.getElementById("arbre-bulle");
  const n = Arbre.parId[Arbre.survol ?? Arbre.selection];
  if (!n || !Arbre.etat) {
    bulle.hidden = true;
    return;
  }

  bulle.innerHTML = "";
  const titre = document.createElement("strong");
  titre.textContent = n.nom;
  bulle.appendChild(titre);
  const effets = Object.entries(n.effet);
  for (const [cle, valeur] of effets) {
    const ligne = document.createElement("p");
    ligne.textContent = decrireEffet(cle, valeur, Arbre.etat);
    bulle.appendChild(ligne);
  }
  if (n.cout > 0) {
    const cout = document.createElement("p");
    cout.className = "cout";
    cout.textContent = `Coût : ${n.cout} point${n.cout > 1 ? "s" : ""}`;
    bulle.appendChild(cout);
  }
  const statut = texteEtat(n);
  if (statut) {
    const p = document.createElement("p");
    p.className = `statut ${n.etat}`;
    p.textContent = statut;
    bulle.appendChild(p);
  }
  if (n.etat === "disponible") {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.textContent = `Débloquer (${n.cout} pt${n.cout > 1 ? "s" : ""})`;
    bouton.addEventListener("click", () => debloquer(n.id));
    bulle.appendChild(bouton);
  }
  bulle.hidden = false;

  // Position : au-dessus du nœud, en dessous s'il est trop près du haut ; jamais hors de la vue
  const { x, y, k } = Arbre.vue;
  const rayon = (n.cout === 0 ? RAYON_GRATUIT : RAYON) * k;
  const sx = n.x * k + x, sy = n.y * k + y;
  const zone = bulle.parentElement;
  const l = bulle.offsetWidth, h = bulle.offsetHeight;
  const gauche = Math.min(Math.max(8, sx - l / 2), zone.clientWidth - l - 8);
  let haut = sy - rayon - 10 - h;
  if (haut < 8) haut = sy + rayon + 10;
  bulle.style.left = `${gauche}px`;
  bulle.style.top = `${Math.min(haut, zone.clientHeight - h - 8)}px`;
}
