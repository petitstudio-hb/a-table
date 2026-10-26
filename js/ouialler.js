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
      <span class="rang-prix">${modeIndice ? `${ind.get(x.m.id).n} produits` : euros(x.total)}<small>${k === 0 ? "LE PLUS AVANTAGEUX" : ecart(x)}</small></span></div>`).join("")}
    ${modeIndice ? `<p class="aide">Comparaison sur les produits connus de plusieurs magasins.</p>` : ""}${note}`;
}

document.querySelector("#ou-aller-bouton").addEventListener("click", async () => {
  const zone = document.querySelector("#ou-aller-resultat");
  const bouton = document.querySelector("#ou-aller-bouton");
  bouton.disabled = true;
  zone.innerHTML = `<p class="message">Recherche de votre position…</p>`;
  try {
    const position = await positionGps();
    centreRecherche = position; // gardée en mémoire pour la carte, jamais enregistrée (D9)
    afficherOuAller(position, Number(document.querySelector("#ou-aller-rayon").value));
  } catch (e) {
    zone.innerHTML = `<p class="message erreur">${echapper(e.message)}</p>`;
  } finally {
    bouton.disabled = false;
  }
});
