// Données versionnées et import sûr (S11, fondation invisible : non branché). Détail : livrables/doc-donnees-sures.md
// Valide un fichier de sauvegarde, le met à la version actuelle (migrations), refuse un fichier corrompu ou d'une version future.
const DonneesSures = (() => {
  const VERSION = 4; // version écrite par exporter() aujourd'hui
  const APPLICATIONS = ["Cabasito", "A table"];
  const estNombre = (x) => typeof x === "number" && Number.isFinite(x);

  // Un relevé valide : produit entier ≥ 0, magasin texte, prix nombre ≥ 0, date AAAA-MM-JJ.
  function releveValide(r) {
    const erreurs = [];
    if (!r || typeof r !== "object") return ["relevé illisible"];
    if (!Number.isInteger(r.produit) || r.produit < 0) erreurs.push("produit invalide");
    if (typeof r.magasin !== "string" || !r.magasin) erreurs.push("magasin manquant");
    if (!estNombre(r.prix) || r.prix < 0) erreurs.push("prix invalide");
    if (typeof r.date !== "string" || !/^\d{4}-\d\d-\d\d$/.test(r.date)) erreurs.push("date invalide");
    return erreurs;
  }

  // Met n'importe quelle version connue au format actuel, sans rien perdre. Ne modifie pas l'objet reçu.
  function migrer(entree) {
    if (Array.isArray(entree)) {
      // Version 1 (séance 3) : simple liste de relevés.
      return { application: "Cabasito", version: VERSION, releves: entree.map((r) => ({ envoye: false, ...r })), produitsAjoutes: [], magasins: null, paniers: null, coches: null, modifs: {} };
    }
    const copie = JSON.parse(JSON.stringify(entree));
    const v = copie.version ?? 1;
    if (v < 4) {
      // Versions 2 et 3 : anciens noms de champs et champs absents.
      copie.produitsAjoutes = copie.produitsAjoutes || [];
      copie.modifs = copie.modifs || {};
      if (!copie.magasins && Array.isArray(copie.magasinsAjoutes)) copie.magasins = null; // l'appli complète avec les magasins de base
      copie.releves = (copie.releves || []).map((r) => ({ envoye: false, variante: null, promo: false, quantite: 1, ...r }));
    }
    copie.version = VERSION;
    return copie;
  }

  // Valide un objet déjà lu : { ok, erreurs[], avertissements[], donnees (migrées) }. Message d'erreur lisible pour Hugo.
  function valider(entree) {
    const erreurs = [], avertissements = [];
    if (entree === null || typeof entree !== "object") return { ok: false, erreurs: ["Ce fichier ne contient pas de sauvegarde Cabasito."], avertissements, donnees: null };
    if (!Array.isArray(entree)) {
      if (!APPLICATIONS.includes(entree.application)) erreurs.push("Ce fichier ne vient pas de Cabasito.");
      if (!Array.isArray(entree.releves)) erreurs.push("La liste des relevés est absente.");
      if (estNombre(entree.version) && entree.version > VERSION) erreurs.push(`Ce fichier vient d'une version plus récente de Cabasito (version ${entree.version}). Mets l'appli à jour avant de l'importer.`);
      if (entree.produitsAjoutes !== undefined && !Array.isArray(entree.produitsAjoutes)) erreurs.push("La liste des produits est illisible.");
      if (entree.magasins !== undefined && entree.magasins !== null && !Array.isArray(entree.magasins)) erreurs.push("La liste des magasins est illisible.");
      if (entree.paniers !== undefined && entree.paniers !== null && !Array.isArray(entree.paniers)) erreurs.push("La liste des paniers est illisible.");
    }
    if (erreurs.length) return { ok: false, erreurs, avertissements, donnees: null };
    const donnees = migrer(entree);
    const mauvais = donnees.releves.map((r, i) => [i, releveValide(r)]).filter(([, e]) => e.length);
    if (mauvais.length) {
      if (mauvais.length === donnees.releves.length && mauvais.length > 0) return { ok: false, erreurs: ["Aucun relevé du fichier n'est lisible."], avertissements, donnees: null };
      avertissements.push(`${mauvais.length} relevé${mauvais.length > 1 ? "s" : ""} illisible${mauvais.length > 1 ? "s" : ""} ignoré${mauvais.length > 1 ? "s" : ""} (lignes ${mauvais.slice(0, 5).map(([i]) => i + 1).join(", ")}).`);
      const ecartes = new Set(mauvais.map(([i]) => i));
      donnees.releves = donnees.releves.filter((_, i) => !ecartes.has(i));
    }
    return { ok: true, erreurs, avertissements, donnees };
  }

  // Lit un texte JSON : { ok, … } comme valider, avec un message clair si le JSON est cassé.
  function lireTexte(texte) {
    let objet;
    try { objet = JSON.parse(texte); } catch (e) { return { ok: false, erreurs: ["Le fichier est abîmé ou n'est pas une sauvegarde (lecture impossible)."], avertissements: [], donnees: null }; }
    return valider(objet);
  }

  return { VERSION, valider, lireTexte, migrer, releveValide };
})();
