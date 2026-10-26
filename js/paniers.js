// Page « Mes paniers » (séances 12 et 13, refaite en séance 33) : créer, renommer, supprimer des paniers,
// et composer un panier comme une playlist (ajouter et retirer des produits), directement sous sa ligne.
// Les données (`paniers`) et leur sauvegarde sont dans app.js.
// Un panier est une liste de numéros de produits de ta liste ; le « Panier habituel » existe toujours.

let panierEnModification = null; // id du panier en cours de renommage, ou "__nouveau" pour une création
let panierOuvert = null; // id du panier déplié (un seul à la fois)
let recherchePanier = ""; // texte de la recherche de produits dans le panier déplié

const SUGGESTIONS_PANIERS = ["Ménage", "Protéines", "Apéro", "Petit-déjeuner"];
const MAX_RESULTATS = 150;
const rayonsRepliesPanier = new Set(); // rayons repliés dans la composition d'un panier (R7)

const texteNb = (n) => `${n} produit${n > 1 ? "s" : ""}`;

function afficherPaniers() {
  if (panierOuvert && !paniers.some((p) => p.id === panierOuvert)) panierOuvert = null;
  afficherListePaniers();
}

function afficherListePaniers() {
  const liste = document.querySelector("#liste-paniers");
  const formulaire = (p) => `
    <li class="modif" data-id="${p.id}">
      <div class="formulaire">
        <label class="large">Nom du panier
          <input type="text" data-champ="nom" value="${echapper(p.nom)}" placeholder="ex. Ménage" autocomplete="off">
        </label>
      </div>
      ${p.id === "__nouveau" ? `<div class="suggestions" aria-label="Idées de noms">${SUGGESTIONS_PANIERS.map((s) => `<button type="button" class="puce" data-suggestion="${echapper(s)}">${echapper(s)}</button>`).join("")}</div>` : ""}
      <div class="actions"><button type="button" data-annuler-panier>Annuler</button><button type="button" class="principal" data-enregistrer-panier="${p.id}">${p.id === "__nouveau" ? "Créer" : "Enregistrer"}</button></div>
    </li>`;
  let html = paniers.map((p) => {
    if (p.id === panierEnModification) return formulaire(p);
    const n = p.produits.length;
    const detail = n ? texteNb(n) : "Vide : touche pour y ajouter des produits";
    const ouvert = p.id === panierOuvert;
    return `
      <li data-id="${p.id}" class="${ouvert ? "ouvert" : ""}">
        <button type="button" class="ouvrir" data-ouvrir-panier="${p.id}" aria-expanded="${ouvert}" aria-label="${ouvert ? "Replier" : "Déplier"} le panier ${echapper(p.nom)}">
          <span><strong>${echapper(p.nom)}</strong>${p.id === "habituel" ? ` <em class="etiquette">par défaut</em>` : ""}
            <span class="date">${detail}</span>${blocTotaux(p)}</span>
          <span class="fleche" aria-hidden="true">›</span>
        </button>
        ${ouvert ? detailHtml(p) : ""}
      </li>`;
  }).join("");
  if (panierEnModification === "__nouveau") html += formulaire({ id: "__nouveau", nom: "" });
  liste.innerHTML = html;
  if (panierOuvert) majListesDetail();
  document.querySelector("#creer-panier").hidden = panierEnModification === "__nouveau";
}

// ---------- Totaux par magasin (séance 14) ----------

// Total des prix connus d'un panier dans un magasin, et nombre de prix connus.
function totalPanier(panier, magasin) {
  const prix = panier.produits.map((i) => prixDe(i, magasin.id).prix).filter((p) => p !== null);
  return { total: prix.reduce((a, b) => a + b, 0), connus: prix.length, n: panier.produits.length };
}

// Le moins cher : seulement parmi les magasins qui connaissent au moins 80 % des prix du panier,
// sinon un magasin aux prix manquants paraîtrait faussement moins cher (décision D13).
function magasinMoinsCher(panier) {
  const candidats = visibles().map((m) => ({ m, ...totalPanier(panier, m) })).filter((x) => x.n > 0 && x.connus >= 0.8 * x.n);
  if (candidats.length < 2) return null;
  return candidats.reduce((a, b) => (b.total < a.total ? b : a)).m.id;
}

function blocTotaux(panier) {
  if (!panier.produits.length) return "";
  const mags = visibles();
  if (!mags.length) return "";
  const gagnant = magasinMoinsCher(panier);
  const puces = mags.map((m) => {
    const t = totalPanier(panier, m);
    const classe = m.id === gagnant ? "best" : t.connus ? "" : "vide";
    return `<span class="chip-mag ${classe}">${echapper(nomCourt(m))} <b>${t.connus ? euros(t.total) : "—"}</b> <small>${t.connus}/${t.n}</small></span>`;
  }).join("");
  return `<span class="totaux-panier">${puces}</span>`;
}

// ---------- Panier déplié : composer sur place ----------

const ligneProduit = (i, bouton) => {
  const p = PANIER[i];
  return `<li class="ligne-panier">
    <span><strong>${echapper(p.nom)}</strong>${p.format ? ` <span class="lc-format">${echapper(p.format)}</span>` : ""}
      ${p.marque ? `<span class="date">${echapper(p.marque)}</span>` : ""}</span>
    <span class="boutons">${bouton}</span>
  </li>`;
};

// Les produits regroupés par rayon, avec un bandeau vert par rayon qu'on peut replier (comme dans Ma course).
function lignesParRayon(indices, boutonDe) {
  let html = "";
  let courant = null;
  for (const i of indices) {
    const rayon = PANIER[i].rayon;
    if (rayon !== courant) {
      courant = rayon;
      const replie = rayonsRepliesPanier.has(rayon);
      html += `<li class="rayon-bande"><button type="button" class="rayon-bande-bouton" data-rayon-panier="${echapper(rayon)}" aria-expanded="${!replie}"><span>${echapper(rayon)}</span><span class="fleche">${replie ? "▸" : "▾"}</span></button></li>`;
    }
    if (!rayonsRepliesPanier.has(rayon)) html += ligneProduit(i, boutonDe(i));
  }
  return html;
}

// Le bloc sous la ligne du panier : actions, recherche, produits dans le panier, produits à ajouter.
function detailHtml(panier) {
  return `<div class="detail-deplie">
    <button type="button" class="principal pleine" data-courses-panier>Faire mes courses</button>
    <div class="actions-centre">
      <button type="button" data-dupliquer-panier>Dupliquer</button>
      <button type="button" data-renommer-panier="${panier.id}">Renommer</button>
    </div>
    <div class="champ-recherche">
      <input class="recherche" data-recherche-panier type="search" value="${echapper(recherchePanier)}" placeholder="Rechercher un produit" autocomplete="off" aria-label="Rechercher un produit">
      <button type="button" class="recherche-croix" data-effacer-recherche-panier aria-label="Effacer la recherche" ${recherchePanier ? "" : "hidden"}>×</button>
    </div>
    <h3 class="sous-titre">Dans ce panier</h3>
    <ul class="releves" data-dedans></ul>
    <h3 class="sous-titre">Ajouter des produits</h3>
    <ul class="releves" data-ajout></ul>
    ${panier.id === "habituel" ? "" : `<button type="button" class="lien-supprimer" data-supprimer-panier="${panier.id}">Supprimer ce panier</button>`}
  </div>`;
}

// Met à jour les deux listes du panier déplié, sans toucher au champ de recherche (pour ne pas perdre le curseur).
function majListesDetail() {
  const panier = paniers.find((p) => p.id === panierOuvert);
  const li = document.querySelector(`#liste-paniers li[data-id="${panierOuvert}"]`);
  if (!panier || !li) return;
  const dedans = new Set(panier.produits);
  const requete = sansAccent(recherchePanier.trim());
  const correspond = (i) => !requete || sansAccent(PANIER[i].nom + " " + PANIER[i].rayon + " " + PANIER[i].format).includes(requete);
  const rayons = [...new Set(PANIER.map((p) => p.rayon))];
  const parRayon = (a, b) => rayons.indexOf(PANIER[a].rayon) - rayons.indexOf(PANIER[b].rayon) || a - b;
  li.querySelector(".ouvrir .date").textContent = panier.produits.length ? texteNb(panier.produits.length) : "Vide : touche pour y ajouter des produits";

  const tries = [...dedans].filter(correspond).sort(parRayon);
  li.querySelector("[data-dedans]").innerHTML = tries.length
    ? lignesParRayon(tries, (i) => `<button type="button" data-retirer-produit="${i}" aria-label="Retirer ${echapper(PANIER[i].nom)} du panier">Retirer</button>`)
    : `<li class="vide">${requete && dedans.size ? "Aucun produit du panier ne correspond." : "Ce panier est vide. Ajoute des produits ci-dessous."}</li>`;

  const candidats = produitsActifs().filter((i) => !dedans.has(i)).filter(correspond).sort(parRayon);
  let html = lignesParRayon(candidats.slice(0, MAX_RESULTATS), (i) => `<button type="button" class="ajout" data-ajouter-produit="${i}" aria-label="Ajouter ${echapper(PANIER[i].nom)} au panier">+ Ajouter</button>`);
  if (!candidats.length) html = `<li class="vide">${requete ? "Aucun produit ne correspond à cette recherche." : "Tous les produits de ta liste sont déjà dans ce panier."}</li>`;
  else if (candidats.length > MAX_RESULTATS) html += `<li class="vide">${candidats.length - MAX_RESULTATS} autres produits : affine ta recherche.</li>`;
  li.querySelector("[data-ajout]").innerHTML = html;
  // Les totaux de la ligne suivent les ajouts et les retraits.
  const totaux = li.querySelector(".totaux-panier");
  const neuf = blocTotaux(panier);
  if (totaux) totaux.outerHTML = neuf;
  else if (neuf) li.querySelector(".ouvrir > span").insertAdjacentHTML("beforeend", neuf);
}

// Déplie un panier (replie le précédent), ou le replie s'il était déjà ouvert.
function ouvrirPanier(id) {
  panierOuvert = panierOuvert === id ? null : id;
  panierEnModification = null;
  recherchePanier = "";
  afficherPaniers();
  if (panierOuvert) document.querySelector(`#liste-paniers li[data-id="${panierOuvert}"]`)?.scrollIntoView({ block: "start" });
}

function fermerPanier() {
  if (panierOuvert === null) return;
  panierOuvert = null;
  recherchePanier = "";
  afficherPaniers();
}

// ---------- Créer, renommer, supprimer ----------

function enregistrerPanier(id, nom) {
  nom = nom.trim();
  if (!nom) { notifier("Donne un nom au panier."); return false; }
  if (paniers.some((p) => p.id !== id && p.nom.toLowerCase() === nom.toLowerCase())) { notifier("Un panier porte déjà ce nom."); return false; }
  if (id === "__nouveau") paniers.push({ id: "p" + Date.now().toString(36), nom, produits: [] });
  else paniers.find((p) => p.id === id).nom = nom;
  return true;
}

document.querySelector("#liste-paniers").addEventListener("click", (e) => {
  const ouvrir = e.target.closest("[data-ouvrir-panier]");
  if (ouvrir) { ouvrirPanier(ouvrir.dataset.ouvrirPanier); return; }
  const renommer = e.target.closest("[data-renommer-panier]");
  if (renommer) { panierEnModification = renommer.dataset.renommerPanier; afficherPaniers(); return; }
  if (e.target.closest("[data-annuler-panier]")) { panierEnModification = null; afficherPaniers(); return; }
  const suggestion = e.target.closest("[data-suggestion]");
  if (suggestion) { document.querySelector('#liste-paniers [data-champ="nom"]').value = suggestion.dataset.suggestion; return; }
  const enregistrer = e.target.closest("[data-enregistrer-panier]");
  if (enregistrer) {
    const nom = enregistrer.closest("li").querySelector('[data-champ="nom"]').value;
    const id = enregistrer.dataset.enregistrerPanier;
    if (!enregistrerPanier(id, nom)) return;
    panierEnModification = null;
    sauvegarder();
    toutAfficher();
    // Un panier qu'on vient de créer se déplie tout de suite : on le remplit.
    if (id === "__nouveau") { panierOuvert = null; ouvrirPanier(paniers[paniers.length - 1].id); }
    return;
  }
  const supprimer = e.target.closest("[data-supprimer-panier]");
  if (supprimer) {
    const panier = paniers.find((p) => p.id === supprimer.dataset.supprimerPanier);
    if (!confirm(`Supprimer le panier « ${panier.nom} » ? Les produits et leurs prix ne sont pas effacés.`)) return;
    paniers.splice(paniers.indexOf(panier), 1);
    sauvegarder();
    toutAfficher();
    return;
  }

  // Dans le panier déplié.
  const panier = paniers.find((p) => p.id === panierOuvert);
  if (!panier) return;
  if (e.target.closest("[data-courses-panier]")) {
    panierCourse = panier.id;
    sauvegarder();
    toutAfficher();
    location.hash = "#course";
    return;
  }
  if (e.target.closest("[data-dupliquer-panier]")) {
    let nom = `${panier.nom} (copie)`;
    for (let n = 2; paniers.some((p) => p.nom.toLowerCase() === nom.toLowerCase()); n++) nom = `${panier.nom} (copie ${n})`;
    paniers.push({ id: "p" + Date.now().toString(36), nom, produits: [...panier.produits] });
    sauvegarder();
    toutAfficher();
    panierOuvert = null;
    ouvrirPanier(paniers[paniers.length - 1].id);
    notifier(`Panier dupliqué : ${nom}.`);
    return;
  }
  const rayon = e.target.closest("[data-rayon-panier]");
  if (rayon) {
    const nom = rayon.dataset.rayonPanier;
    rayonsRepliesPanier.has(nom) ? rayonsRepliesPanier.delete(nom) : rayonsRepliesPanier.add(nom);
    majListesDetail();
    return;
  }
  const croix = e.target.closest("[data-effacer-recherche-panier]");
  if (croix) {
    recherchePanier = "";
    const champ = document.querySelector("[data-recherche-panier]");
    champ.value = "";
    croix.hidden = true;
    champ.focus();
    majListesDetail();
    return;
  }
  const ajout = e.target.closest("[data-ajouter-produit]");
  if (ajout) {
    const i = Number(ajout.dataset.ajouterProduit);
    panier.produits.push(i);
    coches.add(i); // un produit ajouté à un panier est à acheter
  }
  const retrait = e.target.closest("[data-retirer-produit]");
  if (retrait) panier.produits = panier.produits.filter((i) => i !== Number(retrait.dataset.retirerProduit));
  if (ajout || retrait) { sauvegarder(); majListesDetail(); }
});

// Recherche dans le panier déplié : filtre les deux listes.
document.querySelector("#liste-paniers").addEventListener("input", (e) => {
  if (!e.target.matches("[data-recherche-panier]")) return;
  recherchePanier = e.target.value;
  e.target.parentElement.querySelector("[data-effacer-recherche-panier]").hidden = !recherchePanier;
  majListesDetail();
});

// Entrée valide le nom, Échap annule.
document.querySelector("#liste-paniers").addEventListener("keydown", (e) => {
  if (!e.target.matches('[data-champ="nom"]')) return;
  if (e.key === "Enter") { e.preventDefault(); e.target.closest("li").querySelector("[data-enregistrer-panier]").click(); }
  if (e.key === "Escape") { panierEnModification = null; afficherPaniers(); }
});

document.querySelector("#creer-panier").addEventListener("click", () => {
  panierEnModification = "__nouveau";
  afficherPaniers();
  document.querySelector('#liste-paniers [data-champ="nom"]')?.focus();
});

afficherPaniers();
