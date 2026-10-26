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
let centreRecherche = null; // centre de la dernière recherche, gardé en mémoire seulement (jamais enregistré, D9)


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

// Écrit dans le champ l'adresse du point trouvé par « Ma position ». Elle n'est jamais enregistrée (D9).
async function afficherAdresse(centre) {
  try {
    const rep = await fetch(`${NOMINATIM.replace("/search", "/reverse")}?format=json&zoom=18&addressdetails=1&lat=${centre.lat}&lon=${centre.lon}`);
    if (!rep.ok) return;
    const a = (await rep.json()).address || {};
    const rue = [a.house_number, a.road].filter(Boolean).join(" ");
    const ville = [a.postcode, a.city || a.town || a.village || a.municipality].filter(Boolean).join(" ");
    const texte = [rue, ville].filter(Boolean).join(", ");
    if (texte) document.querySelector("#trouver-adresse").value = texte;
  } catch (e) { /* le champ reste vide */ }
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
        lat,
        lon,
        distance: distanceM(centre, { lat, lon }),
      };
    })
    .filter((m) => m.nom)
    .sort((a, b) => a.distance - b.distance);
}

// Le magasin de ma liste qui correspond à un résultat de recherche, s'il y en a un.
const magasinConnu = (m) => MAGASINS.find((x) => (x.osm && x.osm.id === m.osm.id) || (x.nom.toLowerCase() === m.nom.toLowerCase() && (x.adresse || "").toLowerCase() === m.rue.toLowerCase()));

// Niveau de prix d'un magasin de ma liste pour le panier habituel : vert (le moins cher), rouge (le plus cher), orange (entre les deux).
// Seuls les magasins qui connaissent au moins 80 % des prix sont classés (décision D13).
function niveauPrix(magasin) {
  const habituel = panierHabituel();
  if (!habituel || !habituel.produits.length) return null;
  const ind = indicesPrix(MAGASINS, habituel.produits);
  const notes = MAGASINS.filter((m) => ind.get(m.id).n >= 3).sort((a, b) => ind.get(a.id).indice - ind.get(b.id).indice);
  const k = notes.findIndex((m) => m.id === magasin.id);
  if (k === -1 || notes.length < 2) return null;
  const rang = k / (notes.length - 1);
  return rang <= 0.34 ? { classe: "vert", texte: "Moins cher" } : rang >= 0.66 ? { classe: "rouge", texte: "Plus cher" } : { classe: "orange", texte: "Prix moyen" };
}

function afficherTrouves() {
  const liste = document.querySelector("#trouver-liste");
  liste.innerHTML = trouves
    .slice(0, nbAffiches)
    .map((m, k) => {
      const connu = magasinConnu(m);
      const ajoute = Boolean(connu);
      const niveau = connu ? niveauPrix(connu) : null;
      const pastille = niveau ? `<span class="niveau ${niveau.classe}" title="${niveau.texte} pour le panier habituel"><i></i>${niveau.texte}</span>` : (connu ? `<span class="niveau gris"><i></i>Prix inconnus</span>` : "");
      return `<li>
        <span><strong>${echapper(m.nom)}</strong> ${pastille}<span class="date">${echapper(m.rue) || "Rue non renseignée"} · ${distanceTexte(m.distance)}</span></span>
        <span class="boutons">${ajoute ? `<em class="envoye">Déjà ajouté</em>` : `<button type="button" data-ajouter-trouve="${k}">+ Ajouter</button>`}</span>
      </li>`;
    })
    .join("");
  document.querySelector("#trouver-resultats").hidden = trouves.length === 0;
  document.querySelector("#trouver-plus").hidden = trouves.length <= nbAffiches;
  if (typeof majCarte === "function") majCarte();
}

async function lancerRecherche(source) {
  let patience;
  const bouton = document.querySelectorAll("#trouver button");
  bouton.forEach((b) => (b.disabled = true));
  try {
    etatTrouver("Recherche en cours…");
    patience = setTimeout(() => etatTrouver("Le serveur est lent en ce moment, ça peut prendre jusqu'à une minute…"), 8000);
    const adresse = document.querySelector("#trouver-adresse").value.trim();
    const centre = source === "adresse" ? (centreChoisi && centreChoisi.texte === adresse ? centreChoisi : await positionAdresse(adresse)) : await positionGps();
    if (source === "gps") afficherAdresse(centre); // sans attendre : l'adresse s'écrit dans le champ quand elle arrive
    const rayon = Number(document.querySelector("#trouver-rayon").value);
    trouves = await chercherMagasins(centre, rayon);
    centreRecherche = centre;
    placerMagasinsConnus();
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
document.querySelector("#trouver-fermer").addEventListener("click", () => {
  trouves = [];
  afficherTrouves();
  etatTrouver("");
});
document.querySelector("#trouver-plus").addEventListener("click", () => {
  nbAffiches += 30;
  afficherTrouves();
});
function ajouterTrouve(k) {
  const m = trouves[k];
  const id = ajouterMagasin(m.nom, m.rue);
  Object.assign(MAGASINS.find((x) => x.id === id), { osm: m.osm, lat: m.lat, lon: m.lon });
  sauvegarder();
  toutAfficher();
  notifier(`${m.nom} ajouté.`);
  if (typeof majCarte === "function") majCarte();
}
document.querySelector("#trouver-liste").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ajouter-trouve]");
  if (b) ajouterTrouve(Number(b.dataset.ajouterTrouve));
});

// ---------- Adresses proposées en tapant (séance 25) ----------
// La Base Adresse Nationale (service de l'État, gratuit) propose des adresses au fil de la frappe.
// Ce qui est tapé n'est envoyé qu'à ce service, pendant la saisie, et n'est jamais enregistré (décision D9).
const BAN = "https://api-adresse.data.gouv.fr/search/";
let centreChoisi = null; // adresse choisie dans la liste : { texte, lat, lon }
let suggestionsAdresses = [];
let minuteurAdresse;

function afficherSuggestions() {
  const liste = document.querySelector("#trouver-suggestions");
  liste.hidden = suggestionsAdresses.length === 0;
  liste.innerHTML = suggestionsAdresses.map((s, k) => `<li><button type="button" data-suggestion-adresse="${k}">${echapper(s.texte)}</button></li>`).join("");
}

document.querySelector("#trouver-adresse").addEventListener("input", (e) => {
  centreChoisi = null;
  clearTimeout(minuteurAdresse);
  const q = e.target.value.trim();
  if (q.length < 3) { suggestionsAdresses = []; afficherSuggestions(); return; }
  minuteurAdresse = setTimeout(async () => {
    try {
      const rep = await fetch(`${BAN}?q=${encodeURIComponent(q)}&limit=5&autocomplete=1`);
      if (!rep.ok) return;
      const { features } = await rep.json();
      if (document.querySelector("#trouver-adresse").value.trim() !== q) return; // le champ a changé entre-temps
      suggestionsAdresses = (features || []).map((f) => ({ texte: f.properties.label, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
      afficherSuggestions();
    } catch (err) { /* sans suggestions, la recherche par « Chercher » reste possible */ }
  }, 300);
});

document.querySelector("#trouver-suggestions").addEventListener("click", (e) => {
  const b = e.target.closest("[data-suggestion-adresse]");
  if (!b) return;
  const s = suggestionsAdresses[Number(b.dataset.suggestionAdresse)];
  document.querySelector("#trouver-adresse").value = s.texte;
  centreChoisi = s;
  suggestionsAdresses = [];
  afficherSuggestions();
  lancerRecherche("adresse");
});

// Les magasins de ma liste qui n'ont pas encore d'emplacement le reçoivent quand une recherche les retrouve (E6.4).
// C'est l'emplacement du magasin, pas celui de l'utilisateur.
function placerMagasinsConnus() {
  let change = false;
  for (const m of trouves) {
    const connu = magasinConnu(m);
    if (connu && typeof connu.lat !== "number" && typeof m.lat === "number") {
      Object.assign(connu, { lat: m.lat, lon: m.lon });
      if (!connu.osm) connu.osm = m.osm;
      change = true;
    }
  }
  if (change) sauvegarder();
}
