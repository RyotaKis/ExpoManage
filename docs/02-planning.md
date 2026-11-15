# ExpoManage : planning de réalisation

Objectif : être opérationnel pour l'édition du **22 au 25 décembre 2026**.
Aujourd'hui : 14 novembre 2026. Il reste **5 semaines et demie**.

Les exposants doivent pouvoir s'inscrire et payer **bien avant** le marché. On livre donc par lots : d'abord l'essentiel pour ouvrir les inscriptions, ensuite les outils de pilotage.

---

## Lot 0 : Cadrage (14 au 17 nov.)
- [x] Expression de besoin
- [x] Spécification v0.1 (`01-specification.md`)
- [x] Analyse de l'application de stands existante (spécification §8)
- [ ] Réponses aux points ouverts de la spécification (§9), en particulier Grand Marché / Sèmè
- [ ] Validation de l'architecture (spécification §10 : vanilla JS + Supabase)
- [ ] Création du projet Supabase (compte à créer par vous)

## Lot 1 : Ouverture des inscriptions (18 au 28 nov.) 🎯 **en ligne le 30 nov.**
Le strict nécessaire pour que les exposants s'inscrivent, demandent et paient.
- Inscription et connexion exposant (téléphone + mot de passe)
- Profil exposant, logo
- Éditions, catégories, tarifs par période (configuration admin)
- Demande de stand : une catégorie × quantité, prix figé
- Contrat versionné et acceptation tracée
- Déclaration de paiement avec justificatif
- Admin : validation ou rejet des paiements, saisie directe, passage automatique de la demande en « Validée »
- Espace exposant : suivi, montant dû, payé, reste à payer
- Rôles super admin / gestionnaire, journal d'audit
- **Mise en ligne** (hébergement à choisir au plus tard le 25 nov.)

## Lot 2 : Pilotage (1er au 10 déc.)
- Attributions d'emplacements : export « à placer » vers le plan, import du CSV des stands
- Petites évolutions du plan existant : champ `ref`, import dans le pool, colonne `Réf.`
- Remises, gratuités, annulations, remboursements, trop-perçus
- Recherche et filtres avancés, fusion des doublons
- Exports Excel / CSV (exposants, demandes, paiements, impayés, attributions)
- Tableau de bord par édition

## Lot 3 : Documents et finitions (11 au 16 déc.)
- PDF : fiche exposant, reçu de paiement, récapitulatif de demande, contrat accepté
- Corrections remontées par l'équipe
- Formation de l'équipe organisatrice

## Gel (17 au 25 déc.)
- Plus de nouvelles fonctionnalités, uniquement des corrections
- Sauvegardes quotidiennes de la base
- Support pendant le marché

## Après l'édition (janvier 2027 et suite)
- Intégration plus poussée avec l'application de stands (API ou fusion)
- Paiement en ligne automatique (FedaPay / Kkiapay)
- Connexion par code OTP SMS / WhatsApp
- Notifications aux exposants
- Comparaisons entre éditions

---

## Risques principaux

| Risque | Parade |
|---|---|
| Délai serré | Lots stricts. Le lot 1 passe avant tout le reste |
| Hébergement choisi trop tard | Décision au plus tard le 25 nov. |
| Contenu manquant (contrat, tarifs, instructions de paiement) | À fournir avant le 25 nov. |
| Doublons d'exposants (changement de numéro) | Recherche par nom et entreprise côté admin, fusion au lot 2 |
| Perte de justificatifs | Stockage sauvegardé, sauvegardes quotidiennes |
