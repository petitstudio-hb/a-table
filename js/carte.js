// Vue carte des magasins (séance 30, E6.4 ; refaite séance 37) : bascule Liste / Carte dans l'onglet Magasins.
// Fond de plan clair OpenFreeMap (données OpenStreetMap, gratuit, sans clé) affiché par MapLibre (bibliothèque libre), chargé seulement à la première ouverture de la carte.
// Un point numéroté par magasin : vert, orange ou rouge selon le niveau de prix, gris si prix inconnus, blanc si le magasin n'est pas dans ma liste.
// Le toucher d'un point ouvre une fiche en bas de la carte. La position de l'utilisateur n'est jamais enregistrée (D9) : le point bleu vient de la dernière recherche et reste en mémoire.

const MAPLIBRE = { css: "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.css", js: "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.js" };
const FOND_CARTE = "https://tiles.openfreemap.org/styles/positron";
const COULEURS_POINTS = { vert: "#1d7a3f", orange: "#e08a1e", rouge: "#c0392b", gris: "#4b5f54", neuf: "#fbf9f1" };

let modeMagasins = "liste"; // "liste" ou "carte"
let carte = null; // objet MapLibre
let marqueursCarte = []; // marqueurs MapLibre des points affichés
let marqueurMoi = null;
let pointsCarte = []; // points affichés, dans l'ordre des numéros
let chargementCarte = null;

function chargerBibliothequeCarte() {
  if (window.maplibregl) return Promise.resolve();
  if (chargementCarte) return chargementCarte;
  // On attend la feuille de style ET le script : sans le style, la carte se crée avec une taille fausse et reste blanche.
  const echec = () => { chargementCarte = null; return new Error("La carte n'a pas pu se charger. Vérifie ta connexion."); };
  const css = new Promise((resolu, rejete) => {
    const lien = document.createElement("link");
    lien.rel = "stylesheet";
    lien.href = MAPLIBRE.css;
    lien.onload = resolu;
    lien.onerror = () => rejete(echec());
    document.head.append(lien);
  });
  const js = new Promise((resolu, rejete) => {
    const script = document.createElement("script");
    script.src = MAPLIBRE.js;
    script.onload = resolu;
    script.onerror = () => rejete(echec());
    document.head.append(script);
  });
  chargementCarte = Promise.all([css, js]);
  return chargementCarte;
}

// Les points à montrer : mes magasins qui ont un emplacement, puis les résultats de recherche qui n'y sont pas.
function calculerPoints() {
  const points = [];
  for (const m of MAGASINS) {
    if (typeof m.lat !== "number") continue;
    const niveau = niveauPrix(m);
    points.push({ id: m.id, nom: m.nom, rue: m.adresse || "", lat: m.lat, lon: m.lon, classe: niveau ? niveau.classe : "gris", texte: niveau ? niveau.texte : "Prix inconnus", connu: true });
  }
  trouves.slice(0, Math.min(nbAffiches, 15)).forEach((m, k) => {
    if (typeof m.lat === "number" && !magasinConnu(m)) points.push({ nom: m.nom, rue: m.rue, lat: m.lat, lon: m.lon, classe: "neuf", texte: "Pas dans ma liste", connu: false, trouve: k });
  });
  if (centreRecherche) for (const p of points) p.distance = distanceM(centreRecherche, p);
  return points.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
}

function elementPoint(p, numero) {
  const fond = COULEURS_POINTS[p.classe];
  const texte = p.classe === "neuf" ? "#13392a" : "#fff";
  const el = document.createElement("div");
  el.className = "point-carte";
  el.innerHTML = `<span style="background:${fond};color:${texte};border-color:${p.classe === "neuf" ? "#0e4d2f" : "#fff"}">${numero}</span>`;
  return el;
}

function fermerFiche() {
  document.querySelector("#carte-fiche").classList.remove("ouverte");
  marqueursCarte.forEach((m) => m.getElement().classList.remove("sel"));
}

function montrerFiche(k) {
  const fiche = document.querySelector("#carte-fiche");
  const p = pointsCarte[k];
  if (!p) { fermerFiche(); return; }
  marqueursCarte.forEach((m, i) => m.getElement().classList.toggle("sel", i === k));
  const pastille = `<span class="niveau ${p.classe === "neuf" ? "gris" : p.classe}"><i></i>${p.texte}</span>`;
  const m = p.connu ? MAGASINS.find((x) => x.id === p.id) : null;
  const t = m ? totalDe(m) : null;
  const panier = t && t.coches ? `<div class="ligne"><span>${echapper(paniers.find((x) => x.id === panierCourse)?.nom || "Panier")} · ${t.connus} prix sur ${t.coches}</span><span class="total">${t.connus ? euros(t.total) : "—"}</span></div>` : "";
  const itineraire = `<a class="bouton-lien" href="https://maps.apple.com/?daddr=${p.lat},${p.lon}&dirflg=w" target="_blank" rel="noopener">Y aller</a>`;
  fiche.innerHTML = `<div class="poignee"></div><h3>${k + 1}. ${echapper(p.nom)} ${pastille}</h3>
    <div class="ligne"><span>${echapper(p.rue) || "Rue non renseignée"}</span><span>${p.distance != null ? `${distanceTexte(p.distance)} à vol d'oiseau` : ""}</span></div>${panier}
    <div class="actions">${itineraire}${p.connu ? `<button type="button" class="plein" data-course-ici="${echapper(p.id)}">Ma course ici</button>` : `<button type="button" class="plein" data-ajouter-trouve="${p.trouve}">+ Ajouter à ma liste</button>`}</div>`;
  fiche.classList.add("ouverte");
}

async function majCarte() {
  if (modeMagasins !== "carte") return;
  const etat = document.querySelector("#carte-etat");
  if (!carte) etat.textContent = "Chargement de la carte…";
  try { await chargerBibliothequeCarte(); } catch (e) { etat.textContent = e.message; return; }
  if (!carte) {
    carte = new maplibregl.Map({ container: "carte-zone", style: FOND_CARTE, center: [2.3522, 48.8566], zoom: 12, attributionControl: { compact: true } });
    carte.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    carte.on("click", fermerFiche);
    carte.once("load", () => carte.resize()); // au cas où la taille du cadre a changé pendant le chargement du fond
    carte.on("error", () => { if (!carte.isStyleLoaded()) document.querySelector("#carte-etat").textContent = "Le fond de carte ne s'affiche pas (connexion ?). Les points restent visibles."; });
  }
  carte.resize();
  marqueursCarte.forEach((m) => m.remove());
  marqueursCarte = [];
  pointsCarte = calculerPoints();
  const bornes = new maplibregl.LngLatBounds();
  let nb = 0;
  pointsCarte.forEach((p, k) => {
    const el = elementPoint(p, k + 1);
    el.addEventListener("click", (e) => { e.stopPropagation(); montrerFiche(k); });
    marqueursCarte.push(new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(carte));
    bornes.extend([p.lon, p.lat]);
    nb++;
  });
  marqueurMoi?.remove();
  marqueurMoi = null;
  if (centreRecherche) {
    const moi = document.createElement("div");
    moi.className = "moi";
    marqueurMoi = new maplibregl.Marker({ element: moi }).setLngLat([centreRecherche.lon, centreRecherche.lat]).addTo(carte);
    bornes.extend([centreRecherche.lon, centreRecherche.lat]);
    nb++;
  }
  if (nb > 1) carte.fitBounds(bornes, { padding: 40, maxZoom: 16, animate: false });
  else if (nb === 1) carte.jumpTo({ center: bornes.getCenter(), zoom: 15 });
  fermerFiche();
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
  if (carteOuverte) majCarte();
}

document.querySelector("#mag-liste").addEventListener("click", () => { modeMagasins = "liste"; majModeMagasins(); });
document.querySelector("#mag-carte").addEventListener("click", () => { modeMagasins = "carte"; majModeMagasins(); });
document.querySelector("#carte-fiche").addEventListener("click", (e) => {
  // « + Ajouter » : même geste que dans la liste des résultats (fonction de trouver.js).
  const b = e.target.closest("[data-ajouter-trouve]");
  if (b) ajouterTrouve(Number(b.dataset.ajouterTrouve));
  // « Ma course ici » : ce magasin devient le seul comparé, et on passe à Ma course.
  const c = e.target.closest("[data-course-ici]");
  if (c) { compares = [c.dataset.courseIci]; sauvegarder(); location.hash = "#course"; calculer(); }
});

// Bouton rond : c'est le seul endroit où la carte demande la position (jamais à l'ouverture), qui n'est jamais enregistrée (D9).
document.querySelector("#carte-loc").addEventListener("click", async () => {
  try {
    document.querySelector("#carte-etat").textContent = "Recherche de ta position…";
    centreRecherche = await positionGps();
    await majCarte();
    carte.flyTo({ center: [centreRecherche.lon, centreRecherche.lat], zoom: 16 });
  } catch (e) {
    document.querySelector("#carte-etat").textContent = e.message;
  }
});

