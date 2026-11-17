// Page d'un type d'objet tiré à la loterie (Armes, Équipements). Réglages lus sur <body> :
//   data-api="/armes"  data-tirer="Tirer une arme"  data-vide="Aucune arme pour l'instant."
//   data-non-equipe="Non équipée"
// Les objets sont empilables : une carte par objet et par tier (avec le nombre d'exemplaires) ; la fiche liste
// les exemplaires, que le joueur peut démanteler (doublon pour un autre exemplaire, sinon ressource rendue).
// Script classique : utilise api, exigerConnexion, ROMAINS, nomObjet, texteEffetsObjet (commun.js).
(() => {
  const reglages = document.body.dataset;
  const $ = (id) => document.getElementById(id);
  let donnees = null;       // réponse GET de l'API
  let singes = {};          // espece → singe possédé (image, nom), pour afficher le porteur
  let dernierTire = null;   // "objet:tier" à mettre en valeur
  let ouvert = null;        // "objet:tier" dont la fiche est ouverte
  let enCours = false;

  const cle = (o) => `${o.objet}:${o.tier}`;

  // Exemplaires regroupés par objet et par tier, dans l'ordre de l'API (meilleur niveau d'abord)
  function groupes() {
    const parCle = new Map();
    for (const o of donnees.obtenus) {
      if (!parCle.has(cle(o))) parCle.set(cle(o), []);
      parCle.get(cle(o)).push(o);
    }
    return parCle;
  }

  function majLoterie() {
    const r = donnees.ressource;
    $("tirer").textContent = `🎰 ${reglages.tirer} · ${donnees.prix} ${r.icone}`;
    $("tirer").disabled = enCours || donnees.stock < donnees.prix;
    $("stock").textContent = `${r.icone} ${donnees.stock.toLocaleString("fr-FR")} ${r.nom}`;
  }

  function texteNiveau(o) {
    if (o.doublonsRequis === null) return `Niv. ${o.niveau} · max`;
    return `Niv. ${o.niveau} · ${o.doublons}/${o.doublonsRequis} doublon${o.doublonsRequis > 1 ? "s" : ""}`;
  }

  function lignePorteur(espece) {
    const s = singes[espece];
    if (!s) return null;
    const ligne = document.createElement("div");
    ligne.className = "porteur";
    ligne.innerHTML = `<img alt=""><span></span>`;
    ligne.querySelector("img").src = s.image;
    ligne.querySelector("span").textContent = s.espece.nom;
    return ligne;
  }

  // Ce que rapporterait le démantèlement d'un exemplaire
  function texteDemantelement(o) {
    const d = o.demantelement;
    return d.vers ? `+1 doublon au niv. ${d.niveauVers}` : `+${d.rembourse} ${donnees.ressource.icone}`;
  }

  function ouvrirDetail(k, message = "") {
    const exemplaires = groupes().get(k);
    if (!exemplaires) {
      $("fond").hidden = true;
      ouvert = null;
      return;
    }
    ouvert = k;
    const meilleur = exemplaires[0];
    const c = donnees.catalogue[meilleur.objet];
    const zone = $("detail");
    zone.innerHTML = `<div class="icone"></div><div class="nom"></div><p class="effet"></p><p class="niveau"></p>`;
    zone.querySelector(".icone").textContent = c.icone;
    zone.querySelector(".nom").textContent = nomObjet(donnees.catalogue, meilleur.objet, meilleur.tier)
      + (exemplaires.length > 1 ? ` ×${exemplaires.length}` : "");
    zone.querySelector(".effet").textContent = texteEffetsObjet(meilleur.valeurs);
    zone.querySelector(".niveau").textContent = `+${donnees.bonusParNiveauPct} % par niveau (max ${donnees.niveauMax})`;

    // Exemplaires : niveau, porteur, et bouton Démanteler (seulement s'il n'est pas équipé)
    const liste = document.createElement("div");
    liste.className = "exemplaires";
    for (const o of exemplaires) {
      const ligne = document.createElement("div");
      ligne.className = "exemplaire";
      ligne.innerHTML = `<div class="infos"><span class="niv"></span><span class="effet-ex"></span></div><button type="button"></button>`;
      ligne.querySelector(".niv").textContent = texteNiveau(o);
      ligne.querySelector(".effet-ex").textContent = texteEffetsObjet(o.valeurs);
      const porteur = o.espece ? lignePorteur(o.espece) : null;
      if (porteur) ligne.querySelector(".infos").appendChild(porteur);
      else {
        const note = document.createElement("span");
        note.className = "non-equipe";
        note.textContent = reglages.nonEquipe;
        ligne.querySelector(".infos").appendChild(note);
      }
      const bouton = ligne.querySelector("button");
      if (o.espece) {
        bouton.textContent = "Équipé";
        bouton.disabled = true;
      } else {
        bouton.textContent = `Démanteler · ${texteDemantelement(o)}`;
        bouton.addEventListener("click", () => demanteler(o, bouton));
      }
      liste.appendChild(ligne);
    }
    zone.appendChild(liste);
    const msg = document.createElement("p");
    msg.className = "message-detail";
    msg.textContent = message;
    zone.appendChild(msg);
    const note = document.createElement("p");
    note.className = "non-equipe";
    note.textContent = "Les objets s'équipent depuis l'onglet Équipe.";
    zone.appendChild(note);

    // Tous les tiers de l'objet (valeurs au niveau 1), ceux obtenus en clair
    const possedes = new Set(donnees.obtenus.filter((x) => x.objet === meilleur.objet).map((x) => x.tier));
    const tiers = document.createElement("div");
    tiers.className = "tiers";
    c.tiers.forEach((valeurs, i) => {
      const t = i + 1;
      const ligne = document.createElement("div");
      ligne.className = "tier" + (possedes.has(t) ? " possede" : "") + (t === meilleur.tier ? " actuel" : "");
      ligne.innerHTML = `<span class="num"></span><span></span>`;
      ligne.querySelector(".num").textContent = ROMAINS[t];
      ligne.lastChild.textContent = texteEffetsObjet(valeurs);
      tiers.appendChild(ligne);
    });
    zone.appendChild(tiers);
    $("fond").hidden = false;
  }

  async function demanteler(o, bouton) {
    if (enCours) return;
    // Un exemplaire déjà monté perd ses niveaux : on demande confirmation
    if ((o.niveau > 1 || o.doublons > 0)
      && !window.confirm(`Cet exemplaire est au niveau ${o.niveau} : ses niveaux seront perdus. Le démanteler quand même ?`)) return;
    enCours = true;
    bouton.disabled = true;
    let message = "";
    try {
      const { ok, data } = await api(`${reglages.api}/demanteler`, { corps: { id: o.id } });
      if (ok) {
        const { demantelement: d, ...etat } = data;
        donnees = etat;
        if (d.vers) message = d.monte ? `Un exemplaire passe au niveau ${d.niveau} !` : "+1 doublon";
        else message = `+${d.rembourse} ${donnees.ressource.nom}`;
        afficherObjets();
        majLoterie();
      } else {
        message = data.erreur;
      }
    } catch {
      message = "Erreur réseau, réessaie.";
    }
    enCours = false;
    ouvrirDetail(cle(o), message);
  }

  function afficherObjets() {
    const zone = $("objets");
    zone.innerHTML = "";
    if (donnees.obtenus.length === 0) {
      zone.innerHTML = `<p class="vide"></p>`;
      zone.firstChild.textContent = reglages.vide;
      return;
    }
    for (const [k, exemplaires] of groupes()) {
      const meilleur = exemplaires[0];
      const c = donnees.catalogue[meilleur.objet];
      const carte = document.createElement("button");
      carte.type = "button";
      carte.className = "objet" + (dernierTire === k ? " flash" : "");
      carte.innerHTML = `<span class="icone"></span><span class="nom"></span><span class="effet"></span><span class="niveau"></span><span class="portes"></span>`;
      carte.querySelector(".icone").textContent = c.icone;
      carte.querySelector(".nom").textContent = nomObjet(donnees.catalogue, meilleur.objet, meilleur.tier)
        + (exemplaires.length > 1 ? ` ×${exemplaires.length}` : "");
      carte.querySelector(".effet").textContent = texteEffetsObjet(meilleur.valeurs);
      carte.querySelector(".niveau").textContent = texteNiveau(meilleur);
      const portes = exemplaires.filter((o) => o.espece).length;
      carte.querySelector(".portes").textContent = portes ? `${portes} équipé${portes > 1 ? "s" : ""}` : "";
      carte.addEventListener("click", () => ouvrirDetail(k));
      zone.appendChild(carte);
    }
  }

  $("tirer").addEventListener("click", async () => {
    if (enCours) return;
    enCours = true;
    majLoterie();
    $("message").textContent = "";
    try {
      const { ok, data } = await api(`${reglages.api}/loterie`, { methode: "POST" });
      if (ok) {
        const { tirage, ...etat } = data;
        donnees = etat;
        const c = donnees.catalogue[tirage.objet];
        $("resultat").className = "nouveau";
        $("resultat").textContent = `${c.icone} ${nomObjet(donnees.catalogue, tirage.objet, tirage.tier)} !`;
        dernierTire = cle(tirage);
        afficherObjets();
      } else {
        $("message").textContent = data.erreur;
      }
    } catch {
      $("message").textContent = "Erreur réseau, réessaie.";
    }
    enCours = false;
    majLoterie();
  });

  const fermer = () => { $("fond").hidden = true; ouvert = null; };
  $("fond").addEventListener("click", (e) => { if (e.target === $("fond")) fermer(); });
  document.querySelector(".fermer").addEventListener("click", fermer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermer(); });

  async function charger() {
    const [res, dex] = await Promise.all([api(reglages.api), api("/monkeydex")]);
    if (!res.ok) {
      $("message").textContent = res.data.erreur;
      return;
    }
    if (dex.ok) singes = Object.fromEntries(dex.data.singes.map((s) => [s.id, s]));
    donnees = res.data;
    majLoterie();
    afficherObjets();
    if (ouvert) ouvrirDetail(ouvert);
  }

  // Ressource ou objets gagnés par le cadeau ou les quêtes du footer
  document.addEventListener("recompense-recue", charger);

  exigerConnexion().then((moi) => { if (moi) charger(); });
})();
