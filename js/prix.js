// Moteur de prix comparables (S8, fondation invisible : non branché à l'interface). Détail : livrables/doc-prix.md
// Unités : masse (g), volume (ml), pièce, lavage, longueur (m). Tout est converti vers une unité de base, puis un prix unitaire
// normalisé (€/kg, €/L, €/pièce, €/lavage, €/m) permet de comparer des formats différents.
const Prix = (() => {
  const SEUIL_COMPLET = 0.8; // décision D13 : un magasin est comparable s'il connaît au moins 80 % des prix cochés
  const sansAccent = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/œ/g, "oe");
  const FACTEURS = { kg: ["masse", 1000], g: ["masse", 1], l: ["volume", 1000], cl: ["volume", 10], ml: ["volume", 1], m: ["longueur", 1] };

  // « 10 × 100 g », « 6x25cl », « 1,5 L », « 12 œufs », « x12 », « 44 W », « 40 lavages », « 30 m » → { type, qte } ou null.
  function lireQuantite(texte) {
    const t = sansAccent(texte).replace(/×/g, "x").replace(/,/g, ".").trim();
    if (!t) return null;
    let m = t.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|cl|ml|l|m)\b/);
    if (m) { const [type, f] = FACTEURS[m[3]]; return { type, qte: Number(m[1]) * Number(m[2]) * f }; }
    m = t.match(/(\d+(?:\.\d+)?)\s*(kg|g|cl|ml|l|m)\s*x\s*(\d+)\b/);
    if (m) { const [type, f] = FACTEURS[m[2]]; return { type, qte: Number(m[3]) * Number(m[1]) * f }; }
    m = t.match(/(\d+(?:\.\d+)?)\s*(kg|g|cl|ml|l|m)\b/);
    if (m) { const [type, f] = FACTEURS[m[2]]; return { type, qte: Number(m[1]) * f }; }
    m = t.match(/(\d+)\s*(lavages?|w)\b/);
    if (m) return { type: "lavage", qte: Number(m[1]) };
    m = t.match(/(\d+)\s*(oeufs?|pieces?|pcs?|sachets?|capsules?|rouleaux|tranches?|boites?)\b/);
    if (m) return { type: "piece", qte: Number(m[1]) };
    m = t.match(/^x\s*(\d+)$|\bx\s*(\d+)\s*$/);
    if (m) return { type: "piece", qte: Number(m[1] || m[2]) };
    return null;
  }

  const UNITE_AFFICHEE = { masse: ["kg", 1000], volume: ["L", 1000], piece: ["pièce", 1], lavage: ["lavage", 1], longueur: ["m", 1] };

  // Prix unitaire normalisé : { valeur (€ par kg, L, pièce…), unite, type } ; null si le format est illisible ou le prix absent.
  function prixUnitaire(format, prix) {
    const q = lireQuantite(format);
    if (!q || q.qte <= 0 || typeof prix !== "number" || !(prix >= 0)) return null;
    const [unite, f] = UNITE_AFFICHEE[q.type];
    return { valeur: Math.round((prix / q.qte) * f * 1000) / 1000, unite, type: q.type };
  }

  // Deux produits sont comparables (même nature, tailles à moins de 25 % d'écart) : renvoie "oui", "non" ou "inconnu".
  function comparables(formatA, formatB, tolerance = 0.25) {
    const a = lireQuantite(formatA), b = lireQuantite(formatB);
    if (!a || !b) return "inconnu";
    if (a.type !== b.type) return "non";
    const r = a.qte / b.qte;
    return r >= 1 / (1 + tolerance) && r <= 1 + tolerance ? "oui" : "non";
  }

  // La règle D13 en un seul endroit : le magasin connaît-il assez de prix parmi ceux demandés ?
  const estComplet = (connus, demandes) => demandes > 0 && connus >= SEUIL_COMPLET * demandes;

  // Compare des magasins sur un panier. prixDe(produit, magasin) → nombre ou null.
  // Retourne les totaux sur les seuls produits connus de TOUS les magasins retenus (économie honnête), et sur combien de produits.
  function comparerPanier(produits, magasins, prixDe) {
    const infos = magasins.map((m) => {
      const connus = produits.filter((p) => prixDe(p, m) !== null && prixDe(p, m) !== undefined).length;
      return { magasin: m, connus, complet: estComplet(connus, produits.length) };
    });
    const retenus = infos.filter((x) => x.complet).map((x) => x.magasin);
    const communs = produits.filter((p) => retenus.every((m) => { const v = prixDe(p, m); return v !== null && v !== undefined; }));
    const totaux = retenus.map((m) => ({ magasin: m, total: Math.round(communs.reduce((s, p) => s + prixDe(p, m), 0) * 100) / 100 })).sort((a, b) => a.total - b.total);
    const economie = totaux.length >= 2 ? Math.round((totaux[totaux.length - 1].total - totaux[0].total) * 100) / 100 : 0;
    return { totaux, economie, surCombien: communs.length, sur: produits.length, ecartes: infos.filter((x) => !x.complet).map((x) => x.magasin) };
  }

  // Clé de regroupement de produits comparables : nom sans taille ni ponctuation + nature du format.
  function cleGroupe(nom, format) {
    const base = sansAccent(nom).replace(/\d+(?:[.,]\d+)?\s*(kg|g|cl|ml|l|m|w)\b/g, " ").replace(/[^a-z ]/g, " ").replace(/\b(x|de|du|la|le|les|des|au|aux|et)\b/g, " ").replace(/\s+/g, " ").trim();
    const q = lireQuantite(format);
    return `${base}|${q ? q.type : "?"}`;
  }

  // Regroupe des produits { nom, format } en groupes comparables ; renvoie les groupes de 2 produits ou plus (listes de numéros).
  function grouper(produits) {
    const g = new Map();
    produits.forEach((p, i) => { const k = cleGroupe(p.nom, p.format); (g.get(k) || g.set(k, []).get(k)).push(i); });
    return [...g.values()].filter((l) => l.length > 1);
  }

  return { lireQuantite, prixUnitaire, comparables, estComplet, comparerPanier, cleGroupe, grouper, SEUIL_COMPLET };
})();
