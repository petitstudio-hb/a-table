// Mode hors connexion de Cabasito (E11) : un « service worker » garde les fichiers de l'appli dans le téléphone.
// - Avec du réseau : on prend toujours la version la plus récente du site (et on la garde pour plus tard).
// - Sans réseau, ou réseau trop lent : on sert la copie gardée. Les données (prix, paniers) sont déjà dans le téléphone.
// - La carte (MapLibre et fond OpenFreeMap) est gardée au fur et à mesure qu'on la voit.
// Les appels à des services (IA, adresses, recherche de magasins) ne sont jamais gardés.
// Pour forcer un nettoyage complet des copies, changer VERSION.

const VERSION = "cabasito-v1";
const CACHE_SITE = `${VERSION}-site`;
const CACHE_CARTE = `${VERSION}-carte`;
const MAX_TUILES = 600;
const DELAI_RESEAU = 4000; // au-delà, on préfère la copie gardée

const FICHIERS = [
  "./", "index.html", "style.css", "manifest.json",
  "js/donnees.js", "js/prix.js", "js/outils.js", "js/repartition.js", "js/repartir.js", "js/filtres-releves.js", "js/historique.js", "js/donnees-sures.js", "js/app.js", "js/association.js", "js/lecture.js", "js/verif-cartes.js", "js/trouver.js", "js/paniers.js", "js/liste.js", "js/achats.js", "js/bascules.js",
  "js/carte.js", "js/ouialler.js", "js/courses.js", "js/formats.js", "js/confort.js",
  "icones/icone-180.png", "icones/icone-192.png", "icones/icone-512.png", "icones/logo.svg",
  "polices/bricolage.woff2", "polices/courierprime-400.woff2", "polices/courierprime-700.woff2",
];
const HOTES_CARTE = ["cdnjs.cloudflare.com", "tile.openstreetmap.org", "tiles.openfreemap.org"];

self.addEventListener("install", (e) => {
  // Un fichier introuvable ne doit pas empêcher d'installer les autres.
  e.waitUntil(caches.open(CACHE_SITE).then((c) => Promise.all(FICHIERS.map((f) => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

const avecDelai = (promesse, ms) => Promise.race([promesse, new Promise((_, rejete) => setTimeout(() => rejete(new Error("délai")), ms))]);

async function limiter(cache, max) {
  const cles = await cache.keys();
  if (cles.length > max) await Promise.all(cles.slice(0, cles.length - max).map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Le site lui-même : réseau d'abord, copie gardée si pas de réseau.
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      // Stockage plein, indisponible ou copie illisible : on ne bloque jamais la réponse du réseau.
      let cache = null;
      try { cache = await caches.open(CACHE_SITE); } catch (err) { /* sans copie gardée */ }
      try {
        const rep = await avecDelai(fetch(req, { cache: "no-cache" }), DELAI_RESEAU); // « no-cache » : toujours vérifier la version en ligne
        if (rep.ok && cache) { try { Promise.resolve(cache.put(req.mode === "navigate" ? "index.html" : req, rep.clone())).catch(() => {}); } catch (err) { /* idem */ } }
        return rep;
      } catch (err) {
        let copie = null;
        try { if (cache) copie = (await cache.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? await cache.match("index.html") : null); } catch (err2) { /* copie illisible */ }
        return copie || new Response("Hors connexion : cette page n'est pas encore gardée dans le téléphone.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  // La carte : copie gardée d'abord (les tuiles ne changent presque jamais), sinon réseau puis on garde.
  if (HOTES_CARTE.some((h) => url.hostname === h || url.hostname.endsWith("." + h))) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_CARTE);
      const copie = await cache.match(req);
      // Le style et la description des tuiles (OpenFreeMap) changent de temps en temps : réseau d'abord, copie si hors connexion.
      const vivant = url.hostname === "tiles.openfreemap.org" && (url.pathname.startsWith("/styles/") || url.pathname === "/planet");
      if (copie && !vivant) return copie;
      if (vivant) {
        try { const rep = await fetch(req); if (rep.ok) cache.put(req, rep.clone()); return rep; } catch (err) { if (copie) return copie; throw err; }
      }
      const rep = await fetch(req);
      if (rep.ok || rep.type === "opaque") { cache.put(req, rep.clone()); limiter(cache, MAX_TUILES); }
      return rep;
    })());
  }
  // Tout le reste (IA, adresses, magasins) : jamais gardé, le navigateur s'en occupe.
});
