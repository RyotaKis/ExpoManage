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
      nom: null, prenoms: null, entreprise: null, telephone_secondaire: null, whatsapp: null, email: null, ifu: null, rccm: null, adresse: null,
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
  return copie(db.editions.filter((e) => e.statut === 'ouverte').sort((a, b) => a.date_debut.localeCompare(b.date_debut))
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
    exposant_nom: [e.nom, e.prenoms].filter(Boolean).join(' '), entreprise: e.entreprise || e.telephone, telephone: e.telephone,
    edition_nom: ed.nom, edition_prefixe: ed.prefixe, edition_date_debut: ed.date_debut, site_nom: s.nom, categorie_nom: c.nom, famille_nom: f.nom,
    total_paye: paye,
    montant_en_attente: attente.reduce((t, p) => t + p.montant, 0),
    nb_paiements_en_attente: attente.length,
    reste_a_payer: d.montant_du - paye,
    statut_financier: paye > d.montant_du ? 'trop_percu' : paye === d.montant_du ? 'solde' : paye > 0 ? 'partiel' : 'non_paye',
    nb_attribues: att.length,
    stands_attribues: att.length ? att.join(', ') : null,
  };
}

export async function creerDemande({ edition_id, site_id, categorie_id, quantite, contrat_id, consentement, note, exposant_id, produits, equipements }) {
  let exposant;
  if (exposant_id) { exigerAdmin(); exposant = db.exposants.find((e) => e.id === exposant_id); }
  else exposant = exposantCourant();
  if (!exposant) throw new Error('Profil exposant introuvable.');
  if (!exposant.nom || !exposant.prenoms || !exposant.entreprise)
    throw new Error('Complétez vos informations (nom, prénoms, entreprise) avant de réserver.');
  if (!String(produits || '').trim()) throw new Error('Indiquez les produits ou services que vous proposerez sur votre stand.');

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
    produits: String(produits).trim(), equipements: equipements?.trim() || null,
    cree_par: session()?.compte_id, created_at: maintenant(), updated_at: maintenant(),
  };
  recalculer(d);
  db.demandes.push(d);
  db.acceptations_contrat.push({
    id: uid(), demande_id: d.id, exposant_id: exposant.id, contrat_id: contrat.id, accepte_le: maintenant(),
    consentement: true, accepte_par: session()?.compte_id, adresse_ip: '(local)', navigateur: navigator.userAgent.slice(0, 300),
    donnees: {
      numero: d.numero, nom: exposant.nom, prenoms: exposant.prenoms, entreprise: exposant.entreprise,
      telephone: exposant.telephone, adresse: exposant.adresse, ville: exposant.ville, ifu: exposant.ifu, rccm: exposant.rccm,
      edition: ed.nom, lieu: ed.lieu, date_debut: ed.date_debut, date_fin: ed.date_fin,
      site: db.sites.find((s) => s.id === site_id)?.nom, categorie: db.categories.find((c) => c.id === categorie_id)?.nom,
      quantite, prix_unitaire: tarif.prix_unitaire, montant: tarif.prix_unitaire * quantite,
      produits: d.produits, equipements: d.equipements, date: maintenant(),
    },
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

export async function declarerPaiement({ demande_id, montant, date_paiement, moyen, reference, commentaire, valider }, justificatif) {
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
  // Paiement saisi par un admin qui l'a constaté lui-même : directement validé
  if (admin && valider) Object.assign(p, { statut: 'valide', valide_par: session()?.compte_id, valide_le: maintenant() });
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

/* ============================================================ Administration */

const contient = (texte, q) => String(texte || '').toLowerCase().includes(q);
const editionParDefaut = () =>
  (db.editions.find((e) => e.statut === 'ouverte') || [...db.editions].sort((a, b) => b.date_debut.localeCompare(a.date_debut))[0])?.id;

export async function editions() {
  exigerAdmin();
  return copie([...db.editions].sort((a, b) => b.date_debut.localeCompare(a.date_debut))
    .map((e) => ({ ...e, sites: db.sites.filter((s) => s.edition_id === e.id).sort((a, b) => a.ordre - b.ordre) })));
}
export async function editionCourante() { exigerAdmin(); return editionParDefaut(); }

export async function catalogue() {
  exigerAdmin();
  return copie({
    familles: [...db.familles].sort((a, b) => a.ordre - b.ordre),
    categories: [...db.categories].sort((a, b) => a.ordre - b.ordre),
  });
}

export async function compteurs() {
  if (!adminCourant()) return { paiements_en_attente: 0 };
  return { paiements_en_attente: db.paiements.filter((p) => p.statut === 'en_attente').length };
}

export async function tableauDeBord(editionId) {
  exigerAdmin();
  const ds = db.demandes.filter((d) => d.edition_id === editionId).map(vue);
  const actives = ds.filter((d) => d.statut !== 'annulee');
  const ed = db.editions.find((e) => e.id === editionId);
  const somme = (l, k) => l.reduce((t, x) => t + x[k], 0);
  const parCategorie = db.categories.map((c) => {
    const l = actives.filter((d) => d.categorie_id === c.id);
    return {
      categorie: c.nom, famille: db.familles.find((f) => f.id === c.famille_id).nom,
      demandes: l.length, exposants: new Set(l.map((d) => d.exposant_id)).size,
      stands_demandes: somme(l, 'quantite'), stands_attribues: somme(l, 'nb_attribues'),
      attendu: somme(l, 'montant_du'), encaisse: somme(l, 'total_paye'),
    };
  });
  const paiementsAttente = db.paiements.filter((p) => p.statut === 'en_attente'
    && db.demandes.find((d) => d.id === p.demande_id)?.edition_id === editionId);
  const debut = ed ? new Date(Date.now() - 7 * 864e5).toISOString() : null;
  return {
    exposants_total: db.exposants.length,
    exposants_edition: new Set(actives.map((d) => d.exposant_id)).size,
    nouveaux_7j: db.exposants.filter((e) => e.created_at >= debut).length,
    demandes: ds.length,
    demandes_par_statut: Object.fromEntries(['en_attente_paiement', 'validee', 'attribuee', 'annulee']
      .map((s) => [s, ds.filter((d) => d.statut === s).length])),
    stands_demandes: somme(actives, 'quantite'),
    stands_attribues: somme(actives, 'nb_attribues'),
    montant_attendu: somme(actives, 'montant_du'),
    montant_encaisse: somme(actives, 'total_paye'),
    montant_restant: actives.reduce((t, d) => t + Math.max(0, d.reste_a_payer), 0),
    paiements_en_attente: paiementsAttente.length,
    montant_en_attente: somme(paiementsAttente, 'montant'),
    par_categorie: parCategorie,
  };
}

/* ---------- Demandes ---------- */

export async function listeDemandes(f = {}) {
  exigerAdmin();
  const q = (f.q || '').trim().toLowerCase();
  const qtel = q.replace(/\D/g, '');
  return db.demandes.map(vue).filter((d) =>
    (!f.edition_id || d.edition_id === f.edition_id) &&
    (!f.categorie_id || d.categorie_id === f.categorie_id) &&
    (!f.famille || d.famille_nom === f.famille) &&
    (!f.statut || d.statut === f.statut) &&
    (!f.statut_financier || (f.statut_financier === 'impaye' ? d.reste_a_payer > 0 && d.statut !== 'annulee' : d.statut_financier === f.statut_financier)) &&
    (!q || contient(d.numero, q) || contient(d.exposant_nom, q) || contient(d.entreprise, q) || (qtel.length >= 4 && d.telephone.includes(qtel))))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function majDemande(id, champs) {
  const admin = exigerAdmin();
  const d = db.demandes.find((x) => x.id === id);
  if (!d) throw new Error('Demande introuvable.');
  const avant = copie(d);
  if ('quantite' in champs) {
    const q = Number(champs.quantite);
    if (!Number.isInteger(q) || q < 1) throw new Error('Nombre de stands invalide.');
    if (q < db.attributions.filter((a) => a.demande_id === id).length) throw new Error('Retirez d\'abord des stands attribués.');
    d.quantite = q;
  }
  if ('categorie_id' in champs && champs.categorie_id !== d.categorie_id) {
    if (!db.categories.some((c) => c.id === champs.categorie_id)) throw new Error('Catégorie invalide.');
    d.categorie_id = champs.categorie_id;
  }
  if ('prix_unitaire' in champs) {
    const p = Number(champs.prix_unitaire);
    if (!Number.isInteger(p) || p < 0) throw new Error('Prix unitaire invalide.');
    if (p !== d.prix_unitaire) { d.prix_unitaire = p; d.tarif_libelle = champs.tarif_libelle || 'Prix ajusté par l\'administration'; d.tarif_id = null; }
  }
  if ('remise_montant' in champs) {
    if (admin.role !== 'super_admin') throw new Error('Seul le super administrateur peut accorder une remise.');
    const r = Number(champs.remise_montant);
    if (!Number.isInteger(r) || r < 0) throw new Error('Remise invalide.');
    if (r > 0 && !champs.remise_motif?.trim()) throw new Error('Indiquez le motif de la remise.');
    d.remise_montant = r;
    d.remise_motif = r > 0 ? champs.remise_motif.trim() : null;
  }
  if ('notes_admin' in champs) d.notes_admin = champs.notes_admin?.trim() || null;
  recalculer(d);
  journal('demandes', d.id, 'UPDATE', avant, d);
  sauver();
  return vue(d);
}

export async function annulerDemande(id, motif) {
  exigerAdmin();
  const d = db.demandes.find((x) => x.id === id);
  if (!motif?.trim()) throw new Error('Indiquez le motif de l\'annulation.');
  const avant = copie(d);
  d.statut = 'annulee';
  d.motif_annulation = motif.trim();
  recalculer(d);
  journal('demandes', d.id, 'UPDATE', avant, d);
  sauver();
}

export async function retablirDemande(id) {
  exigerAdmin();
  const d = db.demandes.find((x) => x.id === id);
  const avant = copie(d);
  d.statut = 'en_attente_paiement';
  d.motif_annulation = null;
  recalculer(d);
  journal('demandes', d.id, 'UPDATE', avant, d);
  sauver();
}

export async function supprimerDemande(id) {
  exigerAdmin('super_admin');
  const d = db.demandes.find((x) => x.id === id);
  if (db.paiements.some((p) => p.demande_id === id)) throw new Error('Cette demande a des paiements : annulez-la plutôt que de la supprimer.');
  db.demandes = db.demandes.filter((x) => x.id !== id);
  db.acceptations_contrat = db.acceptations_contrat.filter((a) => a.demande_id !== id);
  db.attributions = db.attributions.filter((a) => a.demande_id !== id);
  journal('demandes', id, 'DELETE', d, null);
  sauver();
}

/* ---------- Paiements, remboursements ---------- */

export async function modifierPaiement(id, champs) {
  const admin = exigerAdmin();
  const p = db.paiements.find((x) => x.id === id);
  if (!p) throw new Error('Paiement introuvable.');
  if (p.statut === 'valide' && admin.role !== 'super_admin')
    throw new Error('Seul un super administrateur peut modifier un paiement déjà validé.');
  const avant = copie(p);
  if ('montant' in champs) {
    const m = Number(champs.montant);
    if (!Number.isInteger(m) || m <= 0) throw new Error('Montant invalide.');
    p.montant = m;
  }
  if ('date_paiement' in champs) {
    if (!champs.date_paiement || champs.date_paiement > aujourdhui()) throw new Error('Date invalide.');
    p.date_paiement = champs.date_paiement;
  }
  if ('moyen' in champs) p.moyen = champs.moyen;
  if ('reference' in champs) p.reference = champs.reference?.trim() || null;
  if ('commentaire' in champs) p.commentaire = champs.commentaire?.trim() || null;
  p.updated_at = maintenant();
  journal('paiements', p.id, 'UPDATE', avant, p);
  recalculer(db.demandes.find((d) => d.id === p.demande_id));
  sauver();
  return copie(p);
}

export async function supprimerPaiement(id) {
  exigerAdmin('super_admin');
  const p = db.paiements.find((x) => x.id === id);
  db.paiements = db.paiements.filter((x) => x.id !== id);
  journal('paiements', id, 'DELETE', p, null);
  recalculer(db.demandes.find((d) => d.id === p.demande_id));
  sauver();
}

export async function listePaiements(f = {}) {
  exigerAdmin();
  return db.paiements
    .map((p) => ({ ...copie(p), demande: vue(db.demandes.find((d) => d.id === p.demande_id)) }))
    .filter((p) => (!f.edition_id || p.demande.edition_id === f.edition_id) && (!f.statut || p.statut === f.statut))
    .sort((a, b) => b.date_paiement.localeCompare(a.date_paiement) || b.created_at.localeCompare(a.created_at));
}

export async function enregistrerRemboursement({ demande_id, montant, date_remboursement, moyen, motif }) {
  exigerAdmin();
  const d = db.demandes.find((x) => x.id === demande_id);
  montant = Number(montant);
  if (!Number.isInteger(montant) || montant <= 0) throw new Error('Montant invalide.');
  if (!date_remboursement || !moyen) throw new Error('Indiquez la date et le moyen.');
  if (!motif?.trim()) throw new Error('Indiquez le motif du remboursement.');
  if (montant > vue(d).total_paye) throw new Error('Le remboursement dépasse le montant payé.');
  const r = { id: uid(), demande_id, montant, date_remboursement, moyen, motif: motif.trim(), justificatif_path: null,
    effectue_par: session()?.compte_id, created_at: maintenant() };
  db.remboursements.push(r);
  journal('remboursements', r.id, 'INSERT', null, r);
  recalculer(d);
  sauver();
}

/* ---------- Attributions ---------- */

export async function attribuer(demande_id, code_stand, zone) {
  exigerAdmin();
  const d = db.demandes.find((x) => x.id === demande_id);
  const code = String(code_stand || '').trim().toUpperCase();
  if (!code) throw new Error('Indiquez le code du stand.');
  if (d.statut === 'annulee') throw new Error('Cette demande est annulée.');
  const pris = db.attributions.find((a) => a.code_stand === code && a.demande_id !== demande_id && (() => {
    const o = db.demandes.find((x) => x.id === a.demande_id);
    return o.site_id === d.site_id && o.statut !== 'annulee';
  })());
  if (pris) throw new Error(`Le stand ${code} est déjà attribué à la demande ${db.demandes.find((x) => x.id === pris.demande_id).numero}.`);
  const nb = db.attributions.filter((a) => a.demande_id === demande_id);
  if (nb.some((a) => a.code_stand === code)) throw new Error('Stand déjà attribué à cette demande.');
  if (nb.length >= d.quantite) throw new Error(`Cette demande a déjà ses ${d.quantite} stand(s) attribué(s).`);
  const a = { id: uid(), demande_id, code_stand: code, zone: zone?.trim() || null, attribue_par: session()?.compte_id, created_at: maintenant() };
  db.attributions.push(a);
  journal('attributions', a.id, 'INSERT', null, a);
  recalculer(d);
  sauver();
}

export async function retirerAttribution(id) {
  exigerAdmin();
  const a = db.attributions.find((x) => x.id === id);
  db.attributions = db.attributions.filter((x) => x.id !== id);
  journal('attributions', id, 'DELETE', a, null);
  recalculer(db.demandes.find((d) => d.id === a.demande_id));
  sauver();
}

/* ---------- Exposants ---------- */

export async function listeExposants(f = {}) {
  exigerAdmin();
  const q = (f.q || '').trim().toLowerCase();
  const qtel = q.replace(/\D/g, '');
  return db.exposants.filter((e) => !q || contient(`${e.nom} ${e.prenoms}`, q) || contient(`${e.prenoms} ${e.nom}`, q)
      || contient(e.entreprise, q) || (qtel.length >= 4 && e.telephone.includes(qtel)))
    .map((e) => {
      const ds = db.demandes.filter((d) => d.exposant_id === e.id).map(vue);
      const actives = ds.filter((d) => d.statut !== 'annulee');
      return {
        ...copie(e), a_un_compte: !!e.user_id,
        nb_demandes: ds.length,
        nb_editions: new Set(actives.map((d) => d.edition_id)).size,
        nb_stands: actives.reduce((t, d) => t + d.quantite, 0),
        editions: [...new Set(ds.map((d) => d.edition_nom))].join(', '),
        montant_du: actives.reduce((t, d) => t + d.montant_du, 0),
        total_paye: actives.reduce((t, d) => t + d.total_paye, 0),
        reste_a_payer: actives.reduce((t, d) => t + Math.max(0, d.reste_a_payer), 0),
      };
    })
    .sort((a, b) => (a.entreprise || '~').localeCompare(b.entreprise || '~', 'fr'));
}

export async function ficheExposant(id) {
  exigerAdmin();
  const e = db.exposants.find((x) => x.id === id);
  if (!e) throw new Error('Exposant introuvable.');
  return {
    exposant: { ...copie(e), a_un_compte: !!e.user_id },
    demandes: db.demandes.filter((d) => d.exposant_id === id).map(vue).sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}

export async function creerExposant(profil, logo) {
  exigerAdmin();
  const tel = normaliserTelephone(profil.telephone);
  if (!telephoneValide(tel)) throw new Error('Numéro de téléphone invalide.');
  if (db.exposants.some((e) => e.telephone === tel)) throw new Error('Un exposant existe déjà avec ce numéro.');
  if (!profil.nom?.trim() || !profil.prenoms?.trim() || !profil.entreprise?.trim())
    throw new Error('Nom, prénoms et entreprise sont obligatoires.');
  const e = {
    id: uid(), user_id: null, telephone: tel, logo_path: logo?.size ? await stockerFichier(logo, TYPES_IMAGE, 2) : null,
    actif: true, telephone_secondaire: null, whatsapp: null, email: null, ifu: null, rccm: null, adresse: null,
    ville: null, secteur: null, description: null, ...nettoyerProfil(profil),
    notes_admin: profil.notes_admin?.trim() || null, created_at: maintenant(), updated_at: maintenant(),
  };
  db.exposants.push(e);
  journal('exposants', e.id, 'INSERT', null, e);
  sauver();
  return copie(e);
}

export async function majExposant(id, champs, logo) {
  exigerAdmin();
  const e = db.exposants.find((x) => x.id === id);
  const avant = copie(e);
  const p = nettoyerProfil(champs);
  if (!p.nom || !p.prenoms || !p.entreprise) throw new Error('Nom, prénoms et entreprise sont obligatoires.');
  if ('telephone' in champs) {
    const tel = normaliserTelephone(champs.telephone);
    if (!telephoneValide(tel)) throw new Error('Numéro de téléphone invalide.');
    if (tel !== e.telephone) {
      if (db.exposants.some((x) => x.telephone === tel && x.id !== id)) throw new Error('Ce numéro est déjà utilisé par un autre exposant.');
      if (db.comptes.some((c) => c.identifiant === tel)) throw new Error('Ce numéro est déjà l\'identifiant d\'un autre compte.');
      const compte = db.comptes.find((c) => c.id === e.user_id);
      if (compte) compte.identifiant = tel;   // l'exposant se connectera avec le nouveau numéro
      e.telephone = tel;
    }
  }
  Object.assign(e, p, { notes_admin: champs.notes_admin?.trim() || null, updated_at: maintenant() });
  if ('actif' in champs) e.actif = !!champs.actif;
  if (logo?.size) e.logo_path = await stockerFichier(logo, TYPES_IMAGE, 2);
  journal('exposants', e.id, 'UPDATE', avant, e);
  sauver();
  return copie(e);
}

export async function reinitialiserMotDePasse(exposantId, nouveau) {
  exigerAdmin();
  const e = db.exposants.find((x) => x.id === exposantId);
  const c = db.comptes.find((x) => x.id === e?.user_id);
  if (!c) throw new Error('Cet exposant n\'a pas encore de compte : il doit s\'inscrire avec son numéro.');
  if (!nouveau || nouveau.length < 6) throw new Error('6 caractères minimum.');
  c.mdp_hash = await hacher(nouveau);
  journal('comptes', c.id, 'UPDATE', null, { reinitialisation_mot_de_passe: true });
  sauver();
}

export async function supprimerExposant(id) {
  exigerAdmin('super_admin');
  if (db.demandes.some((d) => d.exposant_id === id)) throw new Error('Cet exposant a des demandes : désactivez-le plutôt.');
  const e = db.exposants.find((x) => x.id === id);
  db.exposants = db.exposants.filter((x) => x.id !== id);
  if (e.user_id) db.comptes = db.comptes.filter((c) => c.id !== e.user_id);
  journal('exposants', id, 'DELETE', e, null);
  sauver();
}

/* ---------- Configuration (super admin) ---------- */

function majOuCree(table, champs, valider) {
  exigerAdmin('super_admin');
  const existant = champs.id && db[table].find((x) => x.id === champs.id);
  const ligne = existant || { id: uid(), created_at: maintenant() };
  const avant = copie(existant);
  const nouveau = { ...ligne, ...champs, id: ligne.id };
  valider?.(nouveau);
  if (existant) Object.assign(existant, nouveau); else db[table].push(nouveau);
  journal(table, nouveau.id, existant ? 'UPDATE' : 'INSERT', avant, nouveau);
  sauver();
  return copie(nouveau);
}

export async function enregistrerEdition(champs) {
  return majOuCree('editions', champs, (e) => {
    if (!e.nom?.trim() || !e.prefixe?.trim()) throw new Error('Nom et préfixe obligatoires.');
    e.prefixe = e.prefixe.trim().toUpperCase();
    if (db.editions.some((x) => x.prefixe === e.prefixe && x.id !== e.id)) throw new Error('Ce préfixe est déjà utilisé.');
    if (!e.date_debut || !e.date_fin || e.date_fin < e.date_debut) throw new Error('Dates invalides.');
    e.dernier_numero ??= 0;
    e.statut ??= 'brouillon';
    if (!db.sites.some((s) => s.edition_id === e.id)) db.sites.push({ id: uid(), edition_id: e.id, nom: 'Site principal', ordre: 1 });
  });
}

export async function enregistrerSite(champs) {
  return majOuCree('sites', champs, (s) => {
    if (!s.nom?.trim()) throw new Error('Nom du site obligatoire.');
    if (db.sites.some((x) => x.edition_id === s.edition_id && x.nom === s.nom && x.id !== s.id)) throw new Error('Ce site existe déjà.');
    s.ordre = Number(s.ordre) || 1;
  });
}

export async function enregistrerCategorie(champs) {
  return majOuCree('categories', champs, (c) => {
    if (!c.nom?.trim() || !c.famille_id) throw new Error('Nom et famille obligatoires.');
    c.surface_m2 = c.surface_m2 === '' || c.surface_m2 == null ? null : Number(c.surface_m2);
    c.ordre = Number(c.ordre) || 1;
    c.actif = c.actif !== false;
  });
}

export async function listeTarifs(editionId) {
  exigerAdmin();
  return copie(db.tarifs.filter((t) => t.edition_id === editionId)
    .sort((a, b) => a.categorie_id.localeCompare(b.categorie_id) || a.date_debut.localeCompare(b.date_debut)));
}

export async function enregistrerTarif(champs) {
  return majOuCree('tarifs', champs, (t) => {
    t.prix_unitaire = Number(t.prix_unitaire);
    if (!Number.isInteger(t.prix_unitaire) || t.prix_unitaire < 0) throw new Error('Prix invalide.');
    if (!t.libelle?.trim()) throw new Error('Libellé obligatoire.');
    if (!t.date_debut || !t.date_fin || t.date_fin < t.date_debut) throw new Error('Période invalide.');
    const chevauche = db.tarifs.find((x) => x.id !== t.id && x.site_id === t.site_id && x.categorie_id === t.categorie_id
      && x.date_debut <= t.date_fin && t.date_debut <= x.date_fin);
    if (chevauche) throw new Error(`Cette période chevauche « ${chevauche.libelle} » (${chevauche.date_debut} → ${chevauche.date_fin}).`);
  });
}

export async function supprimerTarif(id) {
  exigerAdmin('super_admin');
  const t = db.tarifs.find((x) => x.id === id);
  db.tarifs = db.tarifs.filter((x) => x.id !== id);
  for (const d of db.demandes) if (d.tarif_id === id) d.tarif_id = null;   // les demandes gardent leur prix figé
  journal('tarifs', id, 'DELETE', t, null);
  sauver();
}

export async function listeContrats(editionId) {
  exigerAdmin();
  return copie(db.contrats.filter((c) => c.edition_id === editionId || c.edition_id == null)
    .map((c) => ({ ...c, nb_acceptations: db.acceptations_contrat.filter((a) => a.contrat_id === c.id).length }))
    .sort((a, b) => b.version - a.version));
}

export async function enregistrerContrat(champs) {
  return majOuCree('contrats', champs, (c) => {
    const avant = db.contrats.find((x) => x.id === c.id);
    if (avant?.publie_le) throw new Error('Un contrat publié ne peut pas être modifié. Créez une nouvelle version.');
    if (!c.titre?.trim() || !c.contenu?.trim()) throw new Error('Titre et texte obligatoires.');
    c.version ??= Math.max(0, ...db.contrats.filter((x) => x.edition_id === c.edition_id).map((x) => x.version)) + 1;
    c.publie_le = null;
    c.actif = true;
  });
}

export async function publierContrat(id) {
  exigerAdmin('super_admin');
  const c = db.contrats.find((x) => x.id === id);
  if (c.publie_le) throw new Error('Déjà publié.');
  const avant = copie(c);
  c.publie_le = maintenant();
  journal('contrats', c.id, 'UPDATE', avant, c);
  sauver();
}

/* ---------- Utilisateurs administrateurs ---------- */

export async function listeAdmins() {
  exigerAdmin('super_admin');
  return db.admins.map((a) => ({ ...copie(a), email: db.comptes.find((c) => c.id === a.user_id)?.identifiant }));
}

export async function creerAdmin({ email, nom, role, mot_de_passe }) {
  exigerAdmin('super_admin');
  email = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('E-mail invalide.');
  if (!nom?.trim()) throw new Error('Nom obligatoire.');
  if (!mot_de_passe || mot_de_passe.length < 8) throw new Error('Mot de passe : 8 caractères minimum.');
  if (db.comptes.some((c) => c.identifiant === email)) throw new Error('Cet e-mail a déjà un compte.');
  const c = { id: uid(), identifiant: email, mdp_hash: await hacher(mot_de_passe), created_at: maintenant() };
  const a = { user_id: c.id, nom: nom.trim(), role: role === 'super_admin' ? 'super_admin' : 'gestionnaire', actif: true, created_at: maintenant() };
  db.comptes.push(c);
  db.admins.push(a);
  journal('admins', c.id, 'INSERT', null, a);
  sauver();
}

export async function majAdmin(userId, { role, actif }) {
  const moi = exigerAdmin('super_admin');
  const a = db.admins.find((x) => x.user_id === userId);
  if (userId === moi.user_id && (actif === false || role === 'gestionnaire')) throw new Error('Vous ne pouvez pas retirer vos propres droits.');
  const avant = copie(a);
  if (role) a.role = role;
  if (actif !== undefined) a.actif = actif;
  journal('admins', userId, 'UPDATE', avant, a);
  sauver();
}

export async function journalAudit(f = {}) {
  exigerAdmin('super_admin');
  const noms = new Map(db.admins.map((a) => [a.user_id, a.nom]));
  for (const e of db.exposants) if (e.user_id) noms.set(e.user_id, `${e.prenoms} ${e.nom} (exposant)`);
  return db.journal_audit
    .filter((j) => (!f.table || j.table_nom === f.table) && (!f.ligne_id || j.ligne_id === f.ligne_id))
    .slice(-500).reverse().map((j) => ({ ...copie(j), auteur: noms.get(j.user_id) || '—' }));
}
