// Point d'entrée unique des données. Les pages importent uniquement ce fichier :
//   import * as api from '/assets/js/api.js';
// Le mode (local ou Supabase) se choisit dans config.js.
// api-supabase.js devra exporter exactement les mêmes fonctions.

import { MODE } from './config.js';

const impl = MODE === 'supabase'
  ? await import('./api-supabase.js')   // à écrire lors du branchement
  : await import('./api-local.js');

export const modeLocal = MODE !== 'supabase';

export const {
  // Session et profil
  inscription, connexionExposant, connexionAdmin, deconnexion, monProfil, monAdmin, majMonProfil, changerMotDePasse,
  // Catalogue public
  editionsOuvertes, tarifsEnVigueur, contratEnVigueur,
  // Exposant
  creerDemande, mesDemandes, detailDemande, declarerPaiement, urlFichier,
  // Administration : pilotage
  editions, editionCourante, catalogue, compteurs, tableauDeBord,
  // Administration : demandes, paiements, attributions
  listeDemandes, majDemande, annulerDemande, retablirDemande, supprimerDemande,
  paiementsEnAttente, traiterPaiement, modifierPaiement, supprimerPaiement, listePaiements, enregistrerRemboursement,
  attribuer, retirerAttribution,
  // Administration : exposants
  listeExposants, ficheExposant, creerExposant, majExposant, reinitialiserMotDePasse, supprimerExposant,
  // Administration : configuration et accès
  enregistrerEdition, enregistrerSite, enregistrerCategorie, listeTarifs, enregistrerTarif, supprimerTarif,
  listeContrats, enregistrerContrat, publierContrat,
  listeAdmins, creerAdmin, majAdmin, journalAudit,
  // Mode local uniquement
  reinitialiser,
} = impl;
