// Barre du bas en verre (maquette validée par Hugo le 30/10/2026, L11 + P11) : une pilule de verre glisse sous l'onglet actif.
// La classe « actif » est posée par montrer() dans app.js ; ici on ne fait que placer la pilule sous cet onglet.
(function () {
  const barre = document.querySelector(".onglets");
  if (!barre) return;
  const lentille = document.createElement("i");
  lentille.className = "lentille";
  lentille.setAttribute("aria-hidden", "true");
  barre.prepend(lentille);

  function placer() {
    const actif = barre.querySelector("a.actif");
    if (!actif) { lentille.hidden = true; return; }
    lentille.hidden = false;
    lentille.style.left = actif.offsetLeft + "px";
    lentille.style.width = actif.offsetWidth + "px";
  }

  // Les classes des onglets changent quand on change d'écran (montrer) : on suit, sans toucher aux onglets eux-mêmes.
  new MutationObserver(placer).observe(barre, { attributes: true, attributeFilter: ["class"], subtree: true });
  window.addEventListener("resize", placer);
  window.addEventListener("orientationchange", placer);
  window.addEventListener("load", placer);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placer);
  placer();
  // La première pose se fait sans glissement ; ensuite la pilule glisse.
  requestAnimationFrame(() => requestAnimationFrame(() => lentille.classList.add("pret")));
})();
