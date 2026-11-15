// Version du site : le commit déployé (change à chaque push + deploy), sinon l'heure de démarrage.
// Elle sert à vider le cache des navigateurs (URLs suffixées par ?v=) et à recharger les onglets
// restés ouverts sur une ancienne version (en-tête X-Version comparé par public/js/commun.js).
import { execFileSync } from "node:child_process";

function lireVersion() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return Date.now().toString(36);
  }
}

export const VERSION = process.env.APP_VERSION || lireVersion();

// Ajoute ?v=VERSION (ou &v=) à une URL locale.
export function avecVersion(url, version = VERSION) {
  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
}

// Page HTML préparée pour la version : <meta name="version"> et ?v= sur les scripts, feuilles
// de style et images locales (/js, /css, /images), pour que le navigateur reprenne les nouveaux fichiers.
export function versionnerHtml(html, version = VERSION) {
  return html
    .replace(/<head>/i, `<head>\n  <meta name="version" content="${version}">`)
    .replace(/(src|href)="(\/(?:js|css|images)\/[^"?#]+)"/g, (_, attr, url) => `${attr}="${avecVersion(url, version)}"`);
}
