// Couche de données SUPABASE : même interface et mêmes formes d'objets que api-local.js.
// Les règles de sécurité et de calcul sont dans la base (supabase/migrations/*.sql) ;
// ce fichier ne fait que lire, écrire et mettre en forme.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, DOMAINE_IDENTIFIANT } from './config.js';
import { normaliserTelephone, telephoneValide, aujourdhui } from './ui.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'fenou-expo-auth' },
});

/* ============================================================ Outils */

// Messages d'erreur lisibles
function message(err) {
  const m = err?.message || String(err);
  const code = err?.code;
  if (/Invalid login credentials/i.test(m)) return 'Identifiant ou mot de passe incorrect.';
  if (/already registered|already exists/i.test(m)) return 'Ce numéro a déjà un compte. Connectez-vous.';
  if (/Email not confirmed/i.test(m)) return 'Compte non confirmé. Contactez l\'organisation.';
  if (/Password should be/i.test(m)) return 'Mot de passe trop court.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Connexion Internet indisponible. Réessayez.';
  if (code === '23P01') return 'Cette période chevauche un autre tarif de la même catégorie.';
  if (code === '23503') return 'Suppression impossible : des éléments y sont rattachés (paiements, demandes…). Annulez ou désactivez plutôt.';
  if (code === '23505') {
    if (/une_seule_edition_ouverte/.test(m)) return 'Une autre édition est déjà ouverte aux inscriptions. Fermez-la d\'abord.';
    if (/prefixe/.test(m)) return 'Ce préfixe est déjà utilisé.';
    if (/telephone/.test(m)) return 'Un exposant existe déjà avec ce numéro.';
    if (/attributions/.test(m)) return 'Stand déjà attribué à cette demande.';
    return 'Cet élément existe déjà.';
  }
  if (/row-level security|permission denied/i.test(m)) return 'Action non autorisée.';
  return m;
}

// Exécute une requête Supabase et renvoie ses données, ou lève une erreur lisible
async function q(requete) {
  const { data, error } = await requete;
  if (error) throw new Error(message(error));
  return data;
}

const identifiant = (tel) => `${tel}@${DOMAINE_IDENTIFIANT}`;
const nettoyer = (v) => (v == null ? null : String(v).trim() || null);
const CHAMPS_PROFIL = ['nom', 'prenoms', 'entreprise', 'telephone_secondaire', 'whatsapp', 'email', 'ifu', 'rccm',
  'adresse', 'ville', 'secteur', 'description'];
function nettoyerProfil(p) {
  const o = {};
  for (const k of CHAMPS_PROFIL) if (k in p) o[k] = nettoyer(p[k]);
  return o;
}

async function utilisateur() {
  const { data } = await sb.auth.getSession();
  return data.session?.user || null;
}

/* ============================================================ Fichiers */

const TYPES_IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const TYPES_JUSTIF = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

// Chemin stocké en base : "<bucket>/<id du compte>/<fichier>"
async function stockerFichier(bucket, fichier, types, maxMo) {
  if (!types.includes(fichier.type)) throw new Error('Format de fichier non accepté.');
  if (fichier.size > maxMo * 1024 * 1024) throw new Error(`Fichier trop lourd (${maxMo} Mo maximum).`);
  const u = await utilisateur();
  if (!u) throw new Error('Vous devez être connecté.');
  const ext = (fichier.name?.split('.').pop() || fichier.type.split('/')[1] || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const chemin = `${u.id}/${crypto.randomUUID()}.${ext}`;
  await q(sb.storage.from(bucket).upload(chemin, fichier, { contentType: fichier.type, upsert: false }));
  return `${bucket}/${chemin}`;
}

const urls = new Map();
export async function urlFichier(chemin) {
  if (!chemin) return null;
  if (urls.has(chemin)) return urls.get(chemin);
  const [bucket, ...reste] = chemin.split('/');
  const objet = reste.join('/');
  let url = null;
  if (bucket === 'justificatifs') {
    const { data } = await sb.storage.from(bucket).createSignedUrl(objet, 3600);
    url = data?.signedUrl || null;
  } else {
    url = sb.storage.from(bucket).getPublicUrl(objet).data.publicUrl;
  }
  if (url) urls.set(chemin, url);
  return url;
}

/* ============================================================ Session et profil */

export async function inscription(profil, motDePasse, logo) {
  const tel = normaliserTelephone(profil.telephone);
  if (!telephoneValide(tel)) throw new Error('Numéro de téléphone invalide.');
  if (!profil.nom?.trim() || !profil.prenoms?.trim() || !profil.entreprise?.trim())
    throw new Error('Nom, prénoms et entreprise sont obligatoires.');
  if (!motDePasse || motDePasse.length < 6) throw new Error('Le mot de passe doit contenir au moins 6 caractères.');

  const email = identifiant(tel);
  let { data, error } = await sb.auth.signUp({ email, password: motDePasse });
  if (error && /already registered|already exists/i.test(error.message)) {
    // Compte créé lors d'une tentative précédente interrompue : on reprend si le mot de passe est le bon
    ({ data, error } = await sb.auth.signInWithPassword({ email, password: motDePasse }));
    if (error) throw new Error('Ce numéro a déjà un compte. Connectez-vous.');
    const existant = await q(sb.from('exposants').select('id').eq('user_id', data.user.id).maybeSingle());
    if (existant) throw new Error('Ce numéro a déjà un compte. Connectez-vous.');
  } else if (error) throw new Error(message(error));
  if (!data.session) throw new Error('Compte créé mais en attente de confirmation. Contactez l\'organisation.');

  const e = await q(sb.rpc('inscrire_exposant', { p: { ...nettoyerProfil(profil), telephone: tel } }));
  if (logo?.size) {
    const logo_path = await stockerFichier('logos', logo, TYPES_IMAGE, 2);
    return q(sb.from('exposants').update({ logo_path }).eq('id', e.id).select().single());
  }
  return e;
}

export async function connexionExposant(telephone, motDePasse) {
  const tel = normaliserTelephone(telephone);
  const { data, error } = await sb.auth.signInWithPassword({ email: identifiant(tel || ''), password: motDePasse || '' });
  if (error) throw new Error(/Invalid login/i.test(error.message) ? 'Numéro ou mot de passe incorrect.' : message(error));
  const e = await q(sb.from('exposants').select('id').eq('user_id', data.user.id).maybeSingle());
  if (!e) { await sb.auth.signOut(); throw new Error('Numéro ou mot de passe incorrect.'); }
}

export async function connexionAdmin(email, motDePasse) {
  const { data, error } = await sb.auth.signInWithPassword({ email: String(email || '').trim().toLowerCase(), password: motDePasse || '' });
  if (error) throw new Error(/Invalid login/i.test(error.message) ? 'E-mail ou mot de passe incorrect.' : message(error));
  const a = await q(sb.from('admins').select('user_id').eq('user_id', data.user.id).eq('actif', true).maybeSingle());
  if (!a) { await sb.auth.signOut(); throw new Error('E-mail ou mot de passe incorrect.'); }
}

export async function deconnexion() { await sb.auth.signOut(); }

export async function monProfil() {
  const u = await utilisateur();
  if (!u) return null;
  return q(sb.from('exposants').select('*').eq('user_id', u.id).maybeSingle());
}

let cacheAdmin = null;
export async function monAdmin() {
  const u = await utilisateur();
  if (!u) return null;
  if (cacheAdmin?.user_id === u.id) return cacheAdmin;
  cacheAdmin = await q(sb.from('admins').select('*').eq('user_id', u.id).eq('actif', true).maybeSingle());
  return cacheAdmin;
}
async function exigerAdmin(role) {
  const a = await monAdmin();
  if (!a) throw new Error('Action réservée aux administrateurs.');
  if (role === 'super_admin' && a.role !== 'super_admin') throw new Error('Action réservée au super administrateur.');
  return a;
}

export async function majMonProfil(champs, logo) {
  const e = await monProfil();
  if (!e) throw new Error('Vous devez être connecté.');
  const p = nettoyerProfil(champs);
  if ('nom' in p && !p.nom) throw new Error('Le nom est obligatoire.');
  if ('prenoms' in p && !p.prenoms) throw new Error('Les prénoms sont obligatoires.');
  if ('entreprise' in p && !p.entreprise) throw new Error('Le nom de l\'entreprise est obligatoire.');
  if (logo?.size) p.logo_path = await stockerFichier('logos', logo, TYPES_IMAGE, 2);
  return q(sb.from('exposants').update(p).eq('id', e.id).select().single());
}

export async function changerMotDePasse(ancien, nouveau) {
  const u = await utilisateur();
  if (!u) throw new Error('Vous devez être connecté.');
  const { error } = await sb.auth.signInWithPassword({ email: u.email, password: ancien || '' });
  if (error) throw new Error('Mot de passe actuel incorrect.');
  if (!nouveau || nouveau.length < 6) throw new Error('Le nouveau mot de passe doit contenir au moins 6 caractères.');
  await q(sb.auth.updateUser({ password: nouveau }));
}

/* ============================================================ Catalogue public */

export async function editionsOuvertes() {
  const eds = await q(sb.from('editions').select('*, sites(*)').eq('statut', 'ouverte'));
  for (const e of eds) e.sites.sort((a, b) => a.ordre - b.ordre);
  return eds;
}

export async function tarifsEnVigueur(editionId) {
  return q(sb.rpc('tarifs_en_vigueur', { p_edition: editionId }));
}

export async function contratEnVigueur(editionId) {
  const c = await q(sb.rpc('contrat_en_vigueur', { p_edition: editionId }));
  return c?.id ? c : null;
}

/* ============================================================ Demandes (exposant) */

export async function creerDemande({ edition_id, site_id, categorie_id, quantite, contrat_id, consentement, note, exposant_id }) {
  quantite = Number(quantite);
  if (!Number.isInteger(quantite) || quantite < 1) throw new Error('Le nombre de stands doit être au moins 1.');
  if (!consentement) throw new Error('Vous devez accepter le contrat d\'exploitation.');
  const d = await q(sb.rpc('creer_demande', {
    p_edition: edition_id, p_site: site_id, p_categorie: categorie_id, p_quantite: quantite,
    p_contrat: contrat_id, p_consentement: true, p_note: note || null, p_exposant: exposant_id || null,
  }));
  return q(sb.from('v_demandes').select('*').eq('id', d.id).single());
}

export async function mesDemandes() {
  const e = await monProfil();
  if (!e) throw new Error('Vous devez être connecté.');
  return q(sb.from('v_demandes').select('*').eq('exposant_id', e.id).order('created_at', { ascending: false }));
}

export async function detailDemande(id) {
  const demande = await q(sb.from('v_demandes').select('*').eq('id', id).maybeSingle());
  if (!demande) throw new Error('Demande introuvable.');
  const [ed, paiements, remboursements, attributions, acceptation] = await Promise.all([
    q(sb.from('editions').select('instructions_paiement').eq('id', demande.edition_id).maybeSingle()),
    q(sb.from('paiements').select('*').eq('demande_id', id).order('created_at', { ascending: false })),
    q(sb.from('remboursements').select('*').eq('demande_id', id).order('created_at')),
    q(sb.from('attributions').select('*').eq('demande_id', id).order('code_stand')),
    q(sb.from('acceptations_contrat').select('*').eq('demande_id', id).maybeSingle()),
  ]);
  const contrat = acceptation ? await q(sb.from('contrats').select('*').eq('id', acceptation.contrat_id).maybeSingle()) : null;
  return { demande, instructions_paiement: ed?.instructions_paiement || null, paiements, remboursements, attributions, acceptation, contrat };
}

/* ============================================================ Paiements */

export async function declarerPaiement({ demande_id, montant, date_paiement, moyen, reference, commentaire, valider }, justificatif) {
  const admin = await monAdmin();
  montant = Number(montant);
  if (!Number.isInteger(montant) || montant <= 0) throw new Error('Indiquez un montant en FCFA (nombre entier positif).');
  if (!date_paiement) throw new Error('Indiquez la date du paiement.');
  if (date_paiement > aujourdhui()) throw new Error('La date du paiement ne peut pas être dans le futur.');
  if (!moyen) throw new Error('Indiquez le moyen de paiement.');
  if (!admin && !justificatif?.size) throw new Error('Joignez la capture d\'écran ou le justificatif du paiement.');
  const justificatif_path = justificatif?.size ? await stockerFichier('justificatifs', justificatif, TYPES_JUSTIF, 5) : null;
  return q(sb.from('paiements').insert({
    demande_id, montant, date_paiement, moyen, reference: nettoyer(reference), commentaire: nettoyer(commentaire),
    justificatif_path, origine: admin ? 'admin' : 'exposant', statut: admin && valider ? 'valide' : 'en_attente',
  }).select().single());
}

// Paiements accompagnés de leur demande (forme de v_demandes)
async function avecDemandes(paiements) {
  const ids = [...new Set(paiements.map((p) => p.demande_id))];
  const ds = ids.length ? await q(sb.from('v_demandes').select('*').in('id', ids)) : [];
  const parId = new Map(ds.map((d) => [d.id, d]));
  return paiements.map((p) => ({ ...p, demande: parId.get(p.demande_id) }));
}

export async function paiementsEnAttente() {
  await exigerAdmin();
  return avecDemandes(await q(sb.from('paiements').select('*').eq('statut', 'en_attente').order('created_at')));
}

export async function traiterPaiement(id, statut, motif) {
  await exigerAdmin();
  if (statut === 'rejete' && !motif?.trim()) throw new Error('Indiquez le motif du rejet.');
  return q(sb.from('paiements').update({ statut, motif_rejet: statut === 'rejete' ? motif.trim() : null }).eq('id', id).select().single());
}

export async function modifierPaiement(id, champs) {
  await exigerAdmin();
  const maj = {};
  if ('montant' in champs) {
    const m = Number(champs.montant);
    if (!Number.isInteger(m) || m <= 0) throw new Error('Montant invalide.');
    maj.montant = m;
  }
  if ('date_paiement' in champs) {
    if (!champs.date_paiement || champs.date_paiement > aujourdhui()) throw new Error('Date invalide.');
    maj.date_paiement = champs.date_paiement;
  }
  if ('moyen' in champs) maj.moyen = champs.moyen;
  if ('reference' in champs) maj.reference = nettoyer(champs.reference);
  if ('commentaire' in champs) maj.commentaire = nettoyer(champs.commentaire);
  return q(sb.from('paiements').update(maj).eq('id', id).select().single());
}

export async function supprimerPaiement(id) {
  await exigerAdmin('super_admin');
  await q(sb.from('paiements').delete().eq('id', id));
}

export async function listePaiements(f = {}) {
  await exigerAdmin();
  let r = sb.from('paiements').select('*').order('date_paiement', { ascending: false }).order('created_at', { ascending: false });
  if (f.statut) r = r.eq('statut', f.statut);
  const liste = await avecDemandes(await q(r));
  return liste.filter((p) => p.demande && (!f.edition_id || p.demande.edition_id === f.edition_id));
}

export async function enregistrerRemboursement({ demande_id, montant, date_remboursement, moyen, motif }) {
  await exigerAdmin();
  montant = Number(montant);
  if (!Number.isInteger(montant) || montant <= 0) throw new Error('Montant invalide.');
  if (!date_remboursement || !moyen) throw new Error('Indiquez la date et le moyen.');
  if (!motif?.trim()) throw new Error('Indiquez le motif du remboursement.');
  await q(sb.from('remboursements').insert({ demande_id, montant, date_remboursement, moyen, motif: motif.trim() }));
}

/* ============================================================ Administration : pilotage */

export async function editions() {
  await exigerAdmin();
  const eds = await q(sb.from('editions').select('*, sites(*)').order('date_debut', { ascending: false }));
  for (const e of eds) e.sites.sort((a, b) => a.ordre - b.ordre);
  return eds;
}

export async function editionCourante() {
  const eds = await editions();
  return (eds.find((e) => e.statut === 'ouverte') || eds[0])?.id;
}

export async function catalogue() {
  await exigerAdmin();
  const [familles, categories] = await Promise.all([
    q(sb.from('familles').select('*').order('ordre')),
    q(sb.from('categories').select('*').order('ordre')),
  ]);
  return { familles, categories };
}

export async function compteurs() {
  if (!(await monAdmin())) return { paiements_en_attente: 0 };
  const { count } = await sb.from('paiements').select('id', { count: 'exact', head: true }).eq('statut', 'en_attente');
  return { paiements_en_attente: count || 0 };
}

export async function tableauDeBord(editionId) {
  await exigerAdmin();
  const depuis7j = new Date(Date.now() - 7 * 864e5).toISOString();
  const [ds, attente, categories, familles, total, nouveaux] = await Promise.all([
    q(sb.from('v_demandes').select('*').eq('edition_id', editionId)),
    q(sb.from('paiements').select('montant, demandes!inner(edition_id)').eq('statut', 'en_attente').eq('demandes.edition_id', editionId)),
    q(sb.from('categories').select('*').order('ordre')),
    q(sb.from('familles').select('*')),
    sb.from('exposants').select('id', { count: 'exact', head: true }),
    sb.from('exposants').select('id', { count: 'exact', head: true }).gte('created_at', depuis7j),
  ]);
  const actives = ds.filter((d) => d.statut !== 'annulee');
  const somme = (l, k) => l.reduce((t, x) => t + Number(x[k] || 0), 0);
  return {
    exposants_total: total.count || 0,
    exposants_edition: new Set(actives.map((d) => d.exposant_id)).size,
    nouveaux_7j: nouveaux.count || 0,
    demandes: ds.length,
    demandes_par_statut: Object.fromEntries(['en_attente_paiement', 'validee', 'attribuee', 'annulee']
      .map((s) => [s, ds.filter((d) => d.statut === s).length])),
    stands_demandes: somme(actives, 'quantite'),
    stands_attribues: somme(actives, 'nb_attribues'),
    montant_attendu: somme(actives, 'montant_du'),
    montant_encaisse: somme(actives, 'total_paye'),
    montant_restant: actives.reduce((t, d) => t + Math.max(0, d.reste_a_payer), 0),
    paiements_en_attente: attente.length,
    montant_en_attente: somme(attente, 'montant'),
    par_categorie: categories.map((c) => {
      const l = actives.filter((d) => d.categorie_id === c.id);
      return {
        categorie: c.nom, famille: familles.find((f) => f.id === c.famille_id)?.nom,
        demandes: l.length, exposants: new Set(l.map((d) => d.exposant_id)).size,
        stands_demandes: somme(l, 'quantite'), stands_attribues: somme(l, 'nb_attribues'),
        attendu: somme(l, 'montant_du'), encaisse: somme(l, 'total_paye'),
      };
    }),
  };
}

/* ============================================================ Administration : demandes */

const contient = (texte, s) => String(texte || '').toLowerCase().includes(s);

export async function listeDemandes(f = {}) {
  await exigerAdmin();
  let r = sb.from('v_demandes').select('*').order('created_at', { ascending: false });
  if (f.edition_id) r = r.eq('edition_id', f.edition_id);
  if (f.categorie_id) r = r.eq('categorie_id', f.categorie_id);
  if (f.famille) r = r.eq('famille_nom', f.famille);
  if (f.statut) r = r.eq('statut', f.statut);
  const s = (f.q || '').trim().toLowerCase();
  const stel = s.replace(/\D/g, '');
  return (await q(r)).filter((d) =>
    (!f.statut_financier || (f.statut_financier === 'impaye' ? d.reste_a_payer > 0 && d.statut !== 'annulee' : d.statut_financier === f.statut_financier)) &&
    (!s || contient(d.numero, s) || contient(d.exposant_nom, s) || contient(d.entreprise, s) || (stel.length >= 4 && d.telephone.includes(stel))));
}

export async function majDemande(id, champs) {
  await exigerAdmin();
  const maj = {};
  if ('quantite' in champs) {
    const n = Number(champs.quantite);
    if (!Number.isInteger(n) || n < 1) throw new Error('Nombre de stands invalide.');
    const { count } = await sb.from('attributions').select('id', { count: 'exact', head: true }).eq('demande_id', id);
    if (n < (count || 0)) throw new Error('Retirez d\'abord des stands attribués.');
    maj.quantite = n;
  }
  if ('categorie_id' in champs) maj.categorie_id = champs.categorie_id;
  if ('prix_unitaire' in champs) {
    const p = Number(champs.prix_unitaire);
    if (!Number.isInteger(p) || p < 0) throw new Error('Prix unitaire invalide.');
    const actuel = await q(sb.from('demandes').select('prix_unitaire').eq('id', id).single());
    if (p !== Number(actuel.prix_unitaire)) Object.assign(maj, { prix_unitaire: p, tarif_libelle: champs.tarif_libelle || 'Prix ajusté par l\'administration', tarif_id: null });
  }
  if ('remise_montant' in champs) {
    const r = Number(champs.remise_montant);
    if (!Number.isInteger(r) || r < 0) throw new Error('Remise invalide.');
    maj.remise_montant = r;
    maj.remise_motif = r > 0 ? nettoyer(champs.remise_motif) : null;
  }
  if ('notes_admin' in champs) maj.notes_admin = nettoyer(champs.notes_admin);
  await q(sb.from('demandes').update(maj).eq('id', id));
  return q(sb.from('v_demandes').select('*').eq('id', id).single());
}

export async function annulerDemande(id, motif) {
  await exigerAdmin();
  if (!motif?.trim()) throw new Error('Indiquez le motif de l\'annulation.');
  await q(sb.from('demandes').update({ statut: 'annulee', motif_annulation: motif.trim() }).eq('id', id));
}

export async function retablirDemande(id) {
  await exigerAdmin();
  await q(sb.from('demandes').update({ statut: 'en_attente_paiement', motif_annulation: null }).eq('id', id));
}

export async function supprimerDemande(id) {
  await exigerAdmin('super_admin');
  const { count } = await sb.from('paiements').select('id', { count: 'exact', head: true }).eq('demande_id', id);
  if (count) throw new Error('Cette demande a des paiements : annulez-la plutôt que de la supprimer.');
  await q(sb.from('demandes').delete().eq('id', id));
}

/* ============================================================ Attributions */

export async function attribuer(demande_id, code_stand, zone) {
  await exigerAdmin();
  const code = String(code_stand || '').trim().toUpperCase();
  if (!code) throw new Error('Indiquez le code du stand.');
  const d = await q(sb.from('demandes').select('statut').eq('id', demande_id).single());
  if (d.statut === 'annulee') throw new Error('Cette demande est annulée.');
  await q(sb.from('attributions').insert({ demande_id, code_stand: code, zone: nettoyer(zone) }));
}

export async function retirerAttribution(id) {
  await exigerAdmin();
  await q(sb.from('attributions').delete().eq('id', id));
}

/* ============================================================ Exposants */

export async function listeExposants(f = {}) {
  await exigerAdmin();
  const [exposants, ds] = await Promise.all([
    q(sb.from('exposants').select('*').order('entreprise')),
    q(sb.from('v_demandes').select('exposant_id, edition_nom, statut, montant_du, total_paye, reste_a_payer')),
  ]);
  const s = (f.q || '').trim().toLowerCase();
  const stel = s.replace(/\D/g, '');
  return exposants
    .filter((e) => !s || contient(`${e.nom} ${e.prenoms}`, s) || contient(`${e.prenoms} ${e.nom}`, s)
      || contient(e.entreprise, s) || (stel.length >= 4 && e.telephone.includes(stel)))
    .map((e) => {
      const l = ds.filter((d) => d.exposant_id === e.id);
      const actives = l.filter((d) => d.statut !== 'annulee');
      return {
        ...e, a_un_compte: !!e.user_id, nb_demandes: l.length,
        editions: [...new Set(l.map((d) => d.edition_nom))].join(', '),
        montant_du: actives.reduce((t, d) => t + Number(d.montant_du), 0),
        total_paye: actives.reduce((t, d) => t + Number(d.total_paye), 0),
        reste_a_payer: actives.reduce((t, d) => t + Math.max(0, d.reste_a_payer), 0),
      };
    })
    .sort((a, b) => a.entreprise.localeCompare(b.entreprise, 'fr'));
}

export async function ficheExposant(id) {
  await exigerAdmin();
  const e = await q(sb.from('exposants').select('*').eq('id', id).maybeSingle());
  if (!e) throw new Error('Exposant introuvable.');
  const demandes = await q(sb.from('v_demandes').select('*').eq('exposant_id', id).order('created_at', { ascending: false }));
  return { exposant: { ...e, a_un_compte: !!e.user_id }, demandes };
}

export async function creerExposant(profil, logo) {
  await exigerAdmin();
  const tel = normaliserTelephone(profil.telephone);
  if (!telephoneValide(tel)) throw new Error('Numéro de téléphone invalide.');
  if (!profil.nom?.trim() || !profil.prenoms?.trim() || !profil.entreprise?.trim())
    throw new Error('Nom, prénoms et entreprise sont obligatoires.');
  const ligne = { ...nettoyerProfil(profil), telephone: tel, notes_admin: nettoyer(profil.notes_admin) };
  if (logo?.size) ligne.logo_path = await stockerFichier('logos', logo, TYPES_IMAGE, 2);
  return q(sb.from('exposants').insert(ligne).select().single());
}

export async function majExposant(id, champs, logo) {
  await exigerAdmin();
  const p = nettoyerProfil(champs);
  if (!p.nom || !p.prenoms || !p.entreprise) throw new Error('Nom, prénoms et entreprise sont obligatoires.');
  if ('telephone' in champs) {
    const tel = normaliserTelephone(champs.telephone);
    if (!telephoneValide(tel)) throw new Error('Numéro de téléphone invalide.');
    await q(sb.rpc('changer_telephone_exposant', { p_exposant: id, p_tel: tel, p_domaine: DOMAINE_IDENTIFIANT }));
  }
  p.notes_admin = nettoyer(champs.notes_admin);
  if ('actif' in champs) p.actif = !!champs.actif;
  if (logo?.size) p.logo_path = await stockerFichier('logos', logo, TYPES_IMAGE, 2);
  return q(sb.from('exposants').update(p).eq('id', id).select().single());
}

export async function reinitialiserMotDePasse(exposantId, nouveau) {
  await exigerAdmin();
  const e = await q(sb.from('exposants').select('user_id').eq('id', exposantId).single());
  if (!e.user_id) throw new Error('Cet exposant n\'a pas encore de compte : il doit s\'inscrire avec son numéro.');
  if (!nouveau || nouveau.length < 6) throw new Error('6 caractères minimum.');
  await q(sb.rpc('reinitialiser_mot_de_passe', { p_user: e.user_id, p_mdp: nouveau }));
}

export async function supprimerExposant(id) {
  await exigerAdmin('super_admin');
  await q(sb.rpc('supprimer_exposant', { p_exposant: id }));
}

/* ============================================================ Configuration (super admin) */

// Insère ou met à jour une ligne ; renvoie la ligne enregistrée
async function enregistrer(table, champs) {
  await exigerAdmin('super_admin');
  const { id, created_at, sites, nb_acceptations, ...valeurs } = champs;
  return id
    ? q(sb.from(table).update(valeurs).eq('id', id).select().single())
    : q(sb.from(table).insert(valeurs).select().single());
}

export async function enregistrerEdition(champs) {
  if (!champs.nom?.trim() || !champs.prefixe?.trim()) throw new Error('Nom et préfixe obligatoires.');
  if (!champs.date_debut || !champs.date_fin || champs.date_fin < champs.date_debut) throw new Error('Dates invalides.');
  return enregistrer('editions', { ...champs, prefixe: champs.prefixe.trim().toUpperCase() });
}

export async function enregistrerSite(champs) {
  if (!champs.nom?.trim()) throw new Error('Nom du site obligatoire.');
  return enregistrer('sites', { ...champs, ordre: Number(champs.ordre) || 1 });
}

export async function enregistrerCategorie(champs) {
  if (!champs.nom?.trim() || !champs.famille_id) throw new Error('Nom et famille obligatoires.');
  return enregistrer('categories', {
    ...champs,
    surface_m2: champs.surface_m2 === '' || champs.surface_m2 == null ? null : Number(champs.surface_m2),
    ordre: Number(champs.ordre) || 1, actif: champs.actif !== false,
  });
}

export async function listeTarifs(editionId) {
  await exigerAdmin();
  return q(sb.from('tarifs').select('*').eq('edition_id', editionId).order('categorie_id').order('date_debut'));
}

export async function enregistrerTarif(champs) {
  const prix = Number(champs.prix_unitaire);
  if (!Number.isInteger(prix) || prix < 0) throw new Error('Prix invalide.');
  if (!champs.libelle?.trim()) throw new Error('Libellé obligatoire.');
  if (!champs.date_debut || !champs.date_fin || champs.date_fin < champs.date_debut) throw new Error('Période invalide.');
  return enregistrer('tarifs', { ...champs, prix_unitaire: prix });
}

export async function supprimerTarif(id) {
  await exigerAdmin('super_admin');
  await q(sb.from('tarifs').delete().eq('id', id));   // les demandes gardent leur prix figé (tarif_id → null)
}

export async function listeContrats(editionId) {
  await exigerAdmin();
  const contrats = await q(sb.from('contrats').select('*, acceptations_contrat(count)')
    .or(`edition_id.eq.${editionId},edition_id.is.null`).order('version', { ascending: false }));
  return contrats.map(({ acceptations_contrat, ...c }) => ({ ...c, nb_acceptations: acceptations_contrat?.[0]?.count || 0 }));
}

export async function enregistrerContrat(champs) {
  if (!champs.titre?.trim() || !champs.contenu?.trim()) throw new Error('Titre et texte obligatoires.');
  const c = { ...champs };
  if (!c.id) {
    let r = sb.from('contrats').select('version').order('version', { ascending: false }).limit(1);
    r = c.edition_id ? r.eq('edition_id', c.edition_id) : r.is('edition_id', null);
    const [dernier] = await q(r);
    c.version = (dernier?.version || 0) + 1;
    c.publie_le = null;
    c.actif = true;
  } else {
    delete c.publie_le; delete c.version;
  }
  return enregistrer('contrats', c);
}

export async function publierContrat(id) {
  await exigerAdmin('super_admin');
  const c = await q(sb.from('contrats').select('publie_le').eq('id', id).single());
  if (c.publie_le) throw new Error('Déjà publié.');
  await q(sb.from('contrats').update({ publie_le: new Date().toISOString() }).eq('id', id));
}

/* ============================================================ Accès */

export async function listeAdmins() {
  await exigerAdmin('super_admin');
  return q(sb.rpc('liste_admins'));
}

export async function creerAdmin({ email, nom, role, mot_de_passe }) {
  await exigerAdmin('super_admin');
  await q(sb.rpc('creer_admin', {
    p_email: String(email || '').trim().toLowerCase(), p_nom: nom, p_role: role === 'super_admin' ? 'super_admin' : 'gestionnaire', p_mdp: mot_de_passe,
  }));
}

export async function majAdmin(userId, { role, actif }) {
  await exigerAdmin('super_admin');
  const maj = {};
  if (role) maj.role = role;
  if (actif !== undefined) maj.actif = actif;
  await q(sb.from('admins').update(maj).eq('user_id', userId));
  cacheAdmin = null;
}

export async function journalAudit(f = {}) {
  await exigerAdmin('super_admin');
  let r = sb.from('journal_audit').select('*').order('created_at', { ascending: false }).limit(500);
  if (f.table) r = r.eq('table_nom', f.table);
  if (f.ligne_id) r = r.eq('ligne_id', f.ligne_id);
  const [lignes, admins, exposants] = await Promise.all([
    q(r), q(sb.from('admins').select('user_id, nom')), q(sb.from('exposants').select('user_id, nom, prenoms').not('user_id', 'is', null)),
  ]);
  const noms = new Map(admins.map((a) => [a.user_id, a.nom]));
  for (const e of exposants) noms.set(e.user_id, `${e.prenoms} ${e.nom} (exposant)`);
  return lignes.map((j) => ({ ...j, auteur: noms.get(j.user_id) || '—' }));
}

/* ============================================================ Mode local uniquement */

export async function reinitialiser() { /* sans effet en mode Supabase */ }
