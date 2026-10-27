// « Gérer ma liste » (séance 18) : renommer, changer le format ou le rayon,
// fusionner deux produits, supprimer. Un produit supprimé reste en place, masqué,
// pour que les numéros des autres produits ne bougent pas.

let produitEnEdition = null; // { i, mode: "modifier" | "fusionner" }
// La fusion est masquée pour l'instant (retour de test du 23/10/2026) : le code reste, prêt à être réactivé avec une recherche.
const FUSION_ACTIVE = false;

function afficherListe() {
  const zone = document.querySelector("#liste-gestion");
  if (!zone) return;
  const requete = sansAccent(document.querySelector("#liste-recherche")?.value.trim() || "");
  const actifs = produitsActifs().filter((i) => !requete || sansAccent(`${PANIER[i].nom} ${PANIER[i].rayon} ${PANIER[i].format}`).includes(requete));
  const rayons = [...new Set(actifs.map((i) => PANIER[i].rayon))];
  const nbReleves = (i) => releves.filter((r) => r.produit === i).length;
  const ligne = (i) => {
    const p = PANIER[i];
    if (produitEnEdition?.i === i && produitEnEdition.mode === "modifier") {
      return `<li class="modif" data-i="${i}">
        <div class="formulaire">
          <label class="large">Nom<input type="text" data-champ="nom" value="${echapper(p.nom)}"></label>
          <label class="large">Marque<input type="text" data-champ="marque" value="${echapper(p.marque || "")}" placeholder="ex. Lustucru"></label>
          <label>Format<input type="text" data-champ="format" value="${echapper(p.format)}" placeholder="500 g, 1 L…"></label>
          <label>Rayon<input type="text" data-champ="rayon" list="liste-rayons" value="${echapper(p.rayon)}"></label>
        </div>
        <div class="actions"><button type="button" data-annuler-liste>Annuler</button><button type="button" class="principal" data-enregistrer-liste="${i}">Enregistrer</button></div>
      </li>`;
    }
    if (produitEnEdition?.i === i && produitEnEdition.mode === "fusionner") {
      return `<li class="modif" data-i="${i}">
        <strong>${echapper(p.nom)}</strong>
        <p class="aide">Ses ${nbReleves(i)} prix passent sur le produit choisi, puis « ${echapper(p.nom)} » disparaît de la liste.</p>
        <label class="large">Fusionner dans
          <select data-champ="cible">${actifs.filter((j) => j !== i).map((j) => `<option value="${j}">${echapper(PANIER[j].nom)}${PANIER[j].format ? ` (${echapper(PANIER[j].format)})` : ""}</option>`).join("")}</select>
        </label>
        <div class="actions"><button type="button" data-annuler-liste>Annuler</button><button type="button" class="principal" data-fusionner-liste="${i}">Fusionner</button></div>
      </li>`;
    }
    return `<li><span><strong>${echapper(p.nom)}</strong> <span class="lc-format">${p.marque ? `${echapper(p.marque)} · ` : ""}${echapper(p.format)}</span>
      <span class="date">${nbReleves(i)} prix</span></span>
      <span class="boutons"><button type="button" data-modifier-liste="${i}">Modifier</button>${FUSION_ACTIVE ? `<button type="button" data-fusion-liste="${i}">Fusionner</button>` : ""}<button type="button" data-supprimer-liste="${i}" aria-label="Supprimer ${echapper(p.nom)}">✕</button></span></li>`;
  };
  zone.innerHTML = `<datalist id="liste-rayons">${rayons.map((r) => `<option value="${echapper(r)}">`).join("")}</datalist>`
    + (actifs.length ? rayons.map((rayon) => `<div class="rayon-liste"><h3 class="rayon-titre-liste">${echapper(rayon)}</h3><ul class="releves">${actifs.filter((i) => PANIER[i].rayon === rayon).map(ligne).join("")}</ul></div>`).join("")
      : `<p class="encart">${requete ? "Aucun produit ne correspond." : "Ta liste est vide."}</p>`);
  afficherMasques();
}

// Les produits supprimés ou fusionnés, qu'on peut rétablir.
function afficherMasques() {
  const zone = document.querySelector("#liste-masques");
  const masques = PANIER.map((p, i) => i).filter((i) => PANIER[i].masque);
  zone.innerHTML = masques.length
    ? `<h3 class="rayon-titre-liste">Supprimés ou fusionnés</h3><ul class="releves">${masques.map((i) => `<li><span><strong>${echapper(PANIER[i].nom)}</strong> <span class="lc-format">${echapper(PANIER[i].format)}</span></span><span class="boutons"><button type="button" data-retablir-liste="${i}">Rétablir</button></span></li>`).join("")}</ul>`
    : "";
}

// Remet un produit dans la liste et dans le panier habituel. Si les prix avaient été fusionnés dessus
// (ils portent alors son nom en variante), ils lui reviennent.
function retablirProduit(i) {
  invaliderIndexPrix();
  PANIER[i].masque = false;
  if (i < NB_PRODUITS_BASE && modifs[i]) { delete modifs[i].masque; if (!Object.keys(modifs[i]).length) delete modifs[i]; }
  if (!panierHabituel().produits.includes(i)) panierHabituel().produits.push(i);
  coches.add(i);
  for (const r of releves) {
    if (r.produit !== i && r.variante && r.variante === PANIER[i].nom) { r.produit = i; r.variante = null; }
  }
}

function masquerProduit(i) {
  PANIER[i].masque = true;
  if (i < NB_PRODUITS_BASE) modifs[i] = { ...(modifs[i] || {}), masque: true };
  coches.delete(i);
  for (const p of paniers) p.produits = p.produits.filter((x) => x !== i);
}

function enregistrerProduit(i, zone) {
  const nom = zone.querySelector('[data-champ="nom"]').value.trim();
  if (!nom) { alert("Le produit a besoin d'un nom."); return false; }
  const changes = {
    nom,
    marque: zone.querySelector('[data-champ="marque"]').value.trim(),
    format: zone.querySelector('[data-champ="format"]').value.trim(),
    rayon: zone.querySelector('[data-champ="rayon"]').value.trim() || "Ajoutés",
  };
  Object.assign(PANIER[i], changes);
  if (i < NB_PRODUITS_BASE) modifs[i] = { ...(modifs[i] || {}), ...changes };
  return true;
}

function fusionnerProduits(source, cible) {
  invaliderIndexPrix();
  for (const r of releves) {
    if (r.produit !== source) continue;
    r.produit = cible;
    if (!r.variante && PANIER[source].nom !== PANIER[cible].nom) r.variante = PANIER[source].nom;
  }
  for (const p of paniers) {
    if (p.produits.includes(source) && !p.produits.includes(cible)) p.produits.push(cible);
  }
  if (coches.has(source)) coches.add(cible);
  masquerProduit(source);
}

function brancherListe() {
  document.querySelector("#liste-recherche").addEventListener("input", afficherListe);
  const zones = [document.querySelector("#liste-gestion"), document.querySelector("#liste-masques")];
  const clic = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const apres = () => { sauvegarder(); produitEnEdition = null; toutAfficher(); };
    if (b.dataset.retablirListe !== undefined) { retablirProduit(Number(b.dataset.retablirListe)); apres(); notifier("Produit rétabli."); }
    else if (b.dataset.modifierListe !== undefined) { produitEnEdition = { i: Number(b.dataset.modifierListe), mode: "modifier" }; afficherListe(); }
    else if (b.dataset.fusionListe !== undefined) { produitEnEdition = { i: Number(b.dataset.fusionListe), mode: "fusionner" }; afficherListe(); }
    else if (b.hasAttribute("data-annuler-liste")) { produitEnEdition = null; afficherListe(); }
    else if (b.dataset.enregistrerListe !== undefined) {
      const i = Number(b.dataset.enregistrerListe);
      if (enregistrerProduit(i, b.closest("li"))) apres();
    } else if (b.dataset.fusionnerListe !== undefined) {
      const source = Number(b.dataset.fusionnerListe);
      const cible = Number(b.closest("li").querySelector('[data-champ="cible"]').value);
      if (!Number.isInteger(cible)) return;
      fusionnerProduits(source, cible);
      apres();
      notifier("Produits fusionnés.");
    } else if (b.dataset.supprimerListe !== undefined) {
      const i = Number(b.dataset.supprimerListe);
      const n = releves.filter((r) => r.produit === i).length;
      if (!confirm(`Supprimer « ${PANIER[i].nom} » de ta liste${n ? ` ? Ses ${n} prix seront aussi supprimés` : ""} ?`)) return;
      releves = releves.filter((r) => r.produit !== i);
      masquerProduit(i);
      apres();
    }
  };
  zones.forEach((z) => z.addEventListener("click", clic));
}

brancherListe();

afficherListe(); // liste.js se charge après le premier affichage de app.js : on dessine la liste dès maintenant
