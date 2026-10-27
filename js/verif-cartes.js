// Vérification d'un ticket, piste 2 : une carte à la fois (branche photo-piste2, non fusionnée).
// Les lignes sûres sont acceptées d'office ; seules les lignes douteuses sont posées en question.
// Ce fichier ne change PAS le modèle de données : il ne fait que remplir brouillon.lignes (produit, nom, rayon) ;
// valider() de lecture.js écrit les relevés exactement comme avant.
const VerifCartes = (() => {
  const PICTOS = { "Fruits et légumes": "🥕", "Crèmerie": "🥛", "Frais": "🧀", "Viandes": "🥩", "Épicerie": "🥫", "Boissons": "🥤" };
  let douteuses = [];
  let total = 0;
  let mode = "carte"; // carte | changer | pret
  let nouveauOuvert = false;
  let rayonChoisi = "";
  let recherche = "";

  const zone = () => document.querySelector("#verif-p2");
  const picto = (r) => PICTOS[r] || "🛒";

  // Classe une ligne : sûre (acceptée d'office) ou douteuse (posée en question), avec le produit proposé.
  function classerLigne(l) {
    const texte = l.libelle || l.nom || "";
    if (l.produit >= 0 && PANIER[l.produit]) {
      const ev = Association.evaluer(texte, PANIER[l.produit]);
      const sure = ev.score >= Association.SEUIL_DOUTEUX && ev.format !== "contredit";
      return { sure, propose: l.produit, candidats: [l.produit] };
    }
    const c = Association.classer(texte, PANIER);
    const propose = l.suggestion >= 0 ? l.suggestion : (c.classe === "nouvelle" ? -1 : c.produit);
    return { sure: false, propose, candidats: c.candidats };
  }

  function demarrer() {
    douteuses = [];
    for (const l of brouillon.lignes) {
      const c = classerLigne(l);
      l.proposeP2 = c.propose;
      l.candidatsP2 = c.candidats;
      if (!c.sure) douteuses.push(l);
    }
    total = douteuses.length;
    mode = douteuses.length ? "carte" : "pret";
    nouveauOuvert = false;
    recherche = "";
    document.querySelector("#verif-detail").open = brouillon.magasin === "__nouveau" || brouillon.lignes.length === 0;
    afficher();
  }

  const nomProduit = (i) => PANIER[i].nom + (PANIER[i].format ? ` (${PANIER[i].format})` : "");
  const courante = () => douteuses[0];

  function suivante() {
    mode = douteuses.length ? "carte" : "pret";
    if (mode === "pret") afficherVerification(); // le détail reflète les choix faits
    nouveauOuvert = false;
    recherche = "";
    afficher();
  }

  function enTete(l) {
    const fait = total - douteuses.length + 1;
    const points = Array.from({ length: total }, (_, k) => `<i class="${k < fait - 1 ? "fait" : k === fait - 1 ? "en-cours" : ""}"></i>`).join("");
    return `<div class="p2-progression"><span class="p2-points">${points}</span><span>${fait} sur ${total}</span></div>
      <div class="p2-lu"><span class="mono">${echapper(l.libelle || l.nom || "Ligne sans nom")}</span><span class="etiquette">${euros(l.prix)}</span></div>`;
  }

  function afficherCarte() {
    const l = courante();
    const p = l.proposeP2;
    const question = p >= 0 ? `C'est bien <strong>${echapper(nomProduit(p))}</strong> ?` : `C'est un nouveau produit : <strong>${echapper(l.nom || l.libelle || "sans nom")}</strong> ?`;
    zone().innerHTML = `${enTete(l)}
      <div class="p2-carte"><div class="p2-picto" aria-hidden="true">${picto(p >= 0 ? PANIER[p].rayon : l.rayon)}</div>
      <p class="p2-question">${question}</p>
      <div class="p2-boutons"><button type="button" class="principal" data-p2="oui">Oui</button><button type="button" data-p2="changer">Changer</button></div></div>`;
  }

  function lignesChoix(l) {
    const t = sansAccent(recherche.trim());
    let liste;
    if (t) liste = produitsActifs().filter((i) => sansAccent(`${PANIER[i].nom} ${PANIER[i].marque || ""}`).includes(t)).slice(0, 8);
    else {
      liste = [...new Set([l.proposeP2, ...(l.candidatsP2 || [])])].filter((i) => i >= 0 && PANIER[i]).slice(0, 3);
    }
    return liste.map((i) => `<li><button type="button" data-p2-produit="${i}"><span class="p2-picto-p" aria-hidden="true">${picto(PANIER[i].rayon)}</span><span>${echapper(PANIER[i].nom)}<br><small>${echapper(PANIER[i].format || "")}</small></span>${!t && i === l.proposeP2 ? "<small>proposé</small>" : ""}</button></li>`).join("");
  }

  function afficherChanger() {
    const l = courante();
    const rayons = [...new Set([...Object.keys(PICTOS), ...produitsActifs().map((i) => PANIER[i].rayon)])].slice(0, 6);
    if (!rayonChoisi || !rayons.includes(rayonChoisi)) rayonChoisi = rayons.includes(l.rayon) ? l.rayon : rayons[0];
    zone().innerHTML = `<button type="button" class="p2-retour" data-p2="retour" aria-label="Retour à la carte">←</button>
      <div class="p2-lu"><span class="mono">${echapper(l.libelle || l.nom || "Ligne sans nom")}</span><span class="etiquette">${euros(l.prix)}</span></div>
      <input type="search" class="recherche" id="p2-q" placeholder="Chercher un produit" autocomplete="off" value="${echapper(recherche)}">
      <ul class="p2-choix" id="p2-liste">${lignesChoix(l)}</ul>
      <div class="p2-nouveau ${nouveauOuvert ? "ouvert" : ""}">
        <button type="button" class="p2-nouveau-titre" data-p2="nouveau" aria-expanded="${nouveauOuvert}">Nouveau produit <span aria-hidden="true">${nouveauOuvert ? "⌄" : "›"}</span></button>
        <div ${nouveauOuvert ? "" : "hidden"}>
          <label>Nom <input type="text" id="p2-nom" value="${echapper(l.nom || l.libelle || "")}"></label>
          <div class="p2-rayons" role="radiogroup" aria-label="Rayon">${rayons.map((r) => `<button type="button" role="radio" aria-checked="${r === rayonChoisi}" aria-label="${echapper(r)}" title="${echapper(r)}" data-p2-rayon="${echapper(r)}" class="${r === rayonChoisi ? "choisi" : ""}">${picto(r)}</button>`).join("")}</div>
          <button type="button" class="principal" data-p2="ajouter">Ajouter</button>
        </div>
      </div>
      <button type="button" class="p2-ignorer" data-p2="ignorer">Je ne sais pas, ignorer</button>`;
  }

  function resume() {
    const lignes = brouillon.lignes.filter((l) => l.prix > 0);
    const somme = lignes.reduce((s, l) => s + l.prix * (l.quantite ?? 1), 0);
    return { n: lignes.length, somme };
  }

  function afficherPret() {
    const { n, somme } = resume();
    const mag = brouillon.magasin === "__nouveau" ? (brouillon.magasinNom || "nouveau magasin") : nomMagasin(brouillon.magasin);
    zone().innerHTML = `<div class="p2-pret"><div class="p2-coche" aria-hidden="true">✓</div>
      <h3>${n ? "Tout est prêt" : "Rien à enregistrer"}</h3>
      <p>${n} produit${n > 1 ? "s" : ""} · ${euros(somme)} · ${echapper(mag || "")}</p>
      <button type="button" class="p2-voir" data-p2="voir" aria-expanded="${document.querySelector("#verif-detail").open}">Voir les produits</button></div>`;
  }

  function afficher() {
    const valider = document.querySelector("#verif-valider");
    if (mode === "carte") afficherCarte();
    else if (mode === "changer") afficherChanger();
    else afficherPret();
    const { n } = resume();
    valider.hidden = mode !== "pret";
    valider.disabled = n === 0;
    valider.textContent = n ? `Valider (${n} produit${n > 1 ? "s" : ""})` : "Valider";
  }

  function agir(e) {
    const b = e.target.closest("button");
    if (!b) return;
    const l = courante();
    if (b.dataset.p2Produit !== undefined) { l.produit = Number(b.dataset.p2Produit); l.avertissement = ""; douteuses.shift(); suivante(); return; }
    if (b.dataset.p2Rayon !== undefined) { rayonChoisi = b.dataset.p2Rayon; l.nom = document.querySelector("#p2-nom").value; afficher(); return; }
    switch (b.dataset.p2) {
      case "oui":
        if (l.proposeP2 >= 0) { l.produit = l.proposeP2; l.avertissement = ""; }
        douteuses.shift(); suivante(); break;
      case "changer": mode = "changer"; nouveauOuvert = false; recherche = ""; afficher(); break;
      case "retour": mode = "carte"; afficher(); break;
      case "nouveau": nouveauOuvert = !nouveauOuvert; if (l) l.nom = document.querySelector("#p2-nom")?.value ?? l.nom; afficher(); break;
      case "ajouter": {
        const nom = document.querySelector("#p2-nom").value.trim();
        if (!nom) { document.querySelector("#p2-nom").focus(); return; }
        l.produit = -1; l.nom = nom; l.rayon = rayonChoisi; l.avertissement = "";
        douteuses.shift(); suivante(); break;
      }
      case "ignorer":
        brouillon.lignes.splice(brouillon.lignes.indexOf(l), 1);
        douteuses.shift(); suivante(); break;
      case "voir": {
        const det = document.querySelector("#verif-detail");
        det.open = !det.open;
        b.setAttribute("aria-expanded", String(det.open));
        if (det.open) { afficherVerification(); }
        break;
      }
    }
  }

  function brancher() {
    zone().addEventListener("click", agir);
    zone().addEventListener("input", (e) => {
      if (e.target.id !== "p2-q") return;
      recherche = e.target.value;
      document.querySelector("#p2-liste").innerHTML = lignesChoix(courante());
    });
    // Une modification faite dans le détail (suppression, nouvelle ligne…) met à jour le résumé de « Tout est prêt ».
    document.querySelector("#verif-detail").addEventListener("click", () => setTimeout(() => { if (mode === "pret") afficher(); }, 0));
    document.querySelector("#verif-detail").addEventListener("change", () => setTimeout(() => { if (mode === "pret") afficher(); }, 0));
  }
  brancher();

  return { demarrer, classerLigne, restantes: () => douteuses.length };
})();
