// Cœur de l'application : données, navigation, « Ma course », saisie manuelle,
// « Mes relevés », export et import. La lecture des photos est dans lecture.js.

const euros = (n) => n.toFixed(2).replace(".", ",") + " €";
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const dateFr = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const echapper = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const CLE = {
  coches: "atable.coches",
  reference: "atable.reference",
  releves: "atable.releves",
  produits: "atable.produits", // produits ajoutés depuis les photos
  magasins: "atable.magasins", // ancien format (séances 6 et avant) : magasins ajoutés depuis les photos
  magasins2: "atable.magasins2", // liste complète des magasins, modifiable (séance 7)
  vu: "atable.magasinVu", // magasin affiché dans Ma course (séance 9)
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
function ecrire(cle, valeur) {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) {}
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
let reference = lire(CLE.reference, "intermarche");
let magasinVu = lire(CLE.vu, null);
let rayonsReplies = new Set(lire(CLE.replies, []));
let relevesReplies = new Set(lire(CLE.relevesReplies, []));
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
  ecrire(CLE.coches, [...coches]);
  ecrire(CLE.reference, reference);
  ecrire(CLE.vu, magasinVu);
  ecrire(CLE.replies, [...rayonsReplies]);
  ecrire(CLE.relevesReplies, [...relevesReplies]);
  ecrire(CLE.releves, releves);
  ecrire(CLE.paniers, paniers);
  ecrire(CLE.panierCourse, panierCourse);
  ecrire(CLE.produits, PANIER.slice(NB_PRODUITS_BASE));
  ecrire(CLE.modifs, modifs);
  ecrire(CLE.magasins2, MAGASINS);
}

function ajouterProduit({ nom, format, rayon }) {
  PANIER.push({ nom: nom || "Produit sans nom", format: format || "", rayon: rayon || "Ajoutés", prix: {} });
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
function prixDe(i, magasin) {
  let dernier = null;
  for (const r of releves) {
    if (r.produit === i && r.magasin === magasin && (!dernier || r.date >= dernier.date)) dernier = r;
  }
  if (dernier) return { prix: dernier.prix, saisi: true, variante: dernier.variante || "" };
  return { prix: PANIER[i].prix[magasin] ?? null, saisi: false, variante: "" };
}

// ---------- Formats et prix au kilo (séances 16 et 17) ----------

// « 500 g », « 1 L », « 6 × 25 cl » → { qte, type } en grammes ou en millilitres, ou null si illisible.
function contenance(texte) {
  const t = String(texte || "").toLowerCase().replace(",", ".").replace(/×/g, "x");
  const m = t.match(/(?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kg|g|cl|ml|l)\b/);
  if (!m) return null;
  const facteur = { kg: 1000, g: 1, l: 1000, cl: 10, ml: 1 }[m[3]];
  return { qte: (m[1] ? Number(m[1]) : 1) * Number(m[2]) * facteur, type: m[3] === "kg" || m[3] === "g" ? "g" : "ml" };
}

// Deux formats sont « proches » s'ils sont de même nature et à moins de 25 % d'écart. Si l'un est illisible, on ne conclut pas.
function formatsProches(a, b) {
  const ca = contenance(a);
  const cb = contenance(b);
  if (!ca || !cb) return true;
  if (ca.type !== cb.type) return false;
  const rapport = ca.qte / cb.qte;
  return rapport >= 0.8 && rapport <= 1.25;
}

// Prix au kilo ou au litre d'un produit, d'après son format ; chaîne vide si le format n'est pas un poids ou un volume.
function prixAuKilo(texteFormat, prix) {
  const c = contenance(texteFormat);
  if (!c || prix === null || prix === undefined) return "";
  return `${euros((prix / c.qte) * 1000)}/${c.type === "g" ? "kg" : "L"}`;
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

const VUES = ["photo", "verif", "course", "magasins", "paniers", "releves", "liste", "sauvegarde", "apropos", "reglages"];
// Les écrans ouverts depuis le menu « Mon profil » (pas dans la barre du bas).
const VUES_PROFIL = ["releves", "liste", "sauvegarde", "apropos", "reglages"];

function montrer(vue) {
  if (!VUES.includes(vue)) vue = "photo";
  if (vue === "verif" && !window.verificationEnCours) vue = "photo";
  for (const v of VUES) document.querySelector(`#vue-${v}`).hidden = v !== vue;
  document.querySelectorAll(".onglets a").forEach((a) => a.classList.toggle("actif", a.dataset.vue === vue));
  document.querySelector("#profil-bouton").classList.toggle("actif", VUES_PROFIL.includes(vue));
  fermerProfil();
  if (vue !== "paniers" && typeof fermerPanier === "function") fermerPanier();
  if (vue === "liste" && typeof afficherListe === "function") afficherListe();
  window.scrollTo(0, 0);
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
  const ref = document.querySelector("#reference");
  ref.innerHTML = visibles().map((m) => `<option value="${m.id}">${echapper(m.nom)}</option>`).join("");
  if (!visibles().some((m) => m.id === reference)) reference = (visibles()[0] || MAGASINS[0] || {}).id;
  ref.value = reference;

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

// Magasin le moins cher : seulement parmi ceux qui connaissent au moins 80 % des prix cochés,
// sinon un magasin aux prix manquants paraîtrait faussement moins cher (décision D13).
function moinsCher() {
  const candidats = visibles().map((m) => ({ m, ...totalDe(m) })).filter((x) => x.coches > 0 && x.connus >= 0.8 * x.coches);
  if (candidats.length < 2) return null;
  return candidats.reduce((a, b) => (b.total < a.total ? b : a)).m.id;
}

// Onglets des magasins (avec leur total) et liste des produits du magasin choisi.
function afficherCourse() {
  const mags = visibles();
  if (!mags.some((m) => m.id === magasinVu)) magasinVu = mags[0]?.id ?? null;
  const vu = mags.find((m) => m.id === magasinVu);
  document.querySelector("#course-onglets").hidden = mags.length === 0;
  const gagnant = moinsCher();
  document.querySelector("#course-onglets").innerHTML = mags
    .map((m) => {
      const t = totalDe(m);
      return `<button type="button" role="tab" aria-selected="${m.id === magasinVu}" class="onglet-mag ${m.id === magasinVu ? "actif" : ""}" data-mag="${m.id}">
        <strong>${echapper(nomCourt(m))}${m.id === gagnant ? ` <i class="pastille" title="Le moins cher"></i>` : ""}</strong>
        <span>${t.connus ? euros(t.total) : "—"}</span></button>`;
    })
    .join("");

  const liste = document.querySelector("#liste-course");
  if (!vu) { liste.innerHTML = ""; document.querySelector("#course-total").textContent = ""; return; }

  const autres = mags.filter((m) => m.id !== vu.id);
  const rayons = [...new Set(produitsCourse().map((i) => PANIER[i].rayon))];
  liste.innerHTML = rayons
    .map((rayon) => {
      const replie = rayonsReplies.has(rayon);
      const produits = produitsCourse().map((i) => ({ p: PANIER[i], i })).filter(({ p }) => p.rayon === rayon);
      const lignes = replie ? "" : produits.map(({ p, i }) => {
        const { prix, saisi, variante } = prixDe(i, vu.id);
        const refPrix = prixDe(i, reference).prix;
        let ecart = "";
        if (prix !== null && refPrix !== null && vu.id !== reference) {
          const d = Math.round((prix - refPrix) * 100) / 100;
          if (Math.abs(d) >= 0.005) ecart = `<span class="ecart ${d < 0 ? "moins" : "plus"}">${d < 0 ? "−" : "+"}${euros(Math.abs(d))}</span>`;
        }
        const ailleurs = autres.map((m) => {
          const q = prixDe(i, m.id).prix;
          return `${echapper(nomCourt(m))} ${q === null ? "—" : euros(q)}`;
        }).join(" · ");
        return `
          <div class="ligne-course ${coches.has(i) ? "" : "decoche"}">
            <label>
              <input type="checkbox" data-index="${i}" ${coches.has(i) ? "checked" : ""}>
              <span class="lc-texte"><span class="lc-nom">${echapper(p.nom)}</span>
                <span class="lc-format">${echapper(p.format)}${variante ? ` · ${echapper(variante)}` : ""}${prixAuKilo(p.format, prix) ? ` · ${prixAuKilo(p.format, prix)}` : ""}</span>
                ${ailleurs ? `<span class="lc-autres">${ailleurs}</span>` : ""}</span>
            </label>
            <button type="button" class="cellule lc-prix ${prix === null ? "manquant" : ""} ${saisi ? "saisi" : ""}" data-produit="${i}" data-magasin="${vu.id}" title="Saisir le prix chez ${echapper(vu.nom)}">
              ${prix === null ? "+ prix" : euros(prix)}${ecart}</button>
          </div>`;
      }).join("");
      return `<div class="rayon-course">
        <button type="button" class="rayon-titre" data-rayon="${echapper(rayon)}" aria-expanded="${!replie}">
          <span>${echapper(rayon)}</span><span class="fleche">${replie ? "▸" : "▾"}</span></button>${lignes}</div>`;
    })
    .join("");
  if (!rayons.length) liste.innerHTML = `<p class="encart">Ce panier est vide. Ajoute des produits dans <a href="#paniers">Mes paniers</a>.</p>`;

  const t = totalDe(vu);
  document.querySelector("#course-total").innerHTML =
    `<span>Total ${echapper(vu.nom)}</span><strong>${t.connus ? euros(t.total) : "—"}</strong><small>${t.connus}/${t.coches} prix connus</small>`;
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
  if (!mags.some((m) => m.id === magasinVu)) magasinVu = mags[0]?.id ?? null;
  const indices = produitsCourse().filter((i) => coches.has(i));

  for (const m of mags) {
    const prix = indices.map((i) => prixDe(i, m.id).prix).filter((p) => p !== null);
    const total = prix.reduce((a, b) => a + b, 0);
    document.querySelector(`[data-total="${m.id}"]`).innerHTML =
      `<strong>${prix.length ? euros(total) : "—"}</strong><span>${prix.length}/${indices.length} prix connus</span>`;
  }

  // Économie par rapport au magasin de référence, calculée seulement sur les
  // produits cochés dont le prix est connu dans les deux magasins (décision D13).
  const ref = reference;
  const vus = mags.filter((m) => m.id === magasinVu);
  const cartes = vus.length && vus[0].id === ref
    ? [`<div class="carte vide"><h3>${echapper(vus[0].nom)}</h3><p>C'est ton magasin de référence. Choisis un autre magasin en haut pour voir l'économie.</p></div>`]
    : vus.map((m) => {
    const communs = indices.filter((i) => prixDe(i, m.id).prix !== null && prixDe(i, ref).prix !== null);
    if (communs.length === 0) {
      return `<div class="carte vide"><h3>${echapper(m.nom)}</h3><p class="chiffre">—</p><p>Aucun produit coché comparable avec ${echapper(nomMagasin(ref))}.</p></div>`;
    }
    const totalRef = communs.reduce((a, i) => a + prixDe(i, ref).prix, 0);
    const totalMag = communs.reduce((a, i) => a + prixDe(i, m.id).prix, 0);
    const ecart = totalRef - totalMag;
    const pct = Math.round((Math.abs(ecart) / totalRef) * 100);
    const sens = ecart > 0.005 ? "gain" : ecart < -0.005 ? "perte" : "egal";
    const texte = sens === "gain" ? `d'économie (−${pct} %)` : sens === "perte" ? `de plus (+${pct} %)` : "pareil";
    const n = communs.length;
    return `
      <div class="carte ${sens}">
        <h3>${echapper(m.nom)}</h3>
        <p class="chiffre">${sens === "egal" ? "=" : (sens === "gain" ? "−" : "+") + euros(Math.abs(ecart))}</p>
        <p>${texte} par rapport à ${echapper(nomMagasin(ref))}</p>
        <p class="detail">Calculé sur ${n} produit${n > 1 ? "s" : ""} coché${n > 1 ? "s" : ""} au prix connu dans les deux magasins : ${euros(totalMag)} contre ${euros(totalRef)}.</p>
      </div>`;
  });
  document.querySelector("#economies").innerHTML = cartes.join("");
  const n = indices.length;
  document.querySelector("#nb-coches").textContent = `${n} produit${n > 1 ? "s" : ""} coché${n > 1 ? "s" : ""} sur ${produitsCourse().length}`;
  afficherCourse();
}

// ---------- Magasins ----------

let magasinEnModification = null; // identifiant du magasin en cours de modification ("__nouveau" pour un ajout)

function afficherMagasins() {
  const liste = document.querySelector("#liste-magasins");
  const formulaire = (m) => `
    <li class="modif" data-id="${m.id}">
      <div class="formulaire">
        <label>Nom<input type="text" data-champ="nom" value="${echapper(m.nom)}" placeholder="ex. Aldi"></label>
        <label>Rue<input type="text" data-champ="adresse" value="${echapper(m.adresse)}" placeholder="ex. 12 rue de Clignancourt"></label>
      </div>
      <div class="actions"><button type="button" data-annuler-magasin>Annuler</button><button type="button" class="principal" data-enregistrer-magasin="${m.id}">Enregistrer</button></div>
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
          <button type="button" data-modifier-magasin="${m.id}">Modifier</button>
          <button type="button" data-supprimer-magasin="${m.id}" aria-label="Supprimer ${echapper(m.nom)}">✕</button>
        </span>
      </li>`;
  }).join("");
  if (magasinEnModification === "__nouveau") html += formulaire({ id: "__nouveau", nom: "", adresse: "" });
  if (!html) html = `<li class="vide">Aucun magasin. Ajoute-en un avec le bouton ci-dessous.</li>`;
  liste.innerHTML = html;
  document.querySelector("#ajouter-magasin").hidden = magasinEnModification === "__nouveau";
}

// ---------- Mes relevés ----------

let enModification = null; // indice du relevé en cours de modification

function afficherReleves() {
  const liste = document.querySelector("#liste-releves");
  document.querySelector("#nb-releves").textContent = releves.length;
  if (!releves.length) {
    liste.innerHTML = `<li class="vide">Aucun prix enregistré pour l'instant. Prends une photo, ou saisis un prix dans « Ma course ».</li>`;
    return;
  }
  const lignes = releves
    .map((r, k) => ({ r, k }))
    .sort((a, b) => b.r.date.localeCompare(a.r.date) || b.k - a.k);
  // Regroupés par rayon, dans l'ordre des rayons de la liste ; chaque rayon se replie.
  const rayons = [...new Set(PANIER.map((p) => p.rayon))].filter((rayon) => lignes.some(({ r }) => PANIER[r.produit].rayon === rayon));
  liste.innerHTML = rayons.map((rayon) => {
    const groupe = lignes.filter(({ r }) => PANIER[r.produit].rayon === rayon);
    const replie = relevesReplies.has(rayon);
    return `<li class="rayon-releve"><button type="button" class="rayon-titre" data-rayon-releve="${echapper(rayon)}" aria-expanded="${!replie}">
      <span>${echapper(rayon)} · ${groupe.length}</span><span class="fleche">${replie ? "▸" : "▾"}</span></button></li>`
      + (replie ? "" : ligneReleves(groupe));
  }).join("");
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
          </li>`;
      }
      return `
        <li>
          <span><strong>${echapper(p.nom)}</strong> chez ${echapper(nomMagasin(r.magasin))} : ${euros(r.prix)}${r.promo ? " <em>promo</em>" : ""}
          <span class="date">${r.variante ? `variante : ${echapper(r.variante)} · ` : ""}${prixAuKilo(p.format, r.prix) ? `${prixAuKilo(p.format, r.prix)} · ` : ""}${dateFr(r.date)} · ${source}${r.libelle ? ` · « ${echapper(r.libelle)} »` : ""}</span></span>
          <span class="boutons"><button type="button" data-modifier="${k}">Modifier</button><button type="button" data-supprimer="${k}" aria-label="Supprimer">✕</button></span>
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
    reference,
    modifs,
  };
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(new Blob([JSON.stringify(contenu, null, 2)], { type: "application/json" }));
  lien.download = `atable-${aujourdhui()}.json`;
  lien.click();
  URL.revokeObjectURL(lien.href);
}

async function importer(fichier) {
  const message = document.querySelector("#sauvegarde-message");
  try {
    const donnees = JSON.parse(await fichier.text());
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
      reference = donnees.reference || reference;
      paniers = Array.isArray(donnees.paniers) ? donnees.paniers : [{ id: "habituel", nom: "Panier habituel", produits: PANIER.map((_, i) => i) }];
      for (const p of paniers) p.produits = p.produits.filter((i) => i < PANIER.length);
      message.textContent = `Import terminé : ${releves.length} relevés.`;
    } else {
      throw new Error("format inconnu");
    }
    message.className = "message ok";
    sauvegarder();
    toutAfficher();
  } catch (e) {
    message.textContent = `Ce fichier ne peut pas être importé (${e.message}).`;
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
  document.querySelector("#course-onglets").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mag]");
    if (!b) return;
    magasinVu = b.dataset.mag;
    sauvegarder();
    calculer();
  });
  const listeCourse = document.querySelector("#liste-course");
  listeCourse.addEventListener("change", (e) => {
    if (!e.target.matches("input[type=checkbox]")) return;
    const i = Number(e.target.dataset.index);
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
    const b = e.target.closest("button.cellule");
    if (b) ouvrirSaisie(b.dataset.produit, b.dataset.magasin);
  });
  document.querySelector("#tout-comparer-bouton").addEventListener("click", (e) => {
    const bloc = document.querySelector("#tout-comparer");
    bloc.hidden = !bloc.hidden;
    e.target.textContent = bloc.hidden ? "Tout comparer" : "Masquer le tableau complet";
    if (!bloc.hidden) bloc.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.querySelector("#reference").addEventListener("change", (e) => {
    reference = e.target.value;
    sauvegarder();
    calculer();
  });

  const toutCocher = (valeur) => {
    const siens = produitsCourse(); // tout cocher ou décocher ne touche que le panier affiché
    coches = valeur ? new Set([...coches, ...siens]) : new Set([...coches].filter((i) => !siens.includes(i)));
    sauvegarder();
    toutAfficher();
  };
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
    const mod = e.target.closest("[data-modifier]");
    if (mod) { enModification = Number(mod.dataset.modifier); afficherReleves(); return; }
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
    const mod = e.target.closest("[data-modifier-magasin]");
    if (mod) { magasinEnModification = mod.dataset.modifierMagasin; afficherMagasins(); return; }
    if (e.target.closest("[data-annuler-magasin]")) { magasinEnModification = null; afficherMagasins(); return; }
    const enr = e.target.closest("[data-enregistrer-magasin]");
    if (enr) {
      const li = enr.closest("li");
      const nom = li.querySelector('[data-champ="nom"]').value.trim();
      const adresse = li.querySelector('[data-champ="adresse"]').value.trim();
      if (!nom) { notifier("Donne un nom au magasin."); return; }
      if (enr.dataset.enregistrerMagasin === "__nouveau") ajouterMagasin(nom, adresse);
      else Object.assign(MAGASINS.find((m) => m.id === enr.dataset.enregistrerMagasin), { nom, adresse });
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
  document.querySelector("#ajouter-magasin").addEventListener("click", () => {
    magasinEnModification = "__nouveau";
    afficherMagasins();
    listeMagasins.querySelector('[data-champ="nom"]')?.focus();
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
    if (e.target.closest("[data-bientot]")) { notifier("Bientôt disponible."); return; }
    if (e.target.closest("a")) fermerProfil();
  });

  document.querySelector("#exporter").addEventListener("click", exporter);
  document.querySelector("#importer").addEventListener("change", (e) => {
    if (e.target.files[0]) importer(e.target.files[0]);
    e.target.value = "";
  });
}

document.querySelector("#saisie-date").value = aujourdhui();
brancherEvenements();
toutAfficher();
montrer(location.hash.slice(1) || "photo");
