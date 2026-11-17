// Barre commune des pages de jeu, en deux étages, plus le footer :
//   1. topbar  : le starter (clic → talents), les ressources possédées, la déconnexion
//   2. onglets : les catégories du jeu (Tirage, Équipe, Combat, Objets, Monkeydex, Talents)
//   3. footer  : quêtes du jour (parchemin), série de connexion (cadeau), annonces (mailbox),
//                chat global et classement, rangés dans des tiroirs
// À charger après commun.js et arbre.js. Expose `Barre` :
//   Barre.profil              promesse de la réponse /profil ({ ok, data })
//   Barre.afficherStarter()   met à jour niveau, XP et coins (ex. après un tirage)
//   Barre.afficherQuota()     met à jour le stock de tirages
//   Barre.afficherPoints()    met à jour la pastille des points de talents
//   Barre.afficherRessource() met à jour une ressource (acier, étoffe, essence)
// Un déblocage dans l'arbre déclenche l'événement "arbre-change" sur document,
// une récompense du cadeau ou des quêtes l'événement "recompense-recue".

const ONGLETS = [
  { titre: "Tirage", href: "/tirage.html", pages: ["/tirage.html"] },
  { titre: "Équipe", href: "/equipe.html", pages: ["/equipe.html"] },
  { titre: "Combat", href: "/combat.html", pages: ["/combat.html", "/pvp.html", "/aventure.html", "/ressources.html", "/eveil.html"] },
  { titre: "Objets", href: "/perks.html", pages: ["/perks.html", "/armes.html", "/equipements.html"] },
  { titre: "Monkeydex", href: "/monkeydex.html", pages: ["/monkeydex.html"] },
  // Les talents restent une fenêtre : l'arbre se lit par-dessus la page en cours.
  { titre: "Talents", action: "arbre", pages: [] },
];

// Ressources affichées en permanence. `coins` et `tirages` viennent du starter et du quota,
// les autres de `ressources` (/profil). Icônes alignées sur donjons.json et ressources-joueur.json.
const RESSOURCES_BARRE = [
  { id: "coins", icone: "💰", titre: "Coins" },
  { id: "tirages", icone: "🎟️", titre: "Tirages disponibles" },
  { id: "acier", icone: "🔩", titre: "Acier (armes)" },
  { id: "etoffe", icone: "🧵", titre: "Étoffe (équipements)" },
  { id: "essence", icone: "✨", titre: "Essence (éveil)" },
];

const IMAGES_STARTERS = {
  "Fire monkey": avecVersion("/images/Starters/fire_starter.png"),
  "Ice monkey": avecVersion("/images/Starters/ice_starter.png"),
};

const Barre = (() => {
  const chemin = window.location.pathname;

  const onglets = ONGLETS.map((o) => {
    const pastille = o.action === "arbre" ? `<span id="points-arbre"></span>` : "";
    if (o.action === "arbre") return `<a href="#" data-action="arbre">${o.titre}${pastille}</a>`;
    return `<a href="${o.href}"${o.pages.includes(chemin) ? ' class="actif"' : ""}>${o.titre}</a>`;
  }).join("");

  const ressources = RESSOURCES_BARRE.map((r) => `
    <span class="ressource" id="ressource-${r.id}" title="${r.titre}">
      <span class="icone">${r.icone}</span><span class="valeur">…</span>
    </span>`).join("");

  document.body.classList.add("avec-barre");
  document.body.insertAdjacentHTML("afterbegin", `
    <div id="barre-haut">
      <header id="topbar">
        <div class="starter-bloc" id="starter-bloc" role="button" tabindex="0" title="Arbre de talents">
          <div class="avatar"><img id="starter-img" alt=""></div>
          <div class="starter-info">
            <div class="starter-ligne">
              <span id="starter-nom"></span>
              <span id="starter-niveau"></span>
            </div>
            <div class="xp-track"><div id="starter-xp-fill" class="xp-fill"></div></div>
            <div id="starter-xp"></div>
          </div>
        </div>
        <div class="droite-topbar">
          <div class="ressources">${ressources}</div>
          <button id="deconnexion" type="button">Déconnexion</button>
        </div>
      </header>
      <nav id="barre-onglets">${onglets}</nav>
    </div>
    <aside class="tiroir" id="tiroir-chat" hidden>
      <div class="entete">
        <h2>Chat global</h2>
        <button type="button" data-fermer="chat" aria-label="Fermer">×</button>
      </div>
      <div id="messages" class="chat-texte"></div>
      <form id="formChat">
        <input id="texteChat" maxlength="200" placeholder="Parle à tout le monde…" autocomplete="off">
        <button id="envoyerChat" type="submit">Envoyer</button>
      </form>
      <div id="statutChat"></div>
    </aside>
    <aside class="tiroir" id="tiroir-classement" hidden>
      <div class="entete">
        <h2>Classement</h2>
        <button type="button" data-fermer="classement" aria-label="Fermer">×</button>
      </div>
      <!-- id préfixé : les pages Aventure et PVP ont leur propre #classement, et le premier
           trouvé dans le document gagnerait sur le leur -->
      <div id="classement-global" class="liste"></div>
    </aside>
    <aside class="tiroir" id="tiroir-annonces" hidden>
      <div class="entete">
        <h2>Annonces</h2>
        <button type="button" data-fermer="annonces" aria-label="Fermer">×</button>
      </div>
      <form id="formAnnonce" hidden>
        <textarea id="texteAnnonce" maxlength="500" rows="3" placeholder="Annonce pour tous les joueurs…"></textarea>
        <button type="submit">Publier</button>
      </form>
      <div id="statutAnnonce"></div>
      <div id="annonces" class="liste"></div>
    </aside>
    <aside class="tiroir" id="tiroir-serie" hidden>
      <div class="entete">
        <h2>Connexion quotidienne</h2>
        <button type="button" data-fermer="serie" aria-label="Fermer">×</button>
      </div>
      <div id="serie-jours" class="serie-jours"></div>
      <button id="serie-recuperer" class="recuperer" type="button" disabled>Récupérer</button>
      <div id="serie-obtenus" class="obtenus"></div>
    </aside>
    <aside class="tiroir" id="tiroir-quetes" hidden>
      <div class="entete">
        <h2>Quêtes du jour</h2>
        <button type="button" data-fermer="quetes" aria-label="Fermer">×</button>
      </div>
      <div id="quetes-liste" class="liste"></div>
      <div id="quetes-bonus" class="quete-bonus"></div>
      <div id="quetes-obtenus" class="obtenus"></div>
    </aside>
    <footer id="footer">
      <button class="onglet-footer icone-seule" type="button" data-tiroir="quetes" title="Quêtes du jour" aria-label="Quêtes du jour">
        📜<span class="point" id="point-quetes"></span>
      </button>
      <button class="onglet-footer icone-seule" type="button" data-tiroir="serie" title="Connexion quotidienne" aria-label="Connexion quotidienne">
        🎁<span class="point" id="point-serie"></span>
      </button>
      <button class="onglet-footer icone-seule mailbox" type="button" data-tiroir="annonces" title="Annonces" aria-label="Annonces">
        📬<span class="point" id="point-annonces"></span>
      </button>
      <button class="onglet-footer" type="button" data-tiroir="chat">
        💬 Chat <span class="en-ligne" id="compte-en-ligne"></span><span class="point" id="point-chat"></span>
      </button>
      <button class="onglet-footer" type="button" data-tiroir="classement" title="Classement" aria-label="Classement">
        🏆<span class="libelle">Classement</span>
      </button>
    </footer>
    <div id="arbre" role="dialog" aria-label="Arbre de talents">
      <div class="arbre-fenetre">
        <button id="arbre-fermer" aria-label="Fermer">×</button>
        <div class="arbre-entete">
          <h2>Talents</h2>
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

  // Valeur d'une ressource de la barre. `texte` remplace l'affichage par défaut (ex. « 86 / 100 »).
  function afficherRessource(id, valeur, texte = null) {
    const zone = document.getElementById(`ressource-${id}`);
    if (!zone) return;
    zone.querySelector(".valeur").textContent = texte ?? Number(valeur ?? 0).toLocaleString("fr-FR");
    zone.classList.toggle("vide", !valeur);
  }

  function afficherStarter(starter) {
    if (!starter) return;
    const chemin = IMAGES_STARTERS[starter.nom];
    if (chemin && !img.src.endsWith(chemin)) img.src = chemin;
    const seuil = starter.niveau * 100;
    document.getElementById("starter-nom").textContent = starter.nom;
    document.getElementById("starter-niveau").textContent = `Niv. ${starter.niveau}`;
    document.getElementById("starter-xp-fill").style.width = Math.min(100, Math.round((starter.xp / seuil) * 100)) + "%";
    document.getElementById("starter-xp").textContent = `${starter.xp} / ${seuil} XP`;
    afficherRessource("coins", starter.coins ?? 0);
  }

  // Stock de tirages : « 86 / 100 ». Le décompte avant la prochaine recharge reste sur la page Tirage.
  function afficherQuota(quota) {
    if (!quota) return;
    afficherRessource("tirages", quota.restants, `${quota.restants} / ${quota.max}`);
  }

  function afficherRessources(ressources) {
    if (!ressources) return;
    for (const id of ["acier", "etoffe", "essence"]) afficherRessource(id, ressources[id] ?? 0);
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
  document.getElementById("barre-onglets").addEventListener("click", (e) => {
    const lien = e.target.closest('[data-action="arbre"]');
    if (!lien) return;
    e.preventDefault();
    ouvrirArbre();
  });

  document.getElementById("deconnexion").addEventListener("click", async () => {
    await api("/deconnexion", { methode: "POST" });
    window.location.replace("/");
  });

  // ---------- Footer : chat global et classement ----------
  // Ouvert, le chat est relu toutes les 2 s ; fermé, toutes les 15 s, juste pour allumer la
  // pastille quand quelqu'un écrit. Le classement n'est chargé que si son tiroir est ouvert.

  const INTERVALLE_CHAT_OUVERT_MS = 2000;
  const INTERVALLE_CHAT_FERME_MS = 15000;
  const INTERVALLE_CLASSEMENT_MS = 10000;
  const INTERVALLE_EN_LIGNE_MS = 20000;
  const INTERVALLE_ANNONCES_MS = 60000;

  let tiroirOuvert = null;
  let minuteurTiroir = null;
  let dernierIdMessage = 0;
  let rafraichissementChat = null;
  let premierChargementChatFait = false;

  // Fenêtre glissante côté serveur : les messages sortis de la fenêtre sont retirés de l'affichage
  function retirerAnciens(plusAncienId) {
    if (!plusAncienId) return;
    const zone = document.getElementById("messages");
    for (const bulle of [...zone.children]) {
      if (Number(bulle.dataset.id) < plusAncienId) bulle.remove();
    }
  }

  // Une seule actualisation à la fois : si une tourne déjà, on attend celle-ci
  function rafraichirChat() {
    if (rafraichissementChat) return rafraichissementChat;

    rafraichissementChat = (async () => {
      try {
        const { ok, data } = await api(`/chat?apres=${dernierIdMessage}`);
        if (!ok) return;
        const zone = document.getElementById("messages");
        for (const m of data.messages) {
          if (zone.querySelector(`[data-id="${m.id}"]`)) continue;
          ajouterBulleChat(zone, m);
          dernierIdMessage = Math.max(dernierIdMessage, m.id);
          // Tiroir fermé : un message de quelqu'un d'autre allume la pastille du bouton
          if (tiroirOuvert !== "chat" && !m.moi && premierChargementChatFait) {
            document.getElementById("point-chat").classList.add("visible");
          }
        }
        premierChargementChatFait = true;
        retirerAnciens(data.plusAncienId);
      } catch {
        // Une perte réseau ne doit pas bloquer le reste de la page.
      } finally {
        rafraichissementChat = null;
      }
    })();

    return rafraichissementChat;
  }

  async function chargerClassement() {
    const { ok, data } = await api("/classement");
    if (!ok) return;
    const zone = document.getElementById("classement-global");
    zone.innerHTML = "";
    if (data.joueurs.length === 0) {
      zone.innerHTML = `<p class="vide">Aucun joueur pour l'instant.</p>`;
      return;
    }
    data.joueurs.forEach((j, i) => {
      const ligne = document.createElement("div");
      ligne.className = "joueur" + (j.moi ? " moi" : "");
      const rang = document.createElement("span");
      rang.className = "rang";
      rang.textContent = i + 1;
      const pseudo = document.createElement("span");
      pseudo.className = "pseudo";
      pseudo.textContent = j.pseudo;
      const total = document.createElement("span");
      total.className = "total";
      total.textContent = j.total;
      ligne.append(rang, pseudo, total);
      zone.appendChild(ligne);
    });
  }

  function ouvrirTiroir(nom) {
    tiroirOuvert = tiroirOuvert === nom ? null : nom;
    for (const tiroir of document.querySelectorAll(".tiroir")) {
      tiroir.hidden = tiroir.id !== `tiroir-${tiroirOuvert}`;
    }
    for (const bouton of document.querySelectorAll(".onglet-footer")) {
      bouton.classList.toggle("ouvert", bouton.dataset.tiroir === tiroirOuvert);
    }
    clearInterval(minuteurTiroir);
    minuteurTiroir = null;
    if (tiroirOuvert === "chat") {
      document.getElementById("point-chat").classList.remove("visible");
      rafraichirChat();
      minuteurTiroir = setInterval(rafraichirChat, INTERVALLE_CHAT_OUVERT_MS);
      const zone = document.getElementById("messages");
      zone.scrollTop = zone.scrollHeight;
    } else if (tiroirOuvert === "classement") {
      chargerClassement();
      minuteurTiroir = setInterval(chargerClassement, INTERVALLE_CLASSEMENT_MS);
    } else if (tiroirOuvert === "annonces") {
      chargerAnnonces();
    } else if (tiroirOuvert === "serie" || tiroirOuvert === "quetes") {
      document.getElementById(`${tiroirOuvert}-obtenus`).innerHTML = "";
      chargerQuotidien();
    }
  }

  // ---------- Cadeau (série de connexion) et parchemin (quêtes du jour) ----------
  // Relus toutes les minutes et à l'ouverture de leur tiroir : la pastille s'allume quand une récompense attend.
  // Après une récupération, la barre est mise à jour et l'événement "recompense-recue" prévient la page
  // (stock de tirages, d'acier… affichés par la page elle-même).

  const INTERVALLE_QUOTIDIEN_MS = 60000;

  // Une récompense en petites pastilles « icône valeur » (nom complet en info-bulle)
  function lots(recompense) {
    return recompense.map((r) => {
      const lot = document.createElement("span");
      lot.className = "lot";
      lot.title = `${r.valeur} ${r.nom}`;
      lot.textContent = `${r.icone} ${r.valeur}`;
      return lot;
    });
  }

  function afficherSerie(serie) {
    const zone = document.getElementById("serie-jours");
    zone.innerHTML = "";
    for (const j of serie.jours) {
      const tuile = document.createElement("div");
      // Grille de 4 colonnes : le dernier jour (le gros lot) prend les deux cases restantes
      tuile.className = `jour-serie ${j.etat}${j.jour === serie.jours.length ? " large" : ""}`;
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = j.etat === "recu" ? `J${j.jour} ✓` : `J${j.jour}`;
      tuile.append(num, ...lots(j.recompense));
      zone.appendChild(tuile);
    }
    const bouton = document.getElementById("serie-recuperer");
    bouton.disabled = serie.recuperee;
    bouton.textContent = serie.recuperee ? "Reviens demain" : `Récupérer J${serie.courant}`;
  }

  function afficherQuetes({ quetes, bonus }) {
    const zone = document.getElementById("quetes-liste");
    zone.innerHTML = "";
    for (const q of quetes) {
      const ligne = document.createElement("div");
      ligne.className = "quete" + (q.reclamee ? " reclamee" : q.terminee ? " terminee" : "");
      const icone = document.createElement("span");
      icone.className = "icone";
      icone.textContent = q.icone;
      const corps = document.createElement("div");
      corps.className = "corps";
      const texte = document.createElement("div");
      texte.className = "texte";
      texte.textContent = q.texte;
      const jauge = document.createElement("div");
      jauge.className = "jauge";
      const plein = document.createElement("div");
      plein.style.width = `${Math.round((q.progres / q.objectif) * 100)}%`;
      jauge.appendChild(plein);
      const compte = document.createElement("div");
      compte.className = "compte";
      compte.textContent = `${q.progres.toLocaleString("fr-FR")} / ${q.objectif.toLocaleString("fr-FR")}`;
      corps.append(texte, jauge, compte);
      const droite = document.createElement("div");
      droite.className = "droite";
      droite.append(...lots(q.recompense));
      if (q.reclamee) {
        const fait = document.createElement("span");
        fait.className = "fait";
        fait.textContent = "✓";
        droite.appendChild(fait);
      } else if (q.terminee) {
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "recuperer";
        bouton.dataset.rang = q.rang;
        bouton.textContent = "Récupérer";
        droite.appendChild(bouton);
      }
      ligne.append(icone, corps, droite);
      zone.appendChild(ligne);
    }

    const blocBonus = document.getElementById("quetes-bonus");
    blocBonus.innerHTML = "";
    blocBonus.className = "quete-bonus" + (bonus.reclame ? " reclamee" : bonus.disponible ? " terminee" : "");
    const titre = document.createElement("div");
    titre.className = "texte";
    titre.textContent = "Bonus des 3 quêtes";
    const contenu = document.createElement("div");
    contenu.className = "lots";
    contenu.append(...lots(bonus.recompense));
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "recuperer";
    bouton.id = "bonus-recuperer";
    bouton.disabled = !bonus.disponible || bonus.reclame;
    bouton.textContent = bonus.reclame ? "✓ Récupéré" : "Récupérer";
    blocBonus.append(titre, contenu, bouton);
  }

  function afficherQuotidien(data) {
    afficherSerie(data.serie);
    afficherQuetes(data.quetes);
    document.getElementById("point-serie").classList.toggle("visible", data.pastilles.serie);
    document.getElementById("point-quetes").classList.toggle("visible", data.pastilles.quetes);
  }

  async function chargerQuotidien() {
    try {
      const { ok, data } = await api("/quotidien");
      if (ok) afficherQuotidien(data);
    } catch {
      // Réseau indisponible : on réessaiera au prochain tour
    }
  }

  // Ce qui a été obtenu (singe et objets offerts) sous le tiroir, ou l'erreur
  function afficherObtenus(zoneId, ok, data) {
    const zone = document.getElementById(zoneId);
    zone.innerHTML = "";
    zone.classList.toggle("erreur", !ok);
    if (!ok) {
      zone.textContent = data.erreur ?? "Erreur, réessaie.";
      return;
    }
    const titre = document.createElement("div");
    titre.textContent = "✓ Récupéré";
    zone.appendChild(titre);
    for (const o of data.obtenus) {
      const ligne = document.createElement("div");
      ligne.className = "obtenu" + (o.rarete ? " rare" : "");
      if (o.rarete) ligne.style.color = RARETES_AFFICHAGE[o.rarete]?.couleur ?? "";
      if (o.image) {
        const img = document.createElement("img");
        img.src = o.image;
        img.alt = "";
        ligne.appendChild(img);
      } else {
        ligne.append(`${o.icone} `);
      }
      ligne.append(o.texte);
      zone.appendChild(ligne);
    }
  }

  async function recuperer(bouton, chemin, corps, zoneId) {
    bouton.disabled = true;
    try {
      const { ok, data } = await api(chemin, { corps: corps ?? {} });
      afficherObtenus(zoneId, ok, data);
      if (!ok) {
        await chargerQuotidien();
        return;
      }
      afficherQuotidien(data);
      afficherStarter(data.starter);
      afficherQuota(data.quota);
      afficherRessources(data.ressources);
      afficherPoints(data.pointsArbre);
      document.dispatchEvent(new CustomEvent("recompense-recue"));
    } catch {
      afficherObtenus(zoneId, false, { erreur: "Erreur réseau, réessaie." });
      bouton.disabled = false;
    }
  }

  document.getElementById("serie-recuperer").addEventListener("click", (e) => {
    recuperer(e.currentTarget, "/quotidien/serie", null, "serie-obtenus");
  });
  document.getElementById("tiroir-quetes").addEventListener("click", (e) => {
    const bouton = e.target.closest("button.recuperer");
    if (!bouton || bouton.disabled) return;
    if (bouton.id === "bonus-recuperer") recuperer(bouton, "/quotidien/bonus", null, "quetes-obtenus");
    else recuperer(bouton, "/quotidien/quetes", { rang: Number(bouton.dataset.rang) }, "quetes-obtenus");
  });

  // ---------- Mailbox : annonces de l'admin ----------
  // Relue toutes les minutes. Une annonce non lue allume la pastille ; ouvrir le tiroir la marque lue.
  // L'admin voit en plus le formulaire de publication et une croix pour supprimer chaque annonce.

  let admin = false;

  function formaterDate(iso) {
    return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function afficherAnnonces(annonces) {
    const zone = document.getElementById("annonces");
    zone.innerHTML = "";
    if (annonces.length === 0) {
      zone.innerHTML = `<p class="vide">Aucune annonce pour l'instant.</p>`;
      return;
    }
    for (const a of annonces) {
      const bloc = document.createElement("div");
      bloc.className = "annonce";
      const entete = document.createElement("div");
      entete.className = "date";
      entete.textContent = formaterDate(a.created_at);
      if (admin) {
        const supprimer = document.createElement("button");
        supprimer.type = "button";
        supprimer.className = "supprimer";
        supprimer.dataset.supprimer = a.id;
        supprimer.title = "Supprimer";
        supprimer.textContent = "×";
        entete.appendChild(supprimer);
      }
      const texte = document.createElement("div");
      texte.className = "texte";
      texte.textContent = a.texte;
      bloc.append(entete, texte);
      zone.appendChild(bloc);
    }
  }

  async function chargerAnnonces() {
    try {
      const { ok, data } = await api("/annonces");
      if (!ok) return;
      admin = data.admin;
      document.getElementById("formAnnonce").hidden = !admin;
      afficherAnnonces(data.annonces);
      const ouvert = tiroirOuvert === "annonces";
      document.getElementById("point-annonces").classList.toggle("visible", data.nonLues > 0 && !ouvert);
      if (ouvert && data.nonLues > 0) await api("/annonces/lues", { methode: "POST" });
    } catch {
      // Réseau indisponible : on réessaiera au prochain tour
    }
  }

  document.getElementById("formAnnonce").addEventListener("submit", async (e) => {
    e.preventDefault();
    const champ = document.getElementById("texteAnnonce");
    const texte = champ.value.trim();
    if (!texte) return;
    const { ok, data } = await api("/annonces", { corps: { texte } });
    document.getElementById("statutAnnonce").textContent = ok ? "" : data.erreur;
    if (ok) {
      champ.value = "";
      await chargerAnnonces();
    }
  });

  document.getElementById("annonces").addEventListener("click", async (e) => {
    const bouton = e.target.closest("[data-supprimer]");
    if (!bouton || !confirm("Supprimer cette annonce ?")) return;
    const { ok, data } = await api(`/annonces/${bouton.dataset.supprimer}`, { methode: "DELETE" });
    document.getElementById("statutAnnonce").textContent = ok ? "" : data.erreur;
    await chargerAnnonces();
  });

  document.getElementById("footer").addEventListener("click", (e) => {
    const bouton = e.target.closest("[data-tiroir]");
    if (bouton) ouvrirTiroir(bouton.dataset.tiroir);
  });
  document.addEventListener("click", (e) => {
    const fermer = e.target.closest("[data-fermer]");
    if (fermer) ouvrirTiroir(fermer.dataset.fermer);
  });

  document.getElementById("formChat").addEventListener("submit", async (e) => {
    e.preventDefault();
    const champ = document.getElementById("texteChat");
    const texte = champ.value.trim();
    if (!texte) return;
    const { ok, data } = await api("/chat", { corps: { texte } });
    document.getElementById("statutChat").textContent = ok ? "" : data.erreur;
    if (ok) {
      champ.value = "";
      await rafraichirChat();
    }
  });

  // Nombre de joueurs en ligne, affiché sur le bouton du chat (moi compris)
  async function rafraichirEnLigne() {
    try {
      const { ok, data } = await api("/joueurs");
      if (!ok) return;
      const nombre = data.joueurs.filter((j) => j.en_ligne).length + 1;
      document.getElementById("compte-en-ligne").textContent = `· ${nombre} en ligne`;
    } catch {
      // Réseau indisponible : on réessaiera au prochain tour
    }
  }

  rafraichirChat();
  rafraichirEnLigne();
  setInterval(rafraichirChat, INTERVALLE_CHAT_FERME_MS);
  setInterval(rafraichirEnLigne, INTERVALLE_EN_LIGNE_MS);
  chargerAnnonces();
  setInterval(chargerAnnonces, INTERVALLE_ANNONCES_MS);
  chargerQuotidien();
  setInterval(chargerQuotidien, INTERVALLE_QUOTIDIEN_MS);

  // Profil chargé une seule fois ; la page peut l'attendre via Barre.profil.
  // Sans starter, le joueur est envoyé le choisir. Sans session, exigerConnexion() de la page redirige.
  const profil = api("/profil").then((reponse) => {
    if (reponse.ok) {
      if (!reponse.data.starter) window.location.replace("/starter.html");
      afficherStarter(reponse.data.starter);
      afficherQuota(reponse.data.quota);
      afficherRessources(reponse.data.ressources);
      afficherPoints(reponse.data.pointsArbre);
    }
    return reponse;
  }).catch(() => ({ ok: false, status: 0, data: {} }));

  return { profil, afficherStarter, afficherQuota, afficherRessource, afficherRessources, afficherPoints };
})();
