// Bascules en onglets soulignés (Liste/Carte dans Magasins, Par rayon/Mes achats dans Mes relevés) :
// - le trait souligné glisse d'un onglet à l'autre ;
// - le contenu qui apparaît glisse doucement dans la même page (même mouvement que les changements d'écran).
// Les boutons gardent leur rôle (ce sont app.js, carte.js, achats.js qui affichent ou masquent les contenus) : ici on ne fait que l'habillage.

// Bouton -> contenu qui apparaît, et sens du glissement.
const BASCULES_CONTENUS = {
  "mag-carte": { contenu: () => document.querySelector("#carte-magasins"), classe: "glisse-droite" },
  "mag-liste": { contenu: () => document.querySelector("#liste-magasins")?.closest(".carte-blanche"), classe: "glisse-gauche" },
  "mode-ticket": { contenu: () => document.querySelector("#achats"), classe: "glisse-droite" },
  "mode-rayon": { contenu: () => document.querySelector("#releves-rayons"), classe: "glisse-gauche" },
};

// Place le trait sous l'onglet actif (rien à faire si le groupe est masqué : il sera replacé quand il s'affichera).
function placerSouligne(groupe) {
  let trait = groupe.querySelector(".souligne");
  if (!trait) {
    trait = document.createElement("span");
    trait.className = "souligne";
    trait.setAttribute("aria-hidden", "true");
    groupe.append(trait);
  }
  const actif = groupe.querySelector("button.actif");
  if (!actif || !actif.offsetWidth) return;
  trait.style.left = `${actif.offsetLeft}px`;
  trait.style.width = `${actif.offsetWidth}px`;
}

function placerSoulignes() {
  document.querySelectorAll(".mode-releves").forEach(placerSouligne);
}

// Un groupe qui s'affiche (changement d'écran) ou dont la taille change (rotation, police chargée) replace son trait.
const surveillant = typeof ResizeObserver === "function" ? new ResizeObserver((entrees) => entrees.forEach((e) => placerSouligne(e.target))) : null;
document.querySelectorAll(".mode-releves").forEach((groupe) => {
  placerSouligne(groupe);
  surveillant?.observe(groupe);
});

document.addEventListener("click", (e) => {
  const bouton = e.target.closest(".mode-releves button");
  if (!bouton) return;
  // On laisse d'abord les autres écouteurs afficher/masquer les contenus, puis on habille.
  setTimeout(() => {
    placerSouligne(bouton.closest(".mode-releves"));
    const regle = BASCULES_CONTENUS[bouton.id];
    const contenu = regle?.contenu();
    if (!contenu || contenu.hidden) return;
    contenu.classList.remove("glisse-droite", "glisse-gauche");
    void contenu.offsetWidth; // relance l'animation même si on revient sur le même onglet
    contenu.classList.add(regle.classe);
    contenu.addEventListener("animationend", () => contenu.classList.remove("glisse-droite", "glisse-gauche"), { once: true });
  }, 0);
});

window.addEventListener("resize", placerSoulignes);
// Filet de sécurité : après un changement d'écran, on replace les traits (le groupe vient de s'afficher).
window.addEventListener("hashchange", () => { setTimeout(placerSoulignes, 60); setTimeout(placerSoulignes, 500); });
if (document.fonts?.ready) document.fonts.ready.then(placerSoulignes);
