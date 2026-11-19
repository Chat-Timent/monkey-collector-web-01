// Page d'un type d'objet tiré à la loterie (Armes, Équipements). Réglages lus sur <body> :
//   data-api="/armes"  data-tirer="Tirer une arme"  data-vide="Aucune arme pour l'instant."
//   data-non-equipe="Non équipée"
// Chaque objet tiré est un exemplaire unique, sans niveau : une tuile par exemplaire (émoji, tier dans le coin,
// infobulle au survol). Un clic ouvre sa fiche, d'où le joueur peut le démanteler (cristaux rendus selon le tier).
// Script classique : utilise Barre (barre.js), api, exigerConnexion, iconeHTML, echapperHTML, ROMAINS, nomObjet, texteEffetsObjet,
// tuileObjetHTML (commun.js).
(() => {
  const reglages = document.body.dataset;
  const $ = (id) => document.getElementById(id);
  let donnees = null;       // réponse GET de l'API
  let singes = {};          // espece → singe possédé (image, nom), pour afficher le porteur
  let dernierTire = null;   // id de l'exemplaire tiré à l'instant, mis en valeur
  let enCours = false;

  const porteurDe = (o) => (o.espece ? singes[o.espece] ?? null : null);

  // Exemplaires du meilleur tier au plus faible, puis par objet, puis du plus récent au plus ancien
  function tries() {
    const nom = (o) => donnees.catalogue[o.objet].nom;
    return [...donnees.obtenus].sort((a, b) => b.tier - a.tier || nom(a).localeCompare(nom(b)) || b.id - a.id);
  }

  function majLoterie() {
    const r = donnees.ressource;
    $("tirer").innerHTML = `🎰 ${echapperHTML(reglages.tirer)} · ${donnees.prix} ${iconeHTML(r.icone)}`;
    $("tirer").disabled = enCours || donnees.stock < donnees.prix;
    const nom = r.nom.charAt(0).toUpperCase() + r.nom.slice(1);
    $("stock").innerHTML = `${iconeHTML(r.icone)} ${echapperHTML(nom)} : ${donnees.stock.toLocaleString("fr-FR")}`;
    // Barre du haut : tickets dépensés au tirage, cristaux gagnés au démantèlement
    Barre.afficherRessource(r.id, donnees.stock);
    Barre.afficherRessource(donnees.ressourceDemantelement.id, donnees.stockDemantelement);
  }

  function ouvrirDetail(id, message = "") {
    const o = donnees.obtenus.find((x) => x.id === id);
    if (!o) {
      $("fond").hidden = true;
      return;
    }
    const c = donnees.catalogue[o.objet];
    const porteur = porteurDe(o);
    const zone = $("detail");
    zone.innerHTML = `
      <div class="detail-tuile">${tuileObjetHTML(donnees.catalogue, o, { classe: "grande" })}</div>
      <div class="nom"></div>
      <p class="effet"></p>
      <div class="ligne-porteur"></div>
      <button type="button" class="demanteler"></button>
      <p class="message-detail"></p>
      <div class="tiers"></div>`;
    zone.querySelector(".nom").textContent = nomObjet(donnees.catalogue, o.objet, o.tier);
    zone.querySelector(".effet").textContent = texteEffetsObjet(o.valeurs);
    const lignePorteur = zone.querySelector(".ligne-porteur");
    if (porteur) {
      lignePorteur.className = "porteur";
      lignePorteur.innerHTML = `<img alt=""><span></span>`;
      lignePorteur.querySelector("img").src = porteur.image;
      lignePorteur.querySelector("span").textContent = `Porté par ${porteur.espece.nom}`;
    } else {
      lignePorteur.className = "non-equipe";
      lignePorteur.textContent = `${reglages.nonEquipe} · à équiper depuis l'onglet Équipe`;
    }
    const bouton = zone.querySelector(".demanteler");
    if (o.espece) {
      bouton.textContent = "Équipé : retire-le d'abord depuis l'onglet Équipe";
      bouton.disabled = true;
    } else {
      bouton.innerHTML = `Démanteler · +${o.rembourse} ${iconeHTML(donnees.ressourceDemantelement.icone)}`;
      bouton.addEventListener("click", () => demanteler(o, bouton));
    }
    zone.querySelector(".message-detail").textContent = message;
    // Tous les tiers de l'objet, celui-ci en évidence
    const tiers = zone.querySelector(".tiers");
    c.tiers.forEach((valeurs, i) => {
      const t = i + 1;
      const ligne = document.createElement("div");
      ligne.className = "tier possede" + (t === o.tier ? " actuel" : "");
      ligne.innerHTML = `<span class="num"></span><span></span>`;
      ligne.querySelector(".num").textContent = ROMAINS[t];
      ligne.lastChild.textContent = texteEffetsObjet(valeurs);
      tiers.appendChild(ligne);
    });
    $("fond").hidden = false;
  }

  async function demanteler(o, bouton) {
    if (enCours) return;
    enCours = true;
    bouton.disabled = true;
    try {
      const { ok, data } = await api(`${reglages.api}/demanteler`, { corps: { id: o.id } });
      if (ok) {
        const { demantelement: d, ...etat } = data;
        donnees = etat;
        $("fond").hidden = true;
        $("resultat").className = "nouveau";
        $("resultat").textContent = `${nomObjet(donnees.catalogue, d.objet, d.tier)} démantelé : +${d.rembourse} ${donnees.ressourceDemantelement.nom}`;
        afficherObjets();
      } else {
        ouvrirDetail(o.id, data.erreur);
      }
    } catch {
      ouvrirDetail(o.id, "Erreur réseau, réessaie.");
    }
    enCours = false;
    majLoterie(); // après enCours = false : sinon le bouton de tirage resterait grisé
  }

  function afficherObjets() {
    const zone = $("objets");
    zone.className = "tuiles";
    zone.innerHTML = "";
    if (donnees.obtenus.length === 0) {
      zone.className = "";
      zone.innerHTML = `<p class="vide"></p>`;
      zone.firstChild.textContent = reglages.vide;
      return;
    }
    zone.innerHTML = tries().map((o) => tuileObjetHTML(donnees.catalogue, o, {
      porteur: porteurDe(o),
      classe: o.id === dernierTire ? "flash" : "",
    })).join("");
    zone.querySelectorAll(".tuile-objet").forEach((t) => t.addEventListener("click", () => ouvrirDetail(Number(t.dataset.id))));
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
        dernierTire = tirage.id;
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

  const fermer = () => { $("fond").hidden = true; };
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
  }

  // Ressource ou objets gagnés par le cadeau ou les quêtes du footer
  document.addEventListener("recompense-recue", charger);

  exigerConnexion().then((moi) => { if (moi) charger(); });
})();
