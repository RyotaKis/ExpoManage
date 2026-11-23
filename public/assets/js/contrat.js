// Contrat d'exploitation rempli avec les informations de la réservation.
//
// Les {{champs}} du modèle (voir supabase/migrations/005_contrat_v2_brouillon.sql) sont remplacés par :
//  - avant l'envoi : les informations saisies dans le formulaire (aperçu) ;
//  - après l'envoi : les informations figées au moment de l'acceptation (acceptations_contrat.donnees).

import { esc, nombre, date, dateHeure, rendreContrat } from './ui.js';
import { logo } from './icones.js';

/* ------------------------------------------------------------ Nombres en lettres */

const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const DIZAINES = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function moinsDeCent(n) {
  if (n <= 16) return UNITES[n];
  if (n < 20) return 'dix-' + UNITES[n - 10];
  const d = Math.floor(n / 10), u = n % 10;
  if (d === 7 || d === 9) {                       // 70-79 : soixante-dix… ; 90-99 : quatre-vingt-dix…
    const base = d === 7 ? 'soixante' : 'quatre-vingt';
    const reste = 10 + u;
    return base + (d === 7 && u === 1 ? ' et ' : '-') + moinsDeCent(reste);
  }
  if (d === 8) return u ? 'quatre-vingt-' + UNITES[u] : 'quatre-vingts';
  if (!u) return DIZAINES[d];
  return DIZAINES[d] + (u === 1 ? ' et un' : '-' + UNITES[u]);
}

function moinsDeMille(n) {
  const c = Math.floor(n / 100), r = n % 100;
  if (!c) return moinsDeCent(r);
  const cent = c === 1 ? 'cent' : UNITES[c] + (r ? ' cent' : ' cents');
  return r ? cent + ' ' + moinsDeCent(r) : cent;
}

// 60000 → « soixante mille »
export function enLettres(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'zéro';
  const parties = [];
  const milliards = Math.floor(n / 1e9), millions = Math.floor((n % 1e9) / 1e6);
  const milliers = Math.floor((n % 1e6) / 1000), reste = n % 1000;
  if (milliards) parties.push(moinsDeMille(milliards) + (milliards > 1 ? ' milliards' : ' milliard'));
  if (millions) parties.push(moinsDeMille(millions) + (millions > 1 ? ' millions' : ' million'));
  if (milliers) parties.push(milliers === 1 ? 'mille' : moinsDeMille(milliers).replace(/cents$/, 'cent') + ' mille');
  if (reste) parties.push(moinsDeMille(reste));
  return parties.join(' ');
}

/* ------------------------------------------------------------ Valeurs du contrat */

const jours = (debut, fin) => (debut && fin ? Math.round((new Date(fin) - new Date(debut)) / 864e5) + 1 : 0);
const lignes = (t) => String(t || '').split(/\n|;/).map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);

// Valeurs affichées à partir des données de la réservation (forme de acceptations_contrat.donnees)
export function valeurs(d = {}) {
  const n = jours(d.date_debut, d.date_fin);
  const montant = d.montant ?? (d.prix_unitaire && d.quantite ? d.prix_unitaire * d.quantite : null);
  return {
    exposant: [d.prenoms, d.nom && String(d.nom).toUpperCase()].filter(Boolean).join(' '),
    entreprise: d.entreprise,
    telephone: d.telephone ? '+229 ' + String(d.telephone).replace(/^229/, '').replace(/(\d{2})(?=\d)/g, '$1 ') : '',
    adresse: [d.adresse, d.ville].filter(Boolean).join(', '),
    ifu: d.ifu, rccm: d.rccm,
    edition: d.edition, lieu: d.lieu, site: d.site,
    date_debut: date(d.date_debut), date_fin: date(d.date_fin),
    duree: n ? `${enLettres(n)} (${String(n).padStart(2, '0')}) jour${n > 1 ? 's' : ''}` : '',
    categorie: d.categorie,
    quantite: d.quantite ? `${enLettres(d.quantite)} (${String(d.quantite).padStart(2, '0')})` : '',
    prix_unitaire: d.prix_unitaire != null ? nombre(d.prix_unitaire) : '',
    montant: montant != null ? nombre(montant) : '',
    montant_lettres: montant != null ? enLettres(montant) : '',
    numero: d.numero,
    date: d.date ? date(d.date) : '',
    _produits: lignes(d.produits), _equipements: lignes(d.equipements),
    _date_heure: d.date ? dateHeure(d.date) : '', _numero: d.numero,
  };
}

/* ------------------------------------------------------------ Rendu « document » */

// contrat : ligne de la table contrats ; donnees : voir valeurs() ; signe : true si accepté
export function documentContrat(contrat, donnees, { signe = false } = {}) {
  const v = valeurs(donnees);
  const vide = '<span class="champ-vide">à compléter</span>';
  const champ = (nom) => (v[nom] ? `<span class="champ-rempli">${esc(v[nom])}</span>` : vide);
  const bloc = (nom) => {
    if (nom === 'tableau_produits') {
      const n = Math.max(v._produits.length, v._equipements.length, 3);
      return `<div class="table-wrap"><table class="tableau-produits"><thead><tr><th>Produits à vendre</th><th>Équipements</th></tr></thead><tbody>
        ${[...Array(n)].map((_, i) => `<tr><td>${esc(v._produits[i] || '')}</td><td>${esc(v._equipements[i] || '')}</td></tr>`).join('')}
        </tbody></table></div>`;
    }
    if (nom === 'signature') {
      return signe
        ? `<div class="cachet"><strong>Accepté électroniquement</strong>
            <span>par ${esc(v.exposant)} le ${esc(v._date_heure)}</span><span>Demande n° ${esc(v._numero)}</span></div>`
        : '<div class="cachet attente"><strong>Signature électronique</strong><span>Elle sera apposée à l\'envoi de votre demande.</span></div>';
    }
    return null;
  };
  return `
    <article class="contrat-doc">
      <header class="contrat-entete">
        ${logo('', 'sm')}
        <div class="contrat-ref">
          <span>${esc(contrat?.titre || 'Contrat d\'exploitation des stands')}</span>
          <span>Version ${esc(contrat?.version ?? '')}${v._numero ? ` · Demande n° ${esc(v._numero)}` : ''}</span>
        </div>
      </header>
      <div class="contrat-corps">${rendreContrat(contrat?.contenu, { champ, bloc })}</div>
    </article>`;
}

// Le modèle contient-il des champs à remplir ? (sinon : ancien contrat à pointillés)
export const estModele = (contrat) => /\{\{\w+\}\}/.test(contrat?.contenu || '');
