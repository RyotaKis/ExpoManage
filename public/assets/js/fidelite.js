// Historique de participation et niveau de fidélité d'un exposant.
// Seules les demandes non annulées comptent.

export const NIVEAUX = [
  { cle: 'nouveau',     nom: 'Nouveau',     min: 0, texte: 'Réservez votre premier stand pour démarrer votre parcours.' },
  { cle: 'exposant',    nom: 'Exposant',    min: 1, texte: 'Merci pour votre participation !' },
  { cle: 'fidele',      nom: 'Fidèle',      min: 2, texte: 'Vous revenez d\'une édition à l\'autre : merci pour votre fidélité.' },
  { cle: 'ambassadeur', nom: 'Ambassadeur', min: 3, texte: 'Vous faites partie des exposants les plus fidèles du marché.' },
];

export const niveauPour = (nbEditions) => [...NIVEAUX].reverse().find((n) => nbEditions >= n.min);

// demandes : lignes de v_demandes (avec edition_id, edition_nom, edition_date_debut, quantite, total_paye)
export function parcours(demandes) {
  const actives = demandes.filter((d) => d.statut !== 'annulee');
  const parEdition = new Map();
  for (const d of actives) {
    const e = parEdition.get(d.edition_id) || { id: d.edition_id, nom: d.edition_nom, debut: d.edition_date_debut || d.created_at, demandes: 0, stands: 0 };
    e.demandes += 1;
    e.stands += Number(d.quantite) || 0;
    parEdition.set(d.edition_id, e);
  }
  const editions = [...parEdition.values()].sort((a, b) => String(a.debut).localeCompare(String(b.debut)));
  const niveau = niveauPour(editions.length);
  const prochain = NIVEAUX.find((n) => n.min > editions.length) || null;
  return {
    editions, niveau, prochain,
    nbEditions: editions.length,
    nbDemandes: actives.length,
    nbStands: actives.reduce((t, d) => t + (Number(d.quantite) || 0), 0),
    totalPaye: actives.reduce((t, d) => t + Math.max(0, Number(d.total_paye) || 0), 0),
  };
}

export const badgeNiveau = (niveau) => `<span class="niveau" data-niveau="${niveau.cle}">${niveau.nom}</span>`;
