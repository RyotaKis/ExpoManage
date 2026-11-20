# Mise en ligne : Supabase + Cloudflare Pages

Projet Supabase : `https://oxgyxlvvctnwfmywciua.supabase.co`
Code : https://github.com/RyotaKis/ExpoManage (branche `main`)

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

## 5. Hébergement (Cloudflare Pages, gratuit)

1. https://dash.cloudflare.com › créer un compte gratuit.
2. **Workers & Pages › Create › Pages › Connect to Git** › autoriser GitHub › dépôt `RyotaKis/ExpoManage`.
3. Réglages du build :
   - *Production branch* : `main`
   - *Framework preset* : **None**
   - *Build command* : **(vide)**
   - *Build output directory* : **`public`**
4. **Save and Deploy**. Le site est servi en HTTPS sur `https://<nom>.pages.dev`.
   Chaque `git push` sur `main` le met à jour automatiquement.
5. Reporter cette adresse dans Supabase (étape 2, *Site URL*).

Nom de domaine personnalisé (plus tard) : Pages › projet › **Custom domains**.

## 6. À chaque mise à jour importante

- Incrémenter `VERSION` en haut de `public/sw.js` (`v1` → `v2`…) pour que les téléphones
  qui ont installé l'application récupèrent la nouvelle version.

## Sécurité

- La clé `publishable` / `anon` dans `config.js` est publique par nature : la sécurité repose
  sur les règles RLS de la base.
- Ne jamais mettre la clé `secret` / `service_role` dans le code.
- Revenir aux données de démonstration (sans Supabase) : `MODE = 'local'` dans `public/assets/js/config.js`.
