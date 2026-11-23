// Données de DÉMONSTRATION pour le mode local.
// ⚠ Les tarifs, numéros de paiement et le texte du contrat sont FICTIFS :
//   ils servent uniquement à tester l'application.
//
// Comptes de test (mode local uniquement) :
//   Super admin  : admin@expomanage.test    / Admin2026!
//   Gestionnaire : gestion@expomanage.test  / Gestion2026!
//   Exposant     : 0197000001               / Expo2026!   (profil « Boutique Démo »)

export async function donneesDemo(hacher) {
  const t = new Date().toISOString();
  const id = () => crypto.randomUUID();

  const comptes = [
    { id: id(), identifiant: 'admin@expomanage.test', mdp_hash: await hacher('Admin2026!'), created_at: t },
    { id: id(), identifiant: 'gestion@expomanage.test', mdp_hash: await hacher('Gestion2026!'), created_at: t },
    { id: id(), identifiant: '2290197000001', mdp_hash: await hacher('Expo2026!'), created_at: t },
  ];
  const admins = [
    { user_id: comptes[0].id, nom: 'Phanel', role: 'super_admin', actif: true, created_at: t },
    { user_id: comptes[1].id, nom: 'Gestionnaire démo', role: 'gestionnaire', actif: true, created_at: t },
  ];

  const edition = {
    id: id(), nom: 'Fènou HIGBÉ 2026', prefixe: 'FH26', date_debut: '2026-12-22', date_fin: '2026-12-25',
    lieu: 'Cotonou (lieu à préciser)', statut: 'ouverte', dernier_numero: 0, created_at: t,
    instructions_paiement:
      'EXEMPLE FICTIF — à remplacer par l\'administration\n\n' +
      '- MTN Mobile Money : 01 00 00 00 00 (Nom du bénéficiaire)\n' +
      '- Moov Money : 01 00 00 00 01 (Nom du bénéficiaire)\n' +
      '- Virement : Banque XXX, IBAN BJ00 0000 0000 0000\n\n' +
      'Indiquez votre numéro de demande en référence, puis déclarez le paiement ci-dessous avec la capture d\'écran.',
  };
  const sites = [{ id: id(), edition_id: edition.id, nom: 'Site principal', ordre: 1 }];

  const familles = [
    { id: id(), nom: 'Stands produits', ordre: 1 },
    { id: id(), nom: 'Stands entreprises', ordre: 2 },
    { id: id(), nom: 'Stands restauration', ordre: 3 },
  ];
  const cat = (f, nom, surface, ordre, description) =>
    ({ id: id(), famille_id: familles[f].id, nom, surface_m2: surface, ordre, description, actif: true });
  const categories = [
    cat(0, 'Stand produit 6 m²', 6, 1, 'Pour la vente de produits.'),
    cat(0, 'Stand produit 12 m²', 12, 2, 'Pour la vente de produits, surface double.'),
    cat(1, 'Stand entreprise', null, 1, 'Présentation d\'une entreprise ou d\'une marque.'),
    cat(2, 'Restauration unique', null, 1, 'Restauration seule.'),
    cat(2, 'Bar unique', null, 2, 'Bar seul.'),
    cat(2, 'Bar et restaurant', null, 3, 'Bar et restauration.'),
  ];

  // Prix FICTIFS : [préférentiel jusqu'au 30 nov., normal ensuite]
  const prix = [[25000, 30000], [45000, 55000], [100000, 120000], [60000, 75000], [60000, 75000], [100000, 125000]];
  const tarifs = categories.flatMap((c, i) => [
    { id: id(), edition_id: edition.id, site_id: sites[0].id, categorie_id: c.id, libelle: 'Tarif préférentiel',
      prix_unitaire: prix[i][0], date_debut: '2026-11-01', date_fin: '2026-11-30', created_at: t },
    { id: id(), edition_id: edition.id, site_id: sites[0].id, categorie_id: c.id, libelle: 'Tarif normal',
      prix_unitaire: prix[i][1], date_debut: '2026-12-01', date_fin: '2026-12-21', created_at: t },
  ]);

  const contrats = [{
    id: id(), edition_id: edition.id, version: 1, titre: 'Contrat d\'exploitation des stands — Fènou HIGBÉ 2026',
    publie_le: t, actif: true, fichier_path: null, created_at: t,
    contenu: [
      '# Contrat d\'exploitation des stands',
      '*TEXTE DE DÉMONSTRATION. Le contrat réel est saisi par l\'administration.*',
      'Entre **l\'Organisateur** du marché Fènou HIGBÉ,',
      '**ET**',
      'M./Mme : {{exposant}}\nPromoteur(trice) de : {{entreprise}}\nTéléphone : {{telephone}}',
      '## Article 1 — Objet',
      'Le présent contrat fixe les conditions dans lesquelles l\'Entrepreneur exploite {{quantite}} stand(s) « {{categorie}} » '
        + 'pendant {{edition}}, du {{date_debut}} au {{date_fin}} ({{duree}}), pour la somme de {{montant_lettres}} ({{montant}}) francs CFA.',
      '## Article 1 bis — Produits et équipements déclarés',
      '{{tableau_produits}}',
      '## Article 2 — Attribution des emplacements',
      'Les emplacements sont attribués exclusivement par l\'organisation, en fonction des disponibilités et de l\'organisation générale du marché.',
      '## Article 3 — Paiement',
      'Le montant de la participation peut être réglé en plusieurs versements. Chaque versement est validé par l\'organisation après vérification.',
      '## Article 4 — Obligations de l\'exposant',
      '- Respecter les horaires d\'ouverture et de fermeture.\n- Maintenir le stand propre.\n- Respecter les consignes de sécurité.',
      '## Article 5 — Annulation',
      'Les conditions d\'annulation et de remboursement sont définies par l\'organisation.',
      '---',
      'Fait à Cotonou, le {{date}}.',
      '{{signature}}',
    ].join('\n\n'),
  }];

  const exposants = [{
    id: id(), user_id: comptes[2].id, nom: 'DÉMO', prenoms: 'Exposant', telephone: '2290197000001',
    entreprise: 'Boutique Démo', logo_path: null, email: null, ifu: null, rccm: null, adresse: null, ville: 'Cotonou',
    secteur: 'Artisanat', description: null, telephone_secondaire: null, whatsapp: null, notes_admin: null,
    actif: true, created_at: t, updated_at: t,
  }];

  return {
    version: 1, comptes, admins, exposants, editions: [edition], sites, familles, categories, tarifs, contrats,
    demandes: [], acceptations_contrat: [], paiements: [], remboursements: [], attributions: [], journal_audit: [],
  };
}
