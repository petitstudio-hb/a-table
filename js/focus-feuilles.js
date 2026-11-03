// Feuilles du bas (.feuille-prix) : accessibilité du clavier et de VoiceOver, sans rien changer à l'écran (04/11/2026).
// - À l'ouverture, le focus entre dans la feuille (sur la feuille elle-même : pas de clavier qui surgit, pas de défilement).
// - Tab et Maj+Tab restent dans la feuille tant qu'elle est ouverte.
// - À la fermeture, le focus revient au bouton qui l'avait ouverte. Échap est géré par chaque feuille.
(() => {
  let declencheur = null;
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".feuille-prix")) declencheur = e.target.closest("button, a, summary, [tabindex]");
  }, true);

  const cadre = (f) => f.querySelector('[role="dialog"]');
  const focalisables = (c) => [...c.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((x) => !x.disabled && x.type !== "hidden" && x.getClientRects().length > 0);

  function aChange(f) {
    const c = cadre(f);
    if (!c) return;
    if (!f.hidden) {
      if (!c.hasAttribute("tabindex")) c.setAttribute("tabindex", "-1");
      if (!c.contains(document.activeElement)) c.focus({ preventScroll: true });
    } else if (declencheur && declencheur.isConnected && (document.activeElement === document.body || c.contains(document.activeElement))) {
      declencheur.focus({ preventScroll: true });
    }
  }
  const observateur = new MutationObserver((liste) => liste.forEach((m) => aChange(m.target)));
  document.querySelectorAll(".feuille-prix").forEach((f) => observateur.observe(f, { attributes: true, attributeFilter: ["hidden"] }));

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const ouvertes = [...document.querySelectorAll(".feuille-prix:not([hidden])")];
    const c = ouvertes.length ? cadre(ouvertes[ouvertes.length - 1]) : null;
    if (!c) return;
    const liste = focalisables(c);
    if (!liste.length) { e.preventDefault(); return; }
    const premier = liste[0], dernier = liste[liste.length - 1], actif = document.activeElement;
    if (e.shiftKey && (actif === premier || actif === c || !c.contains(actif))) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && (actif === dernier || !c.contains(actif))) { e.preventDefault(); premier.focus(); }
  });
})();
