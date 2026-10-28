// « Mes achats » (séance 25) : les relevés lus sur tickets, regroupés par ticket,
// avec la dépense par semaine et par mois.
// Un ticket = les relevés de même ticket (identifiant `ticket`) ; pour les relevés plus anciens,
// qui n'en ont pas, on regroupe ceux d'un même magasin, d'un même jour, lus sur ticket.

let modeReleves = "rayon"; // "rayon" ou "ticket"
let semainesOuvertes = false; // la dépense par semaine est repliée au départ

// Ce qui a été payé pour la ligne : le montant lu sur le ticket ; pour les anciens relevés, prix × quantité (le prix seul pour le vrac, dont la quantité est un poids).
const montantDe = (r) => (typeof r.montant === "number" ? r.montant : Math.round(r.prix * (Number.isInteger(r.quantite) ? r.quantite || 1 : 1) * 100) / 100);

function ticketsGroupes() {
  const groupes = new Map();
  for (const r of releves) {
    if (r.source !== "ticket") continue;
    const cle = r.ticket || `${r.magasin}|${r.date}`;
    if (!groupes.has(cle)) groupes.set(cle, { cle, magasin: r.magasin, date: r.date, lignes: [], total: 0, exclu: true });
    const g = groupes.get(cle);
    g.lignes.push(r);
    g.total += montantDe(r);
    if (!r.exclu) g.exclu = false; // exclu seulement si toutes ses lignes le sont
  }
  return [...groupes.values()].sort((a, b) => b.date.localeCompare(a.date));
}

// Lundi de la semaine d'une date « AAAA-MM-JJ », au même format.
function debutSemaine(iso) {
  const d = new Date(iso + "T12:00:00Z");
  const jour = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - jour);
  return d.toISOString().slice(0, 10);
}
const debutMois = (iso) => iso.slice(0, 7);

function afficherAchats() {
  const tous = ticketsGroupes();
  const tickets = tous.filter((t) => !t.exclu);
  const exclus = tous.filter((t) => t.exclu);
  const kpi = document.querySelector("#achats-kpi");
  if (!kpi) return;
  const aujourdhuiIso = aujourdhui();
  const semaine = debutSemaine(aujourdhuiIso);
  const mois = debutMois(aujourdhuiIso);
  const somme = (liste) => liste.reduce((s, t) => s + t.total, 0);
  const cetteSemaine = tickets.filter((t) => debutSemaine(t.date) === semaine);
  const ceMois = tickets.filter((t) => debutMois(t.date) === mois);
  const moyenne = tickets.length ? somme(tickets) / tickets.length : 0;

  const zoneExclus = `<details class="exclus" ${exclus.length ? "" : "hidden"}>
      <summary>Tickets exclus (${exclus.length})</summary>
      ${exclus.map((t) => ticketHtml(t, true)).join("")}
    </details>`;

  if (!tickets.length) {
    kpi.innerHTML = "";
    document.querySelector("#achats-semaines").innerHTML = "";
    document.querySelector("#achats-liste").innerHTML = `<p class="encart">${exclus.length ? "Tous vos tickets sont exclus des dépenses." : "Aucun ticket lu pour l'instant. Photographiez ou importez un ticket depuis l'onglet Photo."}</p>` + zoneExclus;
    return;
  }

  kpi.innerHTML = [
    ["Cette semaine", euros(somme(cetteSemaine)), `${cetteSemaine.length} ticket${cetteSemaine.length > 1 ? "s" : ""}`],
    ["Ce mois-ci", euros(somme(ceMois)), `${ceMois.length} ticket${ceMois.length > 1 ? "s" : ""}`],
    ["Ticket moyen", euros(moyenne), `sur ${tickets.length} ticket${tickets.length > 1 ? "s" : ""}`],
  ].map(([titre, valeur, sous]) => `<div class="kpi-case"><span>${titre}</span><b class="mono">${valeur}</b><small>${sous}</small></div>`).join("");

  // Les six dernières semaines, en barres.
  const parSemaine = new Map();
  for (const t of tickets) parSemaine.set(debutSemaine(t.date), (parSemaine.get(debutSemaine(t.date)) || 0) + t.total);
  const semaines = [];
  let d = new Date(semaine + "T12:00:00Z");
  for (let k = 0; k < 6; k++) {
    const iso = d.toISOString().slice(0, 10);
    semaines.push({ iso, total: parSemaine.get(iso) || 0 });
    d.setUTCDate(d.getUTCDate() - 7);
  }
  const max = Math.max(...semaines.map((s) => s.total), 1);
  // Les barres sont repliées derrière « Dépense par semaine » (les trois cases du haut suffisent d'un coup d'œil).
  document.querySelector("#achats-semaines").innerHTML = `<button type="button" class="lien-fleche" id="semaines-bouton" aria-expanded="${semainesOuvertes}"><span>Dépense par semaine</span><i class="fleche-lien" aria-hidden="true"></i></button>
    <div id="semaines-detail" ${semainesOuvertes ? "" : "hidden"}>` + semaines.map((s) => `
    <div class="barre-sem"><span>sem. du ${dateFr(s.iso).slice(0, 5)}</span><i style="width:${Math.round((s.total / max) * 100)}%"></i><b class="mono">${s.total ? euros(s.total) : "—"}</b></div>`).join("") + `</div>`;

  document.querySelector("#achats-liste").innerHTML = `<p class="etiq">MES TICKETS</p>` + tickets.map((t) => ticketHtml(t, false)).join("") + zoneExclus;
}

// Un ticket déplié : ses lignes, puis « Exclure ce ticket des dépenses » (repère `exclu` sur ses relevés, rien n'est supprimé) ou « Remettre dans mes achats ».
function ticketHtml(t, exclu) {
  // Exclure ou remettre : dans le ticket déplié (un geste à risque ne doit pas être sous le doigt dans la liste).
  const action = exclu
    ? `<button type="button" class="lien-discret" data-remettre="${echapper(t.cle)}">Remettre dans mes achats</button>`
    : `<button type="button" class="lien-discret" data-exclure="${echapper(t.cle)}">Exclure ce ticket des dépenses</button>`;
  return `
    <details class="ticket">
      <summary><span><b>${echapper(nomMagasin(t.magasin))}</b>${adresseMagasin(t.magasin) ? `<small>${echapper(adresseMagasin(t.magasin))}</small>` : ""}<small>${dateFr(t.date)} · ${t.lignes.length} article${t.lignes.length > 1 ? "s" : ""}</small></span><span class="etiquette">${euros(t.total)}</span></summary>
      <div class="papier">
        <div class="l"><b>${echapper(nomMagasin(t.magasin).toUpperCase())}</b><span>${dateFr(t.date)}</span></div><hr>
        ${t.lignes.map((r) => {
          const p = PANIER[r.produit];
          // Comme sur le ticket de caisse : le libellé lu en caisse (en capitales), sinon le nom du produit.
          const libelle = (r.libelle || p?.nom || "Produit supprimé").toUpperCase();
          return `<div class="l"><span>${echapper(libelle)}${r.promo ? ` <span class="badge-promo">PROMO</span>` : ""}${r.quantite && r.quantite !== 1 ? ` <small>× ${String(r.quantite).replace(".", ",")}</small>` : ""}</span><span>${euros(montantDe(r)).replace(" €", "")}</span></div>`;
        }).join("")}
        <hr><div class="l"><b>TOTAL</b><b>${euros(t.total).replace(" €", "")}</b></div>
      </div>
      ${action}
    </details>`;
}

function basculerExclusion(cle, exclu) {
  for (const r of releves) {
    if (r.source === "ticket" && (r.ticket || `${r.magasin}|${r.date}`) === cle) {
      if (exclu) r.exclu = true; else delete r.exclu;
    }
  }
  sauvegarder();
  afficherAchats();
  notifier(exclu ? "Ticket exclu. Il est en bas de la liste." : "Ticket remis dans Mes achats.");
}

document.querySelector("#achats-liste").addEventListener("click", (e) => {
  const croix = e.target.closest("[data-exclure]");
  const remettre = e.target.closest("[data-remettre]");
  if (!croix && !remettre) return;
  e.preventDefault(); // le bouton est dans le résumé : sans cela, le ticket s'ouvrirait ou se fermerait
  if (croix) basculerExclusion(croix.dataset.exclure, true);
  else basculerExclusion(remettre.dataset.remettre, false);
});

function majModeReleves() {
  const ticket = modeReleves === "ticket";
  document.querySelector("#releves-rayons").hidden = ticket;
  document.querySelector("#achats").hidden = !ticket;
  for (const [id, actif] of [["#mode-rayon", !ticket], ["#mode-ticket", ticket]]) {
    const b = document.querySelector(id);
    b.classList.toggle("actif", actif);
    b.setAttribute("aria-pressed", String(actif));
  }
  if (ticket) afficherAchats();
}

document.querySelector("#mode-rayon").addEventListener("click", () => { modeReleves = "rayon"; majModeReleves(); });
document.querySelector("#mode-ticket").addEventListener("click", () => { modeReleves = "ticket"; majModeReleves(); });

// Adresse du magasin d'un ticket, affichée sous son nom dans Mes achats (vide si elle n'est pas connue).
function adresseMagasin(id) {
  return MAGASINS.find((m) => m.id === id)?.adresse || "";
}

document.querySelector("#achats-semaines").addEventListener("click", (e) => {
  const bouton = e.target.closest("#semaines-bouton");
  if (!bouton) return;
  semainesOuvertes = !semainesOuvertes;
  bouton.setAttribute("aria-expanded", String(semainesOuvertes));
  document.querySelector("#semaines-detail").hidden = !semainesOuvertes;
});
