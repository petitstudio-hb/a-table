// « Où aller ? » (séance 32, E5) : parmi mes magasins placés sur la carte et assez proches, lequel est le plus avantageux
// pour le panier de Ma course (produits cochés). Même classement que Ma course (décision D13) ; la distance vient de la position,
// gardée en mémoire seulement (D9).

function afficherOuAller(position, rayon) {
  const zone = document.querySelector("#ou-aller-resultat");
  const mags = visibles();
  const { classes, modeIndice, ind } = classerMagasins(mags);
  const sansPlace = mags.filter((m) => typeof m.lat !== "number");
  const proches = classes
    .filter((x) => typeof x.m.lat === "number")
    .map((x) => ({ ...x, distance: distanceM(position, x.m) }))
    .filter((x) => x.distance <= rayon);
  const note = sansPlace.length ? `<p class="aide">${sansPlace.length} magasin${sansPlace.length > 1 ? "s" : ""} de votre liste ${sansPlace.length > 1 ? "n'ont" : "n'a"} pas d'emplacement : une recherche dans « Trouver des magasins » les place.</p>` : "";
  if (!classes.length) {
    zone.innerHTML = `<p class="encart">Pas assez de prix connus pour classer les magasins. Cochez des produits dans Ma course ou ajoutez des prix.</p>${note}`;
    return;
  }
  if (!proches.length) {
    zone.innerHTML = `<p class="encart">Aucun magasin classé dans ce rayon. Essayez une distance plus grande.</p>${note}`;
    return;
  }
  proches.sort((a, b) => (modeIndice ? ind.get(a.m.id).indice - ind.get(b.m.id).indice : a.total - b.total));
  const meilleur = proches[0];
  const plusProche = [...proches].sort((a, b) => a.distance - b.distance)[0];
  const ecart = (x) => (modeIndice ? `+${Math.round((ind.get(x.m.id).indice / ind.get(meilleur.m.id).indice - 1) * 100)} %` : `+${euros(x.total - meilleur.total)}`);
  let phrase = `<b>${echapper(meilleur.m.nom)}</b> est le plus avantageux près de vous, à ${distanceTexte(meilleur.distance)}.`;
  if (plusProche.m.id !== meilleur.m.id) phrase += ` Le plus proche, ${echapper(plusProche.m.nom)} (${distanceTexte(plusProche.distance)}), coûte ${ecart(plusProche)} de plus.`;
  zone.innerHTML = `<p class="bilan">${phrase}</p>
    ${proches.map((x, k) => `<div class="rang ${k === 0 ? "choisi" : ""} rang-fixe">
      <span class="num">${k + 1}</span>
      <span class="rang-nom">${echapper(x.m.nom)}<small>${distanceTexte(x.distance)}${x.m.adresse ? ` · ${echapper(x.m.adresse)}` : ""}</small></span>
      <span class="rang-prix">${modeIndice ? `${ind.get(x.m.id).n} produits` : euros(x.total)}<small>${k === 0 ? "LE PLUS AVANTAGEUX" : ecart(x)}</small></span></div><button type="button" class="y-aller-bouton" data-y-aller="${x.m.id}">Y aller</button>`).join("")}
    ${modeIndice ? `<p class="aide">Comparaison sur les produits connus de plusieurs magasins.</p>` : ""}${note}`;
}

// Le choix d'une distance lance la recherche tout de suite (plus de bouton « Où aller ? », maquette validée le 03/11/2026).
// La position est celle du téléphone, gardée en mémoire cinq minutes seulement (jamais enregistrée, D9). La carte classique se cale sur ce rayon.
let rayonCarte = null; // rayon (en m) de la dernière distance choisie, utilisé par carte.js pour le zoom
let dernierePosition = null;
let dernierePositionLe = 0;

async function lancerOuAller() {
  const choix = document.querySelector("#ou-aller-rayon");
  const zone = document.querySelector("#ou-aller-resultat");
  if (!choix.value) { rayonCarte = null; zone.innerHTML = ""; if (typeof majCarte === "function") majCarte(); return; }
  choix.disabled = true;
  zone.innerHTML = `<p class="message">Recherche de votre position…</p>`;
  try {
    if (!dernierePosition || Date.now() - dernierePositionLe > 300000) { dernierePosition = await positionGps(); dernierePositionLe = Date.now(); }
    centreRecherche = dernierePosition; // gardée en mémoire pour la carte
    rayonCarte = Number(choix.value);
    afficherOuAller(dernierePosition, rayonCarte);
    if (typeof majCarte === "function") majCarte(); // la carte, si elle est ouverte, se cale sur le rayon
  } catch (e) {
    zone.innerHTML = `<p class="message erreur">${echapper(e.message)}</p>`;
  } finally {
    choix.disabled = false;
  }
}
document.querySelector("#ou-aller-rayon").addEventListener("change", lancerOuAller);

// ---------- Y aller : choisir l'appli de plan ----------

const APPLIS_PLAN = [
  { nom: "Plans", titre: "Apple Plans", lien: (p) => `https://maps.apple.com/?daddr=${p.lat},${p.lon}&dirflg=w`, icone: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6Z"/><path d="M9 4v14M15 6v14"/>' },
  { nom: "Google Maps", titre: "Google Maps", lien: (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=walking`, icone: '<path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10Z"/><circle cx="12" cy="11" r="2.4"/>' },
  { nom: "Waze", titre: "Waze", lien: (p) => `https://waze.com/ul?ll=${p.lat},${p.lon}&navigate=yes`, icone: '<path d="M5 14a7 7 0 1 1 13 0c0 3-3 5-6 5s-3-1-5-1-2-2-2-4Z"/><circle cx="10" cy="11" r=".6"/><circle cx="14" cy="11" r=".6"/>' },
];
let destinationYAller = null;

function ouvrirYAller(p) {
  if (typeof p.lat !== "number" || typeof p.lon !== "number") { notifier("Ce magasin n'a pas encore d'emplacement."); return; }
  destinationYAller = p;
  document.querySelector("#y-aller-sous").textContent = p.nom + (p.adresse ? ` · ${p.adresse}` : "");
  const icone = (d) => `<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  document.querySelector("#y-aller-apps").innerHTML = APPLIS_PLAN.map((a) => `<a class="fp-ligne" href="${a.lien(p)}" target="_blank" rel="noopener" data-y-appli="${a.nom}">${icone(a.icone)}<span>${a.titre}</span></a>`).join("")
    + `<button type="button" class="fp-ligne" data-y-copier>${icone('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>')}<span>Copier l'adresse</span></button>`;
  document.querySelector("#feuille-y-aller").hidden = false;
  document.documentElement.classList.add("feuille-prix-ouverte");
}

function fermerYAller() {
  document.querySelector("#feuille-y-aller").hidden = true;
  if (!document.querySelector(".feuille-prix:not([hidden])")) document.documentElement.classList.remove("feuille-prix-ouverte");
}

document.querySelector("#y-aller-apps").addEventListener("click", async (e) => {
  if (e.target.closest("[data-y-appli]")) { fermerYAller(); return; } // le lien s'ouvre de lui-même
  if (!e.target.closest("[data-y-copier]") || !destinationYAller) return;
  const texte = destinationYAller.adresse || `${destinationYAller.lat}, ${destinationYAller.lon}`;
  try { await navigator.clipboard.writeText(texte); notifier("Adresse copiée."); } catch (err) { notifier(texte); }
  fermerYAller();
});
document.querySelector("#y-aller-voile").addEventListener("click", fermerYAller);
document.querySelector("#y-aller-fermer").addEventListener("click", fermerYAller);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.querySelector("#feuille-y-aller").hidden) fermerYAller(); });
document.querySelector("#ou-aller-resultat").addEventListener("click", (e) => {
  const b = e.target.closest("[data-y-aller]");
  if (b) ouvrirYAller(MAGASINS.find((m) => m.id === b.dataset.yAller) || {});
});
