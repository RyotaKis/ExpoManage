# Mise en ligne : Supabase + Cloudflare Pages

Projet Supabase : `https://oxgyxlvvctnwfmywciua.supabase.co`
Code : https://github.com/RyotaKis/ExpoManage (branche `main`)
Site en ligne : https://expomanage.pdreck06.workers.dev (Cloudflare Workers, déployé à chaque push)

## 1. Base de données (Supabase › SQL Editor)

| Script | État |
|---|---|
| `supabase/migrations/001_schema.sql` | ✅ déjà exécuté |
| `supabase/migrations/002_stockage.sql` | ✅ déjà exécuté |
| `supabase/migrations/003_complements.sql` | ⏳ à exécuter : **New query › coller tout le fichier › Run** |

## 2. Connexion par téléphone (Supabase › Authentication)

Les exposants se connectent avec leur numéro, transformé en interne en `229XXXXXXXXXX@tel.fenouhigbe.invalid`.
Aucun e-mail ne doit donc être envoyé :

- **Authentication › Sign In / Providers › Email** :
  - *Enable Email provider* : **activé**
  - *Confirm email* : **désactivé** ← indispensable
- **Authentication › URL Configuration** : *Site URL* = l'adresse du site une fois en ligne
  (ex. `https://expomanage.pages.dev`).

## 3. Premier super administrateur

1. **Authentication › Users › Add user › Create new user** :
   votre e-mail, un mot de passe solide, cocher **Auto Confirm User**.
2. **SQL Editor**, remplacer l'e-mail puis exécuter :

```sql
insert into public.admins (user_id, nom, role)
select id, 'Phanel', 'super_admin' from auth.users where email = 'VOTRE-EMAIL@exemple.com';
```

Les autres administrateurs se créent ensuite depuis l'application (**Paramètres › Utilisateurs**).

## 4. Préparer l'édition (dans l'application, `/admin/`)

**Paramètres › Configuration** :

1. Créer l'édition (nom, préfixe ex. `FH26`, dates 22 → 25/12/2026, lieu, instructions de paiement) ;
   un « Site principal » est créé automatiquement.
2. Ajouter les **tarifs** par catégorie et par période (préférentiel, normal…).
3. Rédiger puis **publier** le contrat d'exploitation.
4. Passer l'édition au statut **Ouverte** : les inscriptions démarrent.

## 5. Hébergement (Cloudflare, gratuit)

Le fichier `wrangler.jsonc` à la racine indique à Cloudflare de publier le dossier `public/` tel quel.

1. https://dash.cloudflare.com › **Workers & Pages › Créer › Importer un dépôt** › `RyotaKis/ExpoManage`.
2. Réglages :
   - *Nom du projet* : `expomanage`
   - *Commande de build* : **(vide)**
   - *Commande de déploiement* : `npx wrangler deploy`
   - *Commande de version (aperçu)* : `npx wrangler versions upload` (proposée par défaut)
   - Jeton d’API : laisser Cloudflare le créer
3. **Déployer**. Le site est servi en HTTPS sur `https://expomanage.<votre-compte>.workers.dev`.
   Chaque `git push` sur `main` le met à jour automatiquement.
4. Reporter cette adresse dans Supabase (étape 2, *Site URL*).

Nom de domaine personnalisé (plus tard) : projet › **Paramètres › Domaines et routes**.

## 6. À chaque mise à jour importante

- Incrémenter `VERSION` en haut de `public/sw.js` (`v1` → `v2`…) pour que les téléphones
  qui ont installé l'application récupèrent la nouvelle version.

## Sécurité

- La clé `publishable` / `anon` dans `config.js` est publique par nature : la sécurité repose
  sur les règles RLS de la base.
- Ne jamais mettre la clé `secret` / `service_role` dans le code.
- Revenir aux données de démonstration (sans Supabase) : `MODE = 'local'` dans `public/assets/js/config.js`.
