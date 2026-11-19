// En-tête et pied communs, plus les gardes d'accès des pages protégées.
import * as api from './api.js';
import { esc, toast } from './ui.js';

const LIENS = {
  public: [['/', 'Accueil'], ['/connexion.html', 'Se connecter'], ['/inscription.html', 'S\'inscrire']],
  exposant: [['/espace/', 'Mes demandes'], ['/espace/demande-nouvelle.html', 'Nouvelle demande'], ['/espace/profil.html', 'Mon profil']],
  admin: [['/admin/', 'Tableau de bord'], ['/admin/paiements.html', 'Paiements'], ['/admin/demandes.html', 'Demandes'],
    ['/admin/exposants.html', 'Exposants']],
  super_admin: [['/admin/configuration.html', 'Configuration'], ['/admin/utilisateurs.html', 'Utilisateurs'], ['/admin/journal.html', 'Journal']],
};

// Pages liées à une rubrique (pour surligner le bon lien)
const RUBRIQUES = { '/admin/demande.html': '/admin/demandes.html', '/admin/exposant.html': '/admin/exposants.html',
  '/espace/demande.html': '/espace/' };

export function monterEntete(espace = 'public', admin = null) {
  const page = location.pathname.replace(/index\.html$/, '');
  const actif = RUBRIQUES[page] || page;
  const liste = espace === 'admin' && admin?.role === 'super_admin' ? [...LIENS.admin, ...LIENS.super_admin] : LIENS[espace] || [];
  const liens = liste
    .map(([href, txt]) => `<a href="${href}"${actif === href ? ' aria-current="page"' : ''}>${esc(txt)}${
      href === '/admin/paiements.html' ? ' <span class="pastille" id="nb-attente" hidden></span>' : ''}</a>`).join('');
  const sortie = espace !== 'public' ? '<button class="btn secondary sm" id="btn-sortie" type="button">Déconnexion</button>' : '';

  document.body.insertAdjacentHTML('afterbegin', `
    ${api.modeLocal ? `<div class="bandeau-local">Mode local : données de démonstration enregistrées dans ce navigateur.
      <button type="button" id="btn-reset">Réinitialiser</button></div>` : ''}
    <header class="topbar"><div class="container">
      <a class="brand" href="${espace === 'exposant' ? '/espace/' : espace === 'admin' ? '/admin/' : '/'}">Fènou <span>HIGBÉ</span>${
        espace === 'admin' ? ' <small>Administration</small>' : ''}</a>
      <nav class="nav" aria-label="Navigation principale">${liens}</nav>
      ${admin ? `<span class="small muted qui">${esc(admin.nom)}</span>` : ''}${sortie}
    </div></header>`);

  document.getElementById('btn-sortie')?.addEventListener('click', async () => {
    await api.deconnexion();
    location.href = espace === 'admin' ? '/admin/connexion.html' : '/connexion.html';
  });
  if (espace === 'admin') rafraichirCompteurs();
  document.getElementById('btn-reset')?.addEventListener('click', async () => {
    if (!confirm('Effacer toutes les données locales et revenir aux données de démonstration ?')) return;
    await api.reinitialiser();
    toast('Données réinitialisées.', 'ok');
    setTimeout(() => (location.href = '/'), 600);
  });
}

export async function rafraichirCompteurs() {
  const { paiements_en_attente: n } = await api.compteurs();
  const el = document.getElementById('nb-attente');
  if (el) { el.textContent = n; el.hidden = !n; }
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
  monterEntete('admin', a);
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
