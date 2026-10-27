// Outils purs (lot 3, extraits d'app.js sans changement) : formats d'affichage, dates, texte, distances, lecture des contenances et prix au kilo.
// Aucun accès aux données ni à l'écran. Chargé avant app.js.

const euros = (n) => n.toFixed(2).replace(".", ",") + " €";
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const dateFr = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const echapper = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sansAccent = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Distance à vol d'oiseau en mètres entre deux points { lat, lon }, et son texte (« 450 m », « 1,2 km »).
const distanceM = (a, b) => {
  const rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};
const distanceTexte = (d) => (d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1).replace(".", ",")} km`);

// ---------- Formats et prix au kilo (séances 16 et 17) ----------

// « 500 g », « 1 L », « 6 × 25 cl » → { qte, type } en grammes ou en millilitres, ou null si illisible.
function contenance(texte) {
  const t = String(texte || "").toLowerCase().replace(",", ".").replace(/×/g, "x");
  const m = t.match(/(?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kg|g|cl|ml|l)\b/);
  if (!m) return null;
  const facteur = { kg: 1000, g: 1, l: 1000, cl: 10, ml: 1 }[m[3]];
  // « 50 cl x 12 » : le nombre de pièces peut aussi suivre la taille.
  const apres = m[1] ? null : t.slice(m.index + m[0].length).match(/^\s*x\s*(\d+)\b/);
  return { qte: (m[1] ? Number(m[1]) : apres ? Number(apres[1]) : 1) * Number(m[2]) * facteur, type: m[3] === "kg" || m[3] === "g" ? "g" : "ml" };
}

// Deux formats sont « proches » s'ils sont de même nature et à moins de 25 % d'écart. Si l'un est illisible, on ne conclut pas.
function formatsProches(a, b) {
  const ca = contenance(a);
  const cb = contenance(b);
  if (!ca || !cb) return true;
  if (ca.type !== cb.type) return false;
  const rapport = ca.qte / cb.qte;
  return rapport >= 0.8 && rapport <= 1.25;
}

// Prix au kilo ou au litre d'un produit, d'après son format ; chaîne vide si le format n'est pas un poids ou un volume.
function prixAuKilo(texteFormat, prix) {
  const c = contenance(texteFormat);
  if (!c || prix === null || prix === undefined) return "";
  return `${euros((prix / c.qte) * 1000)}/${c.type === "g" ? "kg" : "L"}`;
}

