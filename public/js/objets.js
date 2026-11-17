// Page d'un type d'objet tiré à la loterie (Armes, Équipements). Réglages lus sur <body> :
//   data-api="/armes"  data-tirer="Tirer une arme"  data-vide="Aucune arme pour l'instant."
//   data-non-equipe="Non équipée"
// Script classique : utilise api, exigerConnexion, ROMAINS, nomObjet, texteEffetsObjet (commun.js).
(() => {
  const reglages = document.body.dataset;
  const $ = (id) => document.getElementById(id);
  let donnees = null;       // réponse GET de l'API
  let singes = {};          // espece → singe possédé (image, nom), pour afficher le porteur
  let dernierTire = null;   // "objet:tier" à mettre en valeur
  let enCours = false;

  const cle = (o) => `${o.objet}:${o.tier}`;

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

  function ouvrirDetail(o) {
    const c = donnees.catalogue[o.objet];
    const zone = $("detail");
    zone.innerHTML = `<div class="icone"></div><div class="nom"></div><p class="effet"></p><p class="niveau"></p>`;
    zone.querySelector(".icone").textContent = c.icone;
    zone.querySelector(".nom").textContent = nomObjet(donnees.catalogue, o.objet, o.tier);
    zone.querySelector(".effet").textContent = texteEffetsObjet(o.valeurs);
    zone.querySelector(".niveau").textContent =
      `${texteNiveau(o)} · +${donnees.bonusParNiveauPct} % par niveau (max ${donnees.niveauMax})`;
    const porteur = o.espece ? lignePorteur(o.espece) : null;
    if (porteur) {
      zone.appendChild(porteur);
    } else {
      const note = document.createElement("p");
      note.className = "non-equipe";
      note.textContent = `${reglages.nonEquipe} · à équiper depuis l'onglet Équipe`;
      zone.appendChild(note);
    }
    // Tous les tiers de l'objet (valeurs au niveau 1), ceux obtenus en clair
    const possedes = new Set(donnees.obtenus.filter((x) => x.objet === o.objet).map((x) => x.tier));
    const liste = document.createElement("div");
    liste.className = "tiers";
    c.tiers.forEach((valeurs, i) => {
      const t = i + 1;
      const ligne = document.createElement("div");
      ligne.className = "tier" + (possedes.has(t) ? " possede" : "") + (t === o.tier ? " actuel" : "");
      ligne.innerHTML = `<span class="num"></span><span></span>`;
      ligne.querySelector(".num").textContent = ROMAINS[t];
      ligne.lastChild.textContent = texteEffetsObjet(valeurs);
      liste.appendChild(ligne);
    });
    zone.appendChild(liste);
    $("fond").hidden = false;
  }

  function afficherObjets() {
    const zone = $("objets");
    zone.innerHTML = "";
    if (donnees.obtenus.length === 0) {
      zone.innerHTML = `<p class="vide"></p>`;
      zone.firstChild.textContent = reglages.vide;
      return;
    }
    for (const o of donnees.obtenus) {
      const c = donnees.catalogue[o.objet];
      const carte = document.createElement("button");
      carte.type = "button";
      carte.className = "objet" + (dernierTire === cle(o) ? " flash" : "");
      carte.innerHTML = `<span class="icone"></span><span class="nom"></span><span class="effet"></span><span class="niveau"></span>`;
      carte.querySelector(".icone").textContent = c.icone;
      carte.querySelector(".nom").textContent = nomObjet(donnees.catalogue, o.objet, o.tier);
      carte.querySelector(".effet").textContent = texteEffetsObjet(o.valeurs);
      carte.querySelector(".niveau").textContent = texteNiveau(o);
      const porteur = o.espece ? lignePorteur(o.espece) : null;
      if (porteur) carte.appendChild(porteur);
      carte.addEventListener("click", () => ouvrirDetail(o));
      zone.appendChild(carte);
    }
  }

  // Phrase affichée après un tirage
  function texteTirage(t) {
    const c = donnees.catalogue[t.objet];
    const nom = `${c.icone} ${nomObjet(donnees.catalogue, t.objet, t.tier)}`;
    if (!t.doublon) return `${nom} !`;
    if (t.rembourse > 0) return `${nom} déjà au maximum : +${t.rembourse} ${donnees.ressource.icone}`;
    if (t.monte) return `${nom} passe au niveau ${t.niveau} !`;
    return `${nom} : doublon, +1 vers le niveau ${t.niveau + 1}`;
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
        $("resultat").className = tirage.doublon ? "doublon" : "nouveau";
        $("resultat").textContent = texteTirage(tirage);
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

  $("fond").addEventListener("click", (e) => { if (e.target === $("fond")) $("fond").hidden = true; });
  document.querySelector(".fermer").addEventListener("click", () => { $("fond").hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("fond").hidden = true; });

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
  }

  // Ressource ou objets gagnés par le cadeau ou les quêtes du footer
  document.addEventListener("recompense-recue", charger);

  exigerConnexion().then((moi) => { if (moi) charger(); });
})();
