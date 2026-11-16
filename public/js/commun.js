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

// Familles de singes (champ "categorie" de monkeys.json) : réunir des singes d'une même famille
// déclenche une résonance en combat. Icône et couleur identiques sur toutes les pages.
const FAMILLES_AFFICHAGE = {
  "Amour":      { icone: "💗", couleur: "#ff5c9a" },
  "Tristesse":  { icone: "💧", couleur: "#4da3ff" },
  "Joie":       { icone: "😄", couleur: "#ffd23f" },
  "Sang-froid": { icone: "😐", couleur: "#9fb3c8" },
  "Chaos":      { icone: "🔥", couleur: "#ff5a36" },
};

// Icône, couleur et nom d'une famille, ou null pour un singe sans famille.
function infoFamille(categorie) {
  const f = FAMILLES_AFFICHAGE[categorie];
  return f ? { nom: categorie, ...f } : null;
}

// Pourcentage à la française (les bonus augmentés par l'arbre peuvent avoir une décimale : 6,3)
function pctFr(v) {
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

// Panneau listant toutes les familles et leurs bonus par palier.
// `resonances` : catalogue renvoyé par /equipe ; `compte` : { famille: nombre dans l'équipe } ;
// `enAvant` : famille à faire défiler et à mettre en évidence.
function ouvrirInfosFamilles(resonances, compte = {}, enAvant = null) {
  let dialogue = document.getElementById("infos-familles");
  if (!dialogue) {
    dialogue = document.createElement("dialog");
    dialogue.id = "infos-familles";
    dialogue.setAttribute("aria-labelledby", "infos-familles-titre");
    // Clic en dehors du panneau : fermeture
    dialogue.addEventListener("click", (e) => { if (e.target === dialogue) dialogue.close(); });
    document.body.appendChild(dialogue);
  }
  const familles = Object.keys(resonances.categories).filter((nom) => infoFamille(nom));
  const sections = familles.map((nom) => {
    const nb = compte[nom] ?? 0;
    const lignes = resonances.paliers.map((seuil, i) => {
      const b = resonances.categories[nom].bonus[i];
      const atteint = nb >= seuil && (resonances.paliers[i + 1] === undefined || nb < resonances.paliers[i + 1]);
      return `<tr class="${atteint ? "atteint" : ""}">
                <th scope="row">${seuil} singes</th>
                <td>+${pctFr(b.hp)} % PV</td><td>+${pctFr(b.atk)} % ATK</td><td>+${pctFr(b.def)} % DEF</td>
              </tr>`;
    }).join("");
    return `<section class="infos-famille${nom === enAvant ? " en-avant" : ""}" data-famille="${nom}">
              <h3>${badgeFamilleHTML(nom, true)} <span class="dans-equipe">${nb} dans l'équipe</span></h3>
              <table>${lignes}</table>
            </section>`;
  }).join("");
  dialogue.innerHTML = `
    <div class="infos-familles-entete">
      <h2 id="infos-familles-titre">Familles</h2>
      <button type="button" class="fermer" aria-label="Fermer">×</button>
    </div>
    <p class="infos-familles-aide">Les singes d'une même famille dans l'équipe (renfort compris) gagnent ces bonus.</p>
    ${sections}`;
  dialogue.querySelector(".fermer").addEventListener("click", () => dialogue.close());
  if (!dialogue.open) dialogue.showModal();
  dialogue.querySelector(".en-avant")?.scrollIntoView({ block: "nearest" });
}

// Badge de famille (chaîne vide pour un singe sans famille). `grand` : version pour les fiches.
function badgeFamilleHTML(categorie, grand = false) {
  const f = infoFamille(categorie);
  if (!f) return "";
  return `<span class="famille${grand ? " grand" : ""}" style="--famille:${f.couleur}">${f.icone} ${f.nom}</span>`;
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
  return "";
}

// Description détaillée.
function descriptionPerk(catalogue, perk, tier) {
  const v = valeursPerk(catalogue, perk, tier);
  if (perk === "ironskin") return `Le singe qui le porte gagne +${v.defensePct} % de DEF.`;
  if (perk === "taunt") return `Les ennemis attaquent en priorité le singe qui le porte, tant qu'il est en vie. Il gagne +${v.pvPct} % de PV.`;
  if (perk === "blossoming") return `Tous les 2 tours, soigne l'allié qui a le moins de PV de ${v.soinPct} % de ses PV max.`;
  return "";
}
