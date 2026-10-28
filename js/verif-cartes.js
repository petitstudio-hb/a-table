// Vérification d'un ticket en cartes (lot 2 « Photo », maquette validée par Hugo le 28/10/2026).
// Une carte par ligne lue. Les lignes sûres sont acceptées d'office ; les lignes douteuses passent en premier et posent une question :
// « C'est bien … ? » avec Oui ou Autre produit. « Autre produit » ouvre la recherche, avec « Nouveau produit » et « Je ne sais pas, ignorer ».
// Ce fichier ne change PAS le modèle de données : il ne fait que remplir brouillon.lignes (produit, nom, rayon) ; valider() de lecture.js
// écrit les relevés exactement comme avant. Le formulaire complet d'une ligne reste accessible dans la carte, sous « Corriger cette ligne ».
const VerifCartes = (() => {
  let mode = "cartes"; // cartes | choix | fin
  let indexChoix = -1; // ligne en cours dans l'écran « Autre produit »
  let recherche = "";
  let nouveauOuvert = false;
  let rayonChoisi = "";

  const zone = () => document.querySelector("#verif-lignes");
  const icone = (nom, classe) => `<svg class="vc-icone ${classe || ""}" aria-hidden="true"><use href="#i-${nom}"/></svg>`;

  // Pictogramme d'un rayon (on ne se fie pas aux accents ni à la casse).
  function pictoRayon(rayon) {
    const r = sansAccent(rayon || "").toLowerCase();
    if (/fruit|leg|primeur/.test(r)) return "pomme";
    if (/fromage/.test(r)) return "fromage";
    if (/cremerie|frais|lait|laitier/.test(r)) return "lait";
    if (/boisson|cafe|the/.test(r)) return "tasse";
    return "paquet";
  }

  // Classe une ligne : sûre (acceptée d'office) ou douteuse (posée en question), avec le produit proposé et quelques candidats.
  function classerLigne(l) {
    const texte = l.libelle || l.nom || "";
    if (l.produit >= 0 && PANIER[l.produit]) {
      const ev = Association.evaluer(texte, PANIER[l.produit]);
      const sure = !l.avertissement && ev.score >= Association.SEUIL_DOUTEUX && ev.format !== "contredit";
      return { sure, propose: l.produit, candidats: [l.produit] };
    }
    const c = Association.classer(texte, PANIER);
    const propose = l.suggestion >= 0 ? l.suggestion : (c.classe === "nouvelle" ? -1 : c.produit);
    return { sure: false, propose, candidats: c.candidats };
  }

  const enAttente = (l) => l.dt && !l.ok;
  const nomProduit = (i) => PANIER[i].nom + (PANIER[i].format ? ` ${PANIER[i].format}` : "");
  const nomAffiche = (l) => (l.produit >= 0 && PANIER[l.produit] ? nomProduit(l.produit) : (l.nom || l.libelle || "Ligne sans nom"));
  const rayonDe = (l) => (l.produit >= 0 && PANIER[l.produit] ? PANIER[l.produit].rayon : l.rayon);
  const prixLigne = (l) => (l.prix > 0 ? l.prix : 0) * (l.quantite ?? 1);

  function resume() {
    const lignes = brouillon.lignes.filter((l) => l.prix > 0);
    return { n: lignes.length, somme: lignes.reduce((s, l) => s + prixLigne(l), 0) };
  }

  function demarrer() {
    for (const l of brouillon.lignes) {
      const c = classerLigne(l);
      l.propose = c.propose;
      l.candidats = c.candidats;
      l.dt = !c.sure;
      l.ok = false;
      l.ouvert = false;
      l.corriger = false;
    }
    const premiere = brouillon.lignes.find(enAttente);
    if (premiere) premiere.ouvert = true;
    document.querySelector("#verif-detail").open = brouillon.magasin === "__nouveau" || brouillon.lignes.length === 0;
    mode = "cartes";
    recherche = "";
    nouveauOuvert = false;
    afficher();
    window.scrollTo(0, 0);
  }

  // Après une réponse : la première ligne encore en question s'ouvre, les autres cartes se replient.
  function ouvrirSuivante() {
    for (const l of brouillon.lignes) l.ouvert = false;
    const suivante = brouillon.lignes.find(enAttente);
    if (suivante) suivante.ouvert = true;
  }

  // ---------- Cartes ----------

  function carte(l, k) {
    const dt = enAttente(l);
    const ouvert = Boolean(l.ouvert);
    let corps = "";
    if (ouvert) {
      if (dt) {
        const question = l.propose >= 0
          ? `C'est bien <b>${echapper(nomProduit(l.propose))}</b> ?`
          : `Nouveau produit : <b>${echapper(l.nom || l.libelle || "sans nom")}</b> ?`;
        corps += `<div class="vc-corps vc-q">${icone(pictoRayon(l.propose >= 0 ? PANIER[l.propose].rayon : l.rayon), "vc-gros")}
          <p>${question}${l.propose < 0 ? '<span class="vc-nouveau">nouveau</span>' : ""}</p>
          <div class="vc-duo"><button type="button" class="vc-gr" data-vc-oui="${k}">${icone("oui")}Oui</button><button type="button" class="vc-gr" data-vc-autre="${k}">${icone("autre")}Autre produit</button></div></div>`;
      } else {
        const puces = [l.marque, l.poids, l.quantite && l.quantite !== 1 ? `× ${String(l.quantite).replace(".", ",")}` : "", l.rayon, l.promo ? "Promo" : ""].filter(Boolean);
        if (puces.length) corps += `<div class="vc-corps"><div class="vc-puces">${puces.map((p) => `<span>${echapper(p)}</span>`).join("")}</div></div>`;
      }
      corps += `<details class="vc-corriger" ${l.corriger ? "open" : ""} data-vc-corriger="${k}"><summary>Corriger cette ligne</summary>${htmlLigneVerif(l, k)}</details>`;
    }
    return `<article class="vc-carte ${dt ? "dt" : "sur"} ${ouvert ? "ouvert" : ""}" data-vc-carte="${k}">
      <button type="button" class="vc-ch" data-vc-tog="${k}" aria-expanded="${ouvert}">
        <span class="vc-ico">${icone(pictoRayon(rayonDe(l)))}</span>
        <span class="vc-nm">${echapper(dt ? (l.libelle || l.nom || "Ligne sans nom") : nomAffiche(l))}</span>
        <span class="etiquette">${euros(l.prix)}</span>
        ${icone(dt ? "alerte" : "coche", "vc-st")}<span class="vc-chev" aria-hidden="true"></span>
      </button>${corps}</article>`;
  }

  function enTete() {
    const mag = brouillon.magasin === "__nouveau" ? (brouillon.magasinNom || "Nouveau magasin") : nomMagasin(brouillon.magasin);
    const [a, m, j] = (brouillon.date || "").split("-");
    const { somme } = resume();
    document.querySelector("#verif-mag-nom").textContent = mag || "Magasin";
    document.querySelector("#verif-mag-sous").textContent = `${j && m ? `${j}/${m} · ` : ""}${euros(somme)}`;
    const attente = brouillon.lignes.filter(enAttente).length;
    const pastille = document.querySelector("#verif-pastille");
    pastille.hidden = attente === 0;
    pastille.innerHTML = attente ? `${icone("alerte")}${attente}` : "";
    pastille.setAttribute("aria-label", `${attente} ligne${attente > 1 ? "s" : ""} à vérifier`);
    const valider = document.querySelector("#verif-valider");
    const { n } = resume();
    valider.setAttribute("aria-disabled", String(attente > 0 || n === 0));
    valider.textContent = n ? `Valider (${n} produit${n > 1 ? "s" : ""})` : "Valider";
  }

  function afficherCartes() {
    remplirFicheVerif();
    enTete();
    const rayons = [...new Set(produitsActifs().map((i) => PANIER[i].rayon))];
    const ordre = brouillon.lignes.map((l, k) => [l, k]);
    const tri = [...ordre.filter(([l]) => enAttente(l)), ...ordre.filter(([l]) => !enAttente(l))];
    zone().innerHTML = `<datalist id="verif-rayons">${rayons.map((r) => `<option value="${echapper(r)}">`).join("")}</datalist>`
      + (tri.length ? tri.map(([l, k]) => carte(l, k)).join("") : `<p class="encart">Aucun produit trouvé sur cette photo. Ajoute une ligne à la main, ou annule.</p>`);
  }

  // ---------- Autre produit : recherche, nouveau produit, ignorer ----------

  function lignesChoix(l) {
    const t = sansAccent(recherche.trim());
    let liste;
    if (t) liste = produitsActifs().filter((i) => sansAccent(`${PANIER[i].nom} ${PANIER[i].marque || ""}`).includes(t)).slice(0, 8);
    else liste = [...new Set([l.propose, ...(l.candidats || [])])].filter((i) => i >= 0 && PANIER[i]).slice(0, 3);
    if (!liste.length) return `<p class="vc-aucun">Aucun résultat</p>`;
    return liste.map((i) => `<button type="button" class="vc-res" data-vc-produit="${i}">${icone(pictoRayon(PANIER[i].rayon))}<span class="vc-rn">${echapper(PANIER[i].nom)}<small>${echapper(PANIER[i].format || "")}</small></span>${!t && i === l.propose ? '<span class="vc-nouveau">proposé</span>' : ""}</button>`).join("");
  }

  function afficherChoix() {
    const l = brouillon.lignes[indexChoix];
    const rayons = [...new Set([l.rayon, ...produitsActifs().map((i) => PANIER[i].rayon)].filter(Boolean))].slice(0, 8);
    if (!rayonChoisi || !rayons.includes(rayonChoisi)) rayonChoisi = rayons.includes(l.rayon) ? l.rayon : rayons[0];
    document.querySelector("#verif-choix").innerHTML = `
      <div class="vc-choix-tete"><button type="button" class="vc-retour" data-vc-retour aria-label="Retour aux cartes"><span class="vc-chev vc-chev-gauche" aria-hidden="true"></span></button>
        <span class="vc-lu">${echapper(l.libelle || l.nom || "Ligne sans nom")}</span><span class="etiquette">${euros(l.prix)}</span></div>
      <label class="vc-rech">${icone("loupe")}<input id="vc-q" type="search" placeholder="Chercher un produit" autocomplete="off" value="${echapper(recherche)}"></label>
      <div id="vc-res">${lignesChoix(l)}</div>
      <button type="button" class="vc-res nouv ${nouveauOuvert ? "ouvert" : ""}" data-vc-nouveau aria-expanded="${nouveauOuvert}">${icone("plus")}<span class="vc-rn">Nouveau produit</span><span class="vc-chev" aria-hidden="true"></span></button>
      <div class="vc-formc" ${nouveauOuvert ? "" : "hidden"}>
        <label>Nom <input id="vc-nom" type="text" value="${echapper(l.nom || l.libelle || "")}" autocomplete="off"></label>
        <div class="vc-rayons" role="radiogroup" aria-label="Rayon">${rayons.map((r) => `<button type="button" role="radio" aria-checked="${r === rayonChoisi}" data-vc-rayon="${echapper(r)}" class="${r === rayonChoisi ? "on" : ""}">${icone(pictoRayon(r))}${echapper(r)}</button>`).join("")}</div>
        <button type="button" class="vc-gr plein" data-vc-ajouter>${icone("oui")}Ajouter</button>
      </div>
      <button type="button" class="vc-ign" data-vc-ignorer>Je ne sais pas, ignorer</button>`;
  }

  // ---------- Enregistré ----------

  function afficherFin({ n, total, magasin, suite }) {
    mode = "fin";
    document.querySelector("#verif-fin-n").textContent = `${n} produit${n > 1 ? "s" : ""}`;
    document.querySelector("#verif-fin-total").textContent = euros(total);
    document.querySelector("#verif-fin-mag").textContent = magasin || "";
    document.querySelector("#verif-fin-suite").textContent = suite ? "Photo suivante" : "Voir ma course";
    afficher();
    window.scrollTo(0, 0);
  }

  function afficher() {
    document.querySelector("#verif-cartes").hidden = mode !== "cartes";
    document.querySelector("#verif-choix").hidden = mode !== "choix";
    document.querySelector("#verif-fin").hidden = mode !== "fin";
    if (mode === "cartes") afficherCartes();
    else if (mode === "choix") afficherChoix();
  }

  // ---------- Gestes ----------

  function retourCartes() {
    mode = "cartes";
    nouveauOuvert = false;
    recherche = "";
    ouvrirSuivante();
    afficher();
    window.scrollTo(0, 0);
  }

  function agirCartes(e) {
    const b = e.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.vcTog !== undefined) {
      const l = brouillon.lignes[Number(d.vcTog)];
      l.ouvert = !l.ouvert;
      const noeud = b.closest(".vc-carte");
      const k = Number(d.vcTog);
      noeud.outerHTML = carte(l, k);
    } else if (d.vcOui !== undefined) {
      const l = brouillon.lignes[Number(d.vcOui)];
      if (l.propose >= 0) { l.produit = l.propose; l.avertissement = ""; }
      l.ok = true;
      ouvrirSuivante();
      afficherCartes();
    } else if (d.vcAutre !== undefined) {
      indexChoix = Number(d.vcAutre);
      mode = "choix";
      recherche = "";
      nouveauOuvert = false;
      afficher();
      window.scrollTo(0, 0);
    }
  }

  function agirChoix(e) {
    const b = e.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    const l = brouillon.lignes[indexChoix];
    if (d.vcRetour !== undefined) { retourCartes(); return; }
    if (d.vcProduit !== undefined) { l.produit = Number(d.vcProduit); l.avertissement = ""; l.ok = true; retourCartes(); return; }
    if (d.vcRayon !== undefined) { l.nom = document.querySelector("#vc-nom").value; rayonChoisi = d.vcRayon; afficherChoix(); return; }
    if (d.vcNouveau !== undefined) { if (nouveauOuvert) l.nom = document.querySelector("#vc-nom").value; nouveauOuvert = !nouveauOuvert; afficherChoix(); return; }
    if (d.vcAjouter !== undefined) {
      const nom = document.querySelector("#vc-nom").value.trim();
      if (!nom) { document.querySelector("#vc-nom").focus(); return; }
      l.produit = -1; l.nom = nom; l.rayon = rayonChoisi; l.avertissement = ""; l.ok = true;
      retourCartes();
      return;
    }
    if (d.vcIgnorer !== undefined) { brouillon.lignes.splice(indexChoix, 1); retourCartes(); }
  }

  // Une modification faite dans « Corriger cette ligne » met à jour la carte : choisir un produit ou saisir un nom vaut confirmation.
  function apresCorrection(e) {
    const bloc = e.target.closest(".ligne-verif");
    const champ = e.target.dataset?.champ;
    if (!bloc || !champ) return;
    const k = Number(bloc.dataset.k);
    const l = brouillon.lignes[k];
    if (champ === "produit" || champ === "nom") l.ok = true;
    l.corriger = true;
    const noeud = document.querySelector(`.vc-carte[data-vc-carte="${k}"]`);
    if (!noeud) return;
    const nm = noeud.querySelector(".vc-nm");
    if (nm) nm.textContent = enAttente(l) ? (l.libelle || l.nom || "Ligne sans nom") : nomAffiche(l);
    noeud.querySelector(".etiquette").textContent = euros(l.prix);
    if (champ === "produit" || champ === "nom") { ouvrirSuivante(); l.ouvert = true; afficherCartes(); return; }
    enTete();
  }

  function brancher() {
    zone().addEventListener("click", agirCartes);
    zone().addEventListener("change", apresCorrection);
    zone().addEventListener("toggle", (e) => {
      const det = e.target.closest?.("[data-vc-corriger]");
      if (det) brouillon.lignes[Number(det.dataset.vcCorriger)].corriger = det.open;
    }, true);
    const choix = document.querySelector("#verif-choix");
    choix.addEventListener("click", agirChoix);
    choix.addEventListener("input", (e) => {
      if (e.target.id !== "vc-q") return;
      recherche = e.target.value;
      document.querySelector("#vc-res").innerHTML = lignesChoix(brouillon.lignes[indexChoix]);
    });
    // Magasin ou date modifiés dans le détail : l'en-tête suit.
    document.querySelector("#verif-detail").addEventListener("change", () => { if (mode === "cartes") enTete(); });
    document.querySelector("#verif-ajouter").addEventListener("click", () => { if (mode === "cartes") enTete(); });
  }
  brancher();

  return { demarrer, afficher, afficherFin, classerLigne, restantes: () => brouillon.lignes.filter(enAttente).length };
})();
