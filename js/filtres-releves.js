// Filtres et tri de Mes relevés (maquette validée par Hugo le 29/10/2026, option B) : un bouton « Filtres » à côté de ⋯, avec un badge du
// nombre de filtres actifs, qui ouvre une feuille du bas. Les filtres actifs se retirent d'un toucher depuis les puces sous la recherche.
// La liste et le filtrage sont dans app.js (afficherReleves, releveFiltre) : ici, seulement l'interface.

const boutonFiltres = document.querySelector("#filtres-releves");
const feuilleFiltres = document.querySelector("#feuille-filtres");
const puces = document.querySelector("#filtres-releves-actifs");

const LIB_SOURCE = { tous: "Toutes les sources", ticket: "Ticket", etiquette: "Étiquette", saisie: "Saisie à la main" };
const LIB_PERIODE = { 0: "Toute la période", 7: "7 derniers jours", 30: "30 derniers jours", 180: "6 derniers mois" };
const LIB_TRI = { rayon: "Par rayon", recent: "Plus récent d'abord", prix: "Prix croissant", nom: "Produit A → Z" };

// Magasins qui ont au moins un relevé (on ne propose pas de filtre qui ne montrerait rien).
const magasinsAvecReleves = () => MAGASINS.filter((m) => releves.some((r) => r.magasin === m.id));
const libelleMagasin = (id) => (id === "tous" ? "Tous les magasins" : nomMagasin(id));

// Badge du bouton et puces des filtres actifs : appelée à chaque affichage de Mes relevés.
function majFiltresReleves() {
  const nb = nbFiltresReleves();
  const badge = document.querySelector("#filtres-releves-nb");
  badge.hidden = nb === 0;
  badge.textContent = nb;
  boutonFiltres.setAttribute("aria-label", nb ? `Filtrer et trier, ${nb} actif${nb > 1 ? "s" : ""}` : "Filtrer et trier");
  const f = filtresReleves, v = FILTRES_RELEVES_VIDES;
  const actifs = [
    f.magasin !== v.magasin && ["magasin", libelleMagasin(f.magasin)],
    f.source !== v.source && ["source", LIB_SOURCE[f.source]],
    f.periode !== v.periode && ["periode", LIB_PERIODE[f.periode]],
    f.tri !== v.tri && ["tri", LIB_TRI[f.tri]],
  ].filter(Boolean);
  puces.hidden = actifs.length === 0;
  puces.innerHTML = actifs.map(([champ, texte]) => `<button type="button" class="actif" data-retirer="${champ}" aria-label="Retirer le filtre : ${echapper(texte)}">${echapper(texte)}</button>`).join("");
}

function groupeFiltre(champ, titre, valeurs, libelle) {
  return `<h4>${titre}</h4><div class="ft-puces" role="group" aria-label="${titre}">${valeurs.map((x) => `<button type="button" data-champ="${champ}" data-valeur="${x}" class="${String(filtresReleves[champ]) === String(x) ? "on" : ""}" aria-pressed="${String(filtresReleves[champ]) === String(x)}">${echapper(libelle(x))}</button>`).join("")}</div>`;
}

function remplirFeuilleFiltres() {
  document.querySelector("#ft-corps").innerHTML =
    groupeFiltre("magasin", "Magasin", ["tous", ...magasinsAvecReleves().map((m) => m.id)], libelleMagasin)
    + groupeFiltre("source", "Source", ["tous", "ticket", "etiquette", "saisie"], (s) => LIB_SOURCE[s])
    + groupeFiltre("periode", "Période", [0, 7, 30, 180], (p) => LIB_PERIODE[p])
    + groupeFiltre("tri", "Trier", ["rayon", "recent", "prix", "nom"], (t) => LIB_TRI[t]);
}

function ouvrirFiltres() {
  remplirFeuilleFiltres();
  feuilleFiltres.hidden = false;
  document.documentElement.classList.add("feuille-prix-ouverte");
}

function fermerFiltres() {
  feuilleFiltres.hidden = true;
  document.documentElement.classList.remove("feuille-prix-ouverte");
}

boutonFiltres.addEventListener("click", ouvrirFiltres);
document.querySelector("#ft-voile").addEventListener("click", fermerFiltres);
document.querySelector("#ft-ok").addEventListener("click", fermerFiltres);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !feuilleFiltres.hidden) fermerFiltres(); });
document.querySelector("#ft-effacer").addEventListener("click", () => {
  filtresReleves = { ...FILTRES_RELEVES_VIDES };
  remplirFeuilleFiltres();
  afficherReleves();
});
document.querySelector("#ft-corps").addEventListener("click", (e) => {
  const b = e.target.closest("[data-champ]");
  if (!b) return;
  const champ = b.dataset.champ;
  filtresReleves[champ] = champ === "periode" ? Number(b.dataset.valeur) : b.dataset.valeur;
  remplirFeuilleFiltres();
  afficherReleves(); // la liste derrière la feuille suit en direct
});
puces.addEventListener("click", (e) => {
  const b = e.target.closest("[data-retirer]");
  if (!b) return;
  filtresReleves[b.dataset.retirer] = FILTRES_RELEVES_VIDES[b.dataset.retirer];
  afficherReleves();
});

majFiltresReleves();
