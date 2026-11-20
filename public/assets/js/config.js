// Configuration de l'application.

// 'local'    : tout fonctionne dans le navigateur (données de démonstration, rien n'est envoyé).
// 'supabase' : branchement sur le projet Supabase (à activer plus tard).
export const MODE = 'supabase';

// --- Supabase (mode 'supabase') ---------------------------------------------
// Valeurs à copier depuis Supabase > Project Settings > API.
// La clé « anon / publishable » est publique par nature : la sécurité repose sur les règles RLS.
// Ne mettez JAMAIS la clé « service_role » / « secret » ici.
// URL du projet, sans /rest/v1 à la fin.
export const SUPABASE_URL = 'https://oxgyxlvvctnwfmywciua.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_vc4_2mc6vmfY1zP-zEqZig_RIYWgcj1';

// Les exposants se connectent avec téléphone + mot de passe.
// En interne, le numéro devient un identifiant de type <229XXXXXXXXXX>@<ce domaine>.
export const DOMAINE_IDENTIFIANT = 'tel.fenouhigbe.invalid';

export const NOM_MARCHE = 'Fènou HIGBÉ';
