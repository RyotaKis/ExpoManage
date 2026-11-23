// Application installable : enregistrement du service worker et bouton « Installer ».
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

const installee = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
let invite = null;

function bouton() {
  if (installee || document.querySelector('.installer-app')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'installer-app';
  b.innerHTML = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>Installer l'appli`;
  const fermer = document.createElement('span');
  fermer.className = 'fermer'; fermer.setAttribute('aria-label', 'Masquer'); fermer.textContent = '×';
  b.append(fermer);
  b.addEventListener('click', async (ev) => {
    if (ev.target === fermer) { b.remove(); try { sessionStorage.setItem('pwa-masque', '1'); } catch {} return; }
    if (!invite) return;
    invite.prompt();
    await invite.userChoice;
    invite = null; b.remove();
  });
  document.body.append(b);
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  invite = e;
  let masque = false; try { masque = sessionStorage.getItem('pwa-masque'); } catch {}
  if (!masque) bouton();
});
window.addEventListener('appinstalled', () => document.querySelector('.installer-app')?.remove());

// Bulle d'aide (FAQ) : pages publiques et espace exposant, pas l'administration
if (!location.pathname.startsWith('/admin')) import('./faq.js');
