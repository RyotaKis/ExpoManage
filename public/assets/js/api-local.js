// Couche de données LOCALE : tout est stocké dans ce navigateur.
// Données dans localStorage, fichiers (logos, justificatifs) dans IndexedDB.
//
// Elle applique les mêmes règles que la base Supabase (supabase/migrations/001_schema.sql)
// et renvoie des objets de même forme (noms de champs identiques), pour que les pages
// fonctionnent sans changement le jour du branchement.

import { donneesDemo } from './donnees-demo.js';
import { normaliserTelephone, telephoneValide, aujourdhui } from './ui.js';

const CLE_DB = 'expomanage-local-db-v1';
const CLE_SESSION = 'expomanage-local-session';

/* ============================================================ Stockage */

const uid = () => crypto.randomUUID();
const maintenant = () => new Date().toISOString();
const copie = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

export async function hacher(mdp) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('expomanage:' + mdp));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let db = await charger();

async function charger() {
  try {
    const s = localStorage.getItem(CLE_DB);
    if (s) return JSON.parse(s);
  } catch { /* données illisibles : on repart des données de démonstration */ }
  const d = await donneesDemo(hacher);
  localStorage.setItem(CLE_DB, JSON.stringify(d));
  return d;
}

function sauver() {
  try { localStorage.setItem(CLE_DB, JSON.stringify(db)); }
  catch { throw new Error('Stockage du navigateur plein. Réinitialisez les données de démonstration.'); }
}

export async function reinitialiser() {
  localStorage.removeItem(CLE_DB);
  localStorage.removeItem(CLE_SESSION);
  await idb('clear');
  db = await charger();
}

// --- Fichiers (IndexedDB) ---
function idb(op, cle, valeur) {
  return new Promise((ok, ko) => {
    const req = indexedDB.open('expomanage-fichiers', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('fichiers');
    req.onerror = () => ko(req.error);
    req.onsuccess = () => {
      const st = req.result.transaction('fichiers', op === 'get' ? 'readonly' : 'readwrite').objectStore('fichiers');
      const q = op === 'get' ? st.get(cle) : op === 'put' ? st.put(valeur, cle) : st.clear();
      q.onsuccess = () => ok(q.result);
      q.onerror = () => ko(q.error);
    };
  });
}

const TYPES_IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const TYPES_JUSTIF = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

async function stockerFichier(fichier, types, maxMo) {
  if (!types.includes(fichier.type)) throw new Error('Format de fichier non accepté.');
  if (fichier.size > maxMo * 1024 * 1024) throw new Error(`Fichier trop lourd (${maxMo} Mo maximum).`);
  const id = 'idb:' + uid();
  await idb('put', id, fichier);
  return id;
}

const urlsCreees = new Map();
export async function urlFichier(chemin) {
  if (!chemin) return null;
  if (urlsCreees.has(chemin)) return urlsCreees.get(chemin);
  const blob = await idb('get', chemin);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlsCreees.set(chemin, url);
  return url;
}

/* ============================================================ Journal d'audit */

function journal(table, ligne, action, avant, apres) {
  db.journal_audit.push({
    id: db.journal_audit.length + 1, user_id: session()?.compte_id || null,
    table_nom: table, ligne_id: ligne, action, avant: copie(avant), apres: copie(apres), created_at: maintenant(),
  });
}

/* ============================================================ Session */

function session() {
  try { return JSON.parse(localStorage.getItem(CLE_SESSION)); } catch { return null; }
}
const ouvrirSession = (compte_id) => localStorage.setItem(CLE_SESSION, JSON.stringify({ compte_id, ouverte_le: maintenant() }));

const compteCourant = () => db.comptes.find((c) => c.id === session()?.compte_id) || null;
const exposantCourant = () => { const c = compteCourant(); return c ? db.exposants.find((e) => e.user_id === c.id) || null : null; };
const adminCourant = () => { const c = compteCourant(); return c ? db.admins.find((a) => a.user_id === c.id && a.actif) || null : null; };

function exigerExposant() {
  const e = exposantCourant();
  if (!e) throw new Error('Vous devez être connecté.');
  return e;
}
function exigerAdmin(role) {
  const a = adminCourant();
  if (!a) throw new Error('Action réservée aux administrateurs.');
  if (role === 'super_admin' && a.role !== 'super_admin') throw new Error('Action réservée au super administrateur.');
  return a;
}

/* ============================================================ Authentification */

const CHAMPS_PROFIL = ['nom', 'prenoms', 'entreprise', 'telephone_secondaire', 'whatsapp', 'email', 'ifu', 'rccm',
  'adresse', 'ville', 'secteur', 'description'];

function nettoyerProfil(p) {
  const o = {};
  for (const k of CHAMPS_PROFIL) if (k in p) o[k] = String(p[k] ?? '').trim() || null;
  return o;
}

export async function inscription(profil, motDePasse, logo) {
  const tel = normaliserTelephone(profil.telephone);
  if (!telephoneValide(tel)) throw new Error('Numéro de téléphone invalide.');
  if (!profil.nom?.trim() || !profil.prenoms?.trim() || !profil.entreprise?.trim())
    throw new Error('Nom, prénoms et entreprise sont obligatoires.');
  if (!motDePasse || motDePasse.length < 6) throw new Error('Le mot de passe doit contenir au moins 6 caractères.');
  if (db.comptes.some((c) => c.identifiant === tel)) throw new Error('Ce numéro a déjà un compte. Connectez-vous.');

  const logo_path = logo?.size ? await stockerFichier(logo, TYPES_IMAGE, 2) : null;
  const compte = { id: uid(), identifiant: tel, mdp_hash: await hacher(motDePasse), created_at: maintenant() };
  db.comptes.push(compte);

  // Profil créé auparavant par l'organisation avec ce numéro : on le rattache
  let e = db.exposants.find((x) => x.telephone === tel);
  if (e && e.user_id) throw new Error('Ce numéro est déjà utilisé par un autre compte.');
  if (e) {
    const avant = copie(e);
    Object.assign(e, Object.fromEntries(Object.entries(nettoyerProfil(profil)).filter(([, v]) => v != null)),
      { user_id: compte.id, updated_at: maintenant() }, logo_path ? { logo_path } : {});
    journal('exposants', e.id, 'UPDATE', avant, e);
  } else {
    e = {
      id: uid(), user_id: compte.id, telephone: tel, logo_path, notes_admin: null, actif: true,
      telephone_secondaire: null, whatsapp: null, email: null, ifu: null, rccm: null, adresse: null,
      ville: null, secteur: null, description: null,
      ...nettoyerProfil(profil), created_at: maintenant(), updated_at: maintenant(),
    };
    db.exposants.push(e);
    journal('exposants', e.id, 'INSERT', null, e);
  }
  sauver();
  ouvrirSession(compte.id);
  return copie(e);
}

export async function connexionExposant(telephone, motDePasse) {
  const tel = normaliserTelephone(telephone);
  const c = db.comptes.find((x) => x.identifiant === tel);
  if (!c || c.mdp_hash !== (await hacher(motDePasse)) || !db.exposants.some((e) => e.user_id === c.id))
    throw new Error('Numéro ou mot de passe incorrect.');
  ouvrirSession(c.id);
}

export async function connexionAdmin(email, motDePasse) {
  const c = db.comptes.find((x) => x.identifiant === String(email || '').trim().toLowerCase());
  if (!c || c.mdp_hash !== (await hacher(motDePasse)) || !db.admins.some((a) => a.user_id === c.id && a.actif))
    throw new Error('E-mail ou mot de passe incorrect.');
  ouvrirSession(c.id);
}

export async function deconnexion() { localStorage.removeItem(CLE_SESSION); }

export async function monProfil() { return copie(exposantCourant()); }
export async function monAdmin() { return copie(adminCourant()); }

export async function majMonProfil(champs, logo) {
  const e = exigerExposant();
  const p = nettoyerProfil(champs);
  if ('nom' in p && !p.nom) throw new Error('Le nom est obligatoire.');
  if ('prenoms' in p && !p.prenoms) throw new Error('Les prénoms sont obligatoires.');
  if ('entreprise' in p && !p.entreprise) throw new Error('Le nom de l\'entreprise est obligatoire.');
  const avant = copie(e);
  Object.assign(e, p, { updated_at: maintenant() });
  if (logo?.size) e.logo_path = await stockerFichier(logo, TYPES_IMAGE, 2);
  journal('exposants', e.id, 'UPDATE', avant, e);
  sauver();
  return copie(e);
}

export async function changerMotDePasse(ancien, nouveau) {
  const c = compteCourant();
  if (!c) throw new Error('Vous devez être connecté.');
  if (c.mdp_hash !== (await hacher(ancien))) throw new Error('Mot de passe actuel incorrect.');
  if (!nouveau || nouveau.length < 6) throw new Error('Le nouveau mot de passe doit contenir au moins 6 caractères.');
  c.mdp_hash = await hacher(nouveau);
  sauver();
}

/* ============================================================ Catalogue public */

export async function editionsOuvertes() {
  return copie(db.editions.filter((e) => e.statut === 'ouverte')
    .map((e) => ({ ...e, sites: db.sites.filter((s) => s.edition_id === e.id).sort((a, b) => a.ordre - b.ordre) })));
}

export async function tarifsEnVigueur(editionId) {
  const jour = aujourdhui();
  const ed = db.editions.find((e) => e.id === editionId);
  if (!ed || ed.statut === 'brouillon') return [];
  return db.tarifs
    .filter((t) => t.edition_id === editionId && t.date_debut <= jour && jour <= t.date_fin)
    .map((t) => {
      const s = db.sites.find((x) => x.id === t.site_id);
      const c = db.categories.find((x) => x.id === t.categorie_id);
      const f = db.familles.find((x) => x.id === c.famille_id);
      return c.actif ? {
        tarif_id: t.id, site_id: s.id, site_nom: s.nom, famille_nom: f.nom, famille_ordre: f.ordre,
        categorie_id: c.id, categorie_nom: c.nom, description: c.description, surface_m2: c.surface_m2,
        categorie_ordre: c.ordre, libelle: t.libelle, prix_unitaire: t.prix_unitaire, date_fin: t.date_fin,
        _site_ordre: s.ordre,
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a._site_ordre - b._site_ordre || a.famille_ordre - b.famille_ordre || a.categorie_ordre - b.categorie_ordre);
}

function contratVigueur(editionId) {
  return db.contrats
    .filter((c) => c.publie_le && c.actif && (c.edition_id === editionId || c.edition_id == null))
    .sort((a, b) => (a.edition_id == null) - (b.edition_id == null) || b.publie_le.localeCompare(a.publie_le))[0] || null;
}
export async function contratEnVigueur(editionId) { return copie(contratVigueur(editionId)); }

/* ============================================================ Demandes */

function recalculer(d) {
  d.montant_brut = d.prix_unitaire * d.quantite;
  d.montant_du = Math.max(0, d.montant_brut - (d.remise_montant || 0));
  if (d.statut !== 'annulee') {
    if (db.attributions.some((a) => a.demande_id === d.id)) d.statut = 'attribuee';
    else if (d.montant_du === 0 || db.paiements.some((p) => p.demande_id === d.id && p.statut === 'valide')) d.statut = 'validee';
    else d.statut = 'en_attente_paiement';
  }
  d.updated_at = maintenant();
}

// Équivalent de la vue v_demandes
function vue(d) {
  const e = db.exposants.find((x) => x.id === d.exposant_id);
  const ed = db.editions.find((x) => x.id === d.edition_id);
  const s = db.sites.find((x) => x.id === d.site_id);
  const c = db.categories.find((x) => x.id === d.categorie_id);
  const f = db.familles.find((x) => x.id === c.famille_id);
  const ps = db.paiements.filter((p) => p.demande_id === d.id);
  const encaisse = ps.filter((p) => p.statut === 'valide').reduce((t, p) => t + p.montant, 0);
  const rembourse = db.remboursements.filter((r) => r.demande_id === d.id).reduce((t, r) => t + r.montant, 0);
  const attente = ps.filter((p) => p.statut === 'en_attente');
  const att = db.attributions.filter((a) => a.demande_id === d.id).map((a) => a.code_stand).sort();
  const paye = encaisse - rembourse;
  return {
    ...copie(d),
    exposant_nom: `${e.nom} ${e.prenoms}`, entreprise: e.entreprise, telephone: e.telephone,
    edition_nom: ed.nom, site_nom: s.nom, categorie_nom: c.nom, famille_nom: f.nom,
    total_paye: paye,
    montant_en_attente: attente.reduce((t, p) => t + p.montant, 0),
    nb_paiements_en_attente: attente.length,
    reste_a_payer: d.montant_du - paye,
    statut_financier: paye > d.montant_du ? 'trop_percu' : paye === d.montant_du ? 'solde' : paye > 0 ? 'partiel' : 'non_paye',
    nb_attribues: att.length,
    stands_attribues: att.length ? att.join(', ') : null,
  };
}

export async function creerDemande({ edition_id, site_id, categorie_id, quantite, contrat_id, consentement, note, exposant_id }) {
  let exposant;
  if (exposant_id) { exigerAdmin(); exposant = db.exposants.find((e) => e.id === exposant_id); }
  else exposant = exposantCourant();
  if (!exposant) throw new Error('Complétez d\'abord votre profil exposant.');

  quantite = Number(quantite);
  if (!Number.isInteger(quantite) || quantite < 1) throw new Error('Le nombre de stands doit être au moins 1.');
  if (!consentement) throw new Error('Vous devez accepter le contrat d\'exploitation.');

  const ed = db.editions.find((e) => e.id === edition_id);
  if (!ed) throw new Error('Édition introuvable.');
  if (ed.statut !== 'ouverte' && !adminCourant()) throw new Error('Les inscriptions ne sont pas ouvertes pour cette édition.');
  if (!db.sites.some((s) => s.id === site_id && s.edition_id === edition_id)) throw new Error('Site invalide pour cette édition.');

  const jour = aujourdhui();
  const tarif = db.tarifs.find((t) => t.edition_id === edition_id && t.site_id === site_id && t.categorie_id === categorie_id
    && t.date_debut <= jour && jour <= t.date_fin);
  if (!tarif) throw new Error('Aucun tarif en vigueur aujourd\'hui pour cette catégorie.');

  const contrat = contratVigueur(edition_id);
  if (!contrat) throw new Error('Aucun contrat publié pour cette édition.');
  if (contrat.id !== contrat_id) throw new Error('Le contrat a été mis à jour. Veuillez relire et accepter la nouvelle version.');

  ed.dernier_numero += 1;
  const d = {
    id: uid(), numero: `${ed.prefixe}-${String(ed.dernier_numero).padStart(4, '0')}`,
    exposant_id: exposant.id, edition_id, site_id, categorie_id, quantite,
    tarif_id: tarif.id, tarif_libelle: tarif.libelle, prix_unitaire: tarif.prix_unitaire,
    montant_brut: 0, remise_montant: 0, remise_motif: null, montant_du: 0,
    statut: 'en_attente_paiement', motif_annulation: null, note_exposant: note?.trim() || null, notes_admin: null,
    cree_par: session()?.compte_id, created_at: maintenant(), updated_at: maintenant(),
  };
  recalculer(d);
  db.demandes.push(d);
  db.acceptations_contrat.push({
    id: uid(), demande_id: d.id, exposant_id: exposant.id, contrat_id: contrat.id, accepte_le: maintenant(),
    consentement: true, accepte_par: session()?.compte_id, adresse_ip: '(local)', navigateur: navigator.userAgent.slice(0, 300),
  });
  journal('demandes', d.id, 'INSERT', null, d);
  sauver();
  return vue(d);
}

function demandeAccessible(id) {
  const d = db.demandes.find((x) => x.id === id);
  if (!d) throw new Error('Demande introuvable.');
  if (!adminCourant() && d.exposant_id !== exposantCourant()?.id) throw new Error('Demande introuvable.');
  return d;
}

export async function mesDemandes() {
  const e = exigerExposant();
  return db.demandes.filter((d) => d.exposant_id === e.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).map(vue);
}

// Détail complet d'une demande (exposant propriétaire ou admin)
export async function detailDemande(id) {
  const d = demandeAccessible(id);
  const acc = db.acceptations_contrat.find((a) => a.demande_id === d.id) || null;
  const ed = db.editions.find((x) => x.id === d.edition_id);
  return {
    demande: vue(d),
    instructions_paiement: ed.instructions_paiement,
    paiements: copie(db.paiements.filter((p) => p.demande_id === d.id).sort((a, b) => b.created_at.localeCompare(a.created_at))),
    remboursements: copie(db.remboursements.filter((r) => r.demande_id === d.id)),
    attributions: copie(db.attributions.filter((a) => a.demande_id === d.id)),
    acceptation: copie(acc),
    contrat: copie(acc && db.contrats.find((c) => c.id === acc.contrat_id)),
  };
}

/* ============================================================ Paiements */

export async function declarerPaiement({ demande_id, montant, date_paiement, moyen, reference, commentaire }, justificatif) {
  const d = demandeAccessible(demande_id);
  const admin = adminCourant();
  if (!admin && d.statut === 'annulee') throw new Error('Cette demande est annulée.');
  montant = Number(montant);
  if (!Number.isInteger(montant) || montant <= 0) throw new Error('Indiquez un montant en FCFA (nombre entier positif).');
  if (!date_paiement) throw new Error('Indiquez la date du paiement.');
  if (date_paiement > aujourdhui()) throw new Error('La date du paiement ne peut pas être dans le futur.');
  if (!moyen) throw new Error('Indiquez le moyen de paiement.');
  if (!admin && !justificatif?.size) throw new Error('Joignez la capture d\'écran ou le justificatif du paiement.');

  const p = {
    id: uid(), demande_id, montant, date_paiement, moyen, reference: reference?.trim() || null,
    justificatif_path: justificatif?.size ? await stockerFichier(justificatif, TYPES_JUSTIF, 5) : null,
    origine: admin ? 'admin' : 'exposant', statut: 'en_attente', motif_rejet: null,
    commentaire: commentaire?.trim() || null, declare_par: session()?.compte_id,
    valide_par: null, valide_le: null, created_at: maintenant(), updated_at: maintenant(),
  };
  db.paiements.push(p);
  journal('paiements', p.id, 'INSERT', null, p);
  recalculer(d);
  sauver();
  return copie(p);
}

export async function paiementsEnAttente() {
  exigerAdmin();
  return db.paiements.filter((p) => p.statut === 'en_attente')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((p) => ({ ...copie(p), demande: vue(db.demandes.find((d) => d.id === p.demande_id)) }));
}

export async function traiterPaiement(id, statut, motif) {
  const admin = exigerAdmin();
  const p = db.paiements.find((x) => x.id === id);
  if (!p) throw new Error('Paiement introuvable.');
  if (p.statut === 'valide' && admin.role !== 'super_admin')
    throw new Error('Seul un super administrateur peut modifier un paiement déjà validé.');
  if (statut === 'rejete' && !motif?.trim()) throw new Error('Indiquez le motif du rejet.');
  const avant = copie(p);
  Object.assign(p, {
    statut, motif_rejet: statut === 'rejete' ? motif.trim() : null,
    valide_par: statut === 'en_attente' ? null : session()?.compte_id,
    valide_le: statut === 'en_attente' ? null : maintenant(), updated_at: maintenant(),
  });
  journal('paiements', p.id, 'UPDATE', avant, p);
  recalculer(db.demandes.find((d) => d.id === p.demande_id));
  sauver();
  return copie(p);
}
