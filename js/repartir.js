// « Répartir sur deux magasins » (lot 4, maquette validée par Hugo le 29/10/2026, option C) : un bandeau vert dans Ma course, seulement quand
// l'économie dépasse le déplacement ; le toucher ouvre une feuille du bas avec quoi acheter où. Le calcul est celui de js/repartition.js.
// Honnête par construction : l'économie n'est annoncée que sur les produits dont on connaît les prix, et on dit « sur N produits sur M ».

const CLE_PENALITE = "atable.penaliteDeplacement"; // euros comptés pour le déplacement vers un second magasin
let penaliteDeplacement = Number(lire(CLE_PENALITE, 2));
if (![0, 2, 5, 10].includes(penaliteDeplacement)) penaliteDeplacement = 2;

const bandeauRepartition = document.querySelector("#repartition-bandeau");
const feuilleRepartition = document.querySelector("#feuille-repartition");

// Le meilleur partage du panier affiché (produits cochés) entre les magasins affichés.
function calculRepartition() {
  const produits = produitsCourse().filter((i) => coches.has(i));
  const magasins = visibles().map((m) => m.id);
  return Repartition.meilleurePaire(produits, magasins, (p, m) => prixDe(p, m).prix, { penalite: penaliteDeplacement });
}

const resumeRepartition = (r) => `${echapper(nomMagasin(r.magasins[0]))} + ${echapper(nomMagasin(r.magasins[1]))}`;

// Appelée à la fin de chaque affichage de Ma course (app.js) : le bandeau n'existe que si ça vaut le déplacement (et pas en mode courses).
function majRepartition() {
  const r = !modeCourses ? calculRepartition() : { ok: false };
  const afficher = r.ok && r.vautLeDeplacement;
  bandeauRepartition.hidden = !afficher;
  if (!afficher) return;
  bandeauRepartition.innerHTML = `<span class="txt">Économisez ${euros(r.economieNette)} en deux magasins<small>${resumeRepartition(r)} · déplacement compté</small></span><span class="rp-chev" aria-hidden="true"></span>`;
}

function detailRepartition(r) {
  const bloc = (m) => {
    const lignes = r.parMagasin[m];
    const sousTotal = lignes.reduce((s, p) => s + prixDe(p, m).prix, 0);
    return `<h3>À acheter chez ${echapper(nomMagasin(m))} (${lignes.length})</h3>`
      + lignes.map((p) => `<div class="rp-ligne"><span>${echapper(PANIER[p].nom)}</span><span>${euros(prixDe(p, m).prix)}</span></div>`).join("")
      + `<div class="rp-total"><span>Sous-total</span><span>${euros(sousTotal)}</span></div>`;
  };
  const sans = r.sansPrix.length ? `<div class="rp-note">${r.sansPrix.length} produit${r.sansPrix.length > 1 ? "s" : ""} sans prix connu dans ces magasins : ${r.sansPrix.length > 1 ? "ils ne comptent" : "il ne compte"} pas dans le calcul.</div>` : "";
  return `<div class="rp-detail">${bloc(r.magasins[0])}${bloc(r.magasins[1])}</div>`
    + `<div class="rp-note">Seul chez ${echapper(nomMagasin(r.reference.magasin))} : ${euros(r.reference.total)}. Avec deux magasins : ${euros(r.total)}. Économie brute ${euros(r.economieBrute)}, moins ${euros(penaliteDeplacement)} de déplacement = <b>${euros(r.economieNette)}</b>. Calculé sur ${r.surCombien} produit${r.surCombien > 1 ? "s" : ""} sur ${r.sur}.</div>${sans}`;
}

function remplirFeuilleRepartition() {
  const r = calculRepartition();
  const sous = document.querySelector("#rep-sous");
  const corps = document.querySelector("#rep-corps");
  if (!r.ok) {
    sous.textContent = "";
    corps.innerHTML = `<p>Pas de partage possible : ${echapper(r.raison)}.</p>`;
  } else {
    sous.textContent = r.vautLeDeplacement ? `${nomMagasin(r.magasins[0])} + ${nomMagasin(r.magasins[1])} : ça vaut le déplacement.` : "L'économie ne couvre pas le déplacement compté.";
    corps.innerHTML = detailRepartition(r);
  }
  feuilleRepartition.querySelectorAll("[data-pen]").forEach((b) => b.classList.toggle("on", Number(b.dataset.pen) === penaliteDeplacement));
}

function ouvrirRepartition() {
  remplirFeuilleRepartition();
  feuilleRepartition.hidden = false;
  document.documentElement.classList.add("feuille-prix-ouverte");
}

function fermerRepartition() {
  feuilleRepartition.hidden = true;
  document.documentElement.classList.remove("feuille-prix-ouverte");
  majRepartition(); // un déplacement compté différent peut faire apparaître ou disparaître le bandeau
}

bandeauRepartition.addEventListener("click", ouvrirRepartition);
document.querySelector("#rep-voile").addEventListener("click", fermerRepartition);
document.querySelector("#rep-fermer").addEventListener("click", fermerRepartition);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !feuilleRepartition.hidden) fermerRepartition(); });
feuilleRepartition.addEventListener("click", (e) => {
  const b = e.target.closest("[data-pen]");
  if (!b) return;
  penaliteDeplacement = Number(b.dataset.pen);
  ecrire(CLE_PENALITE, penaliteDeplacement);
  remplirFeuilleRepartition();
});

majRepartition();
