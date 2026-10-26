// Liaison avec Open Prices (prices.openfoodfacts.org) :
// lecture des prix des magasins, connexion au compte Open Food Facts,
// envoi des relevés avec une preuve (photo du ticket ou de l'étiquette).

const API = "https://prices.openfoodfacts.org/api/v1";
const CLE_JETON = "atable.op.jeton";
const CLE_PSEUDO = "atable.op.pseudo";

let jeton = lire(CLE_JETON, null);
let pseudo = lire(CLE_PSEUDO, null);

// ---------- Lecture des prix ----------

async function chargerPrixMagasins() {
  const zone = document.querySelector("#op-magasins");
  zone.innerHTML = `<p class="aide">Chargement des prix Open Prices…</p>`;
  const blocs = await Promise.all(MAGASINS.map(async (m) => {
    try {
      const url = `${API}/prices?location_osm_id=${m.osm.id}&location_osm_type=${m.osm.type}&order_by=-date&size=50`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      const donnees = await r.json();
      const lignes = donnees.items.map((p) => {
        const nom = p.product?.product_name || p.product_name || p.category_tag?.replace(/^\w+:/, "").replace(/-/g, " ") || p.product_code;
        const unite = p.price_per === "KILOGRAM" ? " /kg" : "";
        return `<li><span>${nom}<span class="date">${p.date.split("-").reverse().join("/")}</span></span><strong>${euros(p.price)}${unite}</strong></li>`;
      }).join("");
      return `
        <details class="op-magasin">
          <summary><strong>${echapper(m.nom)}</strong> <span>${donnees.total} prix sur Open Prices</span></summary>
          ${donnees.total ? `<ul class="releves">${lignes}</ul>` : `<p class="aide">Aucun prix pour l'instant : tes relevés seront les premiers.</p>`}
          ${donnees.total ? `<a href="https://prices.openfoodfacts.org/locations/${donnees.items[0].location_id}" target="_blank" rel="noopener">Voir sur Open Prices</a>` : ""}
        </details>`;
    } catch (e) {
      return `<details class="op-magasin"><summary><strong>${echapper(m.nom)}</strong> <span>indisponible</span></summary><p class="aide">Open Prices ne répond pas pour l'instant.</p></details>`;
    }
  }));
  zone.innerHTML = blocs.join("");
}

// ---------- Connexion ----------

function afficherConnexion() {
  const connecte = Boolean(jeton);
  document.querySelector("#op-connexion").hidden = connecte;
  document.querySelector("#op-connecte").hidden = !connecte;
  document.querySelector("#op-envoi").hidden = !connecte;
  if (connecte) document.querySelector("#op-pseudo").textContent = pseudo;
}

async function seConnecter(e) {
  e.preventDefault();
  const message = document.querySelector("#op-connexion-message");
  const identifiant = document.querySelector("#op-identifiant").value.trim();
  const champMdp = document.querySelector("#op-mdp");
  message.textContent = "Connexion…";
  message.className = "message";
  try {
    const corps = new URLSearchParams({ username: identifiant, password: champMdp.value });
    const r = await fetch(`${API}/auth`, { method: "POST", body: corps });
    if (!r.ok) throw new Error(r.status === 401 ? "Identifiant ou mot de passe incorrect." : `Erreur ${r.status}`);
    const donnees = await r.json();
    jeton = donnees.access_token;
    pseudo = identifiant;
    ecrire(CLE_JETON, jeton);
    ecrire(CLE_PSEUDO, pseudo);
    message.textContent = "";
    afficherConnexion();
    afficherEnvoi();
  } catch (err) {
    message.textContent = err.message.startsWith("Identifiant") ? err.message : `Connexion impossible (${err.message}).`;
    message.className = "message erreur";
  } finally {
    champMdp.value = ""; // le mot de passe n'est jamais gardé
  }
}

function seDeconnecter() {
  jeton = null;
  pseudo = null;
  try { localStorage.removeItem(CLE_JETON); localStorage.removeItem(CLE_PSEUDO); } catch (e) {}
  afficherConnexion();
}

// ---------- Envoi ----------

// Un relevé peut être envoyé s'il a un code-barres, ou si le produit a une catégorie (fruits et légumes).
const envoyable = (r) => Boolean(r.code || PANIER[r.produit].categorie);

function relevesAEnvoyer() {
  const magasin = document.querySelector("#op-magasin").value;
  const date = document.querySelector("#op-date").value;
  return releves
    .map((r, k) => ({ r, k }))
    .filter(({ r }) => !r.envoye && r.magasin === magasin && (!date || r.date === date));
}

function afficherEnvoi() {
  const liste = document.querySelector("#op-liste");
  if (!liste) return;
  const candidats = relevesAEnvoyer();
  if (!candidats.length) {
    liste.innerHTML = `<li class="vide">Aucun relevé non envoyé pour ce magasin à cette date. Saisis d'abord tes prix plus haut.</li>`;
  } else {
    liste.innerHTML = candidats.map(({ r }) => {
      const p = PANIER[r.produit];
      const statut = envoyable(r) ? "" : ` <em>code-barres manquant, ne sera pas envoyé</em>`;
      return `<li><span>${echapper(p.nom)} : ${euros(r.prix)}${statut}</span></li>`;
    }).join("");
  }
  document.querySelector("#op-envoyer").disabled = !candidats.some(({ r }) => envoyable(r));
}

function corpsPrix(r, magasin, preuveId) {
  const p = PANIER[r.produit];
  const commun = {
    currency: "EUR",
    date: r.date,
    location_osm_id: magasin.osm.id,
    location_osm_type: magasin.osm.type,
    proof_id: preuveId,
    price_is_discounted: Boolean(r.promo),
  };
  if (r.code) return { ...commun, type: "PRODUCT", product_code: r.code, price: r.prix };
  // Fruits et légumes : prix au kilo, calculé à partir du format.
  return { ...commun, type: "CATEGORY", category_tag: p.categorie, price_per: "KILOGRAM", price: Math.round((r.prix / p.poidsKg) * 100) / 100 };
}

async function envoyer(e) {
  e.preventDefault();
  const message = document.querySelector("#op-envoi-message");
  const fichier = document.querySelector("#op-photo").files[0];
  const magasin = MAGASINS.find((m) => m.id === document.querySelector("#op-magasin").value);
  const date = document.querySelector("#op-date").value;
  const aEnvoyer = relevesAEnvoyer().filter(({ r }) => envoyable(r));

  if (!fichier) { message.textContent = "Ajoute la photo du ticket ou de l'étiquette : Open Prices l'exige comme preuve."; message.className = "message erreur"; return; }
  if (!aEnvoyer.length) return;

  const entete = { Authorization: `Bearer ${jeton}` };
  message.className = "message";
  try {
    message.textContent = "Envoi de la photo…";
    const formulaire = new FormData();
    formulaire.append("file", fichier);
    formulaire.append("type", document.querySelector("#op-type").value);
    formulaire.append("location_osm_id", magasin.osm.id);
    formulaire.append("location_osm_type", magasin.osm.type);
    formulaire.append("currency", "EUR");
    if (date) formulaire.append("date", date);
    const rp = await fetch(`${API}/proofs/upload`, { method: "POST", headers: entete, body: formulaire });
    if (rp.status === 401 || rp.status === 403) { seDeconnecter(); throw new Error("Session expirée : reconnecte-toi."); }
    if (!rp.ok) throw new Error(`photo refusée (erreur ${rp.status})`);
    const preuve = await rp.json();

    let ok = 0;
    const erreurs = [];
    for (const { r } of aEnvoyer) {
      message.textContent = `Envoi des prix… ${ok + erreurs.length + 1}/${aEnvoyer.length}`;
      const rr = await fetch(`${API}/prices`, {
        method: "POST",
        headers: { ...entete, "Content-Type": "application/json" },
        body: JSON.stringify(corpsPrix(r, magasin, preuve.id)),
      });
      if (rr.ok) { r.envoye = true; ok++; }
      else erreurs.push(`${PANIER[r.produit].nom} (erreur ${rr.status})`);
    }
    sauvegarder();
    toutAfficher();
    document.querySelector("#op-photo").value = "";
    message.textContent = `${ok} prix envoyé${ok > 1 ? "s" : ""} à Open Prices. Merci !` + (erreurs.length ? ` Non envoyés : ${erreurs.join(", ")}.` : "");
    message.className = erreurs.length ? "message erreur" : "message ok";
    chargerPrixMagasins();
  } catch (err) {
    message.textContent = `Envoi impossible : ${err.message}`;
    message.className = "message erreur";
  }
}

// ---------- Démarrage ----------

function demarrerOpenPrices() {
  const choix = document.querySelector("#op-magasin");
  for (const m of MAGASINS) choix.insertAdjacentHTML("beforeend", `<option value="${m.id}">${echapper(m.nom)}</option>`);
  choix.value = "aldi";
  document.querySelector("#op-date").value = new Date().toISOString().slice(0, 10);

  document.querySelector("#op-connexion").addEventListener("submit", seConnecter);
  document.querySelector("#op-deconnexion").addEventListener("click", seDeconnecter);
  document.querySelector("#op-envoi").addEventListener("submit", envoyer);
  choix.addEventListener("change", afficherEnvoi);
  document.querySelector("#op-date").addEventListener("change", afficherEnvoi);

  afficherConnexion();
  afficherEnvoi();
  chargerPrixMagasins();
}

demarrerOpenPrices();
