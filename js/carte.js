// Vue carte des magasins (séance 30, E6.4) : bascule Liste / Carte dans l'onglet Magasins.
// Fond de plan OpenStreetMap via Leaflet (bibliothèque libre), chargé seulement à la première ouverture de la carte.
// Un point par magasin : vert, orange ou rouge selon le niveau de prix, gris si prix inconnus, blanc si le magasin n'est pas dans ma liste.
// La position de l'utilisateur n'est jamais enregistrée (D9) : le point bleu vient de la dernière recherche et reste en mémoire.

const LEAFLET = { css: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css", js: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js" };
const COULEURS_POINTS = { vert: "#1f8a4c", orange: "#e08a1e", rouge: "#c0392b", gris: "#9aa39c", neuf: "#faf8f0" };

let modeMagasins = "liste"; // "liste" ou "carte"
let carte = null; // objet Leaflet
let couchePoints = null;
let pointsCarte = []; // points affichés, dans l'ordre des numéros
let chargementLeaflet = null;
let positionTentee = false; // la position n'est demandée qu'une fois par ouverture de la page
let centrerSurPosition = false;

function chargerLeaflet() {
  if (window.L) return Promise.resolve();
  if (chargementLeaflet) return chargementLeaflet;
  chargementLeaflet = new Promise((resolu, rejete) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = LEAFLET.css;
    document.head.append(css);
    const script = document.createElement("script");
    script.src = LEAFLET.js;
    script.onload = resolu;
    script.onerror = () => { chargementLeaflet = null; rejete(new Error("La carte n'a pas pu se charger. Vérifie ta connexion.")); };
    document.head.append(script);
  });
  return chargementLeaflet;
}


// Les points à montrer : mes magasins qui ont un emplacement, puis les résultats de recherche qui n'y sont pas.
function calculerPoints() {
  const points = [];
  for (const m of MAGASINS) {
    if (typeof m.lat !== "number") continue;
    const niveau = niveauPrix(m);
    points.push({ nom: m.nom, rue: m.adresse || "", lat: m.lat, lon: m.lon, classe: niveau ? niveau.classe : "gris", texte: niveau ? niveau.texte : "Prix inconnus", connu: true });
  }
  trouves.slice(0, Math.min(nbAffiches, 15)).forEach((m, k) => {
    if (typeof m.lat === "number" && !magasinConnu(m)) points.push({ nom: m.nom, rue: m.rue, lat: m.lat, lon: m.lon, classe: "neuf", texte: "Pas dans ma liste", connu: false, trouve: k });
  });
  if (centreRecherche) for (const p of points) p.distance = distanceM(centreRecherche, p);
  return points.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
}

function iconePoint(p, numero) {
  const fond = COULEURS_POINTS[p.classe];
  const texte = p.classe === "neuf" ? "#1b2a22" : "#fff";
  return L.divIcon({
    className: "point-carte",
    html: `<span style="background:${fond};color:${texte};border-color:${p.classe === "neuf" ? "#0e4d2f" : "#fff"}">${numero}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function montrerFiche(k) {
  const fiche = document.querySelector("#carte-fiche");
  const p = pointsCarte[k];
  if (!p) { fiche.hidden = true; return; }
  const pastille = `<span class="niveau ${p.classe === "neuf" ? "gris" : p.classe}"><i></i>${p.texte}</span>`;
  fiche.hidden = false;
  fiche.innerHTML = `<span><strong>${k + 1}. ${echapper(p.nom)}</strong> ${pastille}<span class="date">${echapper(p.rue) || "Rue non renseignée"}${p.distance != null ? ` · ${distanceTexte(p.distance)}` : ""}</span></span>
    ${p.connu ? "" : `<button type="button" data-ajouter-trouve="${p.trouve}">+ Ajouter</button>`}`;
}

async function majCarte() {
  if (modeMagasins !== "carte") return;
  const etat = document.querySelector("#carte-etat");
  try { await chargerLeaflet(); } catch (e) { etat.textContent = e.message; return; }
  if (!carte) {
    carte = L.map("carte-zone", { zoomControl: true }).setView([48.8566, 2.3522], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© les contributeurs d'OpenStreetMap" }).addTo(carte);
    couchePoints = L.layerGroup().addTo(carte);
    carte.on("click", () => { document.querySelector("#carte-fiche").hidden = true; });
  }
  carte.invalidateSize();
  couchePoints.clearLayers();
  pointsCarte = calculerPoints();
  const bornes = [];
  pointsCarte.forEach((p, k) => {
    L.marker([p.lat, p.lon], { icon: iconePoint(p, k + 1) }).on("click", () => montrerFiche(k)).addTo(couchePoints);
    bornes.push([p.lat, p.lon]);
  });
  if (centreRecherche) {
    L.circleMarker([centreRecherche.lat, centreRecherche.lon], { radius: 8, color: "#fff", weight: 3, fillColor: "#2b6cb0", fillOpacity: 1 }).addTo(couchePoints);
    bornes.push([centreRecherche.lat, centreRecherche.lon]);
  }
  if (centrerSurPosition && centreRecherche) { carte.setView([centreRecherche.lat, centreRecherche.lon], 15, { animate: false }); centrerSurPosition = false; }
  else if (bornes.length > 1) carte.fitBounds(bornes, { padding: [30, 30], maxZoom: 16 });
  else if (bornes.length === 1) carte.setView(bornes[0], 15);
  document.querySelector("#carte-fiche").hidden = true;
  const sansPlace = MAGASINS.filter((m) => typeof m.lat !== "number").length;
  etat.textContent = pointsCarte.length
    ? (sansPlace ? `${sansPlace} magasin${sansPlace > 1 ? "s" : ""} de ta liste ${sansPlace > 1 ? "n'ont" : "n'a"} pas encore d'emplacement : une recherche plus bas les place sur la carte.` : "Touche un point pour voir le magasin.")
    : "Aucun magasin placé pour l'instant. Lance une recherche plus bas (« Ma position » ou une adresse) : les magasins trouvés apparaissent ici.";
}

function majModeMagasins() {
  const carteOuverte = modeMagasins === "carte";
  document.querySelector("#carte-magasins").hidden = !carteOuverte;
  document.querySelector("#liste-magasins").closest(".carte-blanche").hidden = carteOuverte;
  for (const [id, actif] of [["#mag-liste", !carteOuverte], ["#mag-carte", carteOuverte]]) {
    const b = document.querySelector(id);
    b.classList.toggle("actif", actif);
    b.setAttribute("aria-pressed", String(actif));
  }
  if (carteOuverte) majCarte().then(localiserAuto);
}

document.querySelector("#mag-liste").addEventListener("click", () => { modeMagasins = "liste"; majModeMagasins(); });
document.querySelector("#mag-carte").addEventListener("click", () => { modeMagasins = "carte"; majModeMagasins(); });
// « + Ajouter » de la fiche : même geste que dans la liste des résultats (fonction de trouver.js).
document.querySelector("#carte-fiche").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ajouter-trouve]");
  if (b) ajouterTrouve(Number(b.dataset.ajouterTrouve));
});

// À l'ouverture de la carte, on montre la position actuelle (point bleu) si aucune recherche n'a déjà un centre.
// Elle reste en mémoire seulement (D9) ; refusée, la carte s'ouvre quand même.
async function localiserAuto() {
  if (centreRecherche || positionTentee) return;
  positionTentee = true;
  try {
    centreRecherche = await positionGps();
    centrerSurPosition = true;
    majCarte();
  } catch (e) {
    document.querySelector("#carte-etat").textContent = e.message;
  }
}
