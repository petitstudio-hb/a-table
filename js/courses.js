// Mode courses (séance 36) : « ma liste de courses à cocher pour quand je suis en magasin ».
// L'interrupteur de Ma course transforme l'écran : un seul magasin (celui où l'on est), tous les produits décochés au départ,
// un appui met le produit dans le cabas (la ligne se barre), un texte libre pour ce qui n'est pas dans la liste, et une barre
// fixe avec le total du cabas. Ce qui est dans le cabas est gardé dans le téléphone : rien ne disparaît si on ferme l'appli,
// si on change de magasin ou de panier, ou si on replie un rayon.
// L'état (modeCourses, cabas, cabasLibres) et l'affichage de la liste sont dans app.js ; ici : l'interrupteur, le texte libre, la barre et la fin.

const vueCourse = document.querySelector("#vue-course");
const barreCourses = document.querySelector("#barre-courses");
const champLibre = document.querySelector("#libre-champ");
const suggLibre = document.querySelector("#sugg-libre");
const listeLibre = document.querySelector("#libre-liste");
const feuilleFin = document.querySelector("#fin-courses");

const magasinCourses = () => magasinsCompares(visibles())[0] || null;
// Les produits qu'il y a à acheter (cochés dans Ma course), et ceux déjà dans le cabas.
const aAcheter = () => produitsCourse().filter((i) => coches.has(i));
const dansCabas = () => aAcheter().filter((i) => cabas.has(i));

function totalCabas() {
  const m = magasinCourses();
  if (!m) return 0;
  const connus = dansCabas().reduce((s, i) => s + (prixCourse(i, m.id).prix || 0), 0);
  const libres = cabasLibres.filter((l) => l.pris && l.i != null).reduce((s, l) => s + (prixCourse(l.i, m.id).prix || 0), 0);
  return connus + libres;
}

// Prix corrigés en rayon pour le magasin des courses : [{ i, prevu, rayon }]. Un prix prévu inconnu ne compte pas dans l'écart (D13).
function correctionsCourses() {
  const m = magasinCourses();
  if (!m) return [];
  return aAcheter().filter((i) => cleRayon(i, m.id) in prixRayon).map((i) => ({ i, prevu: prixDe(i, m.id).prix, rayon: prixRayon[cleRayon(i, m.id)] }));
}
const ecartCourses = () => correctionsCourses().filter((c) => c.prevu !== null).reduce((s, c) => s + (c.rayon - c.prevu), 0);
const texteEcart = (e) => `${e >= 0 ? "+" : "−"}${euros(Math.abs(e))}`;

// Fin des courses : chaque prix corrigé en rayon devient un relevé (source « etiquette » : c'est un prix vu en rayon), puis les corrections sont effacées.
function enregistrerCorrections() {
  const m = magasinCourses();
  const faits = m ? correctionsCourses() : [];
  for (const c of faits) {
    releves.push({ produit: c.i, magasin: m.id, prix: c.rayon, date: aujourdhui(), promo: false, quantite: 1, libelle: null, marque: null, ticket: null, montant: c.rayon, variante: null, source: "etiquette", code: null, envoye: false });
  }
  prixRayon = {};
  corrigeOuverts.clear();
  return faits.length;
}

function afficherLibres() {
  const m = magasinCourses();
  listeLibre.innerHTML = cabasLibres.map((l, k) => {
    const p = l.i != null && m ? prixDe(l.i, m.id).prix : null;
    const detail = [l.i != null ? PANIER[l.i]?.format : "", p == null ? (l.i != null ? "prix inconnu" : "texte libre, sans prix") : euros(p)].filter(Boolean).join(" · ");
    return `<div class="libre-l ${l.pris ? "pris" : ""}" data-libre="${k}"><span class="c"></span><span class="n">${echapper(l.nom)}<small>${echapper(detail)}</small></span><button type="button" class="sup" data-sup-libre="${k}" aria-label="Retirer ${echapper(l.nom)}">×</button></div>`;
  }).join("");
}

// Appelée à la fin de chaque affichage de Ma course (app.js).
function majCourses() {
  const bascule = document.querySelector("#bascule-courses");
  bascule.classList.toggle("on", modeCourses);
  bascule.setAttribute("aria-checked", String(modeCourses));
  barreCourses.hidden = !modeCourses;
  if (!modeCourses) return;
  afficherLibres();
  const m = magasinCourses();
  const total = dansCabas().length + cabasLibres.filter((l) => l.pris).length;
  const reste = aAcheter().length + cabasLibres.length - total;
  document.querySelector("#cabas-totaux").innerHTML = m ? `<span>${echapper(nomCourt(m))} <b>${euros(totalCabas())}</b></span>` : `<span>${total} produit${total > 1 ? "s" : ""}</span>`;
  document.querySelector("#cabas-reste").textContent = reste;
  // Écart entre le prix prévu et le prix vu en rayon, seulement s'il y a des corrections.
  const nb = correctionsCourses().length;
  const ecart = document.querySelector("#cabas-ecart"); // absent des anciennes maquettes (copies de l'écran d'avant le lot 3)
  if (ecart) {
    ecart.hidden = nb === 0;
    ecart.innerHTML = nb ? `<small>Écart prévu / payé</small><b>${texteEcart(ecartCourses())}</b>` : "";
  }
}

// ---------- Interrupteur ----------
document.querySelector("#bascule-courses").addEventListener("click", () => {
  modeCourses = !modeCourses;
  if (!modeCourses) compares = null; // retour aux colonnes habituelles
  sauvegarder();
  calculer();
  window.scrollTo(0, 0);
});

// ---------- Texte libre : produits proposés en tapant ----------
function proposerLibre() {
  const q = sansAccent(champLibre.value.trim());
  if (!q) { suggLibre.hidden = true; return; }
  const m = magasinCourses();
  const trouves = produitsActifs().filter((i) => sansAccent(`${PANIER[i].nom} ${PANIER[i].marque || ""}`).includes(q)).slice(0, 6);
  suggLibre.innerHTML = trouves.map((i) => {
    const p = m ? prixDe(i, m.id).prix : null;
    return `<li><button type="button" data-sugg="${i}"><span>${echapper(PANIER[i].nom)} <small>${echapper(PANIER[i].format || "")}</small></span><small>${p == null ? "prix inconnu" : euros(p)}</small></button></li>`;
  }).join("") + `<li class="nouveau"><button type="button" data-texte="${echapper(champLibre.value.trim())}">+ Ajouter « ${echapper(champLibre.value.trim())} »</button></li>`;
  suggLibre.hidden = false;
}
function ajouterLibre(nom, i) {
  cabasLibres.push({ nom, i, pris: false });
  champLibre.value = "";
  suggLibre.hidden = true;
  sauvegarder();
  majCourses();
}
champLibre.addEventListener("input", proposerLibre);
champLibre.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && champLibre.value.trim()) { e.preventDefault(); ajouterLibre(champLibre.value.trim(), null); }
});
suggLibre.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.sugg !== undefined) ajouterLibre(PANIER[Number(b.dataset.sugg)].nom, Number(b.dataset.sugg));
  else ajouterLibre(b.dataset.texte, null);
});
listeLibre.addEventListener("click", (e) => {
  const sup = e.target.closest("[data-sup-libre]");
  const ligne = e.target.closest("[data-libre]");
  if (!ligne) return;
  const k = Number(ligne.dataset.libre);
  if (sup) cabasLibres.splice(k, 1);
  else cabasLibres[k].pris = !cabasLibres[k].pris;
  sauvegarder();
  majCourses();
});

// ---------- Fin des courses ----------
document.querySelector("#courses-fin").addEventListener("click", () => {
  const manquants = [...aAcheter().filter((i) => !cabas.has(i)).map((i) => PANIER[i].nom), ...cabasLibres.filter((l) => !l.pris).map((l) => l.nom)];
  const pris = dansCabas().length + cabasLibres.filter((l) => l.pris).length;
  document.querySelector("#fin-recap").innerHTML = `${pris} produit${pris > 1 ? "s" : ""} dans le cabas<br>${manquants.length ? `${manquants.length} pas pris : ${echapper(manquants.slice(0, 4).join(", "))}${manquants.length > 4 ? "…" : ""}<br>` : ""}${correctionsCourses().length ? `${correctionsCourses().length} prix corrigé${correctionsCourses().length > 1 ? "s" : ""} en rayon (écart ${texteEcart(ecartCourses())})<br>` : ""}<span class="mono">Total estimé ${euros(totalCabas())}</span>`;
  feuilleFin.hidden = false;
});
document.querySelector("#fin-retour").addEventListener("click", () => { feuilleFin.hidden = true; });
function viderCabas() {
  const corriges = enregistrerCorrections();
  if (corriges) notifier(`${corriges} prix vu${corriges > 1 ? "s" : ""} en rayon enregistré${corriges > 1 ? "s" : ""}.`);
  cabas.clear();
  cabasLibres = [];
  modeCourses = false;
  compares = null;
  feuilleFin.hidden = true;
  sauvegarder();
  calculer();
}
document.querySelector("#fin-scanner").addEventListener("click", () => { viderCabas(); location.hash = "#photo"; });
document.querySelector("#fin-terminer").addEventListener("click", () => { viderCabas(); notifier("Courses terminées. Le cabas est vidé."); });

majCourses();
