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
  document.querySelector("#cle-api").value = cleApi();
  document.querySelector("#photo-sans-cle").hidden = Boolean(cleApi());
  // Sous-titre de la ligne « Lecture des photos » : la clé n'est jamais affichée.
  document.querySelector("#reglage-photos-sous").textContent = `${cleApi() ? "Clé enregistrée" : "Pas de clé"} · ${MODELES.find((m) => m.id === modele())?.nom.split(" : ")[0] || ""}`;
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

// Ticket numérique (séance 25) : un PDF est envoyé tel quel à l'IA, qui sait le lire.
const LIMITE_PDF = 20 * 1024 * 1024;
async function preparerPdf(fichier) {
  if (fichier.size > LIMITE_PDF) throw new Error("Ce PDF dépasse 20 Mo : il est trop lourd pour être lu.");
  const base64 = await new Promise((resolu, rejete) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolu(String(lecteur.result).split(",")[1]);
    lecteur.onerror = () => rejete(new Error("Impossible de lire ce fichier."));
    lecteur.readAsDataURL(fichier);
  });
  const nom = (fichier.name || "ticket.pdf").replace(/[<>&"]/g, "");
  const dataUrl = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="90"><rect width="320" height="90" fill="#fbf9f1" stroke="#cfc8b2"/><text x="16" y="40" font-family="monospace" font-size="22" font-weight="bold" fill="#0e4d2f">Ticket PDF</text><text x="16" y="68" font-family="monospace" font-size="14" fill="#4b5f54">${nom.slice(0, 34)}</text></svg>`);
  return { dataUrl, base64 };
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
        required: ["libelle", "nom", "marque", "quantite", "prix_unitaire", "prix_total", "prix_kg", "poids", "promo", "association", "produit_index", "prix_reference", "rayon"],
        properties: {
          libelle: { type: "string", description: "Texte exact de la ligne." },
          nom: { type: "string", description: "Nom lisible en français, sans abréviation, sans la marque et SANS poids ni volume (le poids va dans « poids »), ex. « Purée de tomates », « Gnocchi à poêler »." },
          marque: { type: "string", description: "Marque commerciale du produit si on la reconnaît (ex. « Lustucru », « Alvalle »), sinon chaîne vide (vrac, fruits et légumes, marque de distributeur)." },
          quantite: { type: "number", description: "Nombre d'articles (2 pour « 2 x 0,49 »), ou poids en kg pour le vrac." },
          prix_unitaire: { type: "number", description: "Prix d'un article, en euros. Pour le vrac : le prix payé." },
          prix_total: { type: "number", description: "Montant de la ligne, en euros." },
          prix_kg: { type: "number", description: "Prix au kilo ou au litre s'il est indiqué, sinon 0." },
          poids: { type: "string", description: "Contenance de l'article (ex. « 500 g », « 1 L », « x12 »), ou chaîne vide." },
          promo: { type: "boolean", description: "Vrai si une remise ou une promotion s'applique." },
          association: { type: "string", enum: ["meme", "variante", "aucune"], description: "« meme » : exactement le même produit que celui du panier (même nature, même format). « variante » : même type de produit mais marque, saveur ou variété différente, format proche. « aucune » : rien ne correspond, ou format très différent (pack contre unité, 75 cl contre 6 × 25 cl)." },
          produit_index: { type: "integer", description: "Indice du produit correspondant dans le panier de référence, ou -1 si aucun ne correspond." },
          prix_reference: { type: "number", description: "Prix ramené au format du produit associé (voir les consignes). Si produit_index vaut -1 : le prix unitaire." },
          rayon: { type: "string", description: "Rayon du produit, en reprenant si possible un rayon existant." },
        },
      },
    },
  },
};

function consignes(type) {
  const panier = produitsActifs().map((i) => `${i} | ${PANIER[i].nom} | ${PANIER[i].format || "format libre"} | ${PANIER[i].rayon}`).join("\n");
  const magasins = MAGASINS.map((m) => `${m.id} | ${m.nom} | ${m.adresse || ""}`).join("\n");
  const rayons = [...new Set(PANIER.map((p) => p.rayon))].join(", ");
  const commun = `Tu aides une personne à suivre les prix de ses courses en France. Tu lis une photo et tu renvoies les produits et leurs prix, en euros, sous forme de données structurées.

Magasins connus (identifiant | nom | adresse) :
${magasins}

Panier de référence (indice | produit | format | rayon) :
${panier}

Rayons existants : ${rayons}

Associer une ligne à un produit du panier :
- Sois prudent : n'associe pas en force. Choisis association « meme » si c'est le même produit, « variante » si c'est le même type de produit avec une marque ou une variété différente (« PENNE 500 G » pour « Pâtes (500 g) »), et « aucune » avec produit_index -1 dans le doute ou si le format est très différent (une bière à l'unité de 75 cl n'est pas un pack de 6 × 25 cl). Mieux vaut un nouveau produit qu'une association fausse.
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
- Ignore les totaux, la TVA, les moyens de paiement, les points fidélité et la consigne.
- Ignore aussi tout ce qui n'est pas un article avec un prix : messages publicitaires, notes et mentions en bas de ticket, coupons, numéro de carte, horaires, adresses de contact, monnaie rendue. N'invente pas de ligne pour eux.
- Sépare toujours la marque du nom : « GNOCCHI A POELER LUSTUCRU » donne nom « Gnocchi à poêler » et marque « Lustucru ».
- Pour rayon, propose celui qui convient le mieux parmi les rayons existants (ou un nouveau si aucun ne va) : le même produit doit toujours tomber dans le même rayon.`;
}

async function lireAvecIA(base64, type, mediaType = "image/jpeg") {
  if (!navigator.onLine) throw new Error("Pas de réseau : la lecture par l'IA en a besoin. Réessaie quand tu auras du réseau.");
  const { Anthropic, client: c } = await client();
  const requete = {
    model: modele(),
    max_tokens: 16000,
    system: consignes(type),
    messages: [{
      role: "user",
      content: [
        mediaType === "application/pdf"
          ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
          : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
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

// ---------- Écran Photo : accueil du premier lancement, écran habituel, lecture en cours, lecture impossible ----------

const CLE_ACCUEIL = "atable.accueil-passe";
let phasePhoto = "repos"; // repos | lecture | echec

// Tant qu'il n'y a aucun relevé (et qu'on n'a pas touché « Passer »), l'écran Photo montre l'accueil en trois étapes.
// Pour le revoir à la main : ajouter ?accueil à l'adresse.
function premierLancement() {
  if (new URLSearchParams(location.search).has("accueil")) return true;
  return releves.length === 0 && lire(CLE_ACCUEIL, false) !== true;
}

function majPhoto() {
  const accueil = phasePhoto === "repos" && premierLancement();
  document.querySelector("#photo-accueil").hidden = !accueil;
  document.querySelector("#photo-classique").hidden = phasePhoto !== "repos" || accueil;
  document.querySelector("#photo-lecture").hidden = phasePhoto !== "lecture";
  document.querySelector("#photo-echec").hidden = phasePhoto !== "echec";
}

function afficherLecture(dataUrl, suffixe) {
  phasePhoto = "lecture";
  const image = document.querySelector("#photo-lecture-image");
  if (dataUrl) image.src = dataUrl; else image.removeAttribute("src");
  document.querySelector("#photo-lecture-titre").textContent = `Lecture en cours${suffixe || ""}…`;
  majPhoto();
}

function afficherEchec(texte) {
  phasePhoto = "echec";
  document.querySelector("#photo-echec-texte").textContent = texte;
  majPhoto();
}

function revenirPhoto() {
  phasePhoto = "repos";
  majPhoto();
}

function recevoirPhotos(fichiers) {
  if (!fichiers.length) return;
  if (!cleApi()) {
    etat("");
    document.querySelector("#photo-sans-cle").hidden = false;
    return;
  }
  document.querySelector("#photo-sans-cle").hidden = true;
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
    revenirPhoto();
    location.hash = "#course";
    return;
  }
  numeroPhoto++;
  window.verificationEnCours = false;
  if (location.hash !== "#photo") location.hash = "#photo";
  const suffixe = totalPhotos > 1 ? ` (photo ${numeroPhoto} sur ${totalPhotos})` : "";
  try {
    etat("");
    afficherLecture(null, suffixe);
    const estPdf = suivante.fichier.type === "application/pdf" || /\.pdf$/i.test(suivante.fichier.name || "");
    const image = estPdf ? await preparerPdf(suivante.fichier) : await preparerImage(suivante.fichier);
    afficherLecture(estPdf ? null : image.dataUrl, suffixe);
    const resultat = await lireAvecIA(image.base64, suivante.type, estPdf ? "application/pdf" : "image/jpeg");
    revenirPhoto();
    ouvrirVerification(resultat, image.dataUrl, suivante.type, suffixe);
  } catch (err) {
    if (file.length) {
      revenirPhoto();
      etat(`${err.message} Photo suivante…`, "erreur");
      setTimeout(photoSuivante, 2500);
    } else {
      afficherEchec(err.message);
    }
  }
}

// ---------- Vérification ----------

// Une ligne lue par l'IA. Association prudente (séance 16) : si le format lu est très différent
// de celui du produit proposé, on ne force pas le rapprochement et on le signale.
function ligneBrouillon(l) {
  let produit = Number.isInteger(l.produit_index) && l.produit_index >= 0 && l.produit_index < PANIER.length ? l.produit_index : -1;
  let lien = l.association === "variante" ? "variante" : "meme";
  let avertissement = "";
  let suggestion = -1;
  if (produit >= 0 && !formatsProches(l.poids, PANIER[produit].format)) {
    avertissement = `Format différent : ${l.poids} lu sur la photo, contre ${PANIER[produit].format} pour « ${PANIER[produit].nom} ». Je n'ai pas associé. Choisis le produit si tu veux quand même.`;
    suggestion = produit;
    produit = -1;
  } else if (produit >= 0 && l.association === "aucune") {
    avertissement = `Je ne suis pas sûr que ce soit « ${PANIER[produit].nom} ». Je n'ai pas associé.`;
    suggestion = produit;
    produit = -1;
  }
  return {
    libelle: l.libelle,
    nom: l.nom,
    marque: (l.marque || "").trim(),
    quantite: l.quantite,
    prixUnitaire: l.prix_unitaire,
    prixTotal: l.prix_total,
    prixKg: l.prix_kg,
    poids: l.poids,
    promo: l.promo,
    produit,
    lien,
    variante: lien === "variante" ? l.nom : "",
    avertissement,
    suggestion,
    prix: Math.round((produit >= 0 ? l.prix_reference : l.prix_unitaire) * 100) / 100,
    rayon: l.rayon,
  };
}

function ouvrirVerification(resultat, dataUrl, type, suffixe) {
  const magasinConnu = MAGASINS.some((m) => m.id === resultat.magasin_id);
  brouillon = {
    type,
    magasin: magasinConnu ? resultat.magasin_id : (resultat.magasin_nom ? "__nouveau" : MAGASINS[0]?.id ?? "__nouveau"),
    magasinNom: resultat.magasin_nom || "",
    magasinAdresse: resultat.magasin_adresse || "",
    date: /^\d{4}-\d{2}-\d{2}$/.test(resultat.date) ? resultat.date : aujourdhui(),
    // Les lignes sans prix (notes, messages en bas de ticket) ne servent à rien : on les écarte (séance 24).
    lignes: resultat.lignes.filter((l) => l.prix_total > 0 || l.prix_unitaire > 0).map(ligneBrouillon),
  };
  document.querySelector("#verif-titre").textContent = `Vérifier ${type === "ticket" ? "le ticket" : "l'étiquette"}${suffixe}`;
  document.querySelector("#verif-image").src = dataUrl;
  const remarque = document.querySelector("#verif-remarque");
  remarque.textContent = resultat.remarque || "";
  remarque.hidden = !resultat.remarque;
  VerifCartes.demarrer();
  window.verificationEnCours = true;
  location.hash = "#verif";
}

// Remet à jour l'écran de vérification (cartes) : d'abord la fiche magasin / date / panier, puis les cartes (js/verif-cartes.js).
function afficherVerification() {
  VerifCartes.afficher();
}

// Fiche magasin, date et panier (dans le détail replié sous l'en-tête).
function remplirFicheVerif() {
  const choixMag = document.querySelector("#verif-magasin");
  choixMag.innerHTML = MAGASINS.map((m) => `<option value="${m.id}">${echapper(m.nom)}</option>`).join("")
    + `<option value="__nouveau">Autre magasin…</option>`;
  choixMag.value = brouillon.magasin;
  document.querySelector("#verif-nouveau-magasin").hidden = brouillon.magasin !== "__nouveau";
  document.querySelector("#verif-magasin-nom").value = brouillon.magasinNom;
  document.querySelector("#verif-magasin-adresse").value = brouillon.magasinAdresse;
  document.querySelector("#verif-date").value = brouillon.date;
  // Les nouveaux produits rejoignent le panier habituel ; on peut aussi les envoyer vers un autre panier.
  const autres = paniers.filter((p) => p.id !== "habituel");
  document.querySelector("#verif-panier-label").hidden = autres.length === 0;
  document.querySelector("#verif-panier").innerHTML = `<option value="">Aucun autre panier</option>` + autres.map((p) => `<option value="${p.id}">${echapper(p.nom)}</option>`).join("");
  document.querySelector("#verif-panier").value = brouillon.panier || "";
}

// Formulaire d'une ligne (produit associé, nom, marque, poids, rayon, prix, quantité, promo) : il vit dans la carte, sous « Corriger ».
function htmlLigneVerif(l, k) {
  const options = (choisi) => `<option value="-1" ${choisi === -1 ? "selected" : ""}>Nouveau produit (ajouté à ma liste)</option>`
    + produitsActifs().map((i) => `<option value="${i}" ${i === choisi ? "selected" : ""}>${echapper(PANIER[i].nom)}${PANIER[i].format ? ` (${echapper(PANIER[i].format)})` : ""}</option>`).join("");
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
            <div class="large">Produit associé
              <select data-champ="produit" hidden>${options(l.produit)}</select>
              <button type="button" class="bouton-produit" data-assoc="${k}">${texteAssoc(l.produit, l.suggestion)}</button>
            </div>
            ${l.avertissement ? `<p class="avertissement">${echapper(l.avertissement)}</p>` : ""}
            <label class="large" data-bloc="lien" ${l.produit >= 0 ? "" : "hidden"}>C'est…
              <select data-champ="lien">
                <option value="meme" ${l.lien === "meme" ? "selected" : ""}>Le même produit</option>
                <option value="variante" ${l.lien === "variante" ? "selected" : ""}>Une variante (marque, saveur…)</option>
              </select>
            </label>
            <label class="large" data-bloc="variante" ${l.produit >= 0 && l.lien === "variante" ? "" : "hidden"}>Précise la variante
              <input type="text" data-champ="variante" value="${echapper(l.variante)}">
            </label>
            <label class="large" data-bloc="nom" ${l.produit >= 0 ? "hidden" : ""}>Nom du nouveau produit
              <input type="text" data-champ="nom" value="${echapper(l.nom)}">
            </label>
            <label data-bloc="marque" ${l.produit >= 0 ? "hidden" : ""}>Marque
              <input type="text" data-champ="marque" value="${echapper(l.marque)}" placeholder="ex. Lustucru">
            </label>
            <label data-bloc="format" ${l.produit >= 0 ? "hidden" : ""}>Poids ou volume
              <input type="text" data-champ="poids" value="${echapper(l.poids)}" placeholder="500 g, 1 L…">
            </label>
            <label class="large" data-bloc="rayon" ${l.produit >= 0 ? "hidden" : ""}>Rayon proposé
              <input type="text" data-champ="rayon" list="verif-rayons" value="${echapper(l.rayon)}">
            </label>
            <label>Prix retenu (€)
              <input type="text" inputmode="decimal" data-champ="prix" value="${l.prix.toFixed(2).replace(".", ",")}">
            </label>
            <label>Quantité
              <input type="text" inputmode="decimal" data-champ="quantite" value="${String(l.quantite ?? 1).replace(".", ",")}">
            </label>
            <p class="pkg" data-pkg>${echapper(texteKg(l))}</p>
            <button type="button" class="promo-bouton ${l.promo ? "actif" : ""}" data-promo aria-pressed="${Boolean(l.promo)}">${l.promo ? "En promo ✓" : "En promo ?"}</button>
          </div>
        </div>`;
}

// Prix au kilo ou au litre d'une ligne : d'après le format du produit associé, ou le poids saisi pour un nouveau produit.
function texteKg(l) {
  const format = l.produit >= 0 ? PANIER[l.produit].format : l.poids;
  const kg = prixAuKilo(format, l.prix > 0 ? l.prix : null);
  if (kg) return `Soit ${kg}`;
  if (l.prixKg > 0) return `${euros(l.prixKg)}/kg indiqué sur le ticket`;
  return l.produit >= 0 ? "" : "Ajoute le poids ou le volume pour voir le prix au kilo.";
}

// ---------- Associer une ligne à un produit : feuille avec recherche (séance 37) ----------
// Le menu déroulant reste dans la ligne (masqué) : c'est lui que lit majChamp ; la feuille ne fait que le remplir.
function texteAssoc(i) {
  return i >= 0 && PANIER[i]
    ? `<span>${echapper(PANIER[i].nom)}<small>${echapper(PANIER[i].format || "")}</small></span><span class="ch">Chercher</span>`
    : `<span>Nouveau produit<small>ajouté à ma liste</small></span><span class="ch">Chercher</span>`;
}

const feuilleAssoc = document.querySelector("#feuille-assoc");
const champAssoc = document.querySelector("#assoc-q");
const resAssoc = document.querySelector("#assoc-res");
let ligneAssoc = null;

function ouvrirAssociation(k) {
  ligneAssoc = k;
  const l = brouillon.lignes[k];
  document.querySelector("#assoc-libelle").textContent = l.libelle ? `« ${l.libelle} » lu sur le ticket` : (l.nom || "Ligne ajoutée");
  champAssoc.value = "";
  remplirAssociation();
  feuilleAssoc.hidden = false;
  champAssoc.focus();
}

function remplirAssociation() {
  const t = sansAccent(champAssoc.value.trim());
  const propose = brouillon.lignes[ligneAssoc]?.suggestion ?? -1;
  const trouves = produitsActifs().filter((i) => !t || sansAccent(`${PANIER[i].nom} ${PANIER[i].marque || ""}`).includes(t));
  // Sans recherche, le produit deviné par la lecture passe en tête.
  if (!t && propose >= 0 && trouves.includes(propose)) trouves.splice(trouves.indexOf(propose), 1), trouves.unshift(propose);
  resAssoc.innerHTML = trouves.slice(0, 15).map((i) => `<li class="${!t && i === propose ? "sug" : ""}"><button type="button" data-i="${i}"><span>${echapper(PANIER[i].nom)}<br><small>${echapper(PANIER[i].format || "")} · ${echapper(PANIER[i].rayon)}</small></span>${!t && i === propose ? "<small>proposé</small>" : ""}</button></li>`).join("")
    + `<li class="nouveau"><button type="button" data-i="-1">+ Nouveau produit${champAssoc.value.trim() ? ` « ${echapper(champAssoc.value.trim())} »` : ""}</button></li>`;
}

champAssoc.addEventListener("input", remplirAssociation);
document.querySelector("#assoc-fermer").addEventListener("click", () => { feuilleAssoc.hidden = true; });
resAssoc.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || ligneAssoc === null) return;
  const bloc = document.querySelector(`#verif-lignes .ligne-verif[data-k="${ligneAssoc}"]`);
  const select = bloc.querySelector('[data-champ="produit"]');
  select.value = b.dataset.i;
  select.dispatchEvent(new Event("change", { bubbles: true })); // majChamp met la ligne à jour
  bloc.querySelector("[data-assoc]").innerHTML = texteAssoc(Number(b.dataset.i));
  feuilleAssoc.hidden = true;
});

function majChamp(e) {
  const bloc = e.target.closest(".ligne-verif");
  const champ = e.target.dataset.champ;
  if (!bloc || !champ) return;
  const l = brouillon.lignes[Number(bloc.dataset.k)];
  if (champ === "produit") {
    l.produit = Number(e.target.value);
    l.avertissement = "";
    bloc.querySelector(".avertissement")?.remove();
    for (const b of ["nom", "marque", "format", "rayon"]) bloc.querySelector(`[data-bloc="${b}"]`).hidden = l.produit >= 0;
    bloc.querySelector('[data-bloc="lien"]').hidden = l.produit < 0;
    bloc.querySelector('[data-bloc="variante"]').hidden = l.produit < 0 || l.lien !== "variante";
  } else if (champ === "lien") {
    l.lien = e.target.value;
    if (l.lien === "variante" && !l.variante) l.variante = l.nom;
    bloc.querySelector('[data-bloc="variante"]').hidden = l.lien !== "variante";
    bloc.querySelector('[data-champ="variante"]').value = l.variante;
  } else if (champ === "variante") l.variante = e.target.value;
  else if (champ === "nom") l.nom = e.target.value;
  else if (champ === "marque") l.marque = e.target.value;
  else if (champ === "poids") l.poids = e.target.value;
  else if (champ === "rayon") l.rayon = e.target.value;
  else if (champ === "prix") { l.prix = lirePrix(e.target.value); l.montantModifie = true; }
  else if (champ === "quantite") { l.quantite = lirePrix(e.target.value) || 1; l.montantModifie = true; }
  const pkg = bloc.querySelector("[data-pkg]");
  if (pkg) pkg.textContent = texteKg(l);
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

  const idTicket = "t" + Date.now().toString(36);
  const panierChoisi = paniers.find((p) => p.id === document.querySelector("#verif-panier").value);
  for (const l of lignes) {
    const produit = l.produit >= 0 ? l.produit : ajouterProduit({ nom: l.nom, format: l.poids, rayon: l.rayon, marque: l.marque });
    if (panierChoisi && !panierChoisi.produits.includes(produit)) { panierChoisi.produits.push(produit); coches.add(produit); }
    releves.push({
      produit,
      magasin,
      prix: Math.round(l.prix * 100) / 100,
      date,
      promo: Boolean(l.promo),
      quantite: l.quantite ?? 1,
      libelle: l.libelle || null,
      marque: (l.marque || "").trim() || null,
      ticket: idTicket,
      montant: !l.montantModifie && l.prixTotal > 0 ? Math.round(l.prixTotal * 100) / 100 : Math.round(l.prix * (l.quantite ?? 1) * 100) / 100,
      variante: l.produit >= 0 && l.lien === "variante" && l.variante.trim() ? l.variante.trim() : null,
      source: brouillon.type,
      code: null,
      envoye: false,
    });
  }
  sauvegarder();
  toutAfficher();
  const texte = `${lignes.length} prix enregistré${lignes.length > 1 ? "s" : ""} chez ${nomMagasin(magasin)}.`;
  notifier(texte);
  // Écran « Enregistré » : on confirme avant de passer à Ma course (ou à la photo suivante s'il y en a).
  VerifCartes.afficherFin({ n: lignes.length, total: lignes.reduce((s, l) => s + l.prix * (l.quantite ?? 1), 0), magasin: nomMagasin(magasin), suite: file.length > 0 });
}

// ---------- Démarrage ----------

function demarrerLecture() {
  afficherReglages();

  for (const id of ["#photo-import"]) {
    document.querySelector(id).addEventListener("change", (e) => {
      recevoirPhotos(e.target.files);
      e.target.value = "";
    });
  }

  // Écran Photo : accueil du premier lancement, lecture impossible.
  const etape1 = document.querySelector("#accueil-etape1");
  etape1.addEventListener("click", () => document.querySelector("#photo-import").click());
  etape1.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); document.querySelector("#photo-import").click(); } });
  document.querySelector("#accueil-passer").addEventListener("click", () => { ecrire(CLE_ACCUEIL, true); majPhoto(); });
  document.querySelector("#photo-echec-annuler").addEventListener("click", () => { file = []; revenirPhoto(); });
  majPhoto();

  document.querySelector("#verif-lignes").addEventListener("input", majChamp);
  document.querySelector("#verif-lignes").addEventListener("change", majChamp);
  document.querySelector("#verif-lignes").addEventListener("click", (e) => {
    const assoc = e.target.closest("[data-assoc]");
    if (assoc) { ouvrirAssociation(Number(assoc.dataset.assoc)); return; }
    const promo = e.target.closest("[data-promo]");
    if (promo) {
      const l = brouillon.lignes[Number(promo.closest(".ligne-verif").dataset.k)];
      l.promo = !l.promo;
      promo.classList.toggle("actif", l.promo);
      promo.setAttribute("aria-pressed", String(l.promo));
      promo.textContent = l.promo ? "En promo ✓" : "En promo ?";
      return;
    }
    const b = e.target.closest("[data-supprimer-ligne]");
    if (!b) return;
    brouillon.lignes.splice(Number(b.dataset.supprimerLigne), 1);
    afficherVerification();
  });
  document.querySelector("#verif-ajouter").addEventListener("click", () => {
    brouillon.lignes.push({ libelle: "", nom: "", marque: "", quantite: 1, prixUnitaire: 0, prixKg: 0, poids: "", promo: false, produit: 0, lien: "meme", variante: "", avertissement: "", suggestion: -1, prix: 0, rayon: "Ajoutés", ouvert: true, corriger: true });
    afficherVerification();
  });
  document.querySelector("#verif-magasin").addEventListener("change", (e) => {
    brouillon.magasin = e.target.value;
    document.querySelector("#verif-nouveau-magasin").hidden = e.target.value !== "__nouveau";
  });
  document.querySelector("#verif-magasin-nom").addEventListener("input", (e) => { brouillon.magasinNom = e.target.value; });
  document.querySelector("#verif-magasin-adresse").addEventListener("input", (e) => { brouillon.magasinAdresse = e.target.value; });
  document.querySelector("#verif-date").addEventListener("change", (e) => { brouillon.date = e.target.value; });
  document.querySelector("#verif-panier").addEventListener("change", (e) => { brouillon.panier = e.target.value; });
  document.querySelector("#verif-valider").addEventListener("click", (e) => {
    if (e.currentTarget.getAttribute("aria-disabled") === "true") return; // il reste des lignes à confirmer
    valider();
  });
  document.querySelector("#verif-fin-suite").addEventListener("click", photoSuivante);
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
    messageCle("Modèle enregistré.", "ok");
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

// ---------- Réglages en un seul écran : trois lignes à déplier, une seule ouverte à la fois ----------
// Lecture des photos (clé, modèle), Sauvegarde (avec le rappel hebdomadaire), Aide et à propos.
function ouvrirReglage(nom) {
  if (!nom) return;
  for (const r of document.querySelectorAll("#vue-reglages .reglage")) {
    const ouvert = r.dataset.reglage === nom;
    r.querySelector(".reglage-corps").hidden = !ouvert;
    r.querySelector(".reglage-titre").setAttribute("aria-expanded", String(ouvert));
  }
}

document.querySelector("#vue-reglages").addEventListener("click", (e) => {
  const titre = e.target.closest(".reglage-titre");
  if (titre) {
    // Toucher une ligne l'ouvre (et referme les autres) ; la toucher de nouveau la referme.
    ouvrirReglage(titre.getAttribute("aria-expanded") === "true" ? "aucune" : titre.closest(".reglage").dataset.reglage);
    return;
  }
  const plus = e.target.closest("[data-plus-reglage]");
  if (plus) {
    const zone = plus.closest(".reglage-corps").querySelector("[data-plus-zone]");
    zone.hidden = !zone.hidden;
    plus.setAttribute("aria-expanded", String(!zone.hidden));
  }
});
