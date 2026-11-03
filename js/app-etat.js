// Données et état de l'application : clés de stockage, lecture/écriture, produits, magasins, paniers, relevés, index des prix, notifications.
// Premier des quatre fichiers issus de l'ancien app.js (découpage sans changement de comportement) : app-etat.js, app-ecrans.js, app-sauvegardes.js, app.js.
// Scripts classiques qui partagent la portée globale : à charger dans cet ordre.

const CLE = {
  coches: "atable.coches",
  releves: "atable.releves",
  produits: "atable.produits", // produits ajoutés depuis les photos
  magasins: "atable.magasins", // ancien format (séances 6 et avant) : magasins ajoutés depuis les photos
  magasins2: "atable.magasins2", // liste complète des magasins, modifiable (séance 7)
  compares: "atable.compares", // magasins dont la colonne de prix est affichée dans Ma course ; null = les deux premiers du classement (séance 30)
  modeCourses: "atable.modeCourses", // mode courses actif (séance 36)
  cabas: "atable.cabas", // produits mis dans le cabas pendant les courses
  cabasLibres: "atable.cabasLibres", // produits en texte libre ajoutés pendant les courses
  prixRayon: "atable.prixRayon", // prix corrigés en rayon pendant les courses (lot 3), enregistrés en relevés à la fin
  replies: "atable.rayonsReplies", // rayons repliés dans Ma course (séance 9)
  relevesReplies: "atable.relevesReplies", // rayons repliés dans Mes relevés (séance 11)
  paniers: "atable.paniers", // paniers : habituel et paniers libres (séance 12)
  panierCourse: "atable.panierCourse", // panier affiché dans Ma course (séance 15)
  modifs: "atable.modifs", // changements sur les produits de base (séance 18)
};

function lire(cle, defaut) {
  try {
    const v = JSON.parse(localStorage.getItem(cle));
    return v === null ? defaut : v;
  } catch (e) { return defaut; }
}
let avertiStockage = false;
function ecrire(cle, valeur) {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) {
    // Stockage plein ou refusé : on le dit une seule fois, sinon les données ne seraient pas gardées sans que personne le sache.
    if (!avertiStockage) { avertiStockage = true; notifier("Les données ne peuvent pas être enregistrées sur cet appareil. Télécharge une sauvegarde."); }
  }
}

// ---------- État ----------

// Les produits et magasins de donnees.js, complétés par ceux ajoutés sur le site.
const NB_PRODUITS_BASE = PANIER.length;
const BASE_ORIGINE = PANIER.map(({ nom, format, rayon }) => ({ nom, format, rayon }));
PANIER.push(...lire(CLE.produits, []));

// « Gérer ma liste » (séance 18) : les changements faits sur les produits de donnees.js
// (nom, format, rayon, masqué) sont gardés à part ; ceux des produits ajoutés le sont avec eux.
let modifs = lire(CLE.modifs, {});
function appliquerModifs() {
  for (let i = 0; i < NB_PRODUITS_BASE; i++) Object.assign(PANIER[i], BASE_ORIGINE[i], { masque: false }, modifs[i] || {});
}
appliquerModifs();
// Les produits encore utilisables (un produit supprimé reste en place, masqué, pour garder les indices).
const produitsActifs = () => PANIER.map((p, i) => i).filter((i) => !PANIER[i].masque);

// Les magasins : la liste enregistrée sur l'appareil, sinon celle de donnees.js
// complétée par les anciens magasins ajoutés depuis les photos.
{
  const enregistres = lire(CLE.magasins2, null);
  if (enregistres) MAGASINS.splice(0, Infinity, ...enregistres);
  else MAGASINS.push(...lire(CLE.magasins, []));
}

let coches = new Set(lire(CLE.coches, PANIER.map((_, i) => i)));
let compares = lire(CLE.compares, null);
let modeCourses = lire(CLE.modeCourses, false);
const cabas = new Set(lire(CLE.cabas, []));
let cabasLibres = lire(CLE.cabasLibres, []); // { nom, i (numéro de produit connu, ou null), pris }
// Prix vus en rayon et corrigés pendant les courses : { "produit|magasin": prix }. Ils remplacent le prix prévu à l'écran et deviennent
// des relevés à la fin des courses (js/courses.js). corrigeOuverts : lignes dont le champ de correction est déplié.
let prixRayon = lire(CLE.prixRayon, {});
const corrigeOuverts = new Set();
const cleRayon = (i, m) => `${i}|${m}`;
// Prix d'un produit pendant les courses : le prix corrigé en rayon s'il existe, sinon le prix prévu (même forme que prixDe).
function prixCourse(i, m) {
  const prevu = prixDe(i, m);
  const k = cleRayon(i, m);
  return k in prixRayon ? { ...prevu, prix: prixRayon[k], rayon: true, prevu: prevu.prix } : prevu;
}
let rayonsReplies = new Set(lire(CLE.replies, []));
let relevesReplies = new Set(lire(CLE.relevesReplies, []));
let rechercheCourse = ""; // texte cherché dans Ma course (sans accent, non mémorisé)
let detailsOuverts = new Set(); // produits dont « voir les autres » est ouvert dans Ma course (non mémorisé)
// Relevé : { produit, magasin, prix, date, promo, quantite, libelle, source, code, envoye }
let releves = lire(CLE.releves, []);

// Les paniers : { id, nom, produits: [indices dans PANIER] }. Le « Panier habituel » reprend d'abord tous les produits de la liste.
let paniers = lire(CLE.paniers, null) || [{ id: "habituel", nom: "Panier habituel", produits: PANIER.map((_, i) => i) }];
const panierHabituel = () => paniers.find((p) => p.id === "habituel");

// Le panier « Tous » (30/10/2026, demandé par Hugo) : tous les produits actifs de la liste, tenu à jour tout seul, placé après le panier habituel.
// Il ne se modifie pas à la main (pas de renommage, de suppression ni de case) ; on peut le dupliquer pour en faire un panier à soi.
function synchroniserTous() {
  const tous = paniers.find((p) => p.id === "tous");
  const produits = produitsActifs();
  if (tous) { tous.nom = "Tous les produits"; tous.auto = true; tous.produits = produits; return; }
  const k = paniers.findIndex((p) => p.id === "habituel");
  paniers.splice(k + 1, 0, { id: "tous", nom: "Tous les produits", auto: true, produits });
}
synchroniserTous();

// Le panier affiché dans « Ma course » : sa liste, ses totaux et ses économies ne portent que sur ses produits.
let panierCourse = lire(CLE.panierCourse, "habituel");
function produitsCourse() {
  if (!paniers.some((p) => p.id === panierCourse)) panierCourse = "habituel";
  return [...paniers.find((p) => p.id === panierCourse).produits].sort((a, b) => a - b);
}

// Valide le prix vu en rayon d'une ligne : un prix identique au prévu annule la correction.
function validerPrixRayon(i, magasin) {
  const champ = document.querySelector(`[data-prix-rayon="${i}"]`);
  const prix = champ ? lirePrix(champ.value) : NaN;
  const prevu = prixDe(i, magasin).prix;
  if (Number.isFinite(prix) && prix > 0 && Math.abs(prix - (prevu ?? -1)) > 0.004) prixRayon[cleRayon(i, magasin)] = Math.round(prix * 100) / 100;
  else delete prixRayon[cleRayon(i, magasin)];
  corrigeOuverts.delete(i);
  sauvegarder();
  calculer();
}

// Pendant les courses : bouton « ⋯ » d'une ligne et, déplié, le champ « Prix vu en rayon » (lot 3).
function htmlCorrectionRayon(i, magasin, prix) {
  const ouvert = corrigeOuverts.has(i);
  const valeur = prix && prix.prix !== null ? prix.prix.toFixed(2).replace(".", ",") : "";
  return `<button type="button" class="plus3" data-corriger="${i}" aria-expanded="${ouvert}" aria-label="Corriger le prix vu en rayon : ${echapper(PANIER[i].nom)}">⋯</button>`
    + (ouvert ? `<div class="corrige-rayon"><label>Prix vu en rayon<input type="text" inputmode="decimal" data-prix-rayon="${i}" value="${valeur}"></label><button type="button" class="principal" data-ok-rayon="${i}" data-magasin-rayon="${magasin}">Corriger</button></div>` : "");
}

function sauvegarder() {
  synchroniserTous();
  invaliderIndexPrix();
  ecrire(CLE.coches, [...coches]);
  ecrire(CLE.compares, compares);
  ecrire(CLE.modeCourses, modeCourses);
  ecrire(CLE.cabas, [...cabas]);
  ecrire(CLE.cabasLibres, cabasLibres);
  ecrire(CLE.prixRayon, prixRayon);
  ecrire(CLE.replies, [...rayonsReplies]);
  ecrire(CLE.relevesReplies, [...relevesReplies]);
  ecrire(CLE.releves, releves);
  ecrire(CLE.paniers, paniers);
  ecrire(CLE.panierCourse, panierCourse);
  ecrire(CLE.produits, PANIER.slice(NB_PRODUITS_BASE));
  ecrire(CLE.modifs, modifs);
  ecrire(CLE.magasins2, MAGASINS);
}

function ajouterProduit({ nom, format, rayon, marque }) {
  // Un poids ou un volume dans le nom passe dans le contenu (format), sauf si le contenu saisi est lisible et le contredit.
  const a = nom ? propositionProduit({ nom, format }) : null;
  if (a) { nom = a.nom; format = a.format; }
  PANIER.push({ nom: nom || "Produit sans nom", marque: (marque || "").trim(), format: format || "", rayon: rayon || "Ajoutés", prix: {} });
  const i = PANIER.length - 1;
  coches.add(i);
  panierHabituel()?.produits.push(i); // un nouveau produit rejoint le panier habituel
  return i;
}

// Les variantes (oignons rouges, une autre marque…) sont des produits à part entière (demande de Hugo, 03/11/2026).
// Une seule fois, les relevés qui portaient une variante passent sur un produit à eux ; une copie des relevés est gardée sur l'appareil.
function separerVariantes() {
  const norme = (t) => sansAccent(String(t || "")).toLowerCase().trim();
  const connus = new Map();
  let n = 0;
  for (const r of releves) {
    if (!r.variante || !PANIER[r.produit]) continue;
    const nom = String(r.variante).trim();
    if (!nom || norme(nom) === norme(PANIER[r.produit].nom)) { r.variante = null; continue; }
    const cle = norme(nom);
    let i = connus.get(cle);
    if (i === undefined) {
      i = PANIER.findIndex((p) => !p.masque && norme(p.nom) === cle);
      if (i < 0) i = ajouterProduit({ nom, rayon: PANIER[r.produit].rayon, marque: r.marque || "" });
      connus.set(cle, i);
    }
    r.produit = i; r.variante = null; n++;
  }
  return n;
}

function ajouterMagasin(nom, adresse = "") {
  const id = "m" + Date.now().toString(36);
  MAGASINS.push({ id, nom: nom || "Nouveau magasin", adresse });
  return id;
}

// Les magasins affichés dans « Ma course » (tous, sauf ceux que Hugo a masqués).
const visibles = () => MAGASINS.filter((m) => m.affiche !== false);

const nomMagasin = (id) => MAGASINS.find((m) => m.id === id)?.nom || "Magasin inconnu";

// Prix à utiliser : le relevé le plus récent, sinon celui de donnees.js.
// Index (produit, magasin) → dernier relevé, reconstruit quand la liste des relevés change (lot 2, résultats identiques).
let indexPrix = null, indexRef = null, indexLong = -1;
const invaliderIndexPrix = () => { indexPrix = null; };
const cleIndexPrix = (p, m) => typeof p + p + "|" + typeof m + m;
function indexerPrix() {
  if (indexPrix && indexRef === releves && indexLong === releves.length) return indexPrix;
  indexPrix = new Map();
  for (const r of releves) {
    const k = cleIndexPrix(r.produit, r.magasin);
    const d = indexPrix.get(k);
    if (!d || r.date >= d.date) indexPrix.set(k, r);
  }
  indexRef = releves; indexLong = releves.length;
  return indexPrix;
}
function prixDe(i, magasin) {
  const dernier = indexerPrix().get(cleIndexPrix(i, magasin));
  if (dernier) return { prix: dernier.prix, saisi: true, variante: dernier.variante || "", promo: Boolean(dernier.promo) };
  return { prix: PANIER[i].prix[magasin] ?? null, saisi: false, variante: "", promo: false };
}

// Dernier code-barres connu pour ce produit dans ce magasin (utile pour Open Prices).
function dernierCode(i, magasin) {
  const avecCode = releves.filter((r) => r.produit === i && r.magasin === magasin && r.code);
  return avecCode.length ? avecCode[avecCode.length - 1].code : null;
}

// Petit message temporaire en bas de l'écran.
function notifier(texte) {
  let bulle = document.querySelector("#bulle");
  if (!bulle) {
    bulle = document.createElement("div");
    bulle.id = "bulle";
    bulle.setAttribute("role", "status");
    document.body.append(bulle);
  }
  bulle.textContent = texte;
  bulle.classList.add("visible");
  clearTimeout(notifier.minuteur);
  notifier.minuteur = setTimeout(() => bulle.classList.remove("visible"), 3500);
}

