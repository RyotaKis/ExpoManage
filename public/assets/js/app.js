// Socle commun : client Supabase, authentification, formats, petits utilitaires d'interface.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, DOMAINE_IDENTIFIANT } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/* ---------------------------------------------------------------- Téléphone */

// Même règle que public.normaliser_telephone() côté base
export function normaliserTelephone(saisie) {
  const chiffres = String(saisie || '').replace(/\D/g, '');
  if (!chiffres) return null;
  return chiffres.startsWith('229') ? chiffres : '229' + chiffres;
}

export function telephoneValide(saisie) {
  const t = normaliserTelephone(saisie);
  // Bénin : 229 + 10 chiffres (01XXXXXXXX) ; on tolère l'ancien format à 8 chiffres
  return !!t && /^229(\d{8}|01\d{8})$/.test(t);
}

export function afficherTelephone(t) {
  if (!t) return '';
  const local = t.startsWith('229') ? t.slice(3) : t;
  return '+229 ' + local.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

const identifiant = (tel) => `${normaliserTelephone(tel)}@${DOMAINE_IDENTIFIANT}`;

/* ---------------------------------------------------------- Authentification */

const MESSAGES_AUTH = {
  'Invalid login credentials': 'Numéro ou mot de passe incorrect.',
  'User already registered': 'Ce numéro a déjà un compte. Connectez-vous.',
  'Password should be at least 6 characters.': 'Le mot de passe doit contenir au moins 6 caractères.',
};
export const messageErreur = (e) =>
  MESSAGES_AUTH[e?.message] || e?.message || 'Une erreur est survenue. Réessayez.';

export async function connexionExposant(telephone, motDePasse) {
  const { data, error } = await sb.auth.signInWithPassword({ email: identifiant(telephone), password: motDePasse });
  if (error) throw error;
  return data;
}

export async function connexionAdmin(email, motDePasse) {
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: motDePasse });
  if (error) throw error;
  return data;
}

// Crée le compte puis le profil exposant (ou rattache un profil créé par l'organisation)
export async function inscriptionExposant(profil, motDePasse) {
  const { error: e1 } = await sb.auth.signUp({ email: identifiant(profil.telephone), password: motDePasse });
  if (e1) throw e1;
  const { data, error: e2 } = await sb.rpc('inscrire_exposant', {
    p: { ...profil, telephone: normaliserTelephone(profil.telephone) },
  });
  if (e2) throw e2;
  return data;
}

export async function deconnexion(versPage = '/connexion.html') {
  await sb.auth.signOut();
  location.href = versPage;
}

export async function utilisateur() {
  const { data } = await sb.auth.getSession();
  return data.session?.user || null;
}

export async function monProfilExposant() {
  const u = await utilisateur();
  if (!u) return null;
  const { data } = await sb.from('exposants').select('*').eq('user_id', u.id).maybeSingle();
  return data;
}

export async function monProfilAdmin() {
  const u = await utilisateur();
  if (!u) return null;
  const { data } = await sb.from('admins').select('*').eq('user_id', u.id).eq('actif', true).maybeSingle();
  return data;
}

// À appeler en haut des pages protégées
export async function exigerExposant() {
  const p = await monProfilExposant();
  if (!p) { location.href = '/connexion.html?retour=' + encodeURIComponent(location.pathname); throw new Error('redirect'); }
  return p;
}
export async function exigerAdmin(role) {
  const a = await monProfilAdmin();
  if (!a || (role === 'super_admin' && a.role !== 'super_admin')) {
    location.href = '/admin/connexion.html'; throw new Error('redirect');
  }
  return a;
}

/* ------------------------------------------------------------------ Formats */

const fmtNombre = new Intl.NumberFormat('fr-FR');
export const fcfa = (n) => fmtNombre.format(Number(n || 0)) + ' FCFA';
export const date = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
export const dateHeure = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : '');

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

// Badge de statut : <span class="badge" data-s="validee">Validée</span>
export const badge = (groupe, valeur) =>
  `<span class="badge" data-s="${esc(valeur)}">${esc(LIBELLES[groupe]?.[valeur] || valeur)}</span>`;

/* ------------------------------------------------------------------ Interface */

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

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

// Désactive un bouton pendant une action asynchrone
export async function avecChargement(bouton, action) {
  const texte = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = 'Patientez…';
  try { return await action(); }
  finally { bouton.disabled = false; bouton.textContent = texte; }
}

// Téléversement d'un fichier dans le dossier du compte connecté
export async function televerser(bucket, fichier, sousDossier = '') {
  const u = await utilisateur();
  const ext = (fichier.name.split('.').pop() || 'bin').toLowerCase();
  const chemin = [u.id, sousDossier, `${crypto.randomUUID()}.${ext}`].filter(Boolean).join('/');
  const { error } = await sb.storage.from(bucket).upload(chemin, fichier, { contentType: fichier.type });
  if (error) throw error;
  return chemin;
}

export const urlLogo = (chemin) => (chemin ? sb.storage.from('logos').getPublicUrl(chemin).data.publicUrl : null);

export async function urlJustificatif(chemin) {
  const { data, error } = await sb.storage.from('justificatifs').createSignedUrl(chemin, 600);
  if (error) throw error;
  return data.signedUrl;
}
