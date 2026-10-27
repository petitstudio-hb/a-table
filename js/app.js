// Cœur de l'application : données, navigation, « Ma course », saisie manuelle,
// « Mes relevés », export et import. La lecture des photos est dans lecture.js.


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
let rayonsReplies = new Set(lire(CLE.replies, []));
let relevesReplies = new Set(lire(CLE.relevesReplies, []));
let rechercheCourse = ""; // texte cherché dans Ma course (sans accent, non mémorisé)
let detailsOuverts = new Set(); // produits dont « voir les autres » est ouvert dans Ma course (non mémorisé)
// Relevé : { produit, magasin, prix, date, promo, quantite, libelle, source, code, envoye }
let releves = lire(CLE.releves, []);

// Les paniers : { id, nom, produits: [indices dans PANIER] }. Le « Panier habituel » reprend d'abord tous les produits de la liste.
let paniers = lire(CLE.paniers, null) || [{ id: "habituel", nom: "Panier habituel", produits: PANIER.map((_, i) => i) }];
const panierHabituel = () => paniers.find((p) => p.id === "habituel");

// Le panier affiché dans « Ma course » : sa liste, ses totaux et ses économies ne portent que sur ses produits.
let panierCourse = lire(CLE.panierCourse, "habituel");
function produitsCourse() {
  if (!paniers.some((p) => p.id === panierCourse)) panierCourse = "habituel";
  return [...paniers.find((p) => p.id === panierCourse).produits].sort((a, b) => a - b);
}

function sauvegarder() {
  invaliderIndexPrix();
  ecrire(CLE.coches, [...coches]);
  ecrire(CLE.compares, compares);
  ecrire(CLE.modeCourses, modeCourses);
  ecrire(CLE.cabas, [...cabas]);
  ecrire(CLE.cabasLibres, cabasLibres);
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

// ---------- Navigation ----------

const VUES = ["photo", "verif", "course", "magasins", "paniers", "releves", "liste", "reglages"];
// Les anciens écrans Sauvegarde, Notifications et À propos sont des sections de Réglages : leurs liens ouvrent la bonne section.
const SECTIONS_REGLAGES = { sauvegarde: "sauvegarde", notifications: "sauvegarde", apropos: "aide" };
// Les écrans ouverts depuis le menu « Mon profil » (pas dans la barre du bas).
const VUES_PROFIL = ["releves", "liste", "reglages"];


// ---------- Transitions entre écrans ----------
const ORDRE_ONGLETS = ["photo", "course", "magasins", "paniers"];
const CLASSES_ANIM = ["anim-fondu", "anim-droite", "anim-gauche", "anim-bas"];
const vueVisible = () => document.querySelector("main > .vue:not([hidden])")?.id.slice(4) || "";

// Un écran du menu profil arrive par le bas ; un onglet arrive du côté où il se trouve dans la barre ; sinon fondu.
function animerVue(avant, apres) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const section = document.querySelector(`#vue-${apres}`);
  if (!section) return;
  const i = ORDRE_ONGLETS.indexOf(avant);
  const j = ORDRE_ONGLETS.indexOf(apres);
  const classe = VUES_PROFIL.includes(apres) ? "anim-bas" : i < 0 || j < 0 ? "anim-fondu" : j > i ? "anim-droite" : "anim-gauche";
  const main = document.querySelector("main");
  section.classList.remove(...CLASSES_ANIM);
  void section.offsetWidth; // relance l'animation si on retouche vite le même onglet
  section.classList.add(classe);
  main.classList.add("en-transition");
  const fin = () => { section.classList.remove(...CLASSES_ANIM); main.classList.remove("en-transition"); clearTimeout(garde); };
  const garde = setTimeout(fin, 500); // filet : la classe est toujours retirée
  section.addEventListener("animationend", fin, { once: true });
}
function montrer(vue) {
  const avant = vueVisible();
  const section = SECTIONS_REGLAGES[vue];
  if (section) vue = "reglages";
  if (!VUES.includes(vue)) vue = "photo";
  if (vue === "verif" && !window.verificationEnCours) vue = "photo";
  for (const v of VUES) document.querySelector(`#vue-${v}`).hidden = v !== vue;
  document.querySelectorAll(".onglets a").forEach((a) => a.classList.toggle("actif", a.dataset.vue === vue));
  document.querySelector("#profil-bouton").classList.toggle("actif", VUES_PROFIL.includes(vue));
  fermerProfil();
  if (vue !== "paniers" && typeof fermerPanier === "function") fermerPanier();
  if (vue === "liste" && typeof afficherListe === "function") afficherListe();
  if (vue === "reglages" && typeof ouvrirReglage === "function") ouvrirReglage(section);
  if (vue === "course" && typeof majNotifs === "function") majNotifs();
  window.scrollTo(0, 0);
  if (avant && avant !== vue) animerVue(avant, vue);
}

// ---------- Menu « Mon profil » ----------

function fermerProfil() {
  document.querySelector("#profil-menu").hidden = true;
  document.querySelector("#profil-bouton").setAttribute("aria-expanded", "false");
}

function basculerProfil() {
  const menu = document.querySelector("#profil-menu");
  menu.hidden = !menu.hidden;
  document.querySelector("#profil-bouton").setAttribute("aria-expanded", String(!menu.hidden));
}

window.addEventListener("hashchange", () => montrer(location.hash.slice(1)));

// ---------- Ma course ----------

function remplirListes() {
  const options = MAGASINS.map((m) => `<option value="${m.id}">${echapper(m.nom)}</option>`).join("");
  produitsCourse(); // vérifie que le panier affiché existe encore
  const choixPanier = document.querySelector("#choix-panier");
  choixPanier.innerHTML = paniers.map((p) => `<option value="${p.id}">${echapper(p.nom)} (${p.produits.length})</option>`).join("");
  choixPanier.value = panierCourse;

  const mag = document.querySelector("#saisie-magasin");
  const magChoisi = mag.value;
  mag.innerHTML = options;
  mag.value = MAGASINS.some((m) => m.id === magChoisi) ? magChoisi : MAGASINS[0]?.id;

  const prod = document.querySelector("#saisie-produit");
  const prodChoisi = prod.value;
  prod.innerHTML = produitsActifs().map((i) => `<option value="${i}">${echapper(PANIER[i].nom)}${PANIER[i].format ? ` (${echapper(PANIER[i].format)})` : ""}</option>`).join("");
  if (prodChoisi) prod.value = prodChoisi;
}

// Nom court d'un magasin pour les petites lignes : « Intermarché Express » devient « Intermarché ».
const nomCourt = (m) => m.nom.split(" ")[0].slice(0, 12);

// Un produit n'a de prix « utile » que s'il est connu ; les totaux ne comptent que les produits cochés.
function totalDe(m) {
  const indices = produitsCourse().filter((i) => coches.has(i));
  const prix = indices.map((i) => prixDe(i, m.id).prix).filter((p) => p !== null);
  return { total: prix.reduce((a, b) => a + b, 0), connus: prix.length, coches: indices.length };
}

// Indice de prix d'un magasin : sur les produits dont au moins deux magasins connaissent le prix, moyenne du rapport
// entre son prix et le prix le plus bas (1 = toujours le moins cher). Il ne dépend pas du nombre de prix connus au total.
function indicesPrix(mags, produits) {
  const res = new Map(mags.map((m) => [m.id, { somme: 0, n: 0 }]));
  for (const i of produits) {
    const connus = mags.map((m) => ({ m, p: prixDe(i, m.id).prix })).filter((x) => x.p !== null && x.p > 0);
    if (connus.length < 2) continue;
    const mini = Math.min(...connus.map((x) => x.p));
    for (const x of connus) { const r = res.get(x.m.id); r.somme += x.p / mini; r.n++; }
  }
  return new Map([...res].map(([id, r]) => [id, { indice: r.n ? r.somme / r.n : null, n: r.n }]));
}

// Classement des magasins : par total quand au moins deux magasins connaissent 80 % des prix cochés (décision D13) ;
// sinon, avec un grand panier, par indice de prix sur les produits connus de plusieurs magasins (au moins 3).
function classerMagasins(mags) {
  const infos = mags.map((m) => ({ m, ...totalDe(m) }));
  const complets = infos.filter((x) => Prix.estComplet(x.connus, x.coches)).sort((a, b) => a.total - b.total);
  const ind = indicesPrix(mags, produitsCourse().filter((i) => coches.has(i)));
  const parIndice = infos.filter((x) => ind.get(x.m.id).n >= 3).sort((a, b) => ind.get(a.m.id).indice - ind.get(b.m.id).indice);
  const modeIndice = complets.length < 2 && parIndice.length >= 2;
  return { infos, ind, classes: modeIndice ? parIndice : complets, modeIndice };
}

// Les magasins dont la colonne de prix est affichée dans la liste (séance 30). `compares` est le choix de l'utilisateur ;
// tant qu'il n'a rien choisi (null), ce sont les deux premiers du classement. Une liste vide est permise : aucune colonne.
function magasinsCompares(mags) {
  if (compares === null) {
    const { infos, classes } = classerMagasins(mags);
    return [...classes, ...infos.filter((x) => !classes.includes(x)).sort((a, b) => b.connus - a.connus)].map((x) => x.m).slice(0, 2);
  }
  return mags.filter((m) => compares.includes(m.id));
}

// Cases à cocher pour choisir les magasins affichés dans Ma course (le même réglage que dans l'onglet Magasins).
let choixMagasinsOuvert = false;
function afficherChoixMagasins() {
  const zone = document.querySelector("#liste-choix-magasins");
  document.querySelector("#choix-magasins").setAttribute("aria-expanded", String(choixMagasinsOuvert));
  document.querySelector("#choix-magasins-texte").textContent = choixMagasinsOuvert ? "Masquer la liste des magasins affichés" : "Choisir les magasins affichés";
  zone.hidden = !choixMagasinsOuvert;
  if (!choixMagasinsOuvert) return;
  zone.innerHTML = MAGASINS.map((m) => `<label class="choix-mag"><input type="checkbox" data-affiche="${m.id}" ${m.affiche !== false ? "checked" : ""}><span>${echapper(m.nom)}${m.adresse ? `<small>${echapper(m.adresse)}</small>` : ""}</span></label>`).join("")
    + `<p class="aide">Décochez un magasin pour le retirer du classement. Il reste dans l'onglet Magasins.</p>`;
}

// Classement des magasins pour le panier, puis la liste avec une colonne de prix par magasin choisi dans le classement.
function afficherCourse() {
  const mags = visibles();
  // En mode courses, on est dans un seul magasin : celui du choix, sinon celui qui connaît le plus de prix.
  if (modeCourses && mags.length && !(compares && compares.length === 1 && mags.some((m) => m.id === compares[0]))) {
    compares = [[...classerMagasins(mags).infos].sort((a, b) => b.connus - a.connus)[0].m.id];
    sauvegarder();
  }
  const colonnes = magasinsCompares(mags);
  const classement = document.querySelector("#classement");
  const liste = document.querySelector("#liste-course");
  document.querySelector("#vue-course").classList.toggle("mode-courses", modeCourses);
  document.querySelector("#course-comparaison").hidden = MAGASINS.length === 0;
  afficherChoixMagasins();

  // 1. Le classement : par total pour les magasins qui connaissent au moins 80 % des prix (décision D13),
  // sinon par indice de prix sur les produits connus de plusieurs magasins.
  const { infos, ind, classes, modeIndice } = classerMagasins(mags);
  document.querySelector("#classement-etiq").textContent = modeIndice ? "OÙ C'EST LE MOINS CHER ? (sur les produits connus de plusieurs magasins)" : "OÙ CE PANIER COÛTE LE MOINS ?";
  const autres = infos.filter((x) => !classes.includes(x));
  classement.innerHTML = [...classes, ...autres].map((x) => {
    const pos = classes.indexOf(x);
    const repere = colonnes.some((c) => c.id === x.m.id) ? "✓" : "";
    const i0 = ind.get(x.m.id);
    const ecart = pos > 0 ? (modeIndice ? `+${Math.round((i0.indice / ind.get(classes[0].m.id).indice - 1) * 100)} % que ${echapper(nomCourt(classes[0].m))}` : `+${euros(x.total - classes[0].total)} que ${echapper(nomCourt(classes[0].m))}`) : "";
    const sous = pos === 0 ? (classes.length > 1 ? "LE MOINS CHER" : "") : pos > 0 ? ecart : "pas assez de prix";
    const principal = pos < 0 ? "—" : modeIndice ? `${i0.n} produits` : euros(x.total);
    return `<button type="button" class="rang ${repere ? "choisi" : ""}" data-compare="${x.m.id}" aria-pressed="${Boolean(repere)}">
      <span class="num ${pos < 0 ? "off" : ""}">${pos < 0 ? "–" : pos + 1}</span>
      <span class="rang-nom">${echapper(x.m.nom)}<small>${x.connus} prix sur ${x.coches}</small></span>
      <span class="rang-prix">${principal}<small>${sous}</small></span>
      <span class="repere ${repere ? "" : "vide"}">${repere}</span></button>`;
  }).join("");

  // La liste : une colonne de prix par magasin choisi dans le classement, le moins cher de la ligne en étiquette jaune.
  if (!mags.length) { liste.innerHTML = ""; document.querySelector("#course-total").textContent = ""; return; }
  // En mode courses, seulement ce qu'il y a à acheter (les produits cochés dans Ma course).
  const correspond = (i) => !rechercheCourse || sansAccent(`${PANIER[i].nom} ${PANIER[i].marque || ""} ${PANIER[i].format || ""}`).includes(rechercheCourse);
  const aListe = (i) => (!modeCourses || coches.has(i)) && correspond(i);
  const rayons = [...new Set(produitsCourse().filter(aListe).map((i) => PANIER[i].rayon))];
  const tete = `<div class="liste-tete" style="--cols:${colonnes.length}"><span>${echapper(paniers.find((p) => p.id === panierCourse)?.nom || "")}</span>${colonnes.map((m) => `<span>${echapper(nomCourt(m)).toUpperCase()}</span>`).join("")}</div>`;
  liste.innerHTML = rayons.length ? tete + rayons
    .map((rayon) => {
      const replie = !rechercheCourse && rayonsReplies.has(rayon); // pendant une recherche, tout est déplié
      const produits = produitsCourse().filter(aListe).map((i) => ({ p: PANIER[i], i })).filter(({ p }) => p.rayon === rayon);
      const lignes = replie ? "" : produits.map(({ p, i }) => {
        const prix = colonnes.map((m) => prixDe(i, m.id));
        const connus = prix.filter((x) => x.prix !== null);
        const mini = connus.length === colonnes.length && colonnes.length > 1 ? Math.min(...prix.map((x) => x.prix)) : null;
        const unique = mini !== null && prix.filter((x) => Math.abs(x.prix - mini) < 0.005).length === 1;
        const variante = prix.find((x) => x.variante)?.variante || "";
        const kg = connus.length ? prixAuKilo(p.format, connus[0].prix) : "";
        const cellules = colonnes.map((m, k) => {
          const { prix: q, saisi } = prix[k];
          const meilleur = unique && Math.abs(q - mini) < 0.005;
          return `<button type="button" class="cellule lc-prix ${q === null ? "manquant" : ""} ${saisi ? "saisi" : ""}" data-produit="${i}" data-magasin="${m.id}" title="Saisir le prix chez ${echapper(m.nom)}">${q === null ? "+ prix" : `<span class="etiquette ${meilleur ? "" : "simple"}">${euros(q).replace(" €", "")}</span>${prix[k].promo ? `<span class="badge-promo">PROMO</span>` : ""}`}</button>`;
        }).join("");
        return `
          <div class="ligne-course ligne-duel ${modeCourses ? (cabas.has(i) ? "pris" : "") : (coches.has(i) ? "" : "decoche")}" style="--cols:${colonnes.length}">
            <label>
              <input type="checkbox" data-index="${i}" ${(modeCourses ? cabas.has(i) : coches.has(i)) ? "checked" : ""}>
              <span class="lc-texte"><span class="lc-nom">${echapper(p.nom)}</span>
                <span class="lc-format">${p.marque ? `${echapper(p.marque)} · ` : ""}${p.format ? `<span class="pastille-format">${echapper(p.format)}</span>` : `<span class="pastille-format vide">contenu à préciser</span>`}${variante ? ` · ${echapper(variante)}` : ""}${kg ? ` <span class="prix-kg">${kg}</span>` : ""}</span></span>
            </label>${cellules}
          </div>`;
      }).join("");
      return `<div class="rayon-course">
        <button type="button" class="rayon-titre" data-rayon="${echapper(rayon)}" aria-expanded="${!replie}">
          <span>${echapper(rayon)}</span><span class="fleche">${replie ? "▸" : "▾"}</span></button>${lignes}</div>`;
    })
    .join("") : rechercheCourse ? `<p class="encart">Aucun produit « ${echapper(document.querySelector("#recherche-course-champ").value.trim())} » dans ce panier.</p>`
      : `<p class="encart">Ce panier est vide. Ajoute des produits dans <a href="#paniers">Mes paniers</a>.</p>`;

  document.querySelector("#course-total").innerHTML = colonnes.map((m) => {
    const t = totalDe(m);
    return `<span>Total ${echapper(m.nom)}</span><strong>${t.connus ? euros(t.total) : "—"}</strong><small>${t.connus}/${t.coches} prix connus</small>`;
  }).join("");
  if (typeof majCourses === "function") majCourses();
  if (typeof majNettoyage === "function") majNettoyage();
}

function afficherTableau() {
  const mags = visibles();
  document.querySelector("#panier-vide").hidden = mags.length > 0;
  document.querySelector("#panier thead tr").innerHTML =
    `<th>Produit</th>` + mags.map((m) => `<th>${echapper(m.nom)}<span>${echapper(m.adresse)}</span></th>`).join("");
  document.querySelector("#panier tfoot tr").innerHTML =
    `<th scope="row">Total des produits cochés</th>` + mags.map((m) => `<td data-total="${m.id}"></td>`).join("");

  // Produits regroupés par rayon, dans l'ordre où chaque rayon apparaît.
  const rayons = [...new Set(produitsCourse().map((i) => PANIER[i].rayon))];
  const ordre = rayons.flatMap((r) => produitsCourse().map((i) => ({ p: PANIER[i], i })).filter(({ p }) => p.rayon === r));

  let html = "";
  let rayonPrecedent = "";
  ordre.forEach(({ p: produit, i }) => {
    if (produit.rayon !== rayonPrecedent) {
      html += `<tr class="rayon"><td colspan="${mags.length + 1}">${echapper(produit.rayon)}</td></tr>`;
      rayonPrecedent = produit.rayon;
    }
    const prix = mags.map((m) => prixDe(i, m.id));
    const connus = prix.map((p) => p.prix).filter((p) => p !== null);
    const meilleur = connus.length > 1 ? Math.min(...connus) : null;

    const cellules = mags.map((m, k) => {
      const { prix: p, saisi } = prix[k];
      const titre = `Saisir le prix chez ${echapper(m.nom)}`;
      if (p === null) return `<td class="manquant"><button class="cellule" data-produit="${i}" data-magasin="${m.id}" title="${titre}">+ prix</button></td>`;
      const classes = [p === meilleur ? "meilleur" : "", saisi ? "saisi" : ""].join(" ");
      return `<td class="${classes}"><button class="cellule" data-produit="${i}" data-magasin="${m.id}" title="${titre}">${euros(p)}</button></td>`;
    }).join("");

    html += `
      <tr data-produit="${i}" class="${coches.has(i) ? "" : "decoche"}">
        <th scope="row">
          <label><input type="checkbox" data-index="${i}" ${coches.has(i) ? "checked" : ""}>
          <span class="nom">${echapper(produit.nom)}<span>${echapper(produit.format)}</span></span></label>
        </th>${cellules}
      </tr>`;
  });
  document.querySelector("#panier tbody").innerHTML = html;
}

function calculer() {
  const mags = visibles();
  const indices = produitsCourse().filter((i) => coches.has(i));

  for (const m of mags) {
    const prix = indices.map((i) => prixDe(i, m.id).prix).filter((p) => p !== null);
    const total = prix.reduce((a, b) => a + b, 0);
    document.querySelector(`[data-total="${m.id}"]`).innerHTML =
      `<strong>${prix.length ? euros(total) : "—"}</strong><span>${prix.length}/${indices.length} prix connus</span>`;
  }

  const n = indices.length;
  document.querySelector("#nb-coches").textContent = `${n} produit${n > 1 ? "s" : ""} coché${n > 1 ? "s" : ""} sur ${produitsCourse().length}`;
  afficherCourse();
}

// ---------- Magasins ----------

let magasinEnModification = null; // identifiant du magasin en cours de modification

function afficherMagasins() {
  const liste = document.querySelector("#liste-magasins");
  const formulaire = (m) => `
    <li class="modif" data-id="${m.id}">
      <div class="formulaire">
        <label>Nom<input type="text" data-champ="nom" value="${echapper(m.nom)}" placeholder="ex. Aldi"></label>
        <label>Rue<input type="text" data-champ="adresse" value="${echapper(m.adresse)}" placeholder="ex. 12 rue de Clignancourt"></label>
      </div>
      <div class="actions"><button type="button" data-annuler-magasin>Annuler</button><button type="button" class="principal" data-enregistrer-magasin="${m.id}">Enregistrer</button></div>
      <button type="button" class="lien-discret" data-supprimer-magasin="${m.id}">Supprimer ce magasin</button>
    </li>`;
  let html = MAGASINS.map((m) => {
    if (m.id === magasinEnModification) return formulaire(m);
    const n = releves.filter((r) => r.magasin === m.id).length;
    return `
      <li data-id="${m.id}">
        <span><strong>${echapper(m.nom)}</strong>
          <span class="date">${echapper(m.adresse) || "Rue non renseignée"} · ${n} relevé${n > 1 ? "s" : ""}</span></span>
        <span class="boutons">
          <label class="interrupteur" title="Afficher dans Ma course"><input type="checkbox" data-afficher="${m.id}" ${m.affiche !== false ? "checked" : ""}><span>Affiché</span></label>
          <span class="fleche" aria-hidden="true">›</span>
        </span>
      </li>`;
  }).join("");
  if (!html) html = `<li class="vide">Aucun magasin. Ajoute-en un avec le bouton ci-dessous.</li>`;
  liste.innerHTML = html;
}

// ---------- Mes relevés ----------

let enModification = null; // indice du relevé en cours de modification
let rechercheReleves = ""; // texte cherché dans Mes relevés (sans accent, non mémorisé)

function afficherReleves() {
  const liste = document.querySelector("#liste-releves");
  document.querySelector("#nb-releves").textContent = releves.length;
  if (!releves.length) {
    liste.innerHTML = `<li class="vide">Aucun prix enregistré pour l'instant. Prends une photo, ou saisis un prix dans « Ma course ».</li>`;
    return;
  }
  const lignes = releves
    .map((r, k) => ({ r, k }))
    .filter(({ r }) => !rechercheReleves || sansAccent(`${PANIER[r.produit].nom} ${r.marque || ""} ${nomMagasin(r.magasin)}`).includes(rechercheReleves))
    .sort((a, b) => b.r.date.localeCompare(a.r.date) || b.k - a.k);
  // Regroupés par rayon, dans l'ordre des rayons de la liste ; chaque rayon se replie.
  const rayons = [...new Set(PANIER.map((p) => p.rayon))].filter((rayon) => lignes.some(({ r }) => PANIER[r.produit].rayon === rayon));
  liste.innerHTML = rayons.map((rayon) => {
    const groupe = lignes.filter(({ r }) => PANIER[r.produit].rayon === rayon);
    const replie = !rechercheReleves && relevesReplies.has(rayon); // pendant une recherche, tout est déplié
    return `<li class="rayon-releve"><button type="button" class="rayon-titre" data-rayon-releve="${echapper(rayon)}" aria-expanded="${!replie}">
      <span>${echapper(rayon)} · ${groupe.length}</span><span class="fleche">${replie ? "▸" : "▾"}</span></button></li>`
      + (replie ? "" : ligneReleves(groupe));
  }).join("") || `<li class="vide">Aucun relevé ne correspond à « ${echapper(document.querySelector("#recherche-releves-champ").value.trim())} ».</li>`;
}

function ligneReleves(groupe) {
  return groupe
    .map(({ r, k }) => {
      const p = PANIER[r.produit];
      const source = r.source === "ticket" ? "ticket" : r.source === "etiquette" ? "étiquette" : "saisie";
      if (k === enModification) {
        return `
          <li class="modif" data-k="${k}">
            <strong>${echapper(p.nom)}</strong>
            <div class="formulaire">
              <label>Prix (€)<input type="text" inputmode="decimal" data-champ="prix" value="${r.prix.toFixed(2).replace(".", ",")}"></label>
              <label>Date<input type="date" data-champ="date" value="${r.date}"></label>
              <label>Magasin<select data-champ="magasin">${MAGASINS.map((m) => `<option value="${m.id}" ${m.id === r.magasin ? "selected" : ""}>${echapper(m.nom)}</option>`).join("")}</select></label>
              <label class="case"><input type="checkbox" data-champ="promo" ${r.promo ? "checked" : ""}> En promo</label>
            </div>
            <div class="actions"><button type="button" data-annuler>Annuler</button><button type="button" class="principal" data-enregistrer="${k}">Enregistrer</button></div>
            <button type="button" class="lien-discret" data-supprimer="${k}">Supprimer ce relevé</button>
          </li>`;
      }
      return `
        <li data-k="${k}">
          <span><strong>${echapper(p.nom)}</strong> chez ${echapper(nomMagasin(r.magasin))} : ${euros(r.prix)}${r.promo ? " <span class=\"badge-promo\">PROMO</span>" : ""}
          <span class="date">${r.marque ? `${echapper(r.marque)} · ` : ""}${r.variante ? `variante : ${echapper(r.variante)} · ` : ""}${prixAuKilo(p.format, r.prix) ? `${prixAuKilo(p.format, r.prix)} · ` : ""}${dateFr(r.date)} · ${source}${r.libelle ? ` · « ${echapper(r.libelle)} »` : ""}</span></span>
          <span class="fleche" aria-hidden="true">›</span>
        </li>`;
    })
    .join("");
}

function toutAfficher() {
  remplirListes();
  afficherTableau();
  calculer();
  afficherMagasins();
  if (typeof afficherPaniers === "function") afficherPaniers();
  if (typeof afficherListe === "function") afficherListe();
  if (typeof majModeReleves === "function") majModeReleves();
  if (typeof afficherTrouves === "function") afficherTrouves(); // met à jour « Déjà ajouté »
  afficherReleves();
  if (typeof afficherEnvoi === "function") afficherEnvoi();
}

// ---------- Saisie manuelle ----------

function ouvrirSaisie(produit, magasin) {
  document.querySelector("#saisie-produit").value = produit;
  document.querySelector("#saisie-magasin").value = magasin;
  const actuel = prixDe(Number(produit), magasin).prix;
  const champ = document.querySelector("#saisie-prix");
  champ.value = actuel === null ? "" : actuel.toFixed(2).replace(".", ",");
  document.querySelector("#saisie-code").value = dernierCode(Number(produit), magasin) || "";
  document.querySelector("#saisie-carte").hidden = false; // le formulaire est replié sous « ⋯ » tant qu'on ne s'en sert pas
  document.querySelector("#saisie").scrollIntoView({ behavior: "smooth", block: "center" });
  champ.focus();
}

const lirePrix = (texte) => parseFloat(String(texte).replace(",", ".").replace(/[^\d.]/g, ""));

// ---------- Export / import ----------

function exporter() {
  const contenu = {
    application: "Cabasito",
    version: 4,
    date: new Date().toISOString(),
    releves,
    produitsAjoutes: PANIER.slice(NB_PRODUITS_BASE),
    magasins: MAGASINS,
    paniers,
    coches: [...coches],
    modifs,
  };
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(new Blob([JSON.stringify(contenu, null, 2)], { type: "application/json" }));
  lien.download = `atable-${aujourdhui()}.json`;
  lien.click();
  if (typeof marquerSauvegarde === "function") marquerSauvegarde();
  URL.revokeObjectURL(lien.href);
}

// Contrôle d'un fichier avant import ou fusion (lot 4) : refuse un fichier abîmé ou d'une version future avec un message clair ;
// un fichier valide est rendu tel quel (seuls les relevés illisibles sont écartés, avec avertissement).
function lireSauvegardeSure(texte) {
  if (typeof DonneesSures === "undefined") return { donnees: JSON.parse(texte), avertissements: [] };
  const res = DonneesSures.lireTexte(texte);
  if (!res.ok) throw new Error(res.erreurs.join(" "));
  const donnees = JSON.parse(texte);
  if (res.avertissements.length) {
    const liste = Array.isArray(donnees) ? donnees : donnees.releves;
    const filtres = liste.filter((r) => DonneesSures.releveValide(r).length === 0);
    if (Array.isArray(donnees)) return { donnees: filtres, avertissements: res.avertissements };
    donnees.releves = filtres;
  }
  return { donnees, avertissements: res.avertissements };
}

async function importer(fichier) {
  const message = document.querySelector("#sauvegarde-message");
  try {
    const { donnees, avertissements } = lireSauvegardeSure(await fichier.text());
    if (Array.isArray(donnees)) {
      // Ancien format (séance 3) : une simple liste de relevés, ajoutée aux relevés actuels.
      const valides = donnees.filter((r) => Number.isInteger(r.produit) && r.produit < PANIER.length && typeof r.prix === "number");
      releves.push(...valides.map((r) => ({ ...r, envoye: Boolean(r.envoye) })));
      message.textContent = `${valides.length} relevé${valides.length > 1 ? "s" : ""} ajouté${valides.length > 1 ? "s" : ""}.`;
    } else if ((donnees.application === "Cabasito" || donnees.application === "A table") && Array.isArray(donnees.releves)) {
      if (!confirm("Remplacer toutes les données de cet appareil par celles du fichier ?")) return;
      PANIER.splice(NB_PRODUITS_BASE, Infinity, ...(donnees.produitsAjoutes || []));
      modifs = donnees.modifs || {};
      appliquerModifs();
      if (Array.isArray(donnees.magasins)) MAGASINS.splice(0, Infinity, ...donnees.magasins);
      else MAGASINS.push(...(donnees.magasinsAjoutes || []).filter((m) => !MAGASINS.some((x) => x.id === m.id)));
      releves = donnees.releves.filter((r) => r.produit < PANIER.length);
      coches = new Set(donnees.coches || PANIER.map((_, i) => i));
      paniers = Array.isArray(donnees.paniers) ? donnees.paniers : [{ id: "habituel", nom: "Panier habituel", produits: PANIER.map((_, i) => i) }];
      for (const p of paniers) p.produits = p.produits.filter((i) => i < PANIER.length);
      message.textContent = `Import terminé : ${releves.length} relevés.`;
    } else {
      throw new Error("format inconnu");
    }
    message.className = "message ok";
    if (avertissements.length) message.textContent += " " + avertissements.join(" ");
    sauvegarder();
    toutAfficher();
  } catch (e) {
    message.textContent = e.message.endsWith(".") ? `Ce fichier ne peut pas être importé. ${e.message}` : `Ce fichier ne peut pas être importé (${e.message}).`;
    message.className = "message erreur";
  }
}

// Fusion de deux sauvegardes (séance 25) : ajoute à ce qu'il y a sur l'appareil ce que contient le fichier, sans rien effacer.
// Les produits identiques (même nom, marque et format) sont reconnus ; les relevés déjà présents ne sont pas doublés.
function fusionnerSauvegarde(donnees) {
  const cle = (p) => [p.nom, p.marque || "", p.format || ""].map((s) => String(s).trim().toLowerCase()).join("|");
  const correspondance = new Map(); // numéro du produit dans le fichier -> numéro ici
  const produitsFichier = [...BASE_ORIGINE.map(() => null), ...(donnees.produitsAjoutes || [])];
  for (let i = 0; i < NB_PRODUITS_BASE; i++) correspondance.set(i, i);
  let produitsAjoutes = 0;
  produitsFichier.forEach((p, i) => {
    if (i < NB_PRODUITS_BASE || !p) return;
    let ici = PANIER.findIndex((q, j) => j >= NB_PRODUITS_BASE && cle(q) === cle(p));
    if (ici === -1) {
      PANIER.push({ ...p, prix: p.prix || {} });
      ici = PANIER.length - 1;
      coches.add(ici);
      panierHabituel()?.produits.push(ici);
      produitsAjoutes++;
    }
    correspondance.set(i, ici);
  });
  const magasinsAjoutes = (donnees.magasins || []).filter((m) => !MAGASINS.some((x) => x.id === m.id));
  MAGASINS.push(...magasinsAjoutes);
  const empreinte = (r) => [r.produit, r.magasin, r.date, r.prix, r.libelle || ""].join("|");
  const connus = new Set(releves.map(empreinte));
  let relevesAjoutes = 0;
  for (const r of donnees.releves || []) {
    if (!correspondance.has(r.produit)) continue;
    const nouveau = { ...r, produit: correspondance.get(r.produit) };
    if (connus.has(empreinte(nouveau))) continue;
    releves.push(nouveau);
    connus.add(empreinte(nouveau));
    relevesAjoutes++;
  }
  for (const p of donnees.paniers || []) {
    if (p.id === "habituel") continue;
    const mappes = (p.produits || []).filter((i) => correspondance.has(i)).map((i) => correspondance.get(i));
    const ici = paniers.find((q) => q.id === p.id || q.nom.trim().toLowerCase() === p.nom.trim().toLowerCase());
    if (ici) { for (const i of mappes) if (!ici.produits.includes(i)) ici.produits.push(i); }
    else paniers.push({ id: p.id, nom: p.nom, produits: mappes });
  }
  return { relevesAjoutes, produitsAjoutes, magasinsAjoutes: magasinsAjoutes.length };
}

async function fusionner(fichier) {
  const message = document.querySelector("#sauvegarde-message");
  try {
    const { donnees, avertissements } = lireSauvegardeSure(await fichier.text());
    if (!((donnees.application === "Cabasito" || donnees.application === "A table") && Array.isArray(donnees.releves))) throw new Error("format inconnu");
    const r = fusionnerSauvegarde(donnees);
    sauvegarder();
    toutAfficher();
    message.textContent = `Fusion terminée : ${r.relevesAjoutes} relevé${r.relevesAjoutes > 1 ? "s" : ""}, ${r.produitsAjoutes} produit${r.produitsAjoutes > 1 ? "s" : ""} et ${r.magasinsAjoutes} magasin${r.magasinsAjoutes > 1 ? "s" : ""} ajoutés. Rien n'a été effacé.`;
    message.className = "message ok";
    if (avertissements.length) message.textContent += " " + avertissements.join(" ");
  } catch (e) {
    message.textContent = e.message.endsWith(".") ? `Ce fichier ne peut pas être fusionné. ${e.message}` : `Ce fichier ne peut pas être fusionné (${e.message}).`;
    message.className = "message erreur";
  }
}

// ---------- Événements ----------

function brancherEvenements() {
  const panier = document.querySelector("#panier");
  panier.addEventListener("change", (e) => {
    if (!e.target.matches("input[type=checkbox]")) return;
    const i = Number(e.target.dataset.index);
    e.target.checked ? coches.add(i) : coches.delete(i);
    e.target.closest("tr").classList.toggle("decoche", !e.target.checked);
    sauvegarder();
    calculer();
  });
  panier.addEventListener("click", (e) => {
    const b = e.target.closest("button.cellule");
    if (b) ouvrirSaisie(b.dataset.produit, b.dataset.magasin);
  });

  document.querySelector("#choix-panier").addEventListener("change", (e) => {
    panierCourse = e.target.value;
    sauvegarder();
    toutAfficher();
  });
  // Choisir les magasins affichés : décocher un magasin le retire du classement et du duel.
  document.querySelector("#choix-magasins").addEventListener("click", () => {
    choixMagasinsOuvert = !choixMagasinsOuvert;
    afficherChoixMagasins();
  });
  document.querySelector("#liste-choix-magasins").addEventListener("change", (e) => {
    const m = MAGASINS.find((x) => x.id === e.target.dataset.affiche);
    if (!m) return;
    m.affiche = e.target.checked;
    sauvegarder();
    toutAfficher();
  });
  // Un magasin touché dans le classement affiche ou masque sa colonne de prix ; on peut tous les masquer.
  document.querySelector("#classement").addEventListener("click", (e) => {
    const b = e.target.closest("[data-compare]");
    if (!b) return;
    const id = b.dataset.compare;
    if (modeCourses) { compares = [id]; sauvegarder(); calculer(); return; } // en magasin : un seul, celui où l'on est
    const actuels = magasinsCompares(visibles()).map((m) => m.id);
    compares = actuels.includes(id) ? actuels.filter((x) => x !== id) : [...actuels, id];
    sauvegarder();
    calculer();
  });
  const listeCourse = document.querySelector("#liste-course");
  listeCourse.addEventListener("change", (e) => {
    if (!e.target.matches("input[type=checkbox]")) return;
    const i = Number(e.target.dataset.index);
    if (modeCourses) { e.target.checked ? cabas.add(i) : cabas.delete(i); sauvegarder(); calculer(); return; }
    e.target.checked ? coches.add(i) : coches.delete(i);
    sauvegarder();
    afficherTableau();
    calculer();
  });
  listeCourse.addEventListener("click", (e) => {
    const rayon = e.target.closest("[data-rayon]");
    if (rayon) {
      const nom = rayon.dataset.rayon;
      rayonsReplies.has(nom) ? rayonsReplies.delete(nom) : rayonsReplies.add(nom);
      sauvegarder();
      afficherCourse();
      return;
    }
    const voir = e.target.closest("[data-voir]");
    if (voir) {
      const i = Number(voir.dataset.voir);
      detailsOuverts.has(i) ? detailsOuverts.delete(i) : detailsOuverts.add(i);
      afficherCourse();
      return;
    }
    const b = e.target.closest("button.cellule");
    if (b) ouvrirSaisie(b.dataset.produit, b.dataset.magasin);
  });
  // Le bouton « ⋯ » range les actions rares de Ma course (tout cocher, tout replier, tout comparer, saisir un prix, magasins affichés).
  document.querySelector("#plus-options").addEventListener("click", (e) => {
    const panneau = document.querySelector("#plus-course");
    panneau.hidden = !panneau.hidden;
    e.currentTarget.setAttribute("aria-expanded", String(!panneau.hidden));
  });
  document.querySelector("#saisie-ouvrir").addEventListener("click", () => {
    const carte = document.querySelector("#saisie-carte");
    carte.hidden = !carte.hidden;
    if (!carte.hidden) carte.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelector("#tout-comparer-bouton").addEventListener("click", (e) => {
    const bloc = document.querySelector("#tout-comparer");
    bloc.hidden = !bloc.hidden;
    e.target.textContent = bloc.hidden ? "Tout comparer" : "Masquer le tableau complet";
    if (!bloc.hidden) bloc.scrollIntoView({ behavior: "smooth", block: "start" });
  });


  const toutCocher = (valeur) => {
    const siens = produitsCourse(); // tout cocher ou décocher ne touche que le panier affiché
    coches = valeur ? new Set([...coches, ...siens]) : new Set([...coches].filter((i) => !siens.includes(i)));
    sauvegarder();
    toutAfficher();
  };
  document.querySelector("#recherche-course-champ").addEventListener("input", (e) => { rechercheCourse = sansAccent(e.target.value.trim()); afficherCourse(); });
  document.querySelector("#tout").addEventListener("click", () => toutCocher(true));
  document.querySelector("#rien").addEventListener("click", () => toutCocher(false));

  document.querySelector("#saisie").addEventListener("submit", (e) => {
    e.preventDefault();
    const prix = lirePrix(document.querySelector("#saisie-prix").value);
    const message = document.querySelector("#saisie-message");
    if (!(prix > 0)) {
      message.textContent = "Indique un prix supérieur à 0.";
      message.className = "message erreur";
      return;
    }
    const releve = {
      produit: Number(document.querySelector("#saisie-produit").value),
      magasin: document.querySelector("#saisie-magasin").value,
      prix: Math.round(prix * 100) / 100,
      date: document.querySelector("#saisie-date").value || aujourdhui(),
      promo: document.querySelector("#saisie-promo").checked,
      quantite: 1,
      libelle: null,
      source: "manuel",
      code: document.querySelector("#saisie-code").value.replace(/\D/g, "") || null,
      envoye: false,
    };
    releves.push(releve);
    sauvegarder();
    toutAfficher();
    message.textContent = `Enregistré : ${PANIER[releve.produit].nom} chez ${nomMagasin(releve.magasin)}, ${euros(releve.prix)}.`;
    message.className = "message ok";
    document.querySelector("#saisie-prix").value = "";
    document.querySelector("#saisie-code").value = "";
    document.querySelector("#saisie-promo").checked = false;
  });

  document.querySelector("#liste-releves").addEventListener("click", (e) => {
    const rayon = e.target.closest("[data-rayon-releve]");
    if (rayon) {
      const nom = rayon.dataset.rayonReleve;
      relevesReplies.has(nom) ? relevesReplies.delete(nom) : relevesReplies.add(nom);
      sauvegarder();
      afficherReleves();
      return;
    }
    const sup = e.target.closest("[data-supprimer]");
    if (sup) {
      releves.splice(Number(sup.dataset.supprimer), 1);
      enModification = null;
      sauvegarder();
      toutAfficher();
      return;
    }
    // Toucher une ligne ouvre sa modification (la suppression s'y trouve).
    const ligne = e.target.closest("li[data-k]:not(.modif)");
    if (ligne) { enModification = Number(ligne.dataset.k); afficherReleves(); return; }
    if (e.target.closest("[data-annuler]")) { enModification = null; afficherReleves(); return; }
    const enr = e.target.closest("[data-enregistrer]");
    if (enr) {
      const li = enr.closest("li");
      const r = releves[Number(enr.dataset.enregistrer)];
      const prix = lirePrix(li.querySelector('[data-champ="prix"]').value);
      if (prix > 0) r.prix = Math.round(prix * 100) / 100;
      r.date = li.querySelector('[data-champ="date"]').value || r.date;
      r.magasin = li.querySelector('[data-champ="magasin"]').value;
      r.promo = li.querySelector('[data-champ="promo"]').checked;
      r.envoye = false;
      enModification = null;
      sauvegarder();
      toutAfficher();
    }
  });

  const listeMagasins = document.querySelector("#liste-magasins");
  listeMagasins.addEventListener("change", (e) => {
    if (!e.target.matches("[data-afficher]")) return;
    MAGASINS.find((m) => m.id === e.target.dataset.afficher).affiche = e.target.checked;
    sauvegarder();
    toutAfficher();
  });
  listeMagasins.addEventListener("click", (e) => {
    // Toucher une ligne ouvre sa modification (la suppression s'y trouve) ; l'interrupteur « Affiché » reste un geste à part.
    const ligne = e.target.closest("li[data-id]:not(.modif)");
    if (ligne && !e.target.closest(".interrupteur")) { magasinEnModification = ligne.dataset.id; afficherMagasins(); return; }
    if (e.target.closest("[data-annuler-magasin]")) { magasinEnModification = null; afficherMagasins(); return; }
    const enr = e.target.closest("[data-enregistrer-magasin]");
    if (enr) {
      const li = enr.closest("li");
      const nom = li.querySelector('[data-champ="nom"]').value.trim();
      const adresse = li.querySelector('[data-champ="adresse"]').value.trim();
      if (!nom) { notifier("Donne un nom au magasin."); return; }
      Object.assign(MAGASINS.find((m) => m.id === enr.dataset.enregistrerMagasin), { nom, adresse });
      magasinEnModification = null;
      sauvegarder();
      toutAfficher();
      return;
    }
    const sup = e.target.closest("[data-supprimer-magasin]");
    if (sup) {
      const m = MAGASINS.find((x) => x.id === sup.dataset.supprimerMagasin);
      const n = releves.filter((r) => r.magasin === m.id).length;
      const question = n
        ? `Supprimer ${m.nom} ? Ses ${n} relevé${n > 1 ? "s" : ""} seront supprimé${n > 1 ? "s" : ""} aussi.`
        : `Supprimer ${m.nom} ?`;
      if (!confirm(question)) return;
      MAGASINS.splice(MAGASINS.indexOf(m), 1);
      releves = releves.filter((r) => r.magasin !== m.id);
      sauvegarder();
      toutAfficher();
    }
  });
  document.querySelector("#ajouter-magasin").addEventListener("click", () => ouvrirAjoutMagasin()); // voir trouver.js

  // Mes relevés : recherche, et « ⋯ » qui range Tout replier / Tout déplier.
  document.querySelector("#recherche-releves-champ").addEventListener("input", (e) => { rechercheReleves = sansAccent(e.target.value.trim()); afficherReleves(); });
  document.querySelector("#plus-releves").addEventListener("click", (e) => {
    const zone = document.querySelector("#plus-releves-zone");
    zone.hidden = !zone.hidden;
    e.currentTarget.setAttribute("aria-expanded", String(!zone.hidden));
  });

  // Tout replier / tout déplier, dans Mes relevés et dans Ma course.
  const rayonsDe = () => [...new Set(PANIER.map((p) => p.rayon))];
  document.querySelector("#releves-replier").addEventListener("click", () => { relevesReplies = new Set(rayonsDe()); sauvegarder(); afficherReleves(); });
  document.querySelector("#releves-deplier").addEventListener("click", () => { relevesReplies = new Set(); sauvegarder(); afficherReleves(); });
  document.querySelector("#course-replier").addEventListener("click", () => { rayonsReplies = new Set(rayonsDe()); sauvegarder(); afficherCourse(); });
  document.querySelector("#course-deplier").addEventListener("click", () => { rayonsReplies = new Set(); sauvegarder(); afficherCourse(); });

  // Menu « Mon profil » : s'ouvre au toucher, se ferme ailleurs ou avec Échap.
  document.querySelector("#profil-bouton").addEventListener("click", (e) => { e.stopPropagation(); basculerProfil(); });
  document.addEventListener("click", (e) => { if (!e.target.closest("#profil-menu")) fermerProfil(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermerProfil(); });
  document.querySelector("#profil-menu").addEventListener("click", (e) => {
    if (e.target.closest("a")) fermerProfil();
  });

  document.querySelector("#exporter").addEventListener("click", exporter);
  document.querySelector("#fusionner").addEventListener("change", (e) => {
    if (e.target.files[0]) fusionner(e.target.files[0]);
    e.target.value = "";
  });
  document.querySelector("#importer").addEventListener("change", (e) => {
    // Remplacer efface les données actuelles : on demande confirmation (la fusion, elle, ne supprime rien).
    if (e.target.files[0] && confirm("Remplacer toutes les données de cet appareil par celles de ce fichier ? Pense à télécharger une sauvegarde avant.")) importer(e.target.files[0]);
    e.target.value = "";
  });
}

document.querySelector("#saisie-date").value = aujourdhui();
brancherEvenements();
toutAfficher();
montrer(location.hash.slice(1) || "photo");
