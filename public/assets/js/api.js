// Point d'entrée unique des données. Les pages importent uniquement ce fichier :
//   import * as api from '/assets/js/api.js';
// Le mode (local ou Supabase) se choisit dans config.js.

import { MODE } from './config.js';

const impl = MODE === 'supabase'
  ? await import('./api-supabase.js')   // à écrire lors du branchement
  : await import('./api-local.js');

export const {
  inscription, connexionExposant, connexionAdmin, deconnexion, monProfil, monAdmin, majMonProfil, changerMotDePasse,
  editionsOuvertes, tarifsEnVigueur, contratEnVigueur,
  creerDemande, mesDemandes, detailDemande,
  declarerPaiement, paiementsEnAttente, traiterPaiement,
  urlFichier,
} = impl;

export const modeLocal = MODE !== 'supabase';
export const reinitialiser = impl.reinitialiser;
