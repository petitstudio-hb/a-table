// Affiche le panier, permet de cocher les produits de la course,
// de saisir des prix, et calcule l'économie par magasin.

const euros = (n) => n.toFixed(2).replace(".", ",") + " €";
const CLE_COCHES = "atable.coches";
const CLE_REFERENCE = "atable.reference";
const CLE_RELEVES = "atable.releves";

function lire(cle, defaut) {
  try {
    const v = JSON.parse(localStorage.getItem(cle));
    return v === null ? defaut : v;
  } catch (e) { return defaut; }
}
function ecrire(cle, valeur) {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) {}
}

// État de la page, mémorisé dans le navigateur.
let coches = new Set(lire(CLE_COCHES, PANIER.map((_, i) => i)));
let reference = lire(CLE_REFERENCE, "intermarche");
// Relevés saisis sur le site : { produit, magasin, prix, date, promo }.
let releves = lire(CLE_RELEVES, []);

function sauvegarder() {
  ecrire(CLE_COCHES, [...coches]);
  ecrire(CLE_REFERENCE, reference);
  ecrire(CLE_RELEVES, releves);
}

// Prix à utiliser : le relevé saisi le plus récent, sinon celui de donnees.js.
function prixDe(i, magasin) {
  const saisis = releves.filter((r) => r.produit === i && r.magasin === magasin);
  if (saisis.length) {
    const dernier = saisis.reduce((a, b) => (b.date >= a.date ? b : a));
    return { prix: dernier.prix, saisi: true };
  }
  return { prix: PANIER[i].prix[magasin], saisi: false };
}

const nomMagasin = (id) => MAGASINS.find((m) => m.id === id).nom;

function construireStructure() {
  const tete = document.querySelector("#panier thead tr");
  const pied = document.querySelector("#panier tfoot tr");
  for (const m of MAGASINS) {
    tete.insertAdjacentHTML("beforeend", `<th>${m.nom}<span>${m.adresse}</span></th>`);
    pied.insertAdjacentHTML("beforeend", `<td data-total="${m.id}"></td>`);
  }

  const choixRef = document.querySelector("#reference");
  const choixMag = document.querySelector("#saisie-magasin");
  for (const m of MAGASINS) {
    choixRef.insertAdjacentHTML("beforeend", `<option value="${m.id}" ${m.id === reference ? "selected" : ""}>${m.nom}</option>`);
    choixMag.insertAdjacentHTML("beforeend", `<option value="${m.id}">${m.nom}</option>`);
  }
  choixMag.value = "aldi";

  const choixProd = document.querySelector("#saisie-produit");
  PANIER.forEach((p, i) => choixProd.insertAdjacentHTML("beforeend", `<option value="${i}">${p.nom} (${p.format})</option>`));

  document.querySelector("#saisie-date").value = new Date().toISOString().slice(0, 10);
}

function afficherLignes() {
  const corps = document.querySelector("#panier tbody");
  let html = "";
  let rayonPrecedent = "";
  PANIER.forEach((produit, i) => {
    if (produit.rayon !== rayonPrecedent) {
      html += `<tr class="rayon"><td colspan="${MAGASINS.length + 1}">${produit.rayon}</td></tr>`;
      rayonPrecedent = produit.rayon;
    }
    const prix = MAGASINS.map((m) => prixDe(i, m.id));
    const connus = prix.map((p) => p.prix).filter((p) => p !== null);
    const meilleur = connus.length > 1 ? Math.min(...connus) : null;

    const cellules = MAGASINS.map((m, k) => {
      const { prix: p, saisi } = prix[k];
      const titre = `Saisir le prix chez ${m.nom}`;
      if (p === null) return `<td class="manquant"><button class="cellule" data-produit="${i}" data-magasin="${m.id}" title="${titre}">+ prix</button></td>`;
      const classes = [p === meilleur ? "meilleur" : "", saisi ? "saisi" : ""].join(" ");
      return `<td class="${classes}"><button class="cellule" data-produit="${i}" data-magasin="${m.id}" title="${titre}">${euros(p)}</button></td>`;
    }).join("");

    html += `
      <tr data-produit="${i}" class="${coches.has(i) ? "" : "decoche"}">
        <th scope="row">
          <label><input type="checkbox" data-index="${i}" ${coches.has(i) ? "checked" : ""}>
          <span class="nom">${produit.nom}<span>${produit.format}</span></span></label>
        </th>${cellules}
      </tr>`;
  });
  corps.innerHTML = html;
}

function calculer() {
  const indices = PANIER.map((_, i) => i).filter((i) => coches.has(i));

  for (const m of MAGASINS) {
    const prix = indices.map((i) => prixDe(i, m.id).prix).filter((p) => p !== null);
    const total = prix.reduce((a, b) => a + b, 0);
    document.querySelector(`[data-total="${m.id}"]`).innerHTML =
      `<strong>${prix.length ? euros(total) : "—"}</strong><span>${prix.length}/${indices.length} prix connus</span>`;
  }

  // Économie par rapport au magasin de référence, calculée seulement sur les
  // produits cochés dont le prix est connu dans les deux magasins (décision D13).
  const ref = reference;
  const cartes = MAGASINS.filter((m) => m.id !== ref).map((m) => {
    const communs = indices.filter((i) => prixDe(i, m.id).prix !== null && prixDe(i, ref).prix !== null);
    if (communs.length === 0) {
      return `<div class="carte vide"><h3>${m.nom}</h3><p class="chiffre">—</p><p>Aucun produit coché comparable avec ${nomMagasin(ref)}.</p></div>`;
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
        <h3>${m.nom}</h3>
        <p class="chiffre">${sens === "egal" ? "=" : (sens === "gain" ? "−" : "+") + euros(Math.abs(ecart))}</p>
        <p>${texte} par rapport à ${nomMagasin(ref)}</p>
        <p class="detail">Calculé sur ${n} produit${n > 1 ? "s" : ""} coché${n > 1 ? "s" : ""} au prix connu dans les deux magasins : ${euros(totalMag)} contre ${euros(totalRef)}.</p>
      </div>`;
  });
  document.querySelector("#economies").innerHTML = cartes.join("");
  const n = indices.length;
  document.querySelector("#nb-coches").textContent = `${n} produit${n > 1 ? "s" : ""} coché${n > 1 ? "s" : ""} sur ${PANIER.length}`;
}

function afficherReleves() {
  const liste = document.querySelector("#liste-releves");
  document.querySelector("#nb-releves").textContent = releves.length;
  document.querySelector("#exporter").disabled = releves.length === 0;
  if (!releves.length) {
    liste.innerHTML = `<li class="vide">Aucun prix saisi pour l'instant.</li>`;
    return;
  }
  liste.innerHTML = releves
    .map((r, k) => ({ r, k }))
    .sort((a, b) => b.r.date.localeCompare(a.r.date))
    .map(({ r, k }) => `
      <li>
        <span><strong>${PANIER[r.produit].nom}</strong> chez ${nomMagasin(r.magasin)} : ${euros(r.prix)}${r.promo ? " <em>promo</em>" : ""}
        <span class="date">${r.date.split("-").reverse().join("/")}</span></span>
        <button type="button" data-supprimer="${k}" title="Supprimer ce relevé">Supprimer</button>
      </li>`)
    .join("");
}

function toutAfficher() {
  afficherLignes();
  calculer();
  afficherReleves();
}

function ouvrirSaisie(produit, magasin) {
  document.querySelector("#saisie-produit").value = produit;
  document.querySelector("#saisie-magasin").value = magasin;
  const actuel = prixDe(Number(produit), magasin).prix;
  const champ = document.querySelector("#saisie-prix");
  champ.value = actuel === null ? "" : actuel.toFixed(2);
  document.querySelector("#saisie").scrollIntoView({ behavior: "smooth", block: "center" });
  champ.focus();
}

function brancherEvenements() {
  document.querySelector("#panier").addEventListener("change", (e) => {
    if (!e.target.matches("input[type=checkbox]")) return;
    const i = Number(e.target.dataset.index);
    e.target.checked ? coches.add(i) : coches.delete(i);
    e.target.closest("tr").classList.toggle("decoche", !e.target.checked);
    sauvegarder();
    calculer();
  });

  document.querySelector("#panier").addEventListener("click", (e) => {
    const b = e.target.closest("button.cellule");
    if (b) ouvrirSaisie(b.dataset.produit, b.dataset.magasin);
  });

  document.querySelector("#reference").addEventListener("change", (e) => {
    reference = e.target.value;
    sauvegarder();
    calculer();
  });

  const toutCocher = (valeur) => {
    coches = valeur ? new Set(PANIER.map((_, i) => i)) : new Set();
    sauvegarder();
    toutAfficher();
  };
  document.querySelector("#tout").addEventListener("click", () => toutCocher(true));
  document.querySelector("#rien").addEventListener("click", () => toutCocher(false));

  document.querySelector("#saisie").addEventListener("submit", (e) => {
    e.preventDefault();
    const prix = parseFloat(document.querySelector("#saisie-prix").value.replace(",", "."));
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
      date: document.querySelector("#saisie-date").value || new Date().toISOString().slice(0, 10),
      promo: document.querySelector("#saisie-promo").checked,
    };
    releves.push(releve);
    sauvegarder();
    toutAfficher();
    message.textContent = `Enregistré : ${PANIER[releve.produit].nom} chez ${nomMagasin(releve.magasin)}, ${euros(releve.prix)}.`;
    message.className = "message ok";
    document.querySelector("#saisie-prix").value = "";
    document.querySelector("#saisie-promo").checked = false;
  });

  document.querySelector("#liste-releves").addEventListener("click", (e) => {
    const b = e.target.closest("[data-supprimer]");
    if (!b) return;
    releves.splice(Number(b.dataset.supprimer), 1);
    document.querySelector("#saisie-message").textContent = "";
    sauvegarder();
    toutAfficher();
  });

  // Télécharge les relevés en fichier, pour les intégrer ensuite dans donnees/.
  document.querySelector("#exporter").addEventListener("click", () => {
    const contenu = releves.map((r) => ({ ...r, produit_nom: PANIER[r.produit].nom, format: PANIER[r.produit].format }));
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(new Blob([JSON.stringify(contenu, null, 2)], { type: "application/json" }));
    lien.download = `releves-${new Date().toISOString().slice(0, 10)}.json`;
    lien.click();
    URL.revokeObjectURL(lien.href);
  });
}

construireStructure();
brancherEvenements();
toutAfficher();
