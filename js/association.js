// Moteur d'association produit/ticket (S7, fondation invisible : rien ne l'appelle encore depuis l'interface).
// Entrée : un libellé de caisse (« B.75CL BIERE BLC MT ») et la liste des produits ; sortie : le meilleur produit,
// un score de 0 à 1, les raisons, et un classement « sûre / douteuse / nouvelle ». Détail : livrables/doc-association.md
const Association = (() => {
  const sansAccent = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // Abréviations de caisse apprises des tickets réels.
  const ABREVIATIONS = { blc: "blanche", blle: "bouteille", frmg: "fromage", eufs: "oeufs", eufs_: "oeufs", nat: "nature", bi: "bio", pq: "paquet", ppx: "", tbe: "", ist: "", mmp: "", tojs: "", fi: "fine", tr: "tranche" };
  const MOTS_VIDES = new Set(["de", "du", "la", "le", "les", "au", "aux", "a", "et", "en", "des", "d", "l", "x", "vrac", "kg", "g", "cl", "ml", "l", "eur", "pur", "bo", "lait_"]);

  function normaliser(texte) {
    return sansAccent(texte).replace(/[.\-/_,'’*()%]/g, " ").replace(/\s+/g, " ").trim();
  }

  // « 6X25CL » → 1500 ml ; « 500G » → 500 g ; null si aucun format lisible ; vrac pesé (« 0,736 kg x 1.99 €/kg ») ignoré.
  function lireFormat(texte) {
    const t = sansAccent(texte).replace(/×/g, "x").replace(/,/g, ".");
    if (/vrac/.test(t) && /\d\s*kg\s*x/.test(t)) return null;
    if (/\d\s*(kg)\s*x\s*\d+\.\d+\s*(eur|€)/.test(t)) return null;
    const f = { kg: 1000, g: 1, l: 1000, cl: 10, ml: 1 };
    let m = t.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|cl|ml|l)\b/);
    if (m) return { qte: Number(m[1]) * Number(m[2]) * f[m[3]], type: /^k?g$/.test(m[3]) ? "g" : "ml" };
    m = t.match(/(\d+(?:\.\d+)?)\s*(kg|g|cl|ml|l)\s*x\s*(\d+)\b/);
    if (m) return { qte: Number(m[3]) * Number(m[1]) * f[m[2]], type: /^k?g$/.test(m[2]) ? "g" : "ml" };
    m = t.match(/(\d+(?:\.\d+)?)\s*(kg|g|cl|ml|l)\b/);
    if (m) return { qte: Number(m[1]) * f[m[2]], type: /^k?g$/.test(m[2]) ? "g" : "ml" };
    return null;
  }

  // Compare deux formats : "ok" (proches, ±25 %), "contredit" (nature ou taille différente), "inconnu" (l'un est illisible).
  function comparerFormats(a, b) {
    const fa = lireFormat(a), fb = lireFormat(b);
    if (!fa || !fb) return "inconnu";
    if (fa.type !== fb.type) return "contredit";
    const r = fa.qte / fb.qte;
    return r >= 0.8 && r <= 1.25 ? "ok" : "contredit";
  }

  function mots(texte) {
    const sortie = [];
    for (let m of normaliser(texte).split(" ")) {
      if (!m || /^\d/.test(m)) continue; // les nombres et formats sont traités à part
      if (m in ABREVIATIONS) m = ABREVIATIONS[m];
      for (const x of m.split(" ")) if (x && !MOTS_VIDES.has(x)) sortie.push(x.replace(/(s|x)$/, ""));
    }
    return sortie;
  }

  // Deux mots se correspondent s'ils sont égaux ou si l'un est le début de l'autre (libellés tronqués : « GINGE » / gingembre).
  const memeMot = (a, b) => a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));

  // Score d'un produit pour un libellé. produit = { nom, format, marque }.
  function evaluer(libelle, produit) {
    const raisons = [];
    const mp = mots(`${produit.nom} ${produit.marque || ""}`);
    const ml = mots(libelle);
    if (!mp.length || !ml.length) return { score: 0, raisons: ["texte vide"], format: "inconnu" };
    let communs = 0;
    const pris = new Set();
    for (const a of mp) {
      const j = ml.findIndex((b, k) => !pris.has(k) && memeMot(a, b));
      if (j >= 0) { pris.add(j); communs++; }
    }
    // couverture du produit (60 %) et du libellé (40 %) : un libellé de caisse contient souvent du bruit.
    let score = 0.6 * (communs / mp.length) + 0.4 * (communs / ml.length);
    if (communs) raisons.push(`${communs} mot${communs > 1 ? "s" : ""} en commun`);
    const format = comparerFormats(libelle, produit.format);
    if (format === "ok" && communs) { score = Math.min(1, score + 0.1); raisons.push("même format"); }
    if (format === "contredit") { score *= 0.5; raisons.push("format différent"); }
    return { score: Math.round(score * 100) / 100, raisons, format };
  }

  const SEUIL_SUR = 0.75, SEUIL_DOUTEUX = 0.45;

  // Classe un libellé : « appris » = { libelleNormalise: indexProduit } tiré des relevés déjà validés.
  function classer(libelle, produits, appris = {}) {
    const cle = normaliser(libelle);
    if (cle in appris && produits[appris[cle]]) {
      return { classe: "sûre", produit: appris[cle], score: 1, raisons: ["déjà associé sur un ticket précédent"], candidats: [appris[cle]] };
    }
    const notes = produits.map((p, i) => ({ i, ...evaluer(libelle, p) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    if (!notes.length || notes[0].score < SEUIL_DOUTEUX) return { classe: "nouvelle", produit: null, score: notes[0]?.score || 0, raisons: ["aucun produit assez proche"], candidats: notes.slice(0, 3).map((x) => x.i) };
    const [premier, second] = notes;
    let classe = premier.score >= SEUIL_SUR && premier.format !== "contredit" ? "sûre" : "douteuse";
    const raisons = [...premier.raisons];
    if (second && premier.score - second.score < 0.1 && classe === "sûre") { classe = "douteuse"; raisons.push("un autre produit est presque aussi proche"); }
    return { classe, produit: premier.i, score: premier.score, raisons, candidats: notes.slice(0, 3).map((x) => x.i) };
  }

  return { normaliser, lireFormat, comparerFormats, evaluer, classer, SEUIL_SUR, SEUIL_DOUTEUX };
})();
if (typeof module !== "undefined") module.exports = Association;
