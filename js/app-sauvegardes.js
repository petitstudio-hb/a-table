// Sauvegardes : export, import (Remplacer), fusion de deux sauvegardes (fait suite à app-ecrans.js).

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
    modifs,
  };
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(new Blob([JSON.stringify(contenu, null, 2)], { type: "application/json" }));
  lien.download = `atable-${aujourdhui()}.json`;
  lien.click();
  if (typeof marquerSauvegarde === "function") marquerSauvegarde();
  URL.revokeObjectURL(lien.href);
}

// Contrôle d'un fichier avant import ou fusion (lot 4) : refuse un fichier abîmé ou d'une version future avec un message clair ;
// un fichier valide est rendu tel quel (seuls les relevés illisibles sont écartés, avec avertissement).
function lireSauvegardeSure(texte) {
  if (typeof DonneesSures === "undefined") return { donnees: JSON.parse(texte), avertissements: [] };
  const res = DonneesSures.lireTexte(texte);
  if (!res.ok) throw new Error(res.erreurs.join(" "));
  const donnees = JSON.parse(texte);
  if (res.avertissements.length) {
    const liste = Array.isArray(donnees) ? donnees : donnees.releves;
    const filtres = liste.filter((r) => DonneesSures.releveValide(r).length === 0);
    if (Array.isArray(donnees)) return { donnees: filtres, avertissements: res.avertissements };
    donnees.releves = filtres;
  }
  return { donnees, avertissements: res.avertissements };
}

async function importer(fichier) {
  const message = document.querySelector("#sauvegarde-message");
  try {
    const { donnees, avertissements } = lireSauvegardeSure(await fichier.text());
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
      paniers = Array.isArray(donnees.paniers) ? donnees.paniers : [{ id: "habituel", nom: "Panier habituel", produits: PANIER.map((_, i) => i) }];
      for (const p of paniers) p.produits = p.produits.filter((i) => i < PANIER.length);
      message.textContent = `Import terminé : ${releves.length} relevés.`;
    } else {
      throw new Error("format inconnu");
    }
    message.className = "message ok";
    if (avertissements.length) message.textContent += " " + avertissements.join(" ");
    sauvegarder();
    toutAfficher();
  } catch (e) {
    message.textContent = e.message.endsWith(".") ? `Ce fichier ne peut pas être importé. ${e.message}` : `Ce fichier ne peut pas être importé (${e.message}).`;
    message.className = "message erreur";
  }
}

// Fusion de deux sauvegardes (séance 25) : ajoute à ce qu'il y a sur l'appareil ce que contient le fichier, sans rien effacer.
// Les produits identiques (même nom, marque et format) sont reconnus ; les relevés déjà présents ne sont pas doublés.
function fusionnerSauvegarde(donnees) {
  const cle = (p) => [p.nom, p.marque || "", p.format || ""].map((s) => String(s).trim().toLowerCase()).join("|");
  const correspondance = new Map(); // numéro du produit dans le fichier -> numéro ici
  const produitsFichier = [...BASE_ORIGINE.map(() => null), ...(donnees.produitsAjoutes || [])];
  for (let i = 0; i < NB_PRODUITS_BASE; i++) correspondance.set(i, i);
  let produitsAjoutes = 0;
  produitsFichier.forEach((p, i) => {
    if (i < NB_PRODUITS_BASE || !p) return;
    let ici = PANIER.findIndex((q, j) => j >= NB_PRODUITS_BASE && cle(q) === cle(p));
    if (ici === -1) {
      PANIER.push({ ...p, prix: p.prix || {} });
      ici = PANIER.length - 1;
      coches.add(ici);
      panierHabituel()?.produits.push(ici);
      produitsAjoutes++;
    }
    correspondance.set(i, ici);
  });
  const magasinsAjoutes = (donnees.magasins || []).filter((m) => !MAGASINS.some((x) => x.id === m.id));
  MAGASINS.push(...magasinsAjoutes);
  const empreinte = (r) => [r.produit, r.magasin, r.date, r.prix, r.libelle || ""].join("|");
  const connus = new Set(releves.map(empreinte));
  let relevesAjoutes = 0;
  for (const r of donnees.releves || []) {
    if (!correspondance.has(r.produit)) continue;
    const nouveau = { ...r, produit: correspondance.get(r.produit) };
    if (connus.has(empreinte(nouveau))) continue;
    releves.push(nouveau);
    connus.add(empreinte(nouveau));
    relevesAjoutes++;
  }
  for (const p of donnees.paniers || []) {
    if (p.id === "habituel") continue;
    const mappes = (p.produits || []).filter((i) => correspondance.has(i)).map((i) => correspondance.get(i));
    const ici = paniers.find((q) => q.id === p.id || q.nom.trim().toLowerCase() === p.nom.trim().toLowerCase());
    if (ici) { for (const i of mappes) if (!ici.produits.includes(i)) ici.produits.push(i); }
    else paniers.push({ id: p.id, nom: p.nom, produits: mappes });
  }
  return { relevesAjoutes, produitsAjoutes, magasinsAjoutes: magasinsAjoutes.length };
}

async function fusionner(fichier) {
  const message = document.querySelector("#sauvegarde-message");
  try {
    const { donnees, avertissements } = lireSauvegardeSure(await fichier.text());
    if (!((donnees.application === "Cabasito" || donnees.application === "A table") && Array.isArray(donnees.releves))) throw new Error("format inconnu");
    const r = fusionnerSauvegarde(donnees);
    sauvegarder();
    toutAfficher();
    message.textContent = `Fusion terminée : ${r.relevesAjoutes} relevé${r.relevesAjoutes > 1 ? "s" : ""}, ${r.produitsAjoutes} produit${r.produitsAjoutes > 1 ? "s" : ""} et ${r.magasinsAjoutes} magasin${r.magasinsAjoutes > 1 ? "s" : ""} ajoutés. Rien n'a été effacé.`;
    message.className = "message ok";
    if (avertissements.length) message.textContent += " " + avertissements.join(" ");
  } catch (e) {
    message.textContent = e.message.endsWith(".") ? `Ce fichier ne peut pas être fusionné. ${e.message}` : `Ce fichier ne peut pas être fusionné (${e.message}).`;
    message.className = "message erreur";
  }
}

