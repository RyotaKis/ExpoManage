// Configuration du projet Supabase.
// Valeurs à copier depuis Supabase > Project Settings > API.
// La clé « anon / publishable » est publique par nature : la sécurité repose sur les règles RLS.
// Ne mettez JAMAIS la clé « service_role » / « secret » ici.

export const SUPABASE_URL = 'https://expomanage.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_vc4_2mc6vmfY1zP-zEqZig_RIYWgcj1';

// Les exposants se connectent avec téléphone + mot de passe.
// En interne, le numéro devient un identifiant de type <229XXXXXXXXXX>@<ce domaine>.
// Aucun e-mail n'est envoyé (confirmation e-mail désactivée dans Supabase).
export const DOMAINE_IDENTIFIANT = 'tel.fenouhigbe.invalid';

export const NOM_MARCHE = 'Fènou HIGBÉ';
