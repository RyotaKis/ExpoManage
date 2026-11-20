// Panneau visuel des écrans de connexion et d'inscription.
import { logo } from './icones.js';
import * as api from './api.js';

export function monterVisuel(el, { admin = false } = {}) {
  el.innerHTML = `
    <a href="/" style="text-decoration:none">${logo('clair', admin ? '' : 'lg')}</a>
    <div class="masquer-mobile" style="margin:22px 0 24px"><span class="bandeau-incline" style="font-size:1rem"><span>Le marché international<br>des jeunes entrepreneurs</span></span></div>
    <p class="masquer-mobile">${admin
      ? 'Pilotez les inscriptions, les demandes de stand, les paiements et les attributions de votre marché.'
      : 'Gérez facilement vos inscriptions, vos demandes de stand et le suivi de vos paiements.'}</p>
    <div class="trait masquer-mobile"></div>
    <p class="devise masquer-mobile">Un marché plus organisé,<br>une expérience plus riche !</p>
    ${api.modeLocal ? '<p class="small" style="color:#fbc531;margin:18px 0 0">Mode local : données de démonstration.</p>' : ''}`;
}
