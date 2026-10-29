// Couche historique des prix (S9, fondation invisible : aucune interface). Détail : livrables/5-documentation/doc-historique.md
// Travaille sur la liste des relevés { produit, magasin, prix, date (AAAA-MM-JJ), quantite? } sans jamais la modifier.
const Historique = (() => {
  const arrondi = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;
  const mediane = (l) => { const s = [...l].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

  // Série de prix d'un produit (dans un magasin si donné), triée par date ; plusieurs relevés le même jour : le dernier saisi gagne.
  function serie(releves, produit, magasin = null) {
    const parJour = new Map();
    for (const r of releves) {
      if (r.produit !== produit || (magasin !== null && r.magasin !== magasin) || typeof r.prix !== "number") continue;
      parJour.set(r.date + "|" + r.magasin, r);
    }
    return [...parJour.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((r) => ({ date: r.date, prix: r.prix, magasin: r.magasin }));
  }

  // Variation entre le premier et le dernier prix d'une série ; null s'il y a moins de 2 points ou un premier prix nul.
  function variation(s) {
    if (s.length < 2 || !(s[0].prix > 0)) return null;
    const a = s[0], b = s[s.length - 1];
    return { de: a.prix, vers: b.prix, absolue: arrondi(b.prix - a.prix), pourcent: arrondi(((b.prix - a.prix) / a.prix) * 100, 1), depuis: a.date, jusqua: b.date };
  }

  // Produits (par magasin) dont le prix a le plus augmenté, du plus fort au plus faible ; au moins 2 relevés.
  function plusFortesHausses(releves, limite = 5) {
    const cles = new Set(releves.map((r) => r.produit + "|" + r.magasin));
    const sortie = [];
    for (const c of cles) {
      const [p, m] = c.split("|");
      const v = variation(serie(releves, Number(p), m));
      if (v && v.pourcent > 0) sortie.push({ produit: Number(p), magasin: m, ...v });
    }
    return sortie.sort((a, b) => b.pourcent - a.pourcent).slice(0, limite);
  }

  // Évolution du panier habituel : variation moyenne (en %) des produits du panier qui ont au moins 2 relevés dans un même magasin.
  function inflationPanier(releves, produits) {
    const parProduit = [];
    for (const p of produits) {
      const magasins = new Set(releves.filter((r) => r.produit === p).map((r) => r.magasin));
      const vs = [...magasins].map((m) => variation(serie(releves, p, m))).filter(Boolean);
      if (vs.length) parProduit.push({ produit: p, pourcent: arrondi(vs.reduce((s, v) => s + v.pourcent, 0) / vs.length, 1) });
    }
    if (!parProduit.length) return { pourcent: null, produits: 0, sur: produits.length, detail: [] };
    return { pourcent: arrondi(parProduit.reduce((s, x) => s + x.pourcent, 0) / parProduit.length, 1), produits: parProduit.length, sur: produits.length, detail: parProduit };
  }

  // Un relevé est-il aberrant ? Écart à la médiane des AUTRES relevés du même produit (au moins 3 autres) : > 1,5× ou < 1/1,5.
  function aberrant(releves, releve, seuil = 1.5) {
    const autres = releves.filter((r) => r !== releve && r.produit === releve.produit && typeof r.prix === "number").map((r) => r.prix);
    if (autres.length < 3 || !(releve.prix > 0)) return { aberrant: false, mediane: mediane(autres), rapport: null };
    const med = mediane(autres);
    const rapport = arrondi(releve.prix / med, 2);
    return { aberrant: rapport > seuil || rapport < 1 / seuil, mediane: med, rapport };
  }

  return { serie, variation, plusFortesHausses, inflationPanier, aberrant, mediane };
})();
