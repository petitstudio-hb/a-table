// « Répartir sur deux magasins » (S10, fondation invisible : aucune interface). Détail : livrables/doc-repartition.md
// Entrée : produits (numéros), magasins (identifiants), prixDe(produit, magasin) → nombre ou null.
// Sortie : le meilleur partage du panier entre 2 magasins, l'économie nette par rapport au meilleur magasin seul, avec une pénalité de déplacement.
const Repartition = (() => {
  const arrondi = (x) => Math.round(x * 100) / 100;
  const connu = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;

  // Meilleur partage pour UNE paire de magasins. Chaque produit va dans le moins cher des deux (ceux sans prix chez l'un vont chez l'autre) ;
  // les produits sans prix dans les deux magasins sont signalés et ne comptent pas.
  function partagerPaire(produits, a, b, prixDe) {
    const parMagasin = { [a]: [], [b]: [] };
    const sansPrix = [];
    let total = 0;
    for (const p of produits) {
      const pa = prixDe(p, a), pb = prixDe(p, b);
      if (!connu(pa) && !connu(pb)) { sansPrix.push(p); continue; }
      const versA = connu(pa) && (!connu(pb) || pa <= pb);
      parMagasin[versA ? a : b].push(p);
      total += versA ? pa : pb;
    }
    return { magasins: [a, b], parMagasin, sansPrix, total: arrondi(total) };
  }

  // Total d'un seul magasin sur une liste de produits ; null s'il lui manque un prix.
  function totalSeul(produits, m, prixDe) {
    let t = 0;
    for (const p of produits) { const v = prixDe(p, m); if (!connu(v)) return null; t += v; }
    return arrondi(t);
  }

  // Cherche la meilleure paire parmi les magasins (écarte ceux qui connaissent moins de `seuil` des produits).
  // options : { penalite (€ de déplacement en plus, défaut 2), seuil (défaut 0.5) }
  function meilleurePaire(produits, magasins, prixDe, options = {}) {
    const penalite = options.penalite ?? 2, seuil = options.seuil ?? 0.5;
    const retenus = magasins.filter((m) => produits.filter((p) => connu(prixDe(p, m))).length >= seuil * produits.length && produits.length > 0);
    const ecartes = magasins.filter((m) => !retenus.includes(m));
    let meilleur = null;
    for (let i = 0; i < retenus.length; i++) for (let j = i + 1; j < retenus.length; j++) {
      const s = partagerPaire(produits, retenus[i], retenus[j], prixDe);
      if (!meilleur || s.total < meilleur.total) meilleur = s;
    }
    if (!meilleur) return { ok: false, raison: "il faut au moins deux magasins qui connaissent la moitié des prix", ecartes };
    // Référence : le moins cher des magasins seuls qui connaissent TOUS les prix du panier couvert par le partage.
    const couverts = produits.filter((p) => !meilleur.sansPrix.includes(p));
    const seuls = retenus.map((m) => ({ magasin: m, total: totalSeul(couverts, m, prixDe) })).filter((x) => x.total !== null).sort((x, y) => x.total - y.total);
    const reference = seuls[0] || null;
    const utilise = meilleur.parMagasin[meilleur.magasins[0]].length > 0 && meilleur.parMagasin[meilleur.magasins[1]].length > 0;
    const brute = reference ? arrondi(reference.total - meilleur.total) : null;
    const nette = brute === null ? null : arrondi(brute - (utilise ? penalite : 0));
    return { ok: true, ...meilleur, ecartes, reference, economieBrute: brute, economieNette: nette, vautLeDeplacement: nette !== null && utilise && nette > 0, surCombien: couverts.length, sur: produits.length };
  }

  return { partagerPaire, totalSeul, meilleurePaire };
})();
