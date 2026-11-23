// Bulle d'aide (FAQ) affichée sur les pages publiques et l'espace exposant.
// Pour modifier les questions : éditer la liste QUESTIONS ci-dessous.

import { CONTACT_WHATSAPP } from './config.js';
import { esc } from './ui.js';

const QUESTIONS = [
  ['Comment réserver un stand ?',
    'Créez votre compte avec votre numéro de téléphone et un mot de passe, puis cliquez sur « Nouvelle demande ». '
    + 'Choisissez l\'édition, la catégorie et le nombre de stands, indiquez ce que vous vendrez, relisez le contrat rempli à votre nom et validez.'],
  ['Quelles informations dois-je fournir ?',
    'À l\'inscription : seulement votre numéro et un mot de passe. Au moment de réserver : nom, prénoms, nom de votre entreprise ou activité, '
    + 'et la liste des produits que vous vendrez. Adresse, IFU, RCCM et e-mail sont facultatifs. Tout est conservé pour vos prochaines réservations.'],
  ['Combien coûte un stand ?',
    'Les tarifs de chaque catégorie sont affichés sur la page d\'accueil. Le prix appliqué est celui en vigueur le jour de votre demande : '
    + 'il ne change plus ensuite, même si les tarifs augmentent.'],
  ['Comment payer ?',
    'Ouvrez votre demande : les numéros et moyens de paiement de l\'organisation y sont indiqués (Mobile Money, virement…). '
    + 'Vous pouvez payer en une ou plusieurs fois. Après chaque versement, déclarez-le avec la capture d\'écran ou le reçu.'],
  ['Quand ma réservation est-elle confirmée ?',
    'Dès que l\'organisation a vérifié votre premier paiement, votre demande passe à « Validée ». '
    + 'L\'emplacement de votre stand vous est ensuite attribué par l\'organisation et s\'affiche dans votre espace.'],
  ['Où trouver mon contrat ?',
    'Le contrat d\'exploitation est rempli automatiquement avec vos informations et signé électroniquement à l\'envoi de votre demande. '
    + 'Retrouvez-le à tout moment dans la demande, avec un bouton pour l\'imprimer ou l\'enregistrer en PDF.'],
  ['Puis-je réserver pour plusieurs éditions ?',
    'Oui. Quand plusieurs éditions sont ouvertes, choisissez celle qui vous intéresse au début de la réservation. '
    + 'Chaque demande indique clairement son édition, et votre parcours d\'exposant compte toutes vos participations.'],
  ['Puis-je annuler ou être remboursé ?',
    'Contactez l\'organisation. Selon le contrat d\'exploitation, les avances versées ne sont pas remboursables.'],
  ['J\'ai oublié mon mot de passe',
    'Contactez l\'organisation : elle peut vous attribuer un nouveau mot de passe. Vous pourrez ensuite le changer dans « Mon profil ».'],
  ['Installer l\'application sur mon téléphone',
    'Sur Android, touchez « Installer l\'appli » en bas de l\'écran (ou menu ⋮ › Installer l\'application). '
    + 'Sur iPhone, dans Safari : bouton Partager › « Sur l\'écran d\'accueil ».'],
];

function monter() {
  if (document.querySelector('.faq-bulle')) return;
  const bulle = document.createElement('button');
  bulle.type = 'button';
  bulle.className = 'faq-bulle';
  bulle.setAttribute('aria-label', 'Aide et questions fréquentes');
  bulle.setAttribute('aria-expanded', 'false');
  bulle.innerHTML = '<span aria-hidden="true">?</span>';

  const panneau = document.createElement('section');
  panneau.className = 'faq-panneau';
  panneau.hidden = true;
  panneau.setAttribute('role', 'dialog');
  panneau.setAttribute('aria-label', 'Questions fréquentes');
  panneau.innerHTML = `
    <header><div><strong>Besoin d'aide ?</strong><span>Les réponses aux questions fréquentes</span></div>
      <button type="button" class="faq-fermer" aria-label="Fermer">×</button></header>
    <div class="faq-recherche"><input type="search" placeholder="Rechercher (paiement, contrat…)" aria-label="Rechercher une question"></div>
    <div class="faq-liste">${QUESTIONS.map(([q, r]) => `<details><summary>${esc(q)}</summary><p>${esc(r)}</p></details>`).join('')}
      <p class="faq-vide" hidden>Aucune réponse trouvée. Écrivez-nous !</p></div>
    ${CONTACT_WHATSAPP ? `<footer><a class="btn block" target="_blank" rel="noopener"
      href="https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent('Bonjour, j\'ai une question sur la réservation de stand Fènou HIGBÉ : ')}">
      Écrire à l'organisation sur WhatsApp</a></footer>` : ''}`;

  const ouvrir = (oui) => {
    panneau.hidden = !oui;
    bulle.setAttribute('aria-expanded', String(oui));
    bulle.classList.toggle('ouverte', oui);
    if (oui) panneau.querySelector('input').focus({ preventScroll: true });
  };
  bulle.addEventListener('click', () => ouvrir(panneau.hidden));
  panneau.querySelector('.faq-fermer').addEventListener('click', () => ouvrir(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panneau.hidden) ouvrir(false); });

  const normal = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  panneau.querySelector('input').addEventListener('input', (e) => {
    const s = normal(e.target.value.trim());
    let vus = 0;
    panneau.querySelectorAll('details').forEach((d) => {
      const ok = !s || normal(d.textContent).includes(s);
      d.hidden = !ok;
      if (ok) vus += 1;
      d.open = !!s && ok && vus === 1;
    });
    panneau.querySelector('.faq-vide').hidden = vus > 0;
  });
  // Une seule réponse ouverte à la fois
  panneau.querySelectorAll('details').forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) panneau.querySelectorAll('details').forEach((x) => { if (x !== d) x.open = false; });
  }));

  document.body.append(panneau, bulle);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', monter);
else monter();
