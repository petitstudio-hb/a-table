// Données du panier de référence (courses toutes les 3 semaines).
// Prix en euros pour la quantité indiquée ; null = prix pas encore relevé.
// Sources : donnees/releves/ (Intermarché 20/10/2026, ticket Aldi 17/10/2026).

// osm : identifiant OpenStreetMap du magasin, utilisé par Open Prices.
const MAGASINS = [
  { id: "intermarche", nom: "Intermarché Express", adresse: "44 rue Lepic", osm: { type: "WAY", id: 929780121 } },
  { id: "g20", nom: "G20", adresse: "17 rue Lepic", osm: { type: "NODE", id: 7656096460 } },
  { id: "aldi", nom: "Aldi", adresse: "Rue de Clignancourt", osm: { type: "NODE", id: 1775896671 } },
];

// Pour les fruits et légumes sans code-barres : catégorie Open Prices et poids
// du format, afin d'envoyer un prix au kilo.

const PANIER = [
  { nom: "Filets de poulet", format: "1 kg", rayon: "Viandes", prix: { intermarche: 10.95, g20: null, aldi: 11.58 } },
  { nom: "Viande hachée", format: "500 g", rayon: "Viandes", prix: { intermarche: 6.90, g20: null, aldi: 5.59 } },
  { nom: "Steaks hachés 15 % MG surgelés", format: "10 × 100 g", rayon: "Viandes", prix: { intermarche: 13.31, g20: null, aldi: null } },
  { nom: "Fromage blanc 0 %", format: "grand format", rayon: "Crèmerie", prix: { intermarche: null, g20: null, aldi: null } },
  { nom: "Fromage de brebis", format: "200 g", rayon: "Crèmerie", prix: { intermarche: 3.30, g20: null, aldi: null } },
  { nom: "Gruyère / emmental râpé", format: "200 g", rayon: "Crèmerie", prix: { intermarche: 1.65, g20: null, aldi: null } },
  { nom: "Oignons", format: "500 g", rayon: "Fruits et légumes", categorie: "en:yellow-onions", poidsKg: 0.5, prix: { intermarche: 2.25, g20: null, aldi: 1.00 } },
  { nom: "Carottes", format: "1 kg", rayon: "Fruits et légumes", categorie: "en:carrots", poidsKg: 1, prix: { intermarche: null, g20: null, aldi: null } },
  { nom: "Pommes de terre", format: "1 kg", rayon: "Fruits et légumes", categorie: "en:potatoes", poidsKg: 1, prix: { intermarche: 0.99, g20: null, aldi: null } },
  { nom: "Tomates cerises", format: "250 g", rayon: "Fruits et légumes", categorie: "en:cherry-tomatoes", poidsKg: 0.25, prix: { intermarche: 0.99, g20: null, aldi: null } },
  { nom: "Mâche", format: "100 g", rayon: "Fruits et légumes", categorie: "en:corn-salad", poidsKg: 0.1, prix: { intermarche: 2.41, g20: null, aldi: null } },
  { nom: "Gazpacho Alvalle", format: "1 L", rayon: "Frais", prix: { intermarche: 4.49, g20: null, aldi: null } },
  { nom: "Gnocchi à poêler Lustucru XXL", format: "720 g", rayon: "Frais", prix: { intermarche: 3.50, g20: null, aldi: null } },
  { nom: "Pesto vert", format: "190 g", rayon: "Épicerie", prix: { intermarche: 1.70, g20: null, aldi: 1.29 } },
  { nom: "Pesto rouge", format: "190 g", rayon: "Épicerie", prix: { intermarche: 1.66, g20: null, aldi: null } },
  { nom: "Pâtes", format: "500 g", rayon: "Épicerie", prix: { intermarche: 0.64, g20: null, aldi: 0.55 } },
  { nom: "Riz basmati", format: "500 g", rayon: "Épicerie", prix: { intermarche: 1.67, g20: null, aldi: null } },
  { nom: "Moutarde", format: "320 g", rayon: "Épicerie", prix: { intermarche: null, g20: null, aldi: null } },
  { nom: "Galettes Wasa Léger", format: "270 g", rayon: "Épicerie", prix: { intermarche: 2.15, g20: null, aldi: null } },
  { nom: "Tisane", format: "20 sachets", rayon: "Épicerie", prix: { intermarche: 2.70, g20: null, aldi: null } },
  { nom: "Lait d'avoine", format: "1 L", rayon: "Boissons", prix: { intermarche: 1.75, g20: null, aldi: 0.99 } },
  { nom: "Bière blanche Hoegaarden", format: "6 × 25 cl", rayon: "Boissons", prix: { intermarche: null, g20: null, aldi: null } },
];
