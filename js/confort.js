// Petits confort (séance 29) : croix pour effacer une recherche, et rappel de sauvegarde (écran « Notifications »).

// ---------- Croix des champs de recherche ----------
for (const champ of document.querySelectorAll("input.recherche")) {
  const enveloppe = document.createElement("div");
  enveloppe.className = "champ-recherche";
  champ.before(enveloppe);
  enveloppe.append(champ);
  const croix = document.createElement("button");
  croix.type = "button";
  croix.className = "recherche-croix";
  croix.setAttribute("aria-label", "Effacer la recherche");
  croix.textContent = "×";
  enveloppe.append(croix);
  const majCroix = () => { croix.hidden = !champ.value; };
  champ.addEventListener("input", majCroix);
  croix.addEventListener("click", () => {
    champ.value = "";
    champ.dispatchEvent(new Event("input", { bubbles: true }));
    champ.focus();
  });
  majCroix();
}

// ---------- Rappel de sauvegarde ----------
// Pas de notification qui sonne téléphone fermé (il faudrait un serveur, voir E8) : un rappel affiché dans l'appli à l'ouverture.
const CLE_NOTIFS = "atable.notifs";
const JOURS_RAPPEL = 7;

function lireNotifs() {
  const v = lire(CLE_NOTIFS, {});
  return { rappel: true, derniere: null, ...(v && typeof v === "object" ? v : {}) };
}
const ecrireNotifs = (n) => ecrire(CLE_NOTIFS, n);

// Appelée par exporter() : on retient le jour de la dernière sauvegarde.
function marquerSauvegarde() {
  ecrireNotifs({ ...lireNotifs(), derniere: aujourdhui() });
  majNotifs();
}

function joursDepuis(iso) {
  return Math.floor((new Date(aujourdhui() + "T12:00:00Z") - new Date(iso + "T12:00:00Z")) / 86400000);
}

function majNotifs() {
  const n = lireNotifs();
  const case_ = document.querySelector("#notif-rappel");
  if (case_) case_.checked = n.rappel;
  const etat = document.querySelector("#notif-etat");
  if (etat) etat.textContent = n.derniere ? `Dernière sauvegarde : ${dateFr(n.derniere)} (il y a ${joursDepuis(n.derniere)} jour${joursDepuis(n.derniere) > 1 ? "s" : ""}).` : "Aucune sauvegarde téléchargée depuis cet appareil.";
  const bandeau = document.querySelector("#rappel-sauvegarde");
  if (!bandeau) return;
  const donnees = releves.length > 0;
  const du = !n.derniere || joursDepuis(n.derniere) >= JOURS_RAPPEL;
  bandeau.hidden = !(n.rappel && donnees && du);
}

document.querySelector("#notif-rappel").addEventListener("change", (e) => {
  ecrireNotifs({ ...lireNotifs(), rappel: e.target.checked });
  majNotifs();
});
document.querySelector("#rappel-fermer").addEventListener("click", () => {
  // On repousse le rappel d'une semaine sans prétendre qu'une sauvegarde a eu lieu.
  document.querySelector("#rappel-sauvegarde").hidden = true;
});
majNotifs();

// ---------- Hors connexion (E11) ----------
// Un bandeau le dit tant qu'il n'y a pas de réseau : les prix et les paniers restent disponibles (ils sont dans le téléphone).
const bandeauHorsLigne = document.createElement("p");
bandeauHorsLigne.id = "hors-ligne";
bandeauHorsLigne.setAttribute("role", "status");
bandeauHorsLigne.textContent = "Hors connexion : tes prix et tes paniers restent disponibles. La lecture de tickets, la recherche de magasins, les adresses et la carte ont besoin du réseau.";
document.querySelector("main")?.prepend(bandeauHorsLigne) || document.body.prepend(bandeauHorsLigne);
const majReseau = () => { bandeauHorsLigne.hidden = navigator.onLine; };
window.addEventListener("online", () => { majReseau(); notifier("De nouveau en ligne."); });
window.addEventListener("offline", majReseau);
majReseau();
