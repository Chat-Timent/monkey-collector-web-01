// Barre commune des pages de jeu : starter (clic → arbre), onglets, coins, déconnexion.
// À charger après commun.js et arbre.js. Expose `Barre` :
//   Barre.profil            promesse de la réponse /profil ({ ok, data })
//   Barre.afficherStarter() met à jour niveau, XP et coins (ex. après un tirage)
//   Barre.afficherPoints()  met à jour la pastille des points d'arbre
// Un déblocage dans l'arbre déclenche l'événement "arbre-change" sur document.

const ONGLETS = [
  { titre: "Tirage", href: "/tirage.html", pages: ["/tirage.html"] },
  { titre: "Équipe", href: "/equipe.html", pages: ["/equipe.html"] },
  { titre: "Combat", href: "/combat.html", pages: ["/combat.html", "/pvp.html", "/aventure.html", "/ressources.html"] },
  { titre: "Perks", href: "/perks.html", pages: ["/perks.html"] },
  { titre: "Monkeydex", href: "/monkeydex.html", pages: ["/monkeydex.html"] },
];

const IMAGES_STARTERS = {
  "Fire monkey": avecVersion("/images/Starters/fire_starter.png"),
  "Ice monkey": avecVersion("/images/Starters/ice_starter.png"),
};

const Barre = (() => {
  const onglets = ONGLETS.map((o) => {
    const actif = o.pages.includes(window.location.pathname) ? ' class="actif"' : "";
    return `<a href="${o.href}"${actif}>${o.titre}</a>`;
  }).join("");

  document.body.classList.add("avec-barre");
  document.body.insertAdjacentHTML("afterbegin", `
    <header id="topbar">
      <div class="starter-bloc" id="starter-bloc" role="button" tabindex="0" title="Arbre de compétences">
        <div class="avatar">
          <img id="starter-img" alt="">
          <span id="points-arbre"></span>
        </div>
        <div class="starter-info">
          <div class="starter-ligne">
            <span id="starter-nom"></span>
            <span id="starter-niveau"></span>
          </div>
          <div class="xp-track"><div id="starter-xp-fill" class="xp-fill"></div></div>
          <div id="starter-xp"></div>
        </div>
      </div>
      <nav class="onglets">${onglets}</nav>
      <div class="droite-topbar">
        <div class="ressource" title="Coins">
          <span class="icone">💰</span>
          <span id="coins" class="valeur">0</span>
        </div>
        <button id="deconnexion" type="button">Déconnexion</button>
      </div>
    </header>
    <div id="arbre" role="dialog" aria-label="Arbre de compétences">
      <div class="arbre-fenetre">
        <button id="arbre-fermer" aria-label="Fermer">×</button>
        <div class="arbre-entete">
          <h2>Arbre de compétences</h2>
          <span id="arbre-points"></span>
          <button id="arbre-recentrer" type="button">Recentrer</button>
        </div>
        <p id="arbre-message"></p>
        <div id="arbre-vue">
          <svg id="arbre-svg" aria-label="Nœuds de l'arbre"><g id="arbre-monde"></g></svg>
          <div id="arbre-bulle" hidden></div>
        </div>
      </div>
    </div>`);

  const img = document.getElementById("starter-img");
  img.addEventListener("error", () => img.classList.add("cachee"));
  img.addEventListener("load", () => img.classList.remove("cachee"));

  function afficherStarter(starter) {
    if (!starter) return;
    const chemin = IMAGES_STARTERS[starter.nom];
    if (chemin && !img.src.endsWith(chemin)) img.src = chemin;
    const seuil = starter.niveau * 100;
    document.getElementById("starter-nom").textContent = starter.nom;
    document.getElementById("starter-niveau").textContent = `Niv. ${starter.niveau}`;
    document.getElementById("starter-xp-fill").style.width = Math.min(100, Math.round((starter.xp / seuil) * 100)) + "%";
    document.getElementById("starter-xp").textContent = `${starter.xp} / ${seuil} XP`;
    document.getElementById("coins").textContent = starter.coins ?? 0;
  }

  function afficherPoints(points) {
    if (points === undefined) return;
    const pastille = document.getElementById("points-arbre");
    pastille.textContent = points;
    pastille.classList.toggle("visible", points > 0);
  }

  initArbre({
    onChangement: (etat) => {
      afficherPoints(etat.points);
      document.dispatchEvent(new CustomEvent("arbre-change", { detail: etat }));
    },
  });

  const bloc = document.getElementById("starter-bloc");
  bloc.addEventListener("click", ouvrirArbre);
  bloc.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ouvrirArbre(); }
  });

  document.getElementById("deconnexion").addEventListener("click", async () => {
    await api("/deconnexion", { methode: "POST" });
    window.location.replace("/");
  });

  // Profil chargé une seule fois ; la page peut l'attendre via Barre.profil.
  // Sans starter, le joueur est envoyé le choisir. Sans session, exigerConnexion() de la page redirige.
  const profil = api("/profil").then((reponse) => {
    if (reponse.ok) {
      if (!reponse.data.starter) window.location.replace("/starter.html");
      afficherStarter(reponse.data.starter);
      afficherPoints(reponse.data.pointsArbre);
    }
    return reponse;
  }).catch(() => ({ ok: false, status: 0, data: {} }));

  return { profil, afficherStarter, afficherPoints };
})();
