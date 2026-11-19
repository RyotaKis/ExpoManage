// Formulaire de fiche exposant (création et modification par l'administration).
import { esc, afficherTelephone } from './ui.js';

export function champsExposant(e = {}, { telephoneModifiable = true } = {}) {
  const v = (k) => esc(e[k] ?? '');
  return `
    <div class="form-grid two">
      <label>Nom <input name="nom" value="${v('nom')}"></label>
      <label>Prénoms <input name="prenoms" value="${v('prenoms')}"></label>
      <label>Entreprise / activité <input name="entreprise" value="${v('entreprise')}"></label>
      <label>Téléphone ${telephoneModifiable ? '' : '<span class="hint">identifiant de connexion</span>'}
        <input name="telephone" type="tel" value="${esc(e.telephone ? afficherTelephone(e.telephone) : '')}"></label>
      <label>WhatsApp <input name="whatsapp" value="${v('whatsapp')}"></label>
      <label>Autre téléphone <input name="telephone_secondaire" value="${v('telephone_secondaire')}"></label>
      <label>E-mail <input name="email" type="email" value="${v('email')}"></label>
      <label>Ville <input name="ville" value="${v('ville')}"></label>
      <label>IFU <input name="ifu" value="${v('ifu')}"></label>
      <label>RCCM <input name="rccm" value="${v('rccm')}"></label>
      <label>Secteur <input name="secteur" value="${v('secteur')}"></label>
      <label>Adresse <input name="adresse" value="${v('adresse')}"></label>
    </div>
    <label>Présentation <textarea name="description" rows="2">${v('description')}</textarea></label>
    <label>Logo <input name="logo" type="file" accept="image/png,image/jpeg,image/webp"></label>
    <label>Notes internes <span class="hint">non visibles par l'exposant</span><textarea name="notes_admin" rows="2">${v('notes_admin')}</textarea></label>`;
}

export function lireExposant(form) {
  const o = {};
  for (const k of ['nom', 'prenoms', 'entreprise', 'telephone', 'whatsapp', 'telephone_secondaire', 'email', 'ville', 'ifu', 'rccm',
    'secteur', 'adresse', 'description', 'notes_admin']) if (form[k]) o[k] = form[k].value.trim();
  return o;
}
