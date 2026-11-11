(() => {
  const INTERVALLE_PRESENCE_MS = 20_000;
  const INTERVALLE_DEFIS_MS = 5_000;
  const estPageCombat = window.location.pathname === "/combat.html";
  const defisDejaSignales = new Set();

  function marquerPresence() {
    fetch("/presence", { method: "POST" }).catch(() => {});
  }

  function afficherNotification(defi) {
    const notification = document.createElement("button");
    notification.type = "button";
    notification.className = "notification-defi";
    notification.innerHTML = `<strong>Nouveau défi</strong><span></span>`;
    notification.querySelector("span").textContent = `${defi.de_pseudo} te défie ! Clique pour répondre.`;
    notification.addEventListener("click", () => {
      window.location.assign("/combat.html");
    });
    document.body.appendChild(notification);

    window.setTimeout(() => notification.remove(), 15_000);
  }

  async function verifierDefis() {
    if (estPageCombat) return;
    try {
      const reponse = await fetch("/defis");
      if (!reponse.ok) return;
      const { recus } = await reponse.json();
      for (const defi of recus) {
        if (defisDejaSignales.has(defi.id)) continue;
        defisDejaSignales.add(defi.id);
        afficherNotification(defi);
      }
    } catch {
      // Une perte réseau ne doit pas empêcher le reste de la page de fonctionner.
    }
  }

  const style = document.createElement("style");
  style.textContent = `
    .notification-defi {
      position: fixed; right: 20px; bottom: 20px; z-index: 1000;
      width: min(340px, calc(100vw - 40px)); padding: 14px 16px;
      display: grid; gap: 4px; text-align: left; cursor: pointer;
      color: #f2f2f2; background: #2a2640; border: 1px solid #ff8a3d;
      border-radius: 10px; box-shadow: 0 10px 28px rgba(0, 0, 0, .35);
      font: inherit;
    }
    .notification-defi strong { color: #ffb86b; }
    .notification-defi:hover { background: #383252; }
  `;
  document.head.appendChild(style);

  marquerPresence();
  window.setInterval(marquerPresence, INTERVALLE_PRESENCE_MS);
  verifierDefis();
  window.setInterval(verifierDefis, INTERVALLE_DEFIS_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      marquerPresence();
      verifierDefis();
    }
  });
})();
