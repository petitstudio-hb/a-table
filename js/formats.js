// Grammage et litrage (séance 37) : le poids ou le volume ne doit pas être dans le NOM d'un produit, mais dans son contenu (le format).
// Ici : lire une taille dans un nom, proposer un nom propre et un contenu lisible, et la carte « Nettoyer les noms » de Ma course.
// Rien n'est modifié sans l'accord de Hugo, et une sauvegarde est téléchargée juste avant.

const UNITES = { kg: "kg", g: "g", l: "L", cl: "cl", ml: "ml", m: "m" };
const unite = (u) => UNITES[u.toLowerCase()];
const nombre = (n) => String(n).replace(".", ",");

// « Bière blonde Budweiser 50cl x12 » → { nom: "Bière blonde Budweiser", format: "12 × 50 cl" } ; null si le nom ne contient pas de taille.
function analyserNom(nom) {
  const motifs = [
    [/\b(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|cl|ml|l)\b/i, (m) => `${m[1]} × ${nombre(m[2].replace(",", "."))} ${unite(m[3])}`],
    [/\b(\d+(?:[.,]\d+)?)\s*(kg|g|cl|ml|l)\s*[x×]\s*(\d+)\b/i, (m) => `${m[3]} × ${nombre(m[1].replace(",", "."))} ${unite(m[2])}`],
    [/\b(\d+(?:[.,]\d+)?)\s*(kg|g|cl|ml|l|m)\b/i, (m) => `${nombre(m[1].replace(",", "."))} ${unite(m[2])}`],
    [/\s[x×]\s?(\d+)\s*$/i, (m) => (/œuf|oeuf/i.test(nom) ? `${m[1]} œufs` : `× ${m[1]}`)],
    [/\b(\d+)\s*W\b/, (m) => (/lessive/i.test(nom) ? `${m[1]} lavages` : null)],
  ];
  for (const [motif, formate] of motifs) {
    const m = nom.match(motif);
    if (!m) continue;
    const format = formate(m);
    if (!format) continue;
    const propre = nom.replace(m[0], " ").replace(/\s+/g, " ").replace(/[\s,;\-–(]+$/, "").trim();
    if (!propre) return null;
    return { nom: propre, format };
  }
  return null;
}

// Proposition pour un produit : null s'il n'y a rien à changer ou si son contenu actuel est lisible et contredit le nom.
function propositionProduit(p) {
  const a = analyserNom(p.nom);
  if (!a) return null;
  const actuel = contenance(p.format);
  const nouveau = contenance(a.format);
  if (actuel && nouveau && Math.abs(actuel.qte - nouveau.qte) > 0.5) return null;
  return a;
}

function appliquerNom(i, nom, format) {
  const changes = { nom, format };
  Object.assign(PANIER[i], changes);
  if (i < NB_PRODUITS_BASE) modifs[i] = { ...(modifs[i] || {}), ...changes };
}

// ---------- Carte « Nettoyer les noms » (sous la liste de Ma course) ----------
const carteNettoyage = document.querySelector("#nettoyage");
let nettoyageReporte = false; // « Plus tard » : jusqu'à la prochaine ouverture de l'appli
let propositions = [];

function majNettoyage() {
  if (modeCourses || nettoyageReporte) { carteNettoyage.hidden = true; return; }
  propositions = produitsActifs().map((i) => ({ i, a: propositionProduit(PANIER[i]) })).filter((x) => x.a);
  carteNettoyage.hidden = !propositions.length;
  if (!propositions.length) return;
  const n = propositions.length;
  carteNettoyage.innerHTML = `<h2>Nettoyer les noms</h2>
    <p class="aide">${n} nom${n > 1 ? "s contiennent" : " contient"} une taille. Décoche ceux que tu veux garder tels quels. Une sauvegarde est téléchargée avant de modifier.</p>
    ${propositions.map(({ i, a }) => `<label class="net-ligne"><input type="checkbox" data-net="${i}" checked>
      <span><span class="net-avant">${echapper(PANIER[i].nom)}</span><br><span class="net-apres">${echapper(a.nom)} <span>· ${echapper(a.format)}</span></span></span></label>`).join("")}
    <div class="net-actions"><button type="button" id="net-plus-tard">Plus tard</button><button type="button" id="net-appliquer" class="plein">Appliquer (${n})</button></div>`;
}

carteNettoyage.addEventListener("change", (e) => {
  if (!e.target.matches("[data-net]")) return;
  const n = carteNettoyage.querySelectorAll("[data-net]:checked").length;
  const bouton = carteNettoyage.querySelector("#net-appliquer");
  bouton.textContent = `Appliquer (${n})`;
  bouton.disabled = n === 0;
});
carteNettoyage.addEventListener("click", (e) => {
  if (e.target.closest("#net-plus-tard")) { nettoyageReporte = true; majNettoyage(); return; }
  if (!e.target.closest("#net-appliquer")) return;
  const choisis = [...carteNettoyage.querySelectorAll("[data-net]:checked")].map((c) => Number(c.dataset.net));
  if (!choisis.length) return;
  exporter(); // sauvegarde avant de toucher aux données
  for (const { i, a } of propositions) if (choisis.includes(i)) appliquerNom(i, a.nom, a.format);
  sauvegarder();
  calculer();
  notifier(`${choisis.length} nom${choisis.length > 1 ? "s" : ""} nettoyé${choisis.length > 1 ? "s" : ""}. La sauvegarde est dans tes téléchargements.`);
});

majNettoyage();
