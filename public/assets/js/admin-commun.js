// Éléments partagés par les pages d'administration.
import * as api from './api.js';
import { esc, fcfa, LIBELLES } from './ui.js';

const CLE_EDITION = 'expomanage-admin-edition';

// Sélecteur d'édition mémorisé d'une page à l'autre. `toutes` ajoute l'option « Toutes les éditions ».
export async function selecteurEdition(select, { toutes = false, onChange } = {}) {
  const eds = await api.editions();
  let choisie = null;
  try { choisie = localStorage.getItem(CLE_EDITION); } catch { /* stockage indisponible */ }
  if (!eds.some((e) => e.id === choisie)) choisie = toutes ? '' : await api.editionCourante();
  select.innerHTML = (toutes ? '<option value="">Toutes les éditions</option>' : '') +
    eds.map((e) => `<option value="${e.id}">${esc(e.nom)}${e.statut === 'ouverte' ? ' (ouverte)' : ''}</option>`).join('');
  select.value = choisie || '';
  select.addEventListener('change', () => {
    try { localStorage.setItem(CLE_EDITION, select.value); } catch { /* ignoré */ }
    onChange?.(select.value);
  });
  return { editions: eds, valeur: () => select.value };
}

// Colonnes d'export des demandes (réutilisées par plusieurs pages)
export const COLONNES_DEMANDES = [
  ['N° demande', (d) => d.numero],
  ['Date', (d) => d.created_at.slice(0, 10)],
  ['Édition', (d) => d.edition_nom],
  ['Site', (d) => d.site_nom],
  ['Exposant', (d) => d.exposant_nom],
  ['Entreprise', (d) => d.entreprise],
  ['Téléphone', (d) => d.telephone],
  ['Famille', (d) => d.famille_nom],
  ['Catégorie', (d) => d.categorie_nom],
  ['Nb stands', (d) => d.quantite],
  ['Prix unitaire', (d) => d.prix_unitaire],
  ['Tarif', (d) => d.tarif_libelle],
  ['Remise', (d) => d.remise_montant],
  ['Montant dû', (d) => d.montant_du],
  ['Payé (validé)', (d) => d.total_paye],
  ['En attente de validation', (d) => d.montant_en_attente],
  ['Reste à payer', (d) => d.reste_a_payer],
  ['Statut demande', (d) => LIBELLES.demande[d.statut]],
  ['Statut paiement', (d) => LIBELLES.financier[d.statut_financier]],
  ['Stands attribués', (d) => d.stands_attribues || ''],
];

export const montantReste = (d) =>
  d.reste_a_payer < 0 ? `<span class="badge" data-s="trop_percu">+ ${fcfa(-d.reste_a_payer)}</span>` : fcfa(d.reste_a_payer);
