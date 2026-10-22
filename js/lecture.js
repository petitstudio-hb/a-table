// Lecture des photos : ticket de caisse ou étiquette en rayon
// -> réduction de l'image -> lecture par l'IA Claude -> écran de vérification -> relevés.

const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm";
const CLE_API = "atable.cle-api";
const CLE_MODELE = "atable.modele";

// Coût indicatif d'une photo : environ 4 000 jetons envoyés (image + consignes) et 1 500 reçus.
const MODELES = [
  { id: "claude-opus-5-5", nom: "Claude Opus 5.5 : le plus précis", court: "Opus : le plus précis (≈ 4 cts)", cout: "environ 4 centimes par photo" },
  { id: "claude-sonnet-5-5", nom: "Claude Sonnet 5.5 : précis et 2 fois moins cher", court: "Sonnet : équilibré (≈ 2 cts)", cout: "environ 2 centimes par photo" },
  { id: "claude-haiku-5-5", nom: "Claude Haiku 5.5 : le plus économique", court: "Haiku : économique (≈ 0,1 ct)", cout: "environ 0,1 centime par photo" },
];
const TAILLE_MAX = 1568; // côté le plus long, en pixels : au-delà, l'IA réduit l'image elle-même

let file = []; // photos en attente de lecture
let numeroPhoto = 0;
let totalPhotos = 0;
let brouillon = null; // résultat de la lecture en cours de vérification

const cleApi = () => lire(CLE_API, "");
const modele = () => lire(CLE_MODELE, MODELES[0].id);

// ---------- Réglages ----------

function afficherReglages() {
  const choix = document.querySelector("#modele");
  choix.innerHTML = MODELES.map((m) => `<option value="${m.id}">${m.nom} (${m.cout})</option>`).join("");
  choix.value = modele();
  // Même choix, en version courte, sur l'écran Photo.
  const rapide = document.querySelector("#photo-modele");
  rapide.innerHTML = MODELES.map((m) => `<option value="${m.id}">${m.court}</option>`).join("");
  rapide.value = modele();
  document.querySelector("#cle-api").value = cleApi();
  document.querySelector("#photo-sans-cle").hidden = Boolean(cleApi());
}

function messageCle(texte, classe) {
  const m = document.querySelector("#cle-message");
  m.textContent = texte;
  m.className = `message ${classe || ""}`;
}

async function client() {
  const { default: Anthropic } = await import(SDK_URL);
  return { Anthropic, client: new Anthropic({ apiKey: cleApi(), dangerouslyAllowBrowser: true }) };
}

function traduireErreur(err, Anthropic) {
  if (Anthropic && err instanceof Anthropic.AuthenticationError) return "Clé d'API refusée : vérifie-la dans les Réglages.";
  if (Anthropic && err instanceof Anthropic.PermissionDeniedError) return "Cette clé n'a pas accès à ce modèle.";
  if (Anthropic && err instanceof Anthropic.RateLimitError) return "Trop de demandes d'un coup : réessaie dans une minute.";
  if (Anthropic && err instanceof Anthropic.BadRequestError) {
    const detail = String(err.message || "");
    if (/credit|billing/i.test(detail)) return "Crédit épuisé sur ton compte Anthropic (rubrique Billing).";
    return `Demande refusée par l'IA (${detail.slice(0, 160)}).`;
  }
  if (Anthropic && err instanceof Anthropic.APIConnectionError) return "Pas de connexion à Internet, ou l'IA ne répond pas.";
  if (Anthropic && err instanceof Anthropic.APIError) return `L'IA a renvoyé une erreur (${err.status ?? "?"}).`;
  return err.message || String(err);
}

// ---------- Réduction de la photo ----------

async function preparerImage(fichier) {
  const image = await createImageBitmap(fichier);
  const echelle = Math.min(1, TAILLE_MAX / Math.max(image.width, image.height));
  const toile = document.createElement("canvas");
  toile.width = Math.round(image.width * echelle);
  toile.height = Math.round(image.height * echelle);
  toile.getContext("2d").drawImage(image, 0, 0, toile.width, toile.height);
  image.close?.();
  const dataUrl = toile.toDataURL("image/jpeg", 0.85);
  return { dataUrl, base64: dataUrl.split(",")[1] };
}

// ---------- Lecture par l'IA ----------

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["magasin_id", "magasin_nom", "magasin_adresse", "date", "lignes", "remarque"],
  properties: {
    magasin_id: { type: "string", description: "Identifiant d'un magasin connu, ou chaîne vide si aucun ne correspond." },
    magasin_nom: { type: "string", description: "Enseigne du magasin lue sur la photo (ex. « Aldi », « Intermarché Express »), sans l'adresse, ou chaîne vide." },
    magasin_adresse: { type: "string", description: "Numéro et rue du magasin lus sur la photo (ex. « 12 rue de Clignancourt »), sans le code postal ni la ville, ou chaîne vide si absents." },
    date: { type: "string", description: "Date d'achat au format AAAA-MM-JJ, ou chaîne vide si absente." },
    remarque: { type: "string", description: "Problème de lecture éventuel à signaler (photo floue, ligne illisible), sinon chaîne vide." },
    lignes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["libelle", "nom", "quantite", "prix_unitaire", "prix_total", "prix_kg", "poids", "promo", "produit_index", "prix_reference", "rayon"],
        properties: {
          libelle: { type: "string", description: "Texte exact de la ligne." },
          nom: { type: "string", description: "Nom lisible en français, sans abréviation (ex. « Purée de tomates »)." },
          quantite: { type: "number", description: "Nombre d'articles (2 pour « 2 x 0,49 »), ou poids en kg pour le vrac." },
          prix_unitaire: { type: "number", description: "Prix d'un article, en euros. Pour le vrac : le prix payé." },
          prix_total: { type: "number", description: "Montant de la ligne, en euros." },
          prix_kg: { type: "number", description: "Prix au kilo ou au litre s'il est indiqué, sinon 0." },
          poids: { type: "string", description: "Contenance de l'article (ex. « 500 g », « 1 L », « x12 »), ou chaîne vide." },
          promo: { type: "boolean", description: "Vrai si une remise ou une promotion s'applique." },
          produit_index: { type: "integer", description: "Indice du produit correspondant dans le panier de référence, ou -1 si aucun ne correspond." },
          prix_reference: { type: "number", description: "Prix ramené au format du produit associé (voir les consignes). Si produit_index vaut -1 : le prix unitaire." },
          rayon: { type: "string", description: "Rayon du produit, en reprenant si possible un rayon existant." },
        },
      },
    },
  },
};

function consignes(type) {
  const panier = PANIER.map((p, i) => `${i} | ${p.nom} | ${p.format || "format libre"} | ${p.rayon}`).join("\n");
  const magasins = MAGASINS.map((m) => `${m.id} | ${m.nom} | ${m.adresse || ""}`).join("\n");
  const rayons = [...new Set(PANIER.map((p) => p.rayon))].join(", ");
  const commun = `Tu aides une personne à suivre les prix de ses courses en France. Tu lis une photo et tu renvoies les produits et leurs prix, en euros, sous forme de données structurées.

Magasins connus (identifiant | nom | adresse) :
${magasins}

Panier de référence (indice | produit | format | rayon) :
${panier}

Rayons existants : ${rayons}

Associer une ligne à un produit du panier :
- Associe (produit_index) seulement si c'est le même type de produit, même de marque ou de variante différente : « PENNE 500 G » correspond à « Pâtes (500 g) », « HACHE MOELLEUX VRAC 500G » à « Viande hachée (500 g) ». Sinon, mets -1.
- prix_reference est le prix que coûterait le format du produit associé. Si le format est identique, c'est le prix unitaire. Si le prix au kilo est connu et que le format est un poids, calcule : prix au kilo × poids du format (ex. oignons à 1,99 €/kg pour un format de 500 g : 1,00). Pour un format différent sans prix au kilo, ramène au prorata de la contenance. Arrondis au centime.
- Pour un produit non associé, propose un nom clair, un poids et un rayon.

Si un magasin connu correspond (enseigne et adresse cohérentes), donne son identifiant. Si l'enseigne est connue mais que l'adresse lue est clairement différente, c'est un autre magasin : magasin_id vide. Sinon magasin_id vide aussi. Dans les deux cas, renseigne magasin_nom (enseigne) et magasin_adresse (numéro et rue) tels qu'imprimés sur la photo, en gardant leur écriture normale (pas tout en majuscules).
Réponds uniquement à partir de ce qui est visible. N'invente pas de ligne.`;

  if (type === "etiquette") {
    return `${commun}

La photo montre une ou plusieurs étiquettes de prix en rayon. Renvoie une ligne par produit étiqueté : nom, contenance, prix, prix au kilo ou au litre s'il est affiché, et promo si l'étiquette l'indique (prix barré, pourcentage, « offre »). La date et le magasin sont souvent absents : laisse-les vides.`;
  }
  return `${commun}

La photo montre un ticket de caisse. Renvoie une ligne par article acheté :
- « 2 x 0,49 € » : quantite 2, prix_unitaire 0,49, prix_total 0,98.
- Vrac « 0,736 kg x 1,99 €/kg » : quantite 0,736, prix_kg 1,99, prix_unitaire et prix_total 1,46.
- Une remise sous un article (ex. « REMISE -0,50 ») s'applique à cet article : déduis-la du prix et mets promo à vrai. Ne crée pas de ligne pour la remise.
- Ignore les totaux, la TVA, les moyens de paiement, les points fidélité et la consigne.`;
}

async function lireAvecIA(base64, type) {
  const { Anthropic, client: c } = await client();
  const requete = {
    model: modele(),
    max_tokens: 16000,
    system: consignes(type),
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
        { type: "text", text: type === "etiquette" ? "Lis cette étiquette de prix." : "Lis ce ticket de caisse." },
      ],
    }],
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
  };
  try {
    // Opus et Sonnet : en cas de refus par un filtre de sécurité, la demande est
    // automatiquement relancée sur un autre modèle (« fallbacks »).
    const reponse = modele() === "claude-haiku-5-5"
      ? await c.messages.create(requete)
      : await c.beta.messages.create({ ...requete, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    if (reponse.stop_reason === "refusal") throw new Error("L'IA a refusé de lire cette photo.");
    if (reponse.stop_reason === "max_tokens") throw new Error("Ticket trop long pour une seule lecture : essaie de le photographier en deux fois.");
    const texte = reponse.content.find((b) => b.type === "text")?.text;
    if (!texte) throw new Error("Réponse vide de l'IA.");
    return JSON.parse(texte);
  } catch (err) {
    throw new Error(traduireErreur(err, Anthropic));
  }
}

// ---------- File de photos ----------

function etat(texte, classe) {
  const m = document.querySelector("#photo-etat");
  m.textContent = texte;
  m.className = `message ${classe || ""}`;
}

function typeChoisi() {
  return document.querySelector('input[name="type-photo"]:checked').value;
}

function recevoirPhotos(fichiers) {
  if (!fichiers.length) return;
  if (!cleApi()) {
    etat("");
    document.querySelector("#photo-sans-cle").hidden = false;
    return;
  }
  file = [...fichiers].map((f) => ({ fichier: f, type: typeChoisi() }));
  numeroPhoto = 0;
  totalPhotos = file.length;
  photoSuivante();
}

async function photoSuivante() {
  const suivante = file.shift();
  if (!suivante) {
    window.verificationEnCours = false;
    brouillon = null;
    location.hash = "#course";
    return;
  }
  numeroPhoto++;
  window.verificationEnCours = false;
  if (location.hash !== "#photo") location.hash = "#photo";
  const suffixe = totalPhotos > 1 ? ` (photo ${numeroPhoto} sur ${totalPhotos})` : "";
  try {
    etat(`Préparation de la photo${suffixe}…`);
    const image = await preparerImage(suivante.fichier);
    etat(`Lecture en cours${suffixe}… Ça prend 10 à 30 secondes.`, "attente");
    const resultat = await lireAvecIA(image.base64, suivante.type);
    etat("");
    ouvrirVerification(resultat, image.dataUrl, suivante.type, suffixe);
  } catch (err) {
    etat(`${err.message}${file.length ? " Photo suivante…" : ""}`, "erreur");
    if (file.length) setTimeout(photoSuivante, 2500);
  }
}

// ---------- Vérification ----------

function ouvrirVerification(resultat, dataUrl, type, suffixe) {
  const magasinConnu = MAGASINS.some((m) => m.id === resultat.magasin_id);
  brouillon = {
    type,
    magasin: magasinConnu ? resultat.magasin_id : (resultat.magasin_nom ? "__nouveau" : MAGASINS[0]?.id ?? "__nouveau"),
    magasinNom: resultat.magasin_nom || "",
    magasinAdresse: resultat.magasin_adresse || "",
    date: /^\d{4}-\d{2}-\d{2}$/.test(resultat.date) ? resultat.date : aujourdhui(),
    lignes: resultat.lignes.map((l) => ({
      libelle: l.libelle,
      nom: l.nom,
      quantite: l.quantite,
      prixUnitaire: l.prix_unitaire,
      prixKg: l.prix_kg,
      poids: l.poids,
      promo: l.promo,
      produit: Number.isInteger(l.produit_index) && l.produit_index >= 0 && l.produit_index < PANIER.length ? l.produit_index : -1,
      prix: Math.round((l.produit_index >= 0 ? l.prix_reference : l.prix_unitaire) * 100) / 100,
      rayon: l.rayon,
    })),
  };
  document.querySelector("#verif-titre").textContent = `Vérifier ${type === "ticket" ? "le ticket" : "l'étiquette"}${suffixe}`;
  document.querySelector("#verif-image").src = dataUrl;
  const remarque = document.querySelector("#verif-remarque");
  remarque.textContent = resultat.remarque || "";
  remarque.hidden = !resultat.remarque;
  afficherVerification();
  window.verificationEnCours = true;
  location.hash = "#verif";
}

function afficherVerification() {
  const choixMag = document.querySelector("#verif-magasin");
  choixMag.innerHTML = MAGASINS.map((m) => `<option value="${m.id}">${echapper(m.nom)}</option>`).join("")
    + `<option value="__nouveau">Autre magasin…</option>`;
  choixMag.value = brouillon.magasin;
  document.querySelector("#verif-nouveau-magasin").hidden = brouillon.magasin !== "__nouveau";
  document.querySelector("#verif-magasin-nom").value = brouillon.magasinNom;
  document.querySelector("#verif-magasin-adresse").value = brouillon.magasinAdresse;
  document.querySelector("#verif-date").value = brouillon.date;

  const options = (choisi) => `<option value="-1" ${choisi === -1 ? "selected" : ""}>Nouveau produit (ajouté à ma liste)</option>`
    + PANIER.map((p, i) => `<option value="${i}" ${i === choisi ? "selected" : ""}>${echapper(p.nom)}${p.format ? ` (${echapper(p.format)})` : ""}</option>`).join("");

  document.querySelector("#verif-lignes").innerHTML = brouillon.lignes.length
    ? brouillon.lignes.map((l, k) => {
      const detail = [
        l.libelle ? `« ${echapper(l.libelle)} »` : "",
        l.prixKg > 0 ? `${euros(l.prixKg)}/kg` : "",
        l.quantite && l.quantite !== 1 ? `quantité ${String(l.quantite).replace(".", ",")}` : "",
        l.prixUnitaire && Math.abs(l.prixUnitaire - l.prix) > 0.005 ? `${euros(l.prixUnitaire)} l'article` : "",
      ].filter(Boolean).join(" · ");
      return `
        <div class="ligne-verif" data-k="${k}">
          <div class="ligne-tete">
            <span class="detail">${detail || "Ligne ajoutée"}</span>
            <button type="button" class="supprimer" data-supprimer-ligne="${k}" aria-label="Supprimer la ligne">✕</button>
          </div>
          <div class="formulaire">
            <label class="large">Produit associé
              <select data-champ="produit">${options(l.produit)}</select>
            </label>
            <label class="large" ${l.produit >= 0 ? "hidden" : ""}>Nom du nouveau produit
              <input type="text" data-champ="nom" value="${echapper(l.nom)}">
            </label>
            <label>Prix retenu (€)
              <input type="text" inputmode="decimal" data-champ="prix" value="${l.prix.toFixed(2).replace(".", ",")}">
            </label>
            <label>Quantité
              <input type="text" inputmode="decimal" data-champ="quantite" value="${String(l.quantite ?? 1).replace(".", ",")}">
            </label>
            <label class="case"><input type="checkbox" data-champ="promo" ${l.promo ? "checked" : ""}> Promo</label>
          </div>
        </div>`;
    }).join("")
    : `<p class="encart">Aucun produit trouvé sur cette photo. Ajoute une ligne à la main, ou annule.</p>`;
}

function majChamp(e) {
  const bloc = e.target.closest(".ligne-verif");
  const champ = e.target.dataset.champ;
  if (!bloc || !champ) return;
  const l = brouillon.lignes[Number(bloc.dataset.k)];
  if (champ === "produit") {
    l.produit = Number(e.target.value);
    bloc.querySelector('[data-champ="nom"]').closest("label").hidden = l.produit >= 0;
  } else if (champ === "nom") l.nom = e.target.value;
  else if (champ === "prix") l.prix = lirePrix(e.target.value);
  else if (champ === "quantite") l.quantite = lirePrix(e.target.value) || 1;
  else if (champ === "promo") l.promo = e.target.checked;
}

function valider() {
  const lignes = brouillon.lignes.filter((l) => l.prix > 0);
  if (!lignes.length) {
    alert("Aucune ligne avec un prix valide à enregistrer.");
    return;
  }
  let magasin = document.querySelector("#verif-magasin").value;
  if (magasin === "__nouveau") {
    const nom = document.querySelector("#verif-magasin-nom").value.trim();
    if (!nom) {
      alert("Donne un nom au nouveau magasin.");
      return;
    }
    magasin = ajouterMagasin(nom, document.querySelector("#verif-magasin-adresse").value.trim());
  }
  const date = document.querySelector("#verif-date").value || aujourdhui();

  for (const l of lignes) {
    const produit = l.produit >= 0 ? l.produit : ajouterProduit({ nom: l.nom, format: l.poids, rayon: l.rayon });
    releves.push({
      produit,
      magasin,
      prix: Math.round(l.prix * 100) / 100,
      date,
      promo: Boolean(l.promo),
      quantite: l.quantite ?? 1,
      libelle: l.libelle || null,
      source: brouillon.type,
      code: null,
      envoye: false,
    });
  }
  sauvegarder();
  toutAfficher();
  const texte = `${lignes.length} prix enregistré${lignes.length > 1 ? "s" : ""} chez ${nomMagasin(magasin)}.`;
  etat(texte, "ok");
  notifier(texte);
  photoSuivante();
}

// ---------- Démarrage ----------

function demarrerLecture() {
  afficherReglages();

  for (const id of ["#photo-camera", "#photo-galerie"]) {
    document.querySelector(id).addEventListener("change", (e) => {
      recevoirPhotos(e.target.files);
      e.target.value = "";
    });
  }

  document.querySelector("#verif-lignes").addEventListener("input", majChamp);
  document.querySelector("#verif-lignes").addEventListener("change", majChamp);
  document.querySelector("#verif-lignes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-supprimer-ligne]");
    if (!b) return;
    brouillon.lignes.splice(Number(b.dataset.supprimerLigne), 1);
    afficherVerification();
  });
  document.querySelector("#verif-ajouter").addEventListener("click", () => {
    brouillon.lignes.push({ libelle: "", nom: "", quantite: 1, prixUnitaire: 0, prixKg: 0, poids: "", promo: false, produit: 0, prix: 0, rayon: "Ajoutés" });
    afficherVerification();
  });
  document.querySelector("#verif-magasin").addEventListener("change", (e) => {
    brouillon.magasin = e.target.value;
    document.querySelector("#verif-nouveau-magasin").hidden = e.target.value !== "__nouveau";
  });
  document.querySelector("#verif-magasin-nom").addEventListener("input", (e) => { brouillon.magasinNom = e.target.value; });
  document.querySelector("#verif-magasin-adresse").addEventListener("input", (e) => { brouillon.magasinAdresse = e.target.value; });
  document.querySelector("#verif-date").addEventListener("change", (e) => { brouillon.date = e.target.value; });
  document.querySelector("#verif-valider").addEventListener("click", valider);
  document.querySelector("#verif-annuler").addEventListener("click", () => {
    etat(file.length ? "Photo ignorée." : "Lecture annulée.");
    photoSuivante();
  });

  document.querySelector("#form-cle").addEventListener("submit", (e) => {
    e.preventDefault();
    const cle = document.querySelector("#cle-api").value.trim();
    ecrire(CLE_API, cle);
    ecrire(CLE_MODELE, document.querySelector("#modele").value);
    afficherReglages();
    messageCle(cle ? "Réglages enregistrés." : "Aucune clé enregistrée.", cle ? "ok" : "erreur");
  });
  document.querySelector("#modele").addEventListener("change", (e) => {
    ecrire(CLE_MODELE, e.target.value);
    document.querySelector("#photo-modele").value = e.target.value;
    messageCle("Modèle enregistré.", "ok");
  });
  document.querySelector("#photo-modele").addEventListener("change", (e) => {
    ecrire(CLE_MODELE, e.target.value);
    document.querySelector("#modele").value = e.target.value;
  });
  document.querySelector("#cle-effacer").addEventListener("click", () => {
    try { localStorage.removeItem(CLE_API); } catch (e) {}
    afficherReglages();
    messageCle("Clé effacée de ce navigateur.", "ok");
  });
  document.querySelector("#cle-tester").addEventListener("click", async () => {
    const saisie = document.querySelector("#cle-api").value.trim();
    if (saisie) ecrire(CLE_API, saisie);
    if (!cleApi()) { messageCle("Colle d'abord ta clé.", "erreur"); return; }
    messageCle("Test en cours…");
    let Anthropic;
    try {
      const r = await client();
      Anthropic = r.Anthropic;
      await r.client.models.retrieve(modele()); // vérifie la clé sans rien coûter
      afficherReglages();
      messageCle("La clé fonctionne.", "ok");
    } catch (err) {
      messageCle(traduireErreur(err, Anthropic), "erreur");
    }
  });
}

demarrerLecture();
