// En-tête et pied communs, plus les gardes d'accès des pages protégées.
import * as api from './api.js';
import { esc, toast } from './ui.js';

const LIENS = {
  public: [['/', 'Accueil'], ['/connexion.html', 'Se connecter'], ['/inscription.html', 'S\'inscrire']],
  exposant: [['/espace/', 'Mes demandes'], ['/espace/demande-nouvelle.html', 'Nouvelle demande'], ['/espace/profil.html', 'Mon profil']],
};

export function monterEntete(espace = 'public') {
  const page = location.pathname.replace(/index\.html$/, '');
  const liens = (LIENS[espace] || [])
    .map(([href, txt]) => `<a href="${href}"${page === href ? ' aria-current="page"' : ''}>${esc(txt)}</a>`).join('');
  const sortie = espace !== 'public' ? '<button class="btn secondary sm" id="btn-sortie" type="button">Déconnexion</button>' : '';

  document.body.insertAdjacentHTML('afterbegin', `
    ${api.modeLocal ? `<div class="bandeau-local">Mode local : données de démonstration enregistrées dans ce navigateur.
      <button type="button" id="btn-reset">Réinitialiser</button></div>` : ''}
    <header class="topbar"><div class="container">
      <a class="brand" href="${espace === 'exposant' ? '/espace/' : '/'}">Fènou <span>HIGBÉ</span></a>
      <nav class="nav" aria-label="Navigation principale">${liens}</nav>${sortie}
    </div></header>`);

  document.getElementById('btn-sortie')?.addEventListener('click', async () => {
    await api.deconnexion();
    location.href = '/connexion.html';
  });
  document.getElementById('btn-reset')?.addEventListener('click', async () => {
    if (!confirm('Effacer toutes les données locales et revenir aux données de démonstration ?')) return;
    await api.reinitialiser();
    toast('Données réinitialisées.', 'ok');
    setTimeout(() => (location.href = '/'), 600);
  });
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
