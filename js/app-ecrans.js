// Écrans : navigation et transitions, menu Mon profil, Ma course, Magasins, Mes relevés (dont la feuille Par produit), saisie manuelle d'un prix (fait suite à app-etat.js).

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
  if (vue === "photo" && window.verificationEnCours) vue = "verif"; // un ticket en cours de vérification est rouvert quand on revient sur Photo, pas perdu (06/11/2026)
  for (const v of VUES) document.querySelector(`#vue-${v}`).hidden = v !== vue;
  document.querySelectorAll(".onglets a").forEach((a) => a.classList.toggle("actif", a.dataset.vue === (vue === "verif" ? "photo" : vue)));
  document.querySelector("#profil-bouton").classList.toggle("actif", VUES_PROFIL.includes(vue));
  fermerProfil();
  if (vue !== "paniers" && typeof fermerPanier === "function") fermerPanier();
  if (vue === "liste" && typeof afficherListe === "function") afficherListe();
  if (vue === "reglages" && typeof ouvrirReglage === "function") ouvrirReglage(section);
  if (vue === "course" && typeof majNotifs === "function") majNotifs();
  window.scrollTo(0, 0);
  if (avant && avant !== vue) animerVue(avant, vue);
  if (typeof placerSoulignes === "function") placerSoulignes(); // le trait des bascules se replace dès que l'écran est visible (js/bascules.js)
  if (vue === "photo" && typeof majPhoto === "function") majPhoto(); // accueil du premier lancement ou écran Photo habituel
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

// Classement replié : seul le moins cher se voit, les autres se déplient d'un toucher (maquette validée le 30/10/2026, option K3).
let classementOuvert = false;

// Produits de même nom mais de contenu ou de marque différents (emmental 100 g et 200 g) : comparés au kilo ou au litre,
// le moins cher en jaune (maquette validée le 09/11/2026). Seulement quand au moins deux versions ont un prix et un contenu lisible.
function majVersions() {
  const zone = document.querySelector("#course-versions");
  if (!zone) return;
  const groupes = new Map();
  for (const i of produitsActifs()) {
    const cle = sansAccent(PANIER[i].nom).toLowerCase().trim();
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(i);
  }
  const blocs = [];
  for (const ids of groupes.values()) {
    const versions = ids.map((i) => {
      const c = contenance(PANIER[i].format);
      const prix = MAGASINS.map((m) => prixDe(i, m.id).prix).filter((p) => p !== null);
      return c && prix.length ? { i, kg: (Math.min(...prix) / c.qte) * 1000, type: c.type } : null;
    }).filter(Boolean);
    if (versions.length < 2 || new Set(versions.map((v) => v.type)).size > 1) continue;
    const mini = Math.min(...versions.map((v) => v.kg));
    const uniq = versions.filter((v) => Math.abs(v.kg - mini) < 0.005).length === 1;
    const unite = versions[0].type === "g" ? "kg" : "L";
    blocs.push(`<h3>${echapper(PANIER[versions[0].i].nom)} : ${versions.length} versions</h3>`
      + versions.map((v) => `<div class="vers-l"><span>${echapper(PANIER[v.i].format)}${PANIER[v.i].marque ? ` · ${echapper(PANIER[v.i].marque)}` : ""}</span><span class="etiquette ${uniq && Math.abs(v.kg - mini) < 0.005 ? "" : "simple"}">${euros(v.kg)}/${unite}</span></div>`).join(""));
  }
  zone.innerHTML = blocs.slice(0, 3).join("");
  zone.hidden = modeCourses || !blocs.length;
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
  majVersions();
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

  const nbAutres = infos.length - 1, voir = document.querySelector("#classement-voir");
  classement.classList.toggle("replie", nbAutres >= 1 && !classementOuvert);
  voir.hidden = nbAutres < 1;
  voir.setAttribute("aria-expanded", String(classementOuvert));
  voir.innerHTML = (classementOuvert ? `Masquer les ${nbAutres} autres` : `Voir les ${nbAutres} autre${nbAutres > 1 ? "s" : ""} magasin${nbAutres > 1 ? "s" : ""}`) + `<i class="chev ${classementOuvert ? "haut" : "bas"}" aria-hidden="true"></i>`;

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
        const prix = colonnes.map((m) => (modeCourses ? prixCourse(i, m.id) : prixDe(i, m.id)));
        const connus = prix.filter((x) => x.prix !== null);
        // Le moins cher est en jaune dès que deux magasins au moins ont un prix (06/11 : un magasin sans prix ne bloque plus le jaune).
        const mini = connus.length >= 2 ? Math.min(...connus.map((x) => x.prix)) : null;
        const unique = mini !== null && connus.filter((x) => Math.abs(x.prix - mini) < 0.005).length === 1;
        const variante = prix.find((x) => x.variante)?.variante || "";
        const kg = connus.length ? prixAuKilo(p.format, connus[0].prix) : "";
        const cellules = colonnes.map((m, k) => {
          const { prix: q, saisi } = prix[k];
          const meilleur = unique && q !== null && Math.abs(q - mini) < 0.005;
          return `<button type="button" class="cellule lc-prix ${q === null ? "manquant" : ""} ${saisi ? "saisi" : ""}" data-produit="${i}" data-magasin="${m.id}" title="Saisir le prix chez ${echapper(m.nom)}">${q === null ? "+ prix" : `<span class="etiquette ${meilleur ? "" : "simple"}">${euros(q).replace(" €", "")}</span>${prix[k].promo ? `<span class="badge-promo">PROMO</span>` : ""}`}</button>`;
        }).join("");
        return `
          <div class="ligne-course ligne-duel ${modeCourses ? (cabas.has(i) ? "pris" : "") : (coches.has(i) ? "" : "decoche")}" style="--cols:${colonnes.length}">
            <label>
              <input type="checkbox" data-index="${i}" ${(modeCourses ? cabas.has(i) : coches.has(i)) ? "checked" : ""}>
              <span class="lc-texte"><span class="lc-nom">${echapper(p.nom)}</span>
                <span class="lc-format">${p.marque ? `${echapper(p.marque)} · ` : ""}${p.format ? `<span class="pastille-format">${echapper(p.format)}</span>` : `<span class="pastille-format vide">contenu à préciser</span>`}${variante ? ` · ${echapper(variante)}` : ""}${kg ? ` <span class="prix-kg">${kg}</span>` : ""}${modeCourses && prix[0]?.rayon ? ` · prévu ${prix[0].prevu === null ? "?" : euros(prix[0].prevu)} · en rayon` : ""}</span></span>
            </label>${cellules}${modeCourses && colonnes.length === 1 ? htmlCorrectionRayon(i, colonnes[0].id, prix[0]) : ""}
          </div>`;
      }).join("");
      return `<div class="rayon-course">
        <button type="button" class="rayon-titre" data-rayon="${echapper(rayon)}" aria-expanded="${!replie}">
          <span>${echapper(rayon)}</span><span class="fleche" aria-hidden="true"></span></button>${lignes}</div>`;
    })
    .join("") : rechercheCourse ? `<p class="encart">Aucun produit « ${echapper(document.querySelector("#recherche-course-champ").value.trim())} » dans ce panier.</p>`
      : `<p class="encart">Ce panier est vide. Ajoute des produits dans <a href="#paniers">Mes paniers</a>.</p>`;

  document.querySelector("#course-total").innerHTML = colonnes.map((m) => {
    const t = totalDe(m);
    return `<span>Total ${echapper(m.nom)}</span><strong>${t.connus ? euros(t.total) : "—"}</strong><small>${t.connus}/${t.coches} prix connus</small>`;
  }).join("");
  if (typeof majCourses === "function") majCourses();
  if (typeof majRepartition === "function") majRepartition();
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
          <span class="fleche" aria-hidden="true"></span>
        </span>
      </li>`;
  }).join("");
  if (!html) html = `<li class="vide">Aucun magasin. Ajoute-en un avec le bouton ci-dessous.</li>`;
  liste.innerHTML = html;
}

// ---------- Mes relevés ----------

let enModification = null; // indice du relevé en cours de modification
let rechercheReleves = ""; // texte cherché dans Mes relevés (sans accent, non mémorisé)
// Filtres et tri de Mes relevés (lot « filtres », maquette validée le 29/10/2026) : non mémorisés, comme la recherche.
// source : ticket | etiquette | saisie ; periode : nombre de jours (0 = toute la période) ; tri : produit (par défaut, 03/11/2026) | rayon | recent | prix | nom
const FILTRES_RELEVES_VIDES = { magasin: "tous", source: "tous", periode: 0, tri: "produit" };
let filtresReleves = { ...FILTRES_RELEVES_VIDES };
const nbFiltresReleves = () => ["magasin", "source", "periode", "tri"].filter((c) => filtresReleves[c] !== FILTRES_RELEVES_VIDES[c]).length;

// Ce relevé passe-t-il les filtres (hors recherche) ?
function releveFiltre(r) {
  const f = filtresReleves;
  if (f.magasin !== "tous" && r.magasin !== f.magasin) return false;
  if (f.source !== "tous" && (f.source === "saisie" ? r.source === "ticket" || r.source === "etiquette" : r.source !== f.source)) return false;
  if (f.periode) {
    const limite = new Date();
    limite.setDate(limite.getDate() - f.periode);
    if (r.date < limite.toISOString().slice(0, 10)) return false;
  }
  return true;
}

function afficherReleves() {
  majFeuilleReleves(); // la feuille d'un produit, si elle est ouverte, suit les changements
  const liste = document.querySelector("#liste-releves");
  document.querySelector("#nb-releves").textContent = releves.length;
  if (typeof majFiltresReleves === "function") majFiltresReleves();
  if (!releves.length) {
    liste.innerHTML = `<li class="vide">Aucun prix enregistré pour l'instant. Prends une photo, ou saisis un prix dans « Ma course ».</li>`;
    return;
  }
  const lignes = releves
    .map((r, k) => ({ r, k }))
    .filter(({ r }) => releveFiltre(r) && (!rechercheReleves || sansAccent(`${PANIER[r.produit].nom} ${r.marque || ""} ${nomMagasin(r.magasin)}`).includes(rechercheReleves)))
    .sort((a, b) => {
      const parDate = b.r.date.localeCompare(a.r.date) || b.k - a.k;
      if (filtresReleves.tri === "prix") return a.r.prix - b.r.prix || parDate;
      if (filtresReleves.tri === "nom") return PANIER[a.r.produit].nom.localeCompare(PANIER[b.r.produit].nom, "fr") || parDate;
      return parDate;
    });
  const message = rechercheReleves || nbFiltresReleves() ? `Aucun relevé ne correspond à ces filtres ou à cette recherche.` : "";
  // « Par produit » (maquette validée le 03/11/2026) : une ligne par produit avec son meilleur prix et sa tendance ; toucher une ligne ouvre une feuille du bas.
  if (filtresReleves.tri === "produit") {
    const parProduit = new Map(); // relevés regroupés une seule fois (au lieu d'un filtre de toute la liste par produit)
    for (const l of lignes) { const g = parProduit.get(l.r.produit); if (g) g.push(l); else parProduit.set(l.r.produit, [l]); }
    const ids = [...parProduit.keys()].sort((a, b) => PANIER[a].nom.localeCompare(PANIER[b].nom, "fr"));
    liste.innerHTML = ids.length ? ids.map((i) => {
      const siens = parProduit.get(i);
      const derniers = new Map();
      for (const { r } of siens) { const d = derniers.get(r.magasin); if (!d || r.date >= d.date) derniers.set(r.magasin, r); }
      const meilleur = [...derniers.values()].reduce((m, x) => (!m || x.prix < m.prix ? x : m), null);
      const serie = Historique.serie(releves, i, meilleur.magasin);
      const v = serie.length > 1 ? Historique.variation(serie) : null;
      const tendance = v ? ` · <span class="${v.pourcent >= 0 ? "rp-hausse" : "rp-baisse"}">${v.pourcent >= 0 ? "▲" : "▼"} ${String(Math.abs(v.pourcent)).replace(".", ",")} %</span>` : "";
      return `<li class="rel-produit"><button type="button" data-produit-releves="${i}"><span class="txt"><b>${echapper(PANIER[i].nom)}</b><small>${siens.length} relevé${siens.length > 1 ? "s" : ""} · ${derniers.size} magasin${derniers.size > 1 ? "s" : ""}</small></span><span class="pr">${euros(meilleur.prix)}<small>chez ${echapper(nomMagasin(meilleur.magasin))}${tendance}</small></span><span class="chev" aria-hidden="true"></span></button></li>`;
    }).join("") : `<li class="vide">${message}</li>`;
    return;
  }
  // « Plus récent d'abord » : une seule liste du plus récent au plus ancien, sans rayons.
  if (filtresReleves.tri === "recent") {
    liste.innerHTML = lignes.length ? ligneReleves(lignes) : `<li class="vide">${message}</li>`;
    return;
  }
  // Regroupés par rayon, dans l'ordre des rayons de la liste ; chaque rayon se replie.
  const rayons = [...new Set(PANIER.map((p) => p.rayon))].filter((rayon) => lignes.some(({ r }) => PANIER[r.produit].rayon === rayon));
  const filtre = rechercheReleves || nbFiltresReleves();
  liste.innerHTML = rayons.map((rayon) => {
    const groupe = lignes.filter(({ r }) => PANIER[r.produit].rayon === rayon);
    const replie = !filtre && relevesReplies.has(rayon); // pendant une recherche ou un filtre, tout est déplié
    return `<li class="rayon-releve"><button type="button" class="rayon-titre" data-rayon-releve="${echapper(rayon)}" aria-expanded="${!replie}">
      <span>${echapper(rayon)} · ${groupe.length}</span><span class="fleche" aria-hidden="true"></span></button></li>`
      + (replie ? "" : ligneReleves(groupe));
  }).join("") || `<li class="vide">${message}</li>`;
}

// Historique du prix d'un produit (lot 3) : courbe dans le magasin du relevé, variation, meilleur prix vu partout. Calculs : js/historique.js.
function courbeSvg(serie) {
  const t = serie.map((s) => new Date(s.date).getTime());
  const prix = serie.map((s) => s.prix);
  const [t0, t1] = [Math.min(...t), Math.max(...t)], [p0, p1] = [Math.min(...prix), Math.max(...prix)];
  const x = (i) => (t1 === t0 ? 150 : 10 + ((t[i] - t0) / (t1 - t0)) * 280);
  const y = (i) => (p1 === p0 ? 45 : 76 - ((prix[i] - p0) / (p1 - p0)) * 62);
  const points = serie.map((_, i) => `${x(i).toFixed(1)},${y(i).toFixed(1)}`).join(" ");
  const dernier = serie.length - 1;
  return `<svg class="courbe" viewBox="0 0 300 90" role="img" aria-label="Prix de ${euros(prix[0])} à ${euros(prix[dernier])}"><polyline fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${points}"/><circle cx="${x(dernier).toFixed(1)}" cy="${y(dernier).toFixed(1)}" r="5" fill="var(--jaune)" stroke="var(--accent)" stroke-width="2"/></svg>`;
}

function htmlHistorique(r) {
  const serie = Historique.serie(releves, r.produit, r.magasin);
  let corps;
  if (serie.length < 2) {
    corps = `<p class="aide">Il faut au moins deux relevés de ce produit dans ce magasin pour tracer l'évolution du prix.</p>`;
  } else {
    const v = Historique.variation(serie);
    const jours = Math.round((new Date(serie[serie.length - 1].date) - new Date(serie[0].date)) / 86400000);
    const duree = jours >= 45 ? `${Math.round(jours / 30)} mois` : `${jours} jour${jours > 1 ? "s" : ""}`;
    const pct = v ? `${v.pourcent >= 0 ? "+" : "−"}${String(Math.abs(v.pourcent)).replace(".", ",")} %` : "";
    corps = courbeSvg(serie) + (v ? `<div class="lg-hist"><span>${v.pourcent >= 0 ? "Hausse" : "Baisse"} sur ${duree}<small>${echapper(nomMagasin(r.magasin))}</small></span><b>${pct}</b></div>` : "");
  }
  const tous = releves.filter((x) => x.produit === r.produit && typeof x.prix === "number" && x.prix > 0);
  const meilleur = tous.reduce((m, x) => (!m || x.prix < m.prix ? x : m), null);
  if (meilleur && tous.length > 1) corps += `<div class="lg-hist"><span>Meilleur prix vu<small>${echapper(nomMagasin(meilleur.magasin))}, ${dateFr(meilleur.date)}</small></span><b>${euros(meilleur.prix)}</b></div>`;
  return `<details class="historique"><summary>Historique du prix</summary>${corps}</details>`;
}

// ---------- Feuille du bas d'un produit (Mes relevés > Par produit) ----------

let produitFeuilleReleves = null;

function ouvrirFeuilleReleves(i) {
  produitFeuilleReleves = i;
  enModification = null;
  document.querySelector("#feuille-releves-produit").hidden = false;
  document.documentElement.classList.add("feuille-prix-ouverte");
  majFeuilleReleves();
}

function fermerFeuilleReleves() {
  produitFeuilleReleves = null;
  enModification = null;
  document.querySelector("#feuille-releves-produit").hidden = true;
  if (!document.querySelector(".feuille-prix:not([hidden])")) document.documentElement.classList.remove("feuille-prix-ouverte");
}

// Contenu de la feuille : courbe du prix, meilleur prix vu, puis tous les relevés du produit (toucher l'un d'eux le modifie ou le supprime).
function majFeuilleReleves() {
  const i = produitFeuilleReleves;
  if (i === null) return;
  const siens = releves.map((r, k) => ({ r, k })).filter(({ r }) => r.produit === i).sort((a, b) => b.r.date.localeCompare(a.r.date) || b.k - a.k);
  if (!siens.length) { fermerFeuilleReleves(); return; }
  const p = PANIER[i];
  const derniers = new Map();
  for (const { r } of siens) if (!derniers.has(r.magasin)) derniers.set(r.magasin, r);
  const meilleur = [...derniers.values()].reduce((m, x) => (!m || x.prix < m.prix ? x : m), null);
  const serie = Historique.serie(releves, i, siens[0].r.magasin);
  const v = serie.length > 1 ? Historique.variation(serie) : null;
  document.querySelector("#frp-titre").textContent = p.nom;
  document.querySelector("#frp-sous").textContent = `${p.format ? `${p.format} · ` : ""}${siens.length} relevé${siens.length > 1 ? "s" : ""}`;
  document.querySelector("#frp-resume").innerHTML = (serie.length > 1 ? courbeSvg(serie) : "")
    + (v ? `<p class="fp-sous">${v.pourcent >= 0 ? "Hausse" : "Baisse"} de ${String(Math.abs(v.pourcent)).replace(".", ",")} % chez ${echapper(nomMagasin(siens[0].r.magasin))}</p>` : "")
    + `<div class="lg-hist"><span>Meilleur prix actuel<small>${echapper(nomMagasin(meilleur.magasin))}, ${dateFr(meilleur.date)}</small></span><b>${euros(meilleur.prix)}</b></div>`;
  document.querySelector("#frp-liste").innerHTML = ligneReleves(siens);
}

function ligneReleves(groupe) {
  return groupe
    .map(({ r, k }) => {
      const p = PANIER[r.produit];
      const source = r.source === "ticket" ? "ticket" : r.source === "etiquette" ? "étiquette" : "saisie";
      if (k === enModification) {
        return `
          <li class="modif" data-k="${k}">
            <button type="button" class="modif-tete" data-replier-releve aria-expanded="true" aria-label="Replier ${echapper(p.nom)}"><strong>${echapper(p.nom)}</strong><span class="chev-bas" aria-hidden="true"></span></button>
            <div class="formulaire">
              <label>Prix (€)<input type="text" inputmode="decimal" data-champ="prix" value="${r.prix.toFixed(2).replace(".", ",")}"></label>
              <label>Date<input type="date" data-champ="date" value="${r.date}"></label>
              <label>Magasin<select data-champ="magasin">${MAGASINS.map((m) => `<option value="${m.id}" ${m.id === r.magasin ? "selected" : ""}>${echapper(m.nom)}</option>`).join("")}</select></label>
              <label class="case"><input type="checkbox" data-champ="promo" ${r.promo ? "checked" : ""}> En promo</label>
            </div>
            ${htmlHistorique(r)}
            <div class="actions"><button type="button" data-annuler>Annuler</button><button type="button" class="principal" data-enregistrer="${k}">Enregistrer</button></div>
            <button type="button" class="lien-discret" data-supprimer="${k}">Supprimer ce relevé</button>
          </li>`;
      }
      return `
        <li data-k="${k}">
          <span><strong>${echapper(p.nom)}</strong> chez ${echapper(nomMagasin(r.magasin))} : ${euros(r.prix)}${r.promo ? " <span class=\"badge-promo\">PROMO</span>" : ""}
          <span class="date">${r.marque ? `${echapper(r.marque)} · ` : ""}${r.variante ? `variante : ${echapper(r.variante)} · ` : ""}${prixAuKilo(p.format, r.prix) ? `${prixAuKilo(p.format, r.prix)} · ` : ""}${dateFr(r.date)} · ${source}${r.libelle ? ` · « ${echapper(r.libelle)} »` : ""}</span></span>
          <span class="fleche" aria-hidden="true"></span>
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

// La saisie d'un prix est une feuille du bas (comme le choix de la photo ou la fin des courses) : on reste là où on est.
// Avec un produit (on a touché son prix) : son nom en titre, le menu « Produit » masqué. Sans produit (« Saisir un prix » dans ⋯) : le menu est affiché.
function ouvrirSaisie(produit, magasin) {
  const champ = document.querySelector("#saisie-prix");
  const connu = produit !== undefined && produit !== null && produit !== "";
  const p = connu ? PANIER[Number(produit)] : null;
  if (connu) document.querySelector("#saisie-produit").value = produit;
  if (magasin) document.querySelector("#saisie-magasin").value = magasin;
  const idProduit = Number(document.querySelector("#saisie-produit").value);
  const idMagasin = document.querySelector("#saisie-magasin").value;
  const actuel = Number.isInteger(idProduit) && idMagasin ? prixDe(idProduit, idMagasin).prix : null;
  champ.value = connu && actuel !== null ? actuel.toFixed(2).replace(".", ",") : "";
  document.querySelector("#saisie-code").value = connu ? (dernierCode(idProduit, idMagasin) || "") : "";
  document.querySelector("#saisie-titre").textContent = p ? p.nom : "Saisir un prix";
  document.querySelector("#saisie-sous").textContent = p ? `${p.format || ""}${p.format ? " · " : ""}${actuel === null ? "prix inconnu" : `dernier prix connu ${euros(actuel)}`}` : "";
  document.querySelector("#saisie-produit-label").hidden = connu;
  document.querySelector("#saisie-message").textContent = "";
  document.querySelector("#saisie-message").className = "message";
  document.querySelector("#saisie-carte").hidden = false;
  document.documentElement.classList.add("feuille-prix-ouverte"); // fige la page derrière la feuille
  champ.focus();
  champ.select();
}

function fermerSaisie() {
  document.querySelector("#saisie-carte").hidden = true;
  document.documentElement.classList.remove("feuille-prix-ouverte");
}

const lirePrix = (texte) => parseFloat(String(texte).replace(",", ".").replace(/[^\d.]/g, ""));

