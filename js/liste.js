// « Gérer ma liste » (séance 18) : renommer, changer le format ou le rayon,
// fusionner deux produits, supprimer. Un produit supprimé reste en place, masqué,
// pour que les numéros des autres produits ne bougent pas.
// Maquette validée le 03/11/2026 : puces de filtre (Tous / Sans contenu / Sans marque), carte « À compléter » et
// modification dans une feuille du bas avec « Enregistrer et suivant » pour enchaîner les produits sans contenu.

let produitEnEdition = null; // { i, mode: "fusionner" } (la modification, elle, passe par la feuille du bas)
let filtreListe = "tous"; // tous | contenu | marque
let suiteListe = []; // produits sans contenu pris l'un après l'autre
let produitFeuille = null; // produit ouvert dans la feuille du bas
// La fusion est masquée pour l'instant (retour de test du 23/10/2026) : le code reste, prêt à être réactivé avec une recherche.
const FUSION_ACTIVE = false;

function afficherListe() {
  const zone = document.querySelector("#liste-gestion");
  if (!zone) return;
  const requete = sansAccent(document.querySelector("#liste-recherche")?.value.trim() || "");
  const tous = produitsActifs();
  const sansContenu = tous.filter((i) => !PANIER[i].format);
  const sansMarque = tous.filter((i) => !PANIER[i].marque);
  const passeFiltre = (i) => filtreListe === "tous" || (filtreListe === "contenu" && !PANIER[i].format) || (filtreListe === "marque" && !PANIER[i].marque);
  const actifs = tous.filter((i) => passeFiltre(i) && (!requete || sansAccent(`${PANIER[i].nom} ${PANIER[i].rayon} ${PANIER[i].format}`).includes(requete)));
  const rayons = [...new Set(actifs.map((i) => PANIER[i].rayon))];
  const nbReleves = (i) => releves.filter((r) => r.produit === i).length;
  const ligne = (i) => {
    const p = PANIER[i];
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
    return `<li><span><strong>${echapper(p.nom)}</strong> <span class="lc-format">${p.marque ? `${echapper(p.marque)} · ` : ""}${p.format ? echapper(p.format) : `<span class="pastille-format vide">contenu à préciser</span>`}</span>
      <span class="date">${nbReleves(i)} prix</span></span>
      <span class="boutons"><button type="button" data-modifier-liste="${i}">Modifier</button>${FUSION_ACTIVE ? `<button type="button" data-fusion-liste="${i}">Fusionner</button>` : ""}<button type="button" data-supprimer-liste="${i}" aria-label="Supprimer ${echapper(p.nom)}">✕</button></span></li>`;
  };
  const acompleter = sansContenu.length
    ? `<button type="button" class="liste-acompleter" data-completer-liste><span class="txt">${sansContenu.length} produit${sansContenu.length > 1 ? "s" : ""} sans contenu<small>Les compléter un par un (litrage ou grammage)</small></span><span class="liste-chev" aria-hidden="true"></span></button>` : "";
  const puce = (cle, texte, n) => `<button type="button" data-filtre-liste="${cle}" class="${filtreListe === cle ? "on" : ""}" aria-pressed="${filtreListe === cle}">${texte} (${n})</button>`;
  const puces = `<div class="liste-puces" role="group" aria-label="Filtrer la liste">${puce("tous", "Tous", tous.length)}${puce("contenu", "Sans contenu", sansContenu.length)}${puce("marque", "Sans marque", sansMarque.length)}</div>`;
  zone.innerHTML = `<datalist id="liste-rayons">${rayons.map((r) => `<option value="${echapper(r)}">`).join("")}</datalist>` + acompleter + puces
    + (actifs.length ? rayons.map((rayon) => `<div class="rayon-liste"><h3 class="rayon-titre-liste">${echapper(rayon)}</h3><ul class="releves">${actifs.filter((i) => PANIER[i].rayon === rayon).map(ligne).join("")}</ul></div>`).join("")
      : `<p class="encart">${requete || filtreListe !== "tous" ? "Aucun produit ne correspond." : "Ta liste est vide."}</p>`);
  afficherMasques();
}

// ---------- Feuille du bas : modifier un produit ----------

function ouvrirFeuilleProduit(i, suite) {
  produitFeuille = i;
  suiteListe = suite ? produitsActifs().filter((j) => !PANIER[j].format) : [];
  const p = PANIER[i];
  const f = document.querySelector("#feuille-produit");
  f.querySelector('[data-champ="nom"]').value = p.nom;
  f.querySelector('[data-champ="marque"]').value = p.marque || "";
  f.querySelector('[data-champ="format"]').value = p.format || "";
  f.querySelector('[data-champ="format"]').classList.toggle("manque", !p.format);
  f.querySelector('[data-champ="rayon"]').value = p.rayon;
  document.querySelector("#fpp-titre").textContent = p.nom;
  document.querySelector("#fpp-sous").textContent = `${releves.filter((r) => r.produit === i).length} prix relevés`;
  const reste = suiteListe.filter((j) => j !== i && !PANIER[j].format).length;
  document.querySelector("#fpp-ok").textContent = suite && reste ? "Enregistrer et suivant" : "Enregistrer";
  document.querySelector("#fpp-ok").dataset.suite = suite && reste ? "1" : "";
  document.querySelector("#fpp-reste").textContent = suite && reste ? `Encore ${reste} produit${reste > 1 ? "s" : ""} à compléter` : "";
  f.hidden = false;
  document.documentElement.classList.add("feuille-prix-ouverte");
  if (!p.format) f.querySelector('[data-champ="format"]').focus({ preventScroll: true });
}

function fermerFeuilleProduit() {
  document.querySelector("#feuille-produit").hidden = true;
  produitFeuille = null;
  if (!document.querySelector(".feuille-prix:not([hidden])")) document.documentElement.classList.remove("feuille-prix-ouverte");
}

function validerFeuilleProduit() {
  const i = produitFeuille;
  if (i === null || !enregistrerProduit(i, document.querySelector("#feuille-produit"))) return;
  const enchaine = document.querySelector("#fpp-ok").dataset.suite === "1";
  const prochain = suiteListe.find((j) => j !== i && !PANIER[j].format);
  sauvegarder();
  toutAfficher();
  if (enchaine && prochain !== undefined) ouvrirFeuilleProduit(prochain, true);
  else fermerFeuilleProduit();
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
    else if (b.dataset.modifierListe !== undefined) ouvrirFeuilleProduit(Number(b.dataset.modifierListe), false);
    else if (b.dataset.filtreListe !== undefined) { filtreListe = b.dataset.filtreListe; afficherListe(); }
    else if (b.hasAttribute("data-completer-liste")) { const premier = produitsActifs().find((j) => !PANIER[j].format); if (premier !== undefined) ouvrirFeuilleProduit(premier, true); }
    else if (b.dataset.fusionListe !== undefined) { produitEnEdition = { i: Number(b.dataset.fusionListe), mode: "fusionner" }; afficherListe(); }
    else if (b.hasAttribute("data-annuler-liste")) { produitEnEdition = null; afficherListe(); }
    else if (b.dataset.fusionnerListe !== undefined) {
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
  document.querySelector("#fpp-ok").addEventListener("click", validerFeuilleProduit);
  document.querySelector("#fpp-annuler").addEventListener("click", fermerFeuilleProduit);
  document.querySelector("#fpp-voile").addEventListener("click", fermerFeuilleProduit);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.querySelector("#feuille-produit").hidden) fermerFeuilleProduit(); });
  document.querySelector("#feuille-produit").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("input")) { e.preventDefault(); validerFeuilleProduit(); } });
}

brancherListe();

afficherListe(); // liste.js se charge après le premier affichage de app.js : on dessine la liste dès maintenant
