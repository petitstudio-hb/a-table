// Page « Mes paniers » (séance 12) : créer, renommer et supprimer des paniers.
// Les données (`paniers`) et leur sauvegarde sont dans app.js.
// Un panier est une liste de produits de ta liste ; le « Panier habituel » existe toujours.

let panierEnModification = null; // id du panier en cours de renommage, ou "__nouveau" pour une création

const SUGGESTIONS_PANIERS = ["Ménage", "Protéines", "Apéro", "Petit-déjeuner"];

function afficherPaniers() {
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
    const detail = n ? `${n} produit${n > 1 ? "s" : ""}` : "Vide pour l'instant : tu pourras y ajouter des produits à la prochaine étape";
    return `
      <li data-id="${p.id}">
        <span><strong>${echapper(p.nom)}</strong>${p.id === "habituel" ? ` <em class="etiquette">par défaut</em>` : ""}
          <span class="date">${detail}</span></span>
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

function enregistrerPanier(id, nom) {
  nom = nom.trim();
  if (!nom) { notifier("Donne un nom au panier."); return false; }
  if (paniers.some((p) => p.id !== id && p.nom.toLowerCase() === nom.toLowerCase())) { notifier("Un panier porte déjà ce nom."); return false; }
  if (id === "__nouveau") paniers.push({ id: "p" + Date.now().toString(36), nom, produits: [] });
  else paniers.find((p) => p.id === id).nom = nom;
  return true;
}

document.querySelector("#liste-paniers").addEventListener("click", (e) => {
  const renommer = e.target.closest("[data-renommer-panier]");
  if (renommer) { panierEnModification = renommer.dataset.renommerPanier; afficherPaniers(); return; }
  if (e.target.closest("[data-annuler-panier]")) { panierEnModification = null; afficherPaniers(); return; }
  const suggestion = e.target.closest("[data-suggestion]");
  if (suggestion) { document.querySelector('#liste-paniers [data-champ="nom"]').value = suggestion.dataset.suggestion; return; }
  const enregistrer = e.target.closest("[data-enregistrer-panier]");
  if (enregistrer) {
    const nom = enregistrer.closest("li").querySelector('[data-champ="nom"]').value;
    if (!enregistrerPanier(enregistrer.dataset.enregistrerPanier, nom)) return;
    panierEnModification = null;
    sauvegarder();
    toutAfficher();
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
