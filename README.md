# ExpoManage

Plateforme de gestion des exposants du marché **Fènou HIGBÉ**.
Front en HTML / CSS / JavaScript vanilla (sans build) + [Supabase](https://supabase.com) (base de données, comptes, fichiers).

- Spécification : [docs/01-specification.md](docs/01-specification.md)
- Planning : [docs/02-planning.md](docs/02-planning.md)

## Arborescence

```
public/                      ← racine du site (ce dossier est mis en ligne)
  assets/css/app.css         styles communs
  index.html, inscription.html, connexion.html
  espace/                    espace exposant (demandes, nouvelle demande, détail + paiement, profil)
  admin/                     administration : tableau de bord, paiements, demandes, exposants,
                             configuration, utilisateurs, journal (entrée : /admin/connexion.html)
  assets/js/config.js        mode (local / supabase), adresse et clé publique Supabase
  assets/js/api.js           point d'entrée unique des données
  assets/js/api-local.js     implémentation locale (navigateur)
  assets/js/donnees-demo.js  données et comptes de démonstration
  assets/js/layout.js        en-tête, garde d'accès
  assets/js/ui.js            formats, libellés, utilitaires
supabase/migrations/
  001_schema.sql             tables, calculs, règles d'accès, catégories initiales
  002_stockage.sql           espaces de fichiers (logos, justificatifs, contrats)
docs/                        spécification et planning
```

## Mode local (développement)

Par défaut (`MODE = 'local'` dans `public/assets/js/config.js`), l'application fonctionne **entièrement dans le navigateur**, sans Supabase. Les données sont dans `localStorage` et les fichiers dans IndexedDB, et la couche `api-local.js` applique les mêmes règles que la base. Les comptes de test et les données de démonstration (tarifs et contrat **fictifs**) sont décrits en tête de `public/assets/js/donnees-demo.js`. Le bandeau jaune permet de tout réinitialiser.

Les pages n'appellent que `assets/js/api.js`. Le branchement Supabase consistera à écrire `api-supabase.js` avec les mêmes fonctions, puis à passer `MODE` à `'supabase'`.

## Installation de Supabase (une seule fois, environ 15 min, au moment du branchement)

### 1. Créer le projet
1. Créez un compte sur [supabase.com](https://supabase.com), puis **New project**.
2. Nom : `expomanage`. Région : **West EU (Paris)** ou **Central EU (Frankfurt)**, les plus proches du Bénin.
3. Notez le mot de passe de la base dans un endroit sûr.

### 2. Régler l'authentification
Dans **Authentication > Sign In / Providers > Email** :
- **Enable Email provider** : activé
- **Confirm email** : **désactivé** (les exposants se connectent par téléphone, aucun e-mail n'est envoyé)
- **Minimum password length** : 6

### 3. Créer la base
Dans **SQL Editor > New query**, collez puis exécutez (**Run**), dans cet ordre :
1. le contenu de `supabase/migrations/001_schema.sql`
2. le contenu de `supabase/migrations/002_stockage.sql`

### 4. Créer le premier super administrateur
1. **Authentication > Users > Add user > Create new user** : votre e-mail et un mot de passe, en cochant *Auto Confirm User*.
2. Dans **SQL Editor**, exécutez (en remplaçant l'e-mail et le nom) :
   ```sql
   insert into public.admins (user_id, nom, role)
   select id, 'Votre nom', 'super_admin' from auth.users where email = 'votre@email.com';
   ```

### 5. Brancher le front
Dans **Project Settings > API**, copiez **Project URL** et la clé **anon / publishable** dans `public/assets/js/config.js`.
Ne copiez **jamais** la clé `service_role` / `secret` dans le front.

## Lancer en local

Depuis le dossier du projet, avec Ruby (déjà présent sur macOS, aucune licence à accepter) :

```bash
ruby -run -e httpd public -p 8080
```

Puis ouvrez http://localhost:8080. Faites `Ctrl+C` pour arrêter.

> `python3` sur macOS passe par les outils Xcode et demande d'accepter leur licence (`sudo xcodebuild -license accept`). Ruby évite cette étape.

## Règles métier garanties par la base
- **Prix figé** : le tarif en vigueur le jour de la demande est copié dans la demande.
- **Une catégorie par demande**, avec une quantité de 1 ou plus.
- **Le contrat en vigueur est obligatoirement accepté** à chaque demande. L'acceptation enregistre la version, la date et l'heure, l'IP et le navigateur.
- **Statut automatique** : la demande passe en *Validée* au premier paiement validé (ou si elle est gratuite), puis en *Stand attribué* dès qu'un stand lui est attribué.
- **Paiements** : ceux déclarés par l'exposant arrivent toujours *En attente*. Seul un super admin peut modifier un paiement déjà validé.
- **Reste à payer** = montant dû − (paiements validés − remboursements), toujours calculé (vue `v_demandes`).
- **Journal d'audit** de toutes les modifications, que l'on ne peut pas effacer depuis l'application.
- **Confidentialité** : chaque exposant ne voit que son profil, ses demandes, ses paiements et ses justificatifs.
