# ExpoManage : spécification fonctionnelle

Plateforme de gestion des exposants du marché Fènou HIGBÉ.
Version 0.1, du 14 novembre 2026. Document de travail, à valider.

---

## 1. Décisions déjà prises

| Sujet | Décision |
|---|---|
| Connexion exposant | Téléphone + mot de passe. Réinitialisation par un administrateur. OTP SMS/WhatsApp envisagé plus tard |
| Tarifs | Un tarif par catégorie et par **période de validité**. Le prix change selon la date de la demande et le type de stand |
| Moyens de paiement | Tous : Mobile Money (MTN, Moov, Celtiis), virement, espèces, chèque, autre. Paiement en ligne automatique plus tard |
| Remises / gratuités / annulations / remboursements / trop-perçus | Gérés |
| Validation d'une demande | **Automatique** dès qu'un premier paiement est **validé par un administrateur**. Pas de validation préalable par l'admin |
| Contrat | Accepté **à chaque demande** |
| Rôles admin | Super administrateur, gestionnaire |
| Système de stands existant | Éditeur de plan en HTML/CSS/JS vanilla, publié en artifact claude.ai (voir §8) |
| Prochaine édition | Du 22 au 25 décembre 2026 |
| Hébergement | À décider plus tard |
| Logo | **Facultatif** |
| Modification d'une demande | Uniquement par un **administrateur**, à la demande de l'exposant qui le contacte |
| Instructions de paiement | **Configurables** par l'admin (numéros Mobile Money, RIB, etc.) et affichées à l'exposant |
| Agrégateur de paiement | Aucun pour l'instant |

---

## 2. Acteurs et droits

| Action | Exposant | Gestionnaire | Super admin |
|---|:-:|:-:|:-:|
| S'inscrire, modifier son profil | ✅ (le sien) | ✅ | ✅ |
| Faire une demande, accepter le contrat | ✅ | ✅ (pour le compte d'un exposant) | ✅ |
| Déclarer un paiement avec justificatif | ✅ | ✅ | ✅ |
| Valider ou rejeter un paiement | | ✅ | ✅ |
| Modifier un paiement déjà validé | | | ✅ |
| Accorder une remise ou une gratuité | | | ✅ |
| Annuler une demande, enregistrer un remboursement | | ✅ | ✅ |
| Attribuer des emplacements | | ✅ | ✅ |
| Gérer les éditions, catégories, tarifs, contrats | | | ✅ |
| Gérer les comptes administrateurs | | | ✅ |
| Supprimer définitivement des données | | | ✅ |
| Consulter le journal d'audit | | | ✅ |
| Tableau de bord, exports | | ✅ | ✅ |

> À confirmer : la répartition entre gestionnaire et super admin. Elle est facile à ajuster.

---

## 3. Modèle de données

### 3.1 Exposant (permanent, toutes éditions confondues)
- `nom`, `prenoms` : obligatoires
- `telephone` : obligatoire et **unique**, c'est l'identifiant de connexion
- `telephone_secondaire`, `whatsapp` : facultatifs
- `entreprise` : nom de l'entreprise ou de l'activité, obligatoire
- `logo` : image, facultatif
- Facultatifs : `email`, `ifu`, `rccm`, `adresse`, `ville`, `description_activite`, `secteur`
- `mot_de_passe`, `date_inscription`, `actif`

### 3.2 Édition
- `nom` (ex. « Fènou HIGBÉ 2026 »), `date_debut`, `date_fin`, `lieu`
- `statut` : Brouillon → Inscriptions ouvertes → Inscriptions fermées → Terminée
- Une seule édition « Inscriptions ouvertes » à la fois. À confirmer

### 3.3 Famille et catégorie de stand
- Familles : Produits, Entreprises, Restauration
- Catégories : Produit 6 m², Produit 12 m², Entreprise, Restauration unique, Bar unique, Bar + restaurant
- Les familles et catégories sont modifiables par le super admin. Aucune n'est codée en dur

### 3.4 Tarif
- `edition`, `categorie`, `libelle` (ex. « Tarif préférentiel », « Tarif normal »), `prix_unitaire` en FCFA, `date_debut`, `date_fin`
- Règle : pour une édition et une catégorie, les périodes **ne se chevauchent pas**
- Le tarif appliqué est celui en vigueur **à la date de création de la demande**

### 3.5 Contrat
- `ContratVersion` : `edition` (ou générique), `numero_version`, `contenu` (texte et/ou PDF), `date_publication`, `actif`
- Une version publiée n'est **jamais modifiée**. Toute modification crée une nouvelle version
- `AcceptationContrat` : `demande`, `exposant`, `contrat_version`, `date_heure`, `adresse_ip`, `navigateur`, case « J'ai lu et j'accepte » cochée

### 3.6 Demande
- `numero` lisible (ex. `FH26-0042`), `exposant`, `edition`, `categorie`, `quantite` (≥ 1)
- **Valeurs figées au moment de la demande** : `tarif_libelle`, `prix_unitaire`, `montant_brut = prix_unitaire × quantite`
- `remise` : montant ou pourcentage, motif, accordée par. Une gratuité est une remise de 100 %
- `montant_du = montant_brut − remise`
- **Calculés, jamais saisis** : `total_paye` (paiements validés moins remboursements), `reste_a_payer = montant_du − total_paye`, `trop_percu` si `total_paye > montant_du`
- `statut` (voir §4)
- Une demande = **une seule catégorie**. Pour d'autres catégories, l'exposant fait d'autres demandes

### 3.7 Paiement
- `demande`, `montant`, `date_paiement`, `moyen` (Mobile Money MTN / Moov / Celtiis, virement, espèces, chèque, autre), `reference_transaction` (facultative), `justificatif` (image ou PDF, facultatif quand c'est l'admin qui saisit)
- `origine` : déclaré par l'exposant / saisi par un admin
- `statut` : En attente de validation → Validé / Rejeté (avec motif)
- `valide_par`, `date_validation`
- Un paiement saisi par un admin peut être directement « Validé »

### 3.8 Remboursement
- `demande`, `montant`, `date`, `moyen`, `motif`, `justificatif`, `effectue_par`
- Il réduit le `total_paye`

### 3.9 Attribution
- `demande`, `reference_emplacement` (code de l'emplacement dans votre système existant, ex. `A-12`), `zone`, `attribue_par`, `date`
- Nombre d'attributions ≤ quantité demandée
- Possible quel que soit le niveau de paiement

### 3.10 Utilisateur administrateur et journal d'audit
- `Utilisateur` : nom, e-mail ou téléphone, mot de passe, rôle, actif
- `JournalAudit` : utilisateur, action, entité, identifiant, **valeurs avant et après**, date et heure, IP. Il est en lecture seule et **ne peut pas être supprimé**

---

## 4. Cycle de vie d'une demande

```
            ┌──────────────┐  1er paiement validé  ┌──────────┐  emplacements  ┌──────────┐
 création ─▶│  En attente  │──────────────────────▶│ Validée  │───────────────▶│ Attribuée│
            │  de paiement │                       └──────────┘   attribués    └──────────┘
            └──────┬───────┘                            │                          │
                   │ annulation                         │ annulation               │ annulation
                   ▼                                    ▼                          ▼
                              ┌──────────┐
                              │ Annulée  │ (remboursement éventuel)
                              └──────────┘
```

- **Statut de la demande** : En attente de paiement, Validée, Attribuée, Annulée
- **Statut financier**, affiché en parallèle : Non payé, Partiellement payé, Soldé, Trop-perçu
- Une gratuité (montant dû = 0) passe directement en **Validée**
- Une attribution peut être faite sur une demande « En attente de paiement » (décision de l'organisation). La demande passe alors en « Attribuée ». À confirmer

---

## 5. Parcours exposant

1. **Inscription** : nom, prénoms, téléphone, entreprise, logo, mot de passe, et en option les autres champs
2. **Connexion** par téléphone et mot de passe
3. Un ancien exposant **se connecte** à son compte existant, vérifie son profil et refait une demande
4. **Nouvelle demande** : choix de l'édition ouverte, puis de la catégorie (avec le tarif en vigueur affiché), puis de la quantité, avec le montant total calculé en direct
5. **Contrat** : lecture, case à cocher, puis confirmation. La demande est créée à ce moment
6. **Paiement** : instructions de paiement (numéros Mobile Money, RIB, etc.), puis déclaration du montant, de la date, du moyen et du justificatif
7. **Suivi** : statut, montant dû, payé, reste à payer, historique des versements, emplacements attribués, contrat accepté téléchargeable

Interface conçue d'abord pour le téléphone.

---

## 6. Espace d'administration

- **Exposants** : liste, recherche (nom, entreprise, téléphone), filtres (édition, catégorie, statut de paiement), fiche complète avec l'historique de toutes les éditions, création pour le compte d'un exposant, réinitialisation du mot de passe, **fusion des doublons**
- **Demandes** : liste et filtres, détail, remise, annulation, attribution des emplacements
- **Paiements** : file « En attente de validation » avec aperçu du justificatif, validation ou rejet en un clic, saisie directe, modification tracée
- **Éditions, catégories, tarifs, contrats** : configuration
- **Utilisateurs** : comptes et rôles
- **Journal d'audit**
- **Exports** Excel et CSV : exposants (tous, par catégorie, par édition), demandes, paiements, impayés, attributions
- **PDF** : fiche exposant, récapitulatif de demande, reçu de paiement, contrat accepté

---

## 7. Tableau de bord (filtrable par édition)

- Exposants enregistrés (total) et nouvelles inscriptions
- Demandes : total, en attente, validées, attribuées, annulées
- Répartition par famille et catégorie (demandes et stands)
- Stands demandés et stands attribués
- Montant attendu, encaissé (validé) et restant à recouvrer
- Paiements en attente de validation (nombre et montant)
- Comparaison entre éditions

---

## 8. Lien avec le système de stands existant

### 8.1 Ce qu'est l'existant (analysé le 14 nov. 2026)
Deux artifacts claude.ai bâtis sur le même code : **« Plan Fenou Grand Marché 2026 »** et **« Plan Fenou Sèmè »**. Ce sont des éditeurs de plan interactifs (SVG) :
- Données stockées dans la base de l'artifact, document `plans/main` : `{ items, pool }`
- Chaque **stand** : `id`, `code` (ex. `C12`), `name` (nom de l'exposant en **texte libre**), `binome`, `note`, couleur, position et taille
- **pool** : exposants « non placés », à glisser sur un stand
- Exports : **CSV** (`Stand;Exposant;Binôme;Note;Statut`), JSON (sauvegarde complète), SVG, PNG
- Import : JSON, qui **remplace** tout le plan

Limite : l'exposant n'y est qu'un nom. Il n'existe aucun identifiant commun avec une base d'exposants.

### 8.2 Intégration proposée : un identifiant commun, échangé par fichier
Les deux applications restent séparées. Elles échangent des fichiers, avec le **numéro de demande** (ex. `FH26-0042`) comme clé commune.

```
 ExpoManage                                   Plan des stands
 ──────────                                   ───────────────
 Demandes validées ── export « à placer » ──▶ ajoutées au pool « Non placés »
   (n° demande, entreprise, catégorie, nb)       (sans écraser le plan)
                                                       │ placement sur le plan
 Attributions      ◀── import CSV stands ──── export CSV (Stand ; Exposant ; Réf.)
   (code stand ↔ n° demande)
```

Petites modifications à apporter au plan existant :
1. Ajouter un champ `ref` (n° de demande) aux stands et aux éléments du pool
2. Ajouter une action « Importer des exposants à placer », qui **ajoute** au pool sans remplacer le plan
3. Ajouter la colonne `Réf.` à l'export CSV

Après l'édition 2026, on pourra fusionner les deux, en intégrant l'éditeur de plan à ExpoManage.

---

## 9. Points encore ouverts

1. **Grand Marché et Sèmè** : s'agit-il de deux sites d'une même édition, ou de deux marchés distincts ? Si ce sont deux sites, il faut ajouter une notion de **site** (tarifs, demandes et plan par site)
2. Les notifications aux exposants (SMS, WhatsApp, e-mail) : pas en version 1 ?
3. Le texte du contrat d'exploitation actuel
4. Les tarifs et périodes 2026 à saisir
5. Les instructions de paiement (numéros, RIB) à saisir

---

## 10. Architecture technique proposée

Contrainte : rester en **HTML / CSS / JavaScript vanilla**, comme l'existant.

La plateforme doit être **publique**. Des exposants sans compte claude.ai doivent pouvoir s'inscrire, se connecter, téléverser des justificatifs, et voir uniquement **leurs** données. Il faut donc un vrai serveur de données. Un artifact claude.ai convient à un outil interne, pas à ce portail public.

**Proposition : front en vanilla JS + Supabase.**

| Élément | Rôle |
|---|---|
| Pages HTML/CSS/JS vanilla | Portail exposant et espace admin, sans framework ni étape de build |
| Supabase (PostgreSQL) | Base de données, avec des règles d'accès par ligne (un exposant ne voit que ses dossiers) |
| Supabase Auth | Connexion téléphone + mot de passe, sans SMS : le numéro est converti en identifiant interne |
| Supabase Storage | Logos et justificatifs de paiement (privés) |
| Fonctions SQL | Calculs fiables côté serveur : prix figé, total payé, reste à payer, statut, journal d'audit |
| Hébergement statique | Netlify, Vercel ou GitHub Pages, gratuits pour démarrer |
| SheetJS / jsPDF | Exports Excel/CSV et génération PDF dans le navigateur |

Avantages : aucun serveur à maintenir, offre gratuite suffisante pour démarrer, sauvegardes gérées, et on reste en JavaScript vanilla.
