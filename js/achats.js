// « Mes achats » (séance 25) : les relevés lus sur tickets, regroupés par ticket,
// avec la dépense par semaine et par mois.
// Un ticket = les relevés de même ticket (identifiant `ticket`) ; pour les relevés plus anciens,
// qui n'en ont pas, on regroupe ceux d'un même magasin, d'un même jour, lus sur ticket.

let modeReleves = "rayon"; // "rayon" ou "ticket"

// Ce qui a été payé pour la ligne : le montant lu sur le ticket ; pour les anciens relevés, prix × quantité (le prix seul pour le vrac, dont la quantité est un poids).
const montantDe = (r) => (typeof r.montant === "number" ? r.montant : Math.round(r.prix * (Number.isInteger(r.quantite) ? r.quantite || 1 : 1) * 100) / 100);

function ticketsGroupes() {
  const groupes = new Map();
  for (const r of releves) {
    if (r.source !== "ticket") continue;
    const cle = r.ticket || `${r.magasin}|${r.date}`;
    if (!groupes.has(cle)) groupes.set(cle, { cle, magasin: r.magasin, date: r.date, lignes: [], total: 0 });
    const g = groupes.get(cle);
    g.lignes.push(r);
    g.total += montantDe(r);
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
  const tickets = ticketsGroupes();
  const kpi = document.querySelector("#achats-kpi");
  if (!kpi) return;
  const aujourdhuiIso = aujourdhui();
  const semaine = debutSemaine(aujourdhuiIso);
  const mois = debutMois(aujourdhuiIso);
  const somme = (liste) => liste.reduce((s, t) => s + t.total, 0);
  const cetteSemaine = tickets.filter((t) => debutSemaine(t.date) === semaine);
  const ceMois = tickets.filter((t) => debutMois(t.date) === mois);
  const moyenne = tickets.length ? somme(tickets) / tickets.length : 0;

  if (!tickets.length) {
    kpi.innerHTML = "";
    document.querySelector("#achats-semaines").innerHTML = "";
    document.querySelector("#achats-liste").innerHTML = `<p class="encart">Aucun ticket lu pour l'instant. Photographiez ou importez un ticket depuis l'onglet Photo.</p>`;
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
  document.querySelector("#achats-semaines").innerHTML = `<p class="etiq">DÉPENSE PAR SEMAINE</p>` + semaines.map((s) => `
    <div class="barre-sem"><span>sem. du ${dateFr(s.iso).slice(0, 5)}</span><i style="width:${Math.round((s.total / max) * 100)}%"></i><b class="mono">${s.total ? euros(s.total) : "—"}</b></div>`).join("");

  document.querySelector("#achats-liste").innerHTML = `<p class="etiq">MES TICKETS</p>` + tickets.map((t) => `
    <details class="ticket">
      <summary><span><b>${echapper(nomMagasin(t.magasin))}</b><small>${dateFr(t.date)} · ${t.lignes.length} article${t.lignes.length > 1 ? "s" : ""}</small></span><span class="etiquette">${euros(t.total)}</span></summary>
      <ul>${t.lignes.map((r) => {
        const p = PANIER[r.produit];
        return `<li><span>${echapper(p?.nom || "Produit supprimé")}${r.marque ? ` <small>${echapper(r.marque)}</small>` : ""}${r.promo ? ` <span class="badge-promo">PROMO</span>` : ""}${r.quantite && r.quantite !== 1 ? ` <small>× ${String(r.quantite).replace(".", ",")}</small>` : ""}</span><b class="mono">${euros(montantDe(r))}</b></li>`;
      }).join("")}</ul>
    </details>`).join("");
}

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
