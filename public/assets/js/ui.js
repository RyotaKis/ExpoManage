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

/* ------------------------------------------------------------------ Dialogue */

// Fenêtre modale avec formulaire. `soumettre(form)` peut lever une erreur : elle s'affiche dans la fenêtre.
// Renvoie true si le formulaire a été validé.
export function dialogue({ titre, corps, bouton = 'Enregistrer', danger = false, soumettre }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dialogue';
    d.innerHTML = `<form class="stack" novalidate>
      <h2>${esc(titre)}</h2>
      <div class="form-grid">${corps}</div>
      <div class="alert erreur" data-erreur hidden></div>
      <div class="row" style="justify-content:flex-end">
        <button type="button" class="btn secondary" data-annuler>Annuler</button>
        <button type="submit" class="btn${danger ? ' danger' : ''}">${esc(bouton)}</button>
      </div></form>`;
    document.body.append(d);
    const form = d.querySelector('form');
    d.querySelector('[data-annuler]').addEventListener('click', () => d.close());
    d.addEventListener('close', () => { d.remove(); resolve(d.returnValue === 'ok'); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = form.querySelector('[type=submit]');
      b.disabled = true;
      try { await soumettre(form); d.close('ok'); }
      catch (err) {
        const z = form.querySelector('[data-erreur]');
        z.textContent = err.message; z.hidden = false; b.disabled = false;
      }
    });
    d.showModal();
    form.querySelector('input:not([type=hidden]),select,textarea')?.focus();
  });
}

/* ------------------------------------------------------------------ Exports */

// colonnes : [[titre, (ligne) => valeur], …]
export async function exporter(nomFichier, colonnes, lignes, format = 'xlsx') {
  const donnees = [colonnes.map((c) => c[0]), ...lignes.map((l) => colonnes.map((c) => c[1](l) ?? ''))];
  const nom = `${nomFichier}-${aujourdhui()}`;
  if (format === 'csv') {
    const q = (v) => (/[";\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = '﻿' + donnees.map((r) => r.map(q).join(';')).join('\r\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: nom + '.csv',
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } else {
    const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
    const ws = XLSX.utils.aoa_to_sheet(donnees);
    ws['!cols'] = donnees[0].map((_, i) => ({ wch: Math.min(40, Math.max(10, ...donnees.map((r) => String(r[i]).length))) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Données');
    XLSX.writeFile(wb, nom + '.xlsx');
  }
}

// Petit menu « Exporter » : renvoie le HTML ; brancher avec brancherExport()
export const boutonsExport = () =>
  `<div class="row"><button type="button" class="btn secondary sm" data-export="xlsx">Exporter Excel</button>
   <button type="button" class="btn secondary sm" data-export="csv">CSV</button></div>`;
export function brancherExport(racine, action) {
  racine.querySelectorAll('[data-export]').forEach((b) =>
    b.addEventListener('click', () => avecChargement(b, () => action(b.dataset.export)).catch(() => {})));
}
