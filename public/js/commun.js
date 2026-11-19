// Outils partagés par toutes les pages. Script classique (pas de module) :
// les fonctions sont globales et utilisables par les scripts de chaque page.

const RARETES_AFFICHAGE = {
  common:    { label: "Commun",     couleur: "#060ee4" },
  uncommon:  { label: "Non-commun", couleur: "#1af3c3" },
  rare:      { label: "Rare",       couleur: "#1cc22a" },
  epic:      { label: "Epic",       couleur: "#a831eb" },
  legendary: { label: "Légendaire", couleur: "#fe9308" },
  mythic:    { label: "Mythique",   couleur: "#E01E1E" },
};

// ---------- Version du site ----------
// Le serveur écrit sa version dans la page (<meta name="version">) et l'annonce dans chaque
// réponse (en-tête X-Version). Après une mise à jour, un onglet resté ouvert sur l'ancienne
// version se recharge tout seul, pour ne pas mélanger ancien et nouveau code.
const VERSION_PAGE = document.querySelector('meta[name="version"]')?.content ?? null;

function avecVersion(url) {
  return VERSION_PAGE ? `${url}${url.includes("?") ? "&" : "?"}v=${VERSION_PAGE}` : url;
}

function verifierVersion(reponse) {
  const serveur = reponse.headers.get("X-Version");
  if (!VERSION_PAGE || !serveur || serveur === VERSION_PAGE) return;
  // Une seule tentative par version : évite une boucle si la page servie était encore l'ancienne
  try {
    if (sessionStorage.getItem("rechargement-version") === serveur) return;
    sessionStorage.setItem("rechargement-version", serveur);
  } catch { /* stockage indisponible : on recharge quand même */ }
  location.reload();
}

// Libellé, couleur et icône d'une rareté (gris neutre si la rareté est inconnue).
function infoRarete(rarete) {
  const r = RARETES_AFFICHAGE[rarete] ?? { label: rarete, couleur: "#777" };
  return { ...r, icone: avecVersion(`/images/MonkeysRarities/rarity_${rarete}.png`) };
}

// Traits des singes (champ "traits" de monkeys.json, 1 à 3 par singe) : réunir des porteurs d'un même trait
// déclenche une résonance en combat. Nom, icône et couleur identiques sur toutes les pages
// (copie de src/data/resonances.json, vérifiée par les tests).
const TRAITS_AFFICHAGE = {
  rempart:         { nom: "Rempart",         icone: "🏰", couleur: "#6fa8dc" },
  sacrifice:       { nom: "Sacrifice",       icone: "🩸", couleur: "#e0457b" },
  euphorie:        { nom: "Euphorie",        icone: "😄", couleur: "#ffd23f" },
  chaos:           { nom: "Chaos",           icone: "🌀", couleur: "#ff6b3d" },
  tueurs_de_geant: { nom: "Tueurs de géant", icone: "🏹", couleur: "#e8913a" },
  devouement:      { nom: "Dévouement",      icone: "💚", couleur: "#5fd38d" },
  malediction:     { nom: "Malédiction",     icone: "💀", couleur: "#a487e0" },
  renforcement:    { nom: "Renforcement",    icone: "💪", couleur: "#9fb3c8" },
};

// Ce que fait chaque trait, en une phrase sans chiffres (les chiffres de chaque palier : effetTrait).
const DESCRIPTIONS_TRAITS = {
  rempart: "Les porteurs subissent moins de dégâts, encore moins quand leurs PV baissent.",
  sacrifice: "Quand un porteur tombe, les autres porteurs en vie (réserve comprise) gagnent une part de ses PV max, ATK et DEF.",
  euphorie: "Les porteurs gagnent de l'ATK à chaque tour, jusqu'à un plafond.",
  chaos: "Après une attaque, un porteur peut frapper une seconde fois un ennemi au hasard.",
  tueurs_de_geant: "Les coups des porteurs infligent un bonus selon les PV max de la cible, plafonné selon leur ATK.",
  devouement: "Chaque coup d'un porteur soigne l'allié le plus blessé d'une part des dégâts infligés.",
  malediction: "À chaque tour, l'ennemi qui a le plus de PV perd de la DEF et de l'ATK, cumulable.",
  renforcement: "Les porteurs gagnent des PV, de l'ATK et de la DEF.",
};

// Icône, couleur et nom d'un trait, ou null pour un trait inconnu.
function infoTrait(id) {
  const t = TRAITS_AFFICHAGE[id];
  return t ? { id, ...t } : null;
}

// Traits connus d'une espèce, dans son ordre (liste vide pour d'anciennes données sans traits).
function traitsDe(espece) {
  return (espece?.traits ?? []).filter((t) => TRAITS_AFFICHAGE[t]);
}

// Nombre de porteurs de chaque trait parmi des espèces (un singe compte pour chacun de ses traits).
function compterTraitsEspeces(especes) {
  const compte = {};
  for (const e of especes) for (const t of traitsDe(e)) compte[t] = (compte[t] ?? 0) + 1;
  return compte;
}

// Pourcentage à la française (les valeurs augmentées par l'arbre peuvent avoir une décimale : 6,3)
function pctFr(v) {
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

// Effet d'un palier en quelques mots, calculé depuis ses valeurs (src/data/resonances.json, Harmonie et Chœur compris).
function effetTrait(id, v) {
  if (!v) return "";
  if (id === "rempart") return `−${pctFr(v.reductionBase)} % de dégâts subis, jusqu'à −${pctFr(v.reductionBase + v.reductionBonus)} % à 0 PV`;
  if (id === "sacrifice") return `+${pctFr(v.partStats)} % des PV max, ATK et DEF du porteur tombé`;
  if (id === "euphorie") return `+${pctFr(v.atkParTour)} % d'ATK par tour, jusqu'à +${pctFr(v.atkPlafond)} %`;
  if (id === "chaos") return `${pctFr(v.chance)} % de chances de frapper à nouveau, à ${pctFr(v.partDegats)} % des dégâts`;
  if (id === "tueurs_de_geant") return `+${pctFr(v.pvMaxPct)} % des PV max de la cible, au plus ${pctFr(v.plafondAtkPct)} % de l'ATK`;
  if (id === "devouement") return `Soin de ${pctFr(v.soinPct)} % des dégâts infligés`;
  if (id === "malediction") return `−${pctFr(v.parTour)} % de DEF et d'ATK par tour, jusqu'à −${pctFr(v.plafond)} %`;
  if (id === "renforcement") return `+${pctFr(v.statsPct)} % de PV, d'ATK et de DEF`;
  return "";
}

// Index (0 = aucun) du plus haut palier atteint avec `nb` porteurs.
function indexPalierTrait(paliers, nb) {
  return paliers.filter((p) => nb >= p).length;
}

// Panneau listant les 8 traits : rôle, description et effet de chaque palier.
// `resonances` : catalogue renvoyé par /equipe ; `compte` : { trait: porteurs dans l'équipe } ;
// `enAvant` : trait à faire défiler et à mettre en évidence.
function ouvrirInfosTraits(resonances, compte = {}, enAvant = null) {
  let dialogue = document.getElementById("infos-traits");
  if (!dialogue) {
    dialogue = document.createElement("dialog");
    dialogue.id = "infos-traits";
    dialogue.setAttribute("aria-labelledby", "infos-traits-titre");
    // Clic en dehors du panneau : fermeture
    dialogue.addEventListener("click", (e) => { if (e.target === dialogue) dialogue.close(); });
    document.body.appendChild(dialogue);
  }
  const ids = Object.keys(resonances?.traits ?? {}).filter((id) => infoTrait(id));
  const sections = ids.map((id) => {
    const t = resonances.traits[id];
    const nb = compte[id] ?? 0;
    const atteint = indexPalierTrait(resonances.paliers, nb);
    const lignes = resonances.paliers.map((seuil, i) => `
      <tr class="${atteint === i + 1 ? "atteint" : ""}">
        <th scope="row">${seuil} singes</th><td>${effetTrait(id, t.paliers[i])}</td>
      </tr>`).join("");
    return `<section class="infos-trait${id === enAvant ? " en-avant" : ""}" data-trait="${id}">
              <h3>${badgeTraitHTML(id, true)} <span class="role">${t.role}</span> <span class="dans-equipe">${nb} dans l'équipe</span></h3>
              <p>${DESCRIPTIONS_TRAITS[id] ?? ""}</p>
              <table>${lignes}</table>
            </section>`;
  }).join("");
  dialogue.innerHTML = `
    <div class="infos-traits-entete">
      <h2 id="infos-traits-titre">Traits</h2>
      <button type="button" class="fermer" aria-label="Fermer">×</button>
    </div>
    <p class="infos-traits-aide">Plus l'équipe compte de singes d'un même trait (renfort compris), plus son effet est fort.</p>
    ${sections}`;
  dialogue.querySelector(".fermer").addEventListener("click", () => dialogue.close());
  if (!dialogue.open) dialogue.showModal();
  dialogue.querySelector(".en-avant")?.scrollIntoView({ block: "nearest" });
}

// Badge d'un trait (chaîne vide pour un trait inconnu). `grand` : version pour les fiches.
function badgeTraitHTML(id, grand = false) {
  const t = infoTrait(id);
  if (!t) return "";
  return `<span class="trait${grand ? " grand" : ""}" style="--trait:${t.couleur}">${t.icone} ${t.nom}</span>`;
}

// Badges de tous les traits d'une espèce, rangés ensemble (chaîne vide si elle n'en a pas).
function badgesTraitsHTML(espece, grand = false) {
  const traits = traitsDe(espece);
  return traits.length ? `<span class="traits">${traits.map((t) => badgeTraitHTML(t, grand)).join("")}</span>` : "";
}

// Ligne des traits dans le descriptif d'un singe (chaîne vide s'il n'en a pas) : toujours séparée de la rareté.
function ligneTraitsHTML(espece, grand = false) {
  const badges = badgesTraitsHTML(espece, grand);
  return badges ? `<div class="ligne-traits">${badges}</div>` : "";
}

// Appel au serveur. `corps` présent → POST JSON. Renvoie { ok, status, data } ;
// `data.erreur` contient le message du serveur en cas d'échec.
// Une coupure réseau fait échouer la promesse, comme fetch.
async function api(chemin, { methode, corps } = {}) {
  const options = { method: methode ?? (corps === undefined ? "GET" : "POST") };
  if (corps !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(corps);
  }
  const reponse = await fetch(chemin, options);
  verifierVersion(reponse);
  let data;
  try {
    data = await reponse.json();
  } catch {
    data = reponse.ok ? {} : { erreur: `erreur ${reponse.status}` };
  }
  return { ok: reponse.ok, status: reponse.status, data };
}

// Renvoie le joueur connecté ({ pseudo }), ou redirige vers l'accueil et renvoie null.
async function exigerConnexion() {
  const { ok, data } = await api("/moi");
  if (!ok) {
    window.location.replace("/");
    return null;
  }
  return data;
}

// Attend le chargement des images (succès ou échec) pour éviter l'affichage par morceaux.
function prechargerImages(urls) {
  return Promise.all([...new Set(urls)].map((url) => new Promise((resolve) => {
    const image = new Image();
    image.onload = image.onerror = resolve;
    image.src = url;
  })));
}

function formaterHeure(iso) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Ajoute un message de chat dans `zone` et fait défiler vers le bas.
// Construit avec textContent : le texte saisi n'est jamais interprété en HTML.
function ajouterBulleChat(zone, m) {
  const bulle = document.createElement("div");
  bulle.className = "msg" + (m.moi ? " moi" : "");
  bulle.dataset.id = String(m.id);

  const entete = document.createElement("div");
  const auteur = document.createElement("span");
  auteur.className = "auteur";
  auteur.textContent = m.pseudo;
  const heure = document.createElement("span");
  heure.className = "heure";
  heure.textContent = formaterHeure(m.created_at);
  entete.append(auteur, heure);

  const texte = document.createElement("div");
  texte.className = "texte";
  texte.textContent = m.texte;

  bulle.append(entete, texte);
  zone.appendChild(bulle);
  zone.scrollTop = zone.scrollHeight;
}

// ---------- Objets (armes…) : textes communs (pages Équipe et Objets) ----------

// Effets d'un objet ({ atkPct: 8, crit: 12 }) en texte : « ATK +8 % · Critique +12 ».
// Avec `stats` (stats de base d'un singe), les pourcentages sont chiffrés : « ATK +8 % (+52) ».
const LIBELLES_EFFETS_OBJET = [
  ["hpPct", "PV", " %", "hp"], ["atkPct", "ATK", " %", "atk"], ["defPct", "DEF", " %", "def"],
  ["crit", "Critique", ""], ["critdmg", "Dégâts crit", ""],
];
function texteEffetsObjet(valeurs, stats = null) {
  return LIBELLES_EFFETS_OBJET
    .filter(([cle]) => valeurs?.[cle])
    .map(([cle, libelle, unite, stat]) => {
      const chiffre = stat && stats?.[stat] ? ` (+${Math.round((stats[stat] * valeurs[cle]) / 100)})` : "";
      return `${libelle} +${String(valeurs[cle]).replace(".", ",")}${unite}${chiffre}`;
    })
    .join(" · ");
}

// Tuile d'un objet (arme, équipement) : l'émoji en grand, le tier en chiffres romains dans le coin en haut à droite (.rang),
// la tête du singe qui le porte dans le coin en bas, et au survol une infobulle (nom, effets, `details`).
// `stats` : stats de base d'un singe, pour chiffrer les pourcentages ; `porteur` : singe du Monkeydex qui le porte.
function tuileObjetHTML(catalogue, o, { stats = null, porteur = null, details = [], classe = "" } = {}) {
  const c = catalogue[o.objet];
  const nom = nomObjet(catalogue, o.objet, o.tier);
  const effets = texteEffetsObjet(o.valeurs, stats);
  const lignes = [effets, ...(porteur ? [`Porté par ${porteur.espece.nom}`] : []), ...details];
  return `<button type="button" class="tuile-objet ${classe}" data-tier="${o.tier}" data-id="${o.id}" aria-label="${nom} : ${effets}">`
    + `<span class="emoji">${c.icone}</span><span class="rang">${ROMAINS[o.tier] ?? o.tier}</span>`
    + (porteur ? `<img class="porteur-mini" src="${porteur.image}" alt="">` : "")
    + `<span class="infobulle"><b>${nom}</b>${lignes.map((l) => `<span>${l}</span>`).join("")}</span></button>`;
}

// Nom d'un objet avec son tier en chiffres romains (« Épée III »).
function nomObjet(catalogue, objet, tier) {
  return `${catalogue[objet]?.nom ?? objet} ${ROMAINS[tier] ?? tier}`;
}

// ---------- Perks : textes communs (pages Équipe et Perks) ----------

const ROMAINS = ["", "I", "II", "III", "IV", "V", "VI"];

// Nom affiché : « Peau de fer II », ou « Taunt » pour un perk sans tier.
function nomPerk(catalogue, perk, tier) {
  const c = catalogue[perk];
  return c.nbTiers > 0 ? `${c.nom} ${ROMAINS[tier]}` : c.nom;
}

function valeursPerk(catalogue, perk, tier) {
  return catalogue[perk].tiers?.[tier - 1] ?? {};
}

// Effet en quelques mots.
function effetPerk(catalogue, perk, tier) {
  const v = valeursPerk(catalogue, perk, tier);
  if (perk === "ironskin") return `+${v.defensePct} % DEF`;
  if (perk === "taunt") return `Attire les attaques · +${v.pvPct} % PV`;
  if (perk === "blossoming") return `Soin ${v.soinPct} % / 2 tours`;
  if (perk === "frenesie") return `+${v.atkParCoupPct} % ATK par coup (×${v.cumulMax})`;
  if (perk === "etendard") return `+${v.atkGroupePct} % ATK au groupe`;
  if (perk === "second_souffle") return `Revient à ${v.retourPvPct} % PV`;
  if (perk === "perforant") return `Ignore ${v.ignoreDefPct} % DEF`;
  return "";
}

// Défense ajoutée par Peau de fer à un singe de défense `def` (même calcul que le serveur).
function bonusDefensePerk(catalogue, perk, tier, def) {
  const pct = valeursPerk(catalogue, perk, tier).defensePct ?? 0;
  return Math.round((def * pct) / 100);
}

// PV ajoutés par Taunt à un singe de `hp` PV (même calcul que le serveur).
function bonusPvPerk(catalogue, perk, tier, hp) {
  const pct = valeursPerk(catalogue, perk, tier).pvPct ?? 0;
  return Math.round((hp * pct) / 100);
}

// Effet en quelques mots, chiffré pour le singe qui le porte (`stats` : ses stats actuelles).
function effetPerkSur(catalogue, perk, tier, stats) {
  const texte = effetPerk(catalogue, perk, tier);
  if (perk === "ironskin" && stats) return `${texte} (+${bonusDefensePerk(catalogue, perk, tier, stats.def)})`;
  if (perk === "taunt" && stats) return `${texte} (+${bonusPvPerk(catalogue, perk, tier, stats.hp)})`;
  return texte;
}

// ---------- Éveil ----------

// Étoiles d'éveil (★ atteintes, ☆ restantes) : indicateur visuel du niveau d'éveil.
function etoilesEveilHTML(niveau, max) {
  return `<span class="etoiles-eveil" title="Éveil ${niveau}/${max}" aria-label="Éveil ${niveau} sur ${max}">`
    + `${"★".repeat(niveau)}<span class="restantes">${"☆".repeat(Math.max(0, max - niveau))}</span></span>`;
}

// Ce qu'un niveau d'éveil change à une compétence (réglages `avant` → `apres`) : « dégâts ×2,8 · ignore 50 % de la DEF ».
const LIBELLES_REGLAGES = {
  critMult: (v) => `dégâts ×${v}`,
  percePct: (v) => `ignore ${v} % de la DEF`,
  atkPct: (v) => `+${v} % d'ATK`,
  defPct: (v) => `+${v} % de DEF`,
  cumulMax: (v) => `cumulable ${v} fois`,
  bouclierPct: (v) => `bouclier de ${v} % des PV max`,
  tousLes: (v) => `tous les ${v} tours`,
};
function texteAmeliorationCompetence(avant, apres) {
  return Object.keys(LIBELLES_REGLAGES)
    .filter((cle) => apres?.[cle] !== undefined && apres[cle] !== avant?.[cle])
    .map((cle) => LIBELLES_REGLAGES[cle](String(apres[cle]).replace(".", ",")))
    .join(" · ");
}

// Description d'une compétence de singe, calculée à partir de ses réglages (src/data/competences.json).
function descriptionCompetence(c) {
  if (c?.id === "presage") return `Tous les ${c.tousLes} tours, frappe l'ennemi qui a le moins de PV : coup critique garanti, dégâts ×${String(c.critMult).replace(".", ",")}, ignore ${c.percePct} % de sa DEF.`;
  if (c?.id === "decret_royal") return `Tous les ${c.tousLes} tours, donne +${c.atkPct} % d'ATK, +${c.hpPct} % de PV et +${c.defPct} % de DEF aux singes de sa rotation (lui compris), cumulable jusqu'à ${c.cumulMax} fois.`;
  if (c?.id === "arc_en_ciel") return `Tous les ${c.tousLes} tours, donne aux singes de sa rotation (lui compris) un bouclier de ${String(c.bouclierPct).replace(".", ",")} % de leurs PV max, qui absorbe les dégâts avant les PV. Le nouveau bouclier remplace l'ancien.`;
  return "";
}

// Description détaillée.
function descriptionPerk(catalogue, perk, tier) {
  const v = valeursPerk(catalogue, perk, tier);
  if (perk === "ironskin") return `Le singe qui le porte gagne +${v.defensePct} % de DEF.`;
  if (perk === "taunt") return `Les ennemis attaquent en priorité le singe qui le porte, tant qu'il est en vie. Il gagne +${v.pvPct} % de PV.`;
  if (perk === "blossoming") return `Tous les 2 tours, soigne l'allié qui a le moins de PV de ${v.soinPct} % de ses PV max.`;
  if (perk === "frenesie") return `Chaque coup porté donne +${v.atkParCoupPct} % d'ATK au singe qui le porte, jusqu'à ${v.cumulMax} fois.`;
  if (perk === "etendard") return `Les singes de son groupe (lui compris) gagnent +${v.atkGroupePct} % d'ATK. Plusieurs Étendards dans un groupe : +${v.plafondPct} % au plus.`;
  if (perk === "second_souffle") return `Une fois par combat, le singe qui le porte revient à ${v.retourPvPct} % de ses PV au lieu d'être K.O.`;
  if (perk === "perforant") return `Les attaques du singe qui le porte ignorent ${v.ignoreDefPct} % de la DEF de la cible.`;
  return "";
}
