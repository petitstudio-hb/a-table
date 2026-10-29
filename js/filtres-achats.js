// Filtres de Mes achats (maquette validée par Hugo le 29/10/2026, option B) : bouton « Filtres » avec badge, feuille du bas (supermarché, période,
// produit), puces des filtres actifs à retirer d'un toucher, et pour un produit cherché un bilan (achats, dépensé, prix moyen).
// Le filtrage et la liste par mois sont dans achats.js (afficherAchats, ticketFiltre) : ici, seulement l'interface.

const feuilleFiltresAchats = document.querySelector("#feuille-filtres-achats");
const outilsAchats = document.querySelector("#achats-outils");

const LIB_PERIODE_ACHATS = { 0: "Toute la période", 30: "30 derniers jours", 90: "3 derniers mois", 180: "6 derniers mois" };
const libelleMagasinAchats = (id) => (id === "tous" ? "Tous" : nomMagasin(id));

// Supermarchés qui ont au moins un ticket.
const magasinsAvecTickets = () => [...new Set(ticketsGroupes().map((t) => t.magasin))];

// Bouton, puces et bilan : appelée par afficherAchats avec les tickets qui passent les filtres.
function majOutilsAchats(tickets) {
  const nb = nbFiltresAchats();
  const f = filtresAchats;
  const puces = [
    f.magasin !== "tous" && ["magasin", nomMagasin(f.magasin)],
    f.periode && ["periode", LIB_PERIODE_ACHATS[f.periode]],
    f.produit.trim() && ["produit", f.produit.trim()],
  ].filter(Boolean);
  let bilan = "";
  if (f.produit.trim()) {
    const lignes = tickets.flatMap((t) => t.lignes.filter(ligneCorrespond));
    const depense = lignes.reduce((s, r) => s + montantDe(r), 0);
    const moyen = lignes.length ? lignes.reduce((s, r) => s + r.prix, 0) / lignes.length : 0;
    bilan = `<div class="bilan-produit"><b>${echapper(f.produit.trim())}</b><div class="l"><span>Achats</span><span>${lignes.length}</span></div><div class="l"><span>Dépensé</span><span>${euros(depense)}</span></div><div class="l"><span>Prix moyen</span><span>${euros(moyen)}</span></div></div>`;
  }
  outilsAchats.innerHTML = `<div class="barre-filtres"><button type="button" class="ft-bouton" id="filtres-achats" aria-label="Filtrer mes achats${nb ? `, ${nb} actif${nb > 1 ? "s" : ""}` : ""}">Filtres${nb ? `<span class="ft-nb">${nb}</span>` : ""}</button></div>`
    + (puces.length ? `<div class="ft-puces">${puces.map(([champ, texte]) => `<button type="button" class="actif" data-retirer-achats="${champ}" aria-label="Retirer le filtre : ${echapper(texte)}">${echapper(texte)}</button>`).join("")}</div>` : "")
    + bilan;
}

function groupeFiltreAchats(champ, titre, valeurs, libelle) {
  return `<h4>${titre}</h4><div class="ft-puces" role="group" aria-label="${titre}">${valeurs.map((x) => `<button type="button" data-champ-achats="${champ}" data-valeur="${x}" class="${String(filtresAchats[champ]) === String(x) ? "on" : ""}" aria-pressed="${String(filtresAchats[champ]) === String(x)}">${echapper(libelle(x))}</button>`).join("")}</div>`;
}

function remplirFeuilleFiltresAchats() {
  document.querySelector("#fa-corps").innerHTML =
    groupeFiltreAchats("magasin", "Supermarché", ["tous", ...magasinsAvecTickets()], libelleMagasinAchats)
    + groupeFiltreAchats("periode", "Période", [0, 30, 90, 180], (p) => LIB_PERIODE_ACHATS[p])
    + `<h4>Produit</h4><input type="search" class="recherche" id="fa-produit" placeholder="ex. lait, filets de poulet" autocomplete="off" aria-label="Produit" value="${echapper(filtresAchats.produit)}">`;
}

function ouvrirFiltresAchats() {
  remplirFeuilleFiltresAchats();
  feuilleFiltresAchats.hidden = false;
  document.documentElement.classList.add("feuille-prix-ouverte");
}

function fermerFiltresAchats() {
  feuilleFiltresAchats.hidden = true;
  document.documentElement.classList.remove("feuille-prix-ouverte");
}

outilsAchats.addEventListener("click", (e) => {
  if (e.target.closest("#filtres-achats")) { ouvrirFiltresAchats(); return; }
  const b = e.target.closest("[data-retirer-achats]");
  if (!b) return;
  filtresAchats[b.dataset.retirerAchats] = FILTRES_ACHATS_VIDES[b.dataset.retirerAchats];
  afficherAchats();
});
document.querySelector("#fa-voile").addEventListener("click", fermerFiltresAchats);
document.querySelector("#fa-ok").addEventListener("click", fermerFiltresAchats);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !feuilleFiltresAchats.hidden) fermerFiltresAchats(); });
document.querySelector("#fa-effacer").addEventListener("click", () => {
  filtresAchats = { ...FILTRES_ACHATS_VIDES };
  remplirFeuilleFiltresAchats();
  afficherAchats();
});
document.querySelector("#fa-corps").addEventListener("click", (e) => {
  const b = e.target.closest("[data-champ-achats]");
  if (!b) return;
  const champ = b.dataset.champAchats;
  filtresAchats[champ] = champ === "periode" ? Number(b.dataset.valeur) : b.dataset.valeur;
  remplirFeuilleFiltresAchats();
  afficherAchats(); // la liste derrière la feuille suit en direct
});
document.querySelector("#fa-corps").addEventListener("input", (e) => {
  if (e.target.id !== "fa-produit") return;
  filtresAchats.produit = e.target.value;
  afficherAchats(); // le champ n'est pas redessiné : on garde la saisie et le focus
});
