// Trouver des supermarchés près de soi (séance 8, élément 0.6).
// Les magasins viennent d'OpenStreetMap (API Overpass, gratuite, sans clé).
// La position (GPS ou adresse tapée) sert uniquement à la recherche : elle n'est jamais enregistrée (décision D9).

// Serveurs Overpass, essayés dans l'ordre, avec le délai maximal de chacun (en secondes).
// Le serveur français répond en moins d'une seconde ; l'allemand est plus lent (30 à 45 s certains jours).
const OVERPASS = [
  { url: "https://overpass.openstreetmap.fr/api/interpreter", delai: 25 },
  { url: "https://overpass-api.de/api/interpreter", delai: 80 },
];
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

let trouves = []; // résultats de la dernière recherche
let nbAffiches = 30; // nombre de résultats montrés (le reste derrière « Afficher plus »)

const distanceM = (a, b) => {
  const rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};

function etatTrouver(texte, erreur = false) {
  const p = document.querySelector("#trouver-etat");
  p.textContent = texte;
  p.className = "message" + (erreur ? " erreur" : "");
}

function positionGps() {
  return new Promise((resolu, rejete) => {
    if (!navigator.geolocation) return rejete(new Error("Ce navigateur ne sait pas donner la position."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolu({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => rejete(new Error("Position refusée ou indisponible. Tu peux taper une adresse à la place.")),
      { enableHighAccuracy: false, timeout: 15000 },
    );
  });
}

async function positionAdresse(adresse) {
  const rep = await fetch(`${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(adresse)}`);
  if (!rep.ok) throw new Error("Recherche d'adresse impossible pour l'instant.");
  const [r] = await rep.json();
  if (!r) throw new Error("Adresse introuvable. Essaie avec le numéro, la rue et la ville.");
  return { lat: Number(r.lat), lon: Number(r.lon) };
}

async function chercherMagasins(centre, rayon) {
  const requete = `[out:json][timeout:25];nwr["shop"~"^(supermarket|convenience)$"](around:${rayon},${centre.lat},${centre.lon});out center tags;`;
  // Le serveur gratuit est parfois surchargé : on essaie le suivant en cas d'échec.
  let donnees = null;
  for (const serveur of OVERPASS) {
    try {
      // AbortController plutôt qu'AbortSignal.timeout, absent des anciens Safari.
      const arret = new AbortController();
      const minuteur = setTimeout(() => arret.abort(), serveur.delai * 1000);
      try {
        const rep = await fetch(serveur.url, { method: "POST", body: "data=" + encodeURIComponent(requete), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: arret.signal });
        if (rep.ok) { donnees = await rep.json(); break; }
      } finally { clearTimeout(minuteur); }
    } catch (e) { /* serveur suivant */ }
  }
  if (!donnees) throw new Error("OpenStreetMap ne répond pas pour l'instant. Réessaie dans un moment.");
  const { elements } = donnees;
  return elements
    .map((e) => {
      const t = e.tags || {};
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      const rue = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
      return {
        nom: t.name || t.brand || "",
        rue,
        osm: { type: e.type.toUpperCase(), id: e.id },
        distance: distanceM(centre, { lat, lon }),
      };
    })
    .filter((m) => m.nom)
    .sort((a, b) => a.distance - b.distance);
}

const dejaAjoute = (m) => MAGASINS.some((x) => (x.osm && x.osm.id === m.osm.id) || (x.nom.toLowerCase() === m.nom.toLowerCase() && (x.adresse || "").toLowerCase() === m.rue.toLowerCase()));

function afficherTrouves() {
  const liste = document.querySelector("#trouver-liste");
  const dist = (d) => (d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1).replace(".", ",")} km`);
  liste.innerHTML = trouves
    .slice(0, nbAffiches)
    .map((m, k) => {
      const ajoute = dejaAjoute(m);
      return `<li>
        <span><strong>${echapper(m.nom)}</strong><span class="date">${echapper(m.rue) || "Rue non renseignée"} · ${dist(m.distance)}</span></span>
        <span class="boutons">${ajoute ? `<em class="envoye">Déjà ajouté</em>` : `<button type="button" data-ajouter-trouve="${k}">+ Ajouter</button>`}</span>
      </li>`;
    })
    .join("");
  document.querySelector("#trouver-resultats").hidden = trouves.length === 0;
  document.querySelector("#trouver-plus").hidden = trouves.length <= nbAffiches;
}

async function lancerRecherche(source) {
  let patience;
  const bouton = document.querySelectorAll("#trouver button");
  bouton.forEach((b) => (b.disabled = true));
  try {
    etatTrouver("Recherche en cours…");
    patience = setTimeout(() => etatTrouver("Le serveur est lent en ce moment, ça peut prendre jusqu'à une minute…"), 8000);
    const adresse = document.querySelector("#trouver-adresse").value.trim();
    const centre = source === "adresse" ? await positionAdresse(adresse) : await positionGps();
    const rayon = Number(document.querySelector("#trouver-rayon").value);
    trouves = await chercherMagasins(centre, rayon);
    nbAffiches = 30;
    afficherTrouves();
    const n = trouves.length;
    etatTrouver(n ? `${n} magasin${n > 1 ? "s" : ""} trouvé${n > 1 ? "s" : ""}, du plus proche au plus loin.` : "Aucun supermarché trouvé dans ce rayon. Essaie un rayon plus grand.");
  } catch (e) {
    etatTrouver(e.message, true);
  } finally {
    clearTimeout(patience);
    bouton.forEach((b) => (b.disabled = false));
  }
}

document.querySelector("#trouver-gps").addEventListener("click", () => lancerRecherche("gps"));
document.querySelector("#trouver-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (document.querySelector("#trouver-adresse").value.trim()) lancerRecherche("adresse");
  else etatTrouver("Tape une adresse, ou utilise « Ma position ».", true);
});
document.querySelector("#trouver-plus").addEventListener("click", () => {
  nbAffiches += 30;
  afficherTrouves();
});
document.querySelector("#trouver-liste").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ajouter-trouve]");
  if (!b) return;
  const m = trouves[Number(b.dataset.ajouterTrouve)];
  const id = ajouterMagasin(m.nom, m.rue);
  MAGASINS.find((x) => x.id === id).osm = m.osm;
  sauvegarder();
  toutAfficher();
  notifier(`${m.nom} ajouté.`);
});
