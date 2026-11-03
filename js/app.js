// Démarrage de l'application : branchement des événements, migration unique des variantes, premier affichage.
// Dernier des quatre fichiers issus de l'ancien app.js ; l'état est dans app-etat.js, les écrans dans app-ecrans.js, les sauvegardes dans app-sauvegardes.js.

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
  document.querySelector("#classement-voir").addEventListener("click", () => { classementOuvert = !classementOuvert; afficherCourse(); });
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
    const corriger = e.target.closest("[data-corriger]");
    if (corriger) {
      const i = Number(corriger.dataset.corriger);
      corrigeOuverts.has(i) ? corrigeOuverts.delete(i) : corrigeOuverts.add(i);
      afficherCourse();
      return;
    }
    const valide = e.target.closest("[data-ok-rayon]");
    if (valide) { validerPrixRayon(Number(valide.dataset.okRayon), valide.dataset.magasinRayon); return; }
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
  // Le bouton « ⋯ » ouvre une feuille du bas qui range les actions rares de Ma course (maquette validée le 03/11/2026).
  const feuilleOptions = document.querySelector("#feuille-options-course");
  const fermerOptions = () => {
    feuilleOptions.hidden = true;
    document.querySelector("#plus-options").setAttribute("aria-expanded", "false");
    if (!document.querySelector(".feuille-prix:not([hidden])")) document.documentElement.classList.remove("feuille-prix-ouverte");
  };
  document.querySelector("#plus-options").addEventListener("click", (e) => {
    feuilleOptions.hidden = false;
    e.currentTarget.setAttribute("aria-expanded", "true");
    document.documentElement.classList.add("feuille-prix-ouverte");
  });
  document.querySelector("#options-voile").addEventListener("click", fermerOptions);
  document.querySelector("#options-fermer").addEventListener("click", fermerOptions);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !feuilleOptions.hidden) fermerOptions(); });
  // Chaque action ferme la feuille, sauf le choix des magasins qui se déplie dans la feuille (le geste propre au bouton a déjà eu lieu).
  feuilleOptions.addEventListener("click", (e) => {
    const b = e.target.closest("button.fp-ligne");
    if (b && b.id !== "choix-magasins") fermerOptions();
  });
  document.querySelector("#saisie-ouvrir").addEventListener("click", () => ouvrirSaisie());
  document.querySelector("#saisie-annuler").addEventListener("click", fermerSaisie);
  document.querySelector("#saisie-voile").addEventListener("click", fermerSaisie);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.querySelector("#saisie-carte").hidden) fermerSaisie(); });
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
    document.querySelector("#saisie-prix").value = "";
    document.querySelector("#saisie-code").value = "";
    document.querySelector("#saisie-promo").checked = false;
    fermerSaisie();
    notifier(`Prix enregistré : ${PANIER[releve.produit].nom} chez ${nomMagasin(releve.magasin)}, ${euros(releve.prix)}.`);
  });

  const cliquerReleves = (e) => {
    const prodLigne = e.target.closest("[data-produit-releves]");
    if (prodLigne) { ouvrirFeuilleReleves(Number(prodLigne.dataset.produitReleves)); return; }
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
    // Toucher une ligne ouvre sa modification (la suppression s'y trouve) ; toucher son titre (flèche vers le bas) la referme.
    if (e.target.closest("[data-replier-releve]")) { enModification = null; afficherReleves(); return; }
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
  };
  document.querySelector("#liste-releves").addEventListener("click", cliquerReleves);
  document.querySelector("#frp-liste").addEventListener("click", cliquerReleves);
  document.querySelector("#frp-voile").addEventListener("click", fermerFeuilleReleves);
  document.querySelector("#frp-fermer").addEventListener("click", fermerFeuilleReleves);
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && produitFeuilleReleves !== null) fermerFeuilleReleves(); });

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

// Une seule fois : séparation des variantes déjà enregistrées en produits à part (après le chargement de tous les scripts : formats.js sert à créer le produit).
document.addEventListener("DOMContentLoaded", () => {
  if (lire("atable.variantes-separees", false) === true) return;
  try { localStorage.setItem("atable.avant-variantes", JSON.stringify(releves)); } catch (e) { /* stockage plein : on continue sans copie */ }
  const separees = separerVariantes();
  if (separees) { sauvegarder(); toutAfficher(); }
  ecrire("atable.variantes-separees", true);
  if (separees) setTimeout(() => notifier(`${separees} achat${separees > 1 ? "s" : ""} de variantes ${separees > 1 ? "sont passés" : "est passé"} sur des produits à part.`), 600);
});

document.querySelector("#saisie-date").value = aujourdhui();
brancherEvenements();
toutAfficher();
montrer(location.hash.slice(1) || "photo");
