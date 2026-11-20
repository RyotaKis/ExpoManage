// Service worker de Fenou Expo Manage.
// - Pages : réseau d'abord, puis cache, puis page hors ligne.
// - Fichiers statiques (CSS, JS, images, polices) : cache immédiat + mise à jour en arrière-plan.
// - Les appels à l'API (Supabase) ne sont jamais mis en cache.
const VERSION = 'v3';
const CACHE = `fenou-expo-${VERSION}`;
// Les pages .html ne sont pas pré-chargées : l'hébergeur les redirige vers leur adresse sans .html,
// et une réponse redirigée ne peut pas servir de page. Elles sont mises en cache à la première visite.
const SOCLE = [
  '/', '/hors-ligne.html', '/espace/',
  '/assets/css/app.css',
  '/assets/js/api.js', '/assets/js/api-local.js', '/assets/js/api-supabase.js', '/assets/js/config.js', '/assets/js/donnees-demo.js',
  '/assets/js/ui.js', '/assets/js/layout.js', '/assets/js/icones.js', '/assets/js/auth-visuel.js', '/assets/js/pwa.js',
  '/assets/icons/icon-192.png', '/assets/icons/icon-512.png', '/assets/icons/apple-touch-icon.png', '/assets/icons/favicon-48.png',
  '/assets/img/site/marche-aerien.jpg', '/assets/img/site/marche-nuit.jpg', '/assets/img/site/allees.jpg',
  '/manifest.webmanifest',
];
const POLICES = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SOCLE.map(async (url) => {
      const rep = await fetch(url, { cache: 'reload' });
      if (!rep.ok) throw new Error(`Pré-chargement impossible : ${url}`);
      // Copie « propre » (sans trace de redirection) pour pouvoir servir de page hors ligne
      await cache.put(url, new Response(await rep.blob(), { status: 200, headers: rep.headers }));
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function reseauDabord(req) {
  const cache = await caches.open(CACHE);
  try {
    const rep = await fetch(req);
    if (rep.ok) cache.put(req, rep.clone());
    return rep;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('/hors-ligne.html'));
  }
}

async function cachePuisMaj(e) {
  const cache = await caches.open(CACHE);
  const enCache = await cache.match(e.request);
  const maj = fetch(e.request).then((rep) => {
    if (rep.ok || rep.type === 'opaque') cache.put(e.request, rep.clone());
    return rep;
  }).catch(() => enCache);
  if (enCache) { e.waitUntil(maj); return enCache; }
  return maj;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === 'navigate') return e.respondWith(reseauDabord(req));
    if (url.pathname === '/sw.js') return;
    return e.respondWith(cachePuisMaj(e));
  }
  if (POLICES.includes(url.hostname)) return e.respondWith(cachePuisMaj(e));
  // Tout le reste (Supabase, etc.) passe directement par le réseau.
});
