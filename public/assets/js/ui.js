// Utilitaires d'interface : formats, libellés, téléphone, notifications.

/* ---------------------------------------------------------------- Téléphone */

// Même règle que public.normaliser_telephone() côté base
export function normaliserTelephone(saisie) {
  const chiffres = String(saisie || '').replace(/\D/g, '');
  if (!chiffres) return null;
  return chiffres.startsWith('229') ? chiffres : '229' + chiffres;
}

// Bénin : 229 + 01XXXXXXXX (10 chiffres) ; l'ancien format à 8 chiffres est toléré
export function telephoneValide(saisie) {
  const t = normaliserTelephone(saisie);
  return !!t && /^229(\d{8}|01\d{8})$/.test(t);
}

export function afficherTelephone(t) {
  if (!t) return '';
  const local = t.startsWith('229') ? t.slice(3) : t;
  return '+229 ' + local.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

/* ------------------------------------------------------------------ Formats */

const fmtNombre = new Intl.NumberFormat('fr-FR');
export const nombre = (n) => fmtNombre.format(Number(n || 0));
export const fcfa = (n) => nombre(n) + ' FCFA';
export const date = (d) =>
  d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
export const dateHeure = (d) =>
  d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
export const aujourdhui = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Porto-Novo' }).format(new Date());

export const LIBELLES = {
  demande: {
    en_attente_paiement: 'En attente de paiement', validee: 'Validée', attribuee: 'Stand attribué', annulee: 'Annulée',
  },
  paiement: { en_attente: 'En attente de validation', valide: 'Validé', rejete: 'Rejeté' },
  financier: { non_paye: 'Non payé', partiel: 'Partiellement payé', solde: 'Soldé', trop_percu: 'Trop-perçu' },
  moyen: {
    mtn_momo: 'MTN Mobile Money', moov_money: 'Moov Money', celtiis_cash: 'Celtiis Cash',
    virement: 'Virement bancaire', especes: 'Espèces', cheque: 'Chèque', autre: 'Autre',
  },
};

export const badge = (groupe, valeur) =>
  `<span class="badge" data-s="${esc(valeur)}">${esc(LIBELLES[groupe]?.[valeur] || valeur)}</span>`;

/* ------------------------------------------------------------------ DOM */

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const param = (nom) => new URLSearchParams(location.search).get(nom);

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(message, type = 'info') {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.dataset.type = type;
  t.setAttribute('role', type === 'erreur' ? 'alert' : 'status');
  t.textContent = message;
  document.body.append(t);
  setTimeout(() => t.remove(), 5000);
}

// Désactive un bouton pendant une action ; affiche l'erreur éventuelle
export async function avecChargement(bouton, action) {
  const texte = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = 'Patientez…';
  try { return await action(); }
  catch (e) { toast(e.message || 'Une erreur est survenue.', 'erreur'); throw e; }
  finally { bouton.disabled = false; bouton.textContent = texte; }
}

// Lit un formulaire en objet { nom: valeur }
export function lireFormulaire(form) {
  const o = {};
  for (const [k, v] of new FormData(form)) if (!(v instanceof File)) o[k] = typeof v === 'string' ? v.trim() : v;
  return o;
}

// Rendu très simple du contrat : # titres, paragraphes séparés par une ligne vide, - listes
export function rendreContrat(texte) {
  return String(texte || '').split(/\n{2,}/).map((bloc) => {
    const b = bloc.trim();
    if (b.startsWith('### ')) return `<h4>${esc(b.slice(4))}</h4>`;
    if (b.startsWith('## ')) return `<h3>${esc(b.slice(3))}</h3>`;
    if (b.startsWith('# ')) return `<h2>${esc(b.slice(2))}</h2>`;
    if (b.split('\n').every((l) => l.trim().startsWith('- ')))
      return '<ul>' + b.split('\n').map((l) => `<li>${esc(l.trim().slice(2))}</li>`).join('') + '</ul>';
    return `<p>${esc(b).replace(/\n/g, '<br>')}</p>`;
  }).join('');
}
