// Mises en page communes : en-tête public, espace exposant (barre d'onglets mobile),
// administration (barre latérale), plus les gardes d'accès des pages protégées.
import * as api from './api.js';
import { esc, toast } from './ui.js';
import { ic, logo } from './icones.js';

const page = () => location.pathname.replace(/index\.html$/, '');
// Pages liées à une rubrique (pour surligner le bon lien)
const RUBRIQUES = { '/admin/demande.html': '/admin/demandes.html', '/admin/exposant.html': '/admin/exposants.html',
  '/espace/demande.html': '/espace/' };
const actif = (href) => ((RUBRIQUES[page()] || page()) === href ? ' aria-current="page"' : '');

function bandeauLocal() {
  if (!api.modeLocal) return '';
  return `<div class="bandeau-local">Mode local : données de démonstration enregistrées dans ce navigateur.
    <button type="button" id="btn-reset">Réinitialiser</button></div>`;
}

function brancherCommuns(retourSortie) {
  document.getElementById('btn-reset')?.addEventListener('click', async () => {
    if (!confirm('Effacer toutes les données locales et revenir aux données de démonstration ?')) return;
    await api.reinitialiser();
    toast('Données réinitialisées.', 'ok');
    setTimeout(() => (location.href = '/'), 600);
  });
  document.querySelectorAll('[data-sortie]').forEach((b) => b.addEventListener('click', async () => {
    await api.deconnexion();
    location.href = retourSortie;
  }));
}

/* ------------------------------------------------------------ Public et exposant */

const LIENS_EXPOSANT = [
  ['/espace/', 'Accueil', 'accueil'],
  ['/espace/demande-nouvelle.html', 'Nouvelle demande', 'plus'],
  ['/espace/profil.html', 'Profil', 'profil'],
];

export function monterEntete(espace = 'public', { sombre = false } = {}) {
  document.body.classList.add(espace);
  if (espace === 'exposant') {
    document.body.insertAdjacentHTML('afterbegin', `${bandeauLocal()}
      <header class="topbar sombre"><div class="container">
        <a href="/espace/" style="text-decoration:none">${logo('clair', 'sm')}</a>
        <nav class="nav" aria-label="Navigation">${LIENS_EXPOSANT.map(([h, t, i]) => `<a href="${h}"${actif(h)}>${ic(i)}${esc(t)}</a>`).join('')}</nav>
        <button class="btn-icone" type="button" data-sortie title="Se déconnecter" aria-label="Se déconnecter" style="margin-left:auto">${ic('sortie')}</button>
      </div></header>`);
    document.body.insertAdjacentHTML('beforeend', `<nav class="tabbar" aria-label="Navigation">${
      LIENS_EXPOSANT.map(([h, t, i]) => `<a href="${h}"${actif(h)}>${ic(i)}${esc(t)}</a>`).join('')}</nav>`);
    brancherCommuns('/connexion.html');
    return;
  }
  // Public
  document.body.insertAdjacentHTML('afterbegin', `${bandeauLocal()}
    <header class="topbar${sombre ? ' sombre' : ''}"><div class="container">
      <a href="/" style="text-decoration:none">${logo(sombre ? 'clair' : '', 'sm')}</a>
      <nav class="nav" aria-label="Navigation">
        <a href="/"${actif('/')}>Accueil</a>
        <a href="/connexion.html"${actif('/connexion.html')}>Se connecter</a>
        <a class="btn sm" href="/inscription.html">S'inscrire</a>
      </nav>
    </div></header>`);
  brancherCommuns('/');
}

/* ------------------------------------------------------------ Administration */

const LIENS_ADMIN = [
  ['/admin/', 'Tableau de bord', 'accueil'],
  ['/admin/paiements.html', 'Paiements', 'paiement'],
  ['/admin/demandes.html', 'Demandes de stand', 'demande'],
  ['/admin/exposants.html', 'Exposants', 'exposants'],
  ['/admin/partage.html', 'Partager le site', 'qr'],
];
const LIENS_SUPER = [
  ['/admin/configuration.html', 'Configuration', 'reglages'],
  ['/admin/utilisateurs.html', 'Utilisateurs', 'bouclier'],
  ['/admin/journal.html', 'Journal', 'journal'],
];

function monterAdmin(admin) {
  document.body.classList.add('admin');
  const lien = ([h, t, i]) => `<a href="${h}"${actif(h)}>${ic(i)}<span>${esc(t)}</span>${
    h === '/admin/paiements.html' ? '<span class="pastille" data-nb-attente hidden></span>' : ''}</a>`;
  const initiales = admin.nom.split(/\s+/).map((m) => m[0]).join('').slice(0, 2).toUpperCase();

  document.body.insertAdjacentHTML('afterbegin', `
    <aside class="sidebar" aria-label="Menu d'administration">
      <a href="/admin/" style="text-decoration:none">${logo('clair')}</a>
      <nav>
        ${LIENS_ADMIN.map(lien).join('')}
        ${admin.role === 'super_admin' ? `<div class="titre-groupe">Paramètres</div>${LIENS_SUPER.map(lien).join('')}` : ''}
      </nav>
      <div class="pied">
        <span class="avatar">${esc(initiales)}</span>
        <span class="qui"><strong>${esc(admin.nom)}</strong><span>${admin.role === 'super_admin' ? 'Super administrateur' : 'Gestionnaire'}</span></span>
        <button type="button" data-sortie title="Se déconnecter" aria-label="Se déconnecter">${ic('sortie')}</button>
      </div>
    </aside>
    <div class="voile" data-fermer-menu></div>
    ${bandeauLocal()}
    <div class="barre-haut">
      <button class="btn-icone" type="button" data-ouvrir-menu aria-label="Ouvrir le menu" style="background:var(--noir-2);border-color:var(--noir-3);color:#fff">${ic('menu')}</button>
      <a href="/admin/" style="text-decoration:none">${logo('clair', 'sm')}</a>
      <a class="btn-icone" href="/admin/paiements.html" aria-label="Paiements à valider" style="background:var(--noir-2);border-color:var(--noir-3);color:#fff">
        ${ic('cloche')}<span class="pastille" data-nb-attente hidden></span></a>
    </div>`);

  document.querySelector('[data-ouvrir-menu]').addEventListener('click', () => document.body.classList.add('menu-ouvert'));
  document.querySelector('[data-fermer-menu]').addEventListener('click', () => document.body.classList.remove('menu-ouvert'));
  brancherCommuns('/admin/connexion.html');
  rafraichirCompteurs();
}

export async function rafraichirCompteurs() {
  const { paiements_en_attente: n } = await api.compteurs();
  document.querySelectorAll('[data-nb-attente]').forEach((el) => { el.textContent = n; el.hidden = !n; });
}

// Page réservée aux administrateurs (role = 'super_admin' pour les pages de configuration)
export async function exigerAdmin(role) {
  const a = await api.monAdmin();
  if (!a) {
    location.replace('/admin/connexion.html?retour=' + encodeURIComponent(location.pathname + location.search));
    throw new Error('redirection');
  }
  if (role === 'super_admin' && a.role !== 'super_admin') {
    location.replace('/admin/');
    throw new Error('redirection');
  }
  monterAdmin(a);
  return a;
}

// Page réservée aux exposants connectés : renvoie le profil, sinon redirige
export async function exigerExposant() {
  const p = await api.monProfil();
  if (!p) {
    location.replace('/connexion.html?retour=' + encodeURIComponent(location.pathname + location.search));
    throw new Error('redirection');
  }
  return p;
}
