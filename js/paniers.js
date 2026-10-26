// Page « Mes paniers » (séances 12 et 13) : créer, renommer, supprimer des paniers,
// et composer un panier comme une playlist (ajouter et retirer des produits).
// Les données (`paniers`) et leur sauvegarde sont dans app.js.
// Un panier est une liste de numéros de produits de ta liste ; le « Panier habituel » existe toujours.

let panierEnModification = null; // id du panier en cours de renommage, ou "__nouveau" pour une création
let panierOuvert = null; // id du panier dont on compose le contenu (écran « Composer »)

const SUGGESTIONS_PANIERS = ["Ménage", "Protéines", "Apéro", "Petit-déjeuner"];
const MAX_RESULTATS = 40;

const texteNb = (n) => `${n} produit${n > 1 ? "s" : ""}`;
const sansAccent = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function afficherPaniers() {
  if (panierOuvert && !paniers.some((p) => p.id === panierOuvert)) panierOuvert = null;
  document.querySelector("#carte-paniers").hidden = panierOuvert !== null;
  document.querySelector("#detail-panier").hidden = panierOuvert === null;
  if (panierOuvert) afficherDetailPanier();
  else afficherListePaniers();
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
    return `
      <li data-id="${p.id}">
        <button type="button" class="ouvrir" data-ouvrir-panier="${p.id}" aria-label="Composer le panier ${echapper(p.nom)}">
          <span><strong>${echapper(p.nom)}</strong>${p.id === "habituel" ? ` <em class="etiquette">par défaut</em>` : ""}
            <span class="date">${detail}</span>${blocTotaux(p)}</span>
          <span class="fleche" aria-hidden="true">›</span>
        </button>
        <span class="boutons">
          <button type="button" data-renommer-panier="${p.id}">Renommer</button>
          ${p.id === "habituel" ? "" : `<button type="button" data-supprimer-panier="${p.id}" aria-label="Supprimer ${echapper(p.nom)}">✕</button>`}
        </span>
      </li>`;
  }).join("");
  if (panierEnModification === "__nouveau") html += formulaire({ id: "__nouveau", nom: "" });
  liste.innerHTML = html;
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

// ---------- Composer un panier ----------

const ligneProduit = (i, bouton) => {
  const p = PANIER[i];
  return `<li class="ligne-panier">
    <span><strong>${echapper(p.nom)}</strong>${p.format ? ` <span class="lc-format">${echapper(p.format)}</span>` : ""}
      ${p.marque ? `<span class="date">${echapper(p.marque)}</span>` : ""}</span>
    <span class="boutons">${bouton}</span>
  </li>`;
};

// Les produits regroupés par rayon, avec un bandeau vert par rayon (comme dans Ma course).
function lignesParRayon(indices, boutonDe) {
  let html = "";
  let courant = null;
  for (const i of indices) {
    if (PANIER[i].rayon !== courant) {
      courant = PANIER[i].rayon;
      html += `<li class="rayon-bande">${echapper(courant)}</li>`;
    }
    html += ligneProduit(i, boutonDe(i));
  }
  return html;
}

function afficherDetailPanier() {
  const panier = paniers.find((p) => p.id === panierOuvert);
  const dedans = new Set(panier.produits);
  document.querySelector("#detail-nom").textContent = panier.nom;
  document.querySelector("#detail-compte").textContent = panier.produits.length ? texteNb(panier.produits.length) : "Aucun produit pour l'instant";
  document.querySelector("#detail-totaux").innerHTML = blocTotaux(panier);

  // Dans le panier : regroupés comme dans la liste (par rayon).
  const rayons = [...new Set(PANIER.map((p) => p.rayon))];
  const tries = [...dedans].sort((a, b) => rayons.indexOf(PANIER[a].rayon) - rayons.indexOf(PANIER[b].rayon) || a - b);
  document.querySelector("#detail-dedans").innerHTML = tries.length
    ? lignesParRayon(tries, (i) => `<button type="button" data-retirer-produit="${i}" aria-label="Retirer ${echapper(PANIER[i].nom)} du panier">Retirer</button>`)
    : `<li class="vide">Ce panier est vide. Ajoute des produits ci-dessous.</li>`;

  // À ajouter : les produits de ma liste qui n'y sont pas encore, filtrés par la recherche.
  const requete = sansAccent(document.querySelector("#detail-recherche").value.trim());
  const candidats = produitsActifs()
    .filter((i) => !dedans.has(i))
    .filter((i) => !requete || sansAccent(PANIER[i].nom + " " + PANIER[i].rayon + " " + PANIER[i].format).includes(requete))
    .sort((a, b) => rayons.indexOf(PANIER[a].rayon) - rayons.indexOf(PANIER[b].rayon) || a - b);
  const visibles = candidats.slice(0, MAX_RESULTATS);
  let html = lignesParRayon(visibles, (i) => `<button type="button" class="ajout" data-ajouter-produit="${i}" aria-label="Ajouter ${echapper(PANIER[i].nom)} au panier">+ Ajouter</button>`);
  if (!candidats.length) html = `<li class="vide">${requete ? "Aucun produit ne correspond à cette recherche." : "Tous les produits de ta liste sont déjà dans ce panier."}</li>`;
  else if (candidats.length > MAX_RESULTATS) html += `<li class="vide">${candidats.length - MAX_RESULTATS} autres produits : affine ta recherche.</li>`;
  document.querySelector("#detail-ajout").innerHTML = html;
}

function ouvrirPanier(id) {
  panierOuvert = id;
  panierEnModification = null;
  document.querySelector("#detail-recherche").value = "";
  afficherPaniers();
  window.scrollTo(0, 0);
}

function fermerPanier() {
  if (panierOuvert === null) return;
  panierOuvert = null;
  afficherPaniers();
}

document.querySelector("#detail-panier").addEventListener("click", (e) => {
  if (e.target.closest("#retour-paniers")) { fermerPanier(); window.scrollTo(0, 0); return; }
  const panier = paniers.find((p) => p.id === panierOuvert);
  if (e.target.closest("#courses-panier")) {
    panierCourse = panier.id;
    sauvegarder();
    toutAfficher();
    location.hash = "#course";
    return;
  }
  if (e.target.closest("#dupliquer-panier")) {
    let nom = `${panier.nom} (copie)`;
    for (let n = 2; paniers.some((p) => p.nom.toLowerCase() === nom.toLowerCase()); n++) nom = `${panier.nom} (copie ${n})`;
    paniers.push({ id: "p" + Date.now().toString(36), nom, produits: [...panier.produits] });
    sauvegarder();
    toutAfficher();
    ouvrirPanier(paniers[paniers.length - 1].id);
    notifier(`Panier dupliqué : ${nom}.`);
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
  if (ajout || retrait) { sauvegarder(); afficherPaniers(); }
});
document.querySelector("#detail-recherche").addEventListener("input", afficherDetailPanier);

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
    // Un panier qu'on vient de créer s'ouvre tout de suite : on le remplit.
    if (id === "__nouveau") ouvrirPanier(paniers[paniers.length - 1].id);
    return;
  }
  const supprimer = e.target.closest("[data-supprimer-panier]");
  if (supprimer) {
    const panier = paniers.find((p) => p.id === supprimer.dataset.supprimerPanier);
    if (!confirm(`Supprimer le panier « ${panier.nom} » ? Les produits et leurs prix ne sont pas effacés.`)) return;
    paniers.splice(paniers.indexOf(panier), 1);
    sauvegarder();
    toutAfficher();
  }
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
