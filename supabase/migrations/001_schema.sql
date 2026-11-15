-- =============================================================================
-- ExpoManage : schéma de la base (Supabase / PostgreSQL)
-- Marché Fènou HIGBÉ
--
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller > Run.
-- Montants en FCFA, entiers.
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- -----------------------------------------------------------------------------
-- 1. Types
-- -----------------------------------------------------------------------------
create type public.statut_edition  as enum ('brouillon', 'ouverte', 'fermee', 'terminee');
create type public.statut_demande  as enum ('en_attente_paiement', 'validee', 'attribuee', 'annulee');
create type public.statut_paiement as enum ('en_attente', 'valide', 'rejete');
create type public.moyen_paiement  as enum ('mtn_momo', 'moov_money', 'celtiis_cash', 'virement', 'especes', 'cheque', 'autre');
create type public.origine_paiement as enum ('exposant', 'admin');
create type public.role_admin      as enum ('super_admin', 'gestionnaire');

-- -----------------------------------------------------------------------------
-- 2. Administrateurs et fonctions d'accès
-- -----------------------------------------------------------------------------
create table public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nom        text not null,
  role       public.role_admin not null default 'gestionnaire',
  actif      boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid() and actif);
$$;

create or replace function public.est_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid() and actif and role = 'super_admin');
$$;

-- Date du jour au Bénin (UTC+1)
create or replace function public.aujourdhui() returns date
language sql stable as $$
  select (now() at time zone 'Africa/Porto-Novo')::date;
$$;

-- Téléphone normalisé : chiffres uniquement, indicatif 229 ajouté si absent
create or replace function public.normaliser_telephone(p text) returns text
language sql immutable as $$
  select case
    when regexp_replace(coalesce(p, ''), '\D', '', 'g') = '' then null
    when regexp_replace(p, '\D', '', 'g') like '229%' then regexp_replace(p, '\D', '', 'g')
    else '229' || regexp_replace(p, '\D', '', 'g')
  end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Exposants (répertoire permanent)
-- -----------------------------------------------------------------------------
create table public.exposants (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid unique references auth.users(id) on delete set null,
  nom                  text not null,
  prenoms              text not null,
  telephone            text not null unique,
  telephone_secondaire text,
  whatsapp             text,
  entreprise           text not null,
  logo_path            text,
  email                text,
  ifu                  text,
  rccm                 text,
  adresse              text,
  ville                text,
  secteur              text,
  description          text,
  notes_admin          text,
  actif                boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create or replace function public.mon_exposant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.exposants where user_id = auth.uid();
$$;

-- Un exposant ne peut changer ni son téléphone (identifiant de connexion) ni son lien de compte
create or replace function public.exposants_avant_maj() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.telephone := public.normaliser_telephone(new.telephone);
  if tg_op = 'UPDATE' and not public.est_admin()
     and coalesce(current_setting('expo.inscription', true), '') <> 'on' then
    if new.telephone is distinct from old.telephone or new.user_id is distinct from old.user_id
       or new.notes_admin is distinct from old.notes_admin or new.actif is distinct from old.actif then
      raise exception 'Modification non autorisée. Contactez l''organisation.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger exposants_avant_maj before insert or update on public.exposants
  for each row execute function public.exposants_avant_maj();

-- -----------------------------------------------------------------------------
-- 4. Éditions, sites, catégories, tarifs
-- -----------------------------------------------------------------------------
create table public.editions (
  id                    uuid primary key default gen_random_uuid(),
  nom                   text not null,
  prefixe               text not null unique,           -- ex. FH26 → demandes FH26-0001
  date_debut            date not null,
  date_fin              date not null,
  lieu                  text,
  statut                public.statut_edition not null default 'brouillon',
  instructions_paiement text,                           -- numéros Mobile Money, RIB… (affiché aux exposants)
  dernier_numero        integer not null default 0,
  created_at            timestamptz not null default now(),
  check (date_fin >= date_debut)
);

-- Sites d'une édition (un seul si le marché se tient en un lieu)
create table public.sites (
  id         uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  nom        text not null,
  ordre      integer not null default 0,
  unique (edition_id, nom)
);

create table public.familles (
  id    uuid primary key default gen_random_uuid(),
  nom   text not null unique,
  ordre integer not null default 0
);

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  famille_id  uuid not null references public.familles(id),
  nom         text not null,
  description text,
  surface_m2  numeric,
  actif       boolean not null default true,
  ordre       integer not null default 0,
  unique (famille_id, nom)
);

create table public.tarifs (
  id            uuid primary key default gen_random_uuid(),
  edition_id    uuid not null references public.editions(id) on delete cascade,
  site_id       uuid not null references public.sites(id) on delete cascade,
  categorie_id  uuid not null references public.categories(id),
  libelle       text not null default 'Tarif normal',
  prix_unitaire bigint not null check (prix_unitaire >= 0),
  date_debut    date not null,
  date_fin      date not null,
  created_at    timestamptz not null default now(),
  check (date_fin >= date_debut),
  -- Pas deux tarifs en vigueur le même jour pour la même catégorie et le même site
  exclude using gist (
    site_id with =, categorie_id with =,
    daterange(date_debut, date_fin, '[]') with &&
  )
);

-- -----------------------------------------------------------------------------
-- 5. Contrats d'exploitation (versionnés)
-- -----------------------------------------------------------------------------
create table public.contrats (
  id           uuid primary key default gen_random_uuid(),
  edition_id   uuid references public.editions(id),   -- null = contrat générique
  version      integer not null,
  titre        text not null,
  contenu      text not null,                          -- texte du contrat (HTML simple ou Markdown)
  fichier_path text,                                   -- PDF éventuel
  publie_le    timestamptz,                            -- null = brouillon
  actif        boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (edition_id, version)
);

-- Une version publiée ne se modifie plus : on en crée une nouvelle
create or replace function public.contrats_avant_maj() returns trigger
language plpgsql as $$
begin
  if old.publie_le is not null and (
       new.contenu is distinct from old.contenu or new.titre is distinct from old.titre
    or new.version is distinct from old.version or new.fichier_path is distinct from old.fichier_path
    or new.edition_id is distinct from old.edition_id or new.publie_le is distinct from old.publie_le) then
    raise exception 'Un contrat publié ne peut pas être modifié. Créez une nouvelle version.';
  end if;
  return new;
end $$;
create trigger contrats_avant_maj before update on public.contrats
  for each row execute function public.contrats_avant_maj();

-- Contrat en vigueur pour une édition : le plus récent publié et actif
create or replace function public.contrat_en_vigueur(p_edition uuid) returns public.contrats
language sql stable security definer set search_path = public as $$
  select * from public.contrats
  where publie_le is not null and actif and (edition_id = p_edition or edition_id is null)
  order by (edition_id is null), publie_le desc
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- 6. Demandes de stands
-- -----------------------------------------------------------------------------
create table public.demandes (
  id                uuid primary key default gen_random_uuid(),
  numero            text not null unique,
  exposant_id       uuid not null references public.exposants(id),
  edition_id        uuid not null references public.editions(id),
  site_id           uuid not null references public.sites(id),
  categorie_id      uuid not null references public.categories(id),
  quantite          integer not null check (quantite > 0),
  -- valeurs figées à la création
  tarif_id          uuid references public.tarifs(id) on delete set null,
  tarif_libelle     text not null,
  prix_unitaire     bigint not null check (prix_unitaire >= 0),
  montant_brut      bigint not null default 0,          -- calculé par trigger
  remise_montant    bigint not null default 0 check (remise_montant >= 0),
  remise_motif      text,
  montant_du        bigint not null default 0,          -- calculé par trigger
  statut            public.statut_demande not null default 'en_attente_paiement',
  motif_annulation  text,
  note_exposant     text,
  notes_admin       text,
  cree_par          uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index demandes_exposant_idx on public.demandes(exposant_id);
create index demandes_edition_idx on public.demandes(edition_id, statut);

create table public.acceptations_contrat (
  id           uuid primary key default gen_random_uuid(),
  demande_id   uuid not null unique references public.demandes(id) on delete cascade,
  exposant_id  uuid not null references public.exposants(id),
  contrat_id   uuid not null references public.contrats(id),
  accepte_le   timestamptz not null default now(),
  consentement boolean not null check (consentement),
  accepte_par  uuid references auth.users(id),
  adresse_ip   text,
  navigateur   text
);

-- -----------------------------------------------------------------------------
-- 7. Paiements, remboursements, attributions
-- -----------------------------------------------------------------------------
create table public.paiements (
  id                uuid primary key default gen_random_uuid(),
  demande_id        uuid not null references public.demandes(id) on delete restrict,
  montant           bigint not null check (montant > 0),
  date_paiement     date not null,
  moyen             public.moyen_paiement not null,
  reference         text,
  justificatif_path text,
  origine           public.origine_paiement not null default 'exposant',
  statut            public.statut_paiement not null default 'en_attente',
  motif_rejet       text,
  commentaire       text,
  declare_par       uuid references auth.users(id),
  valide_par        uuid references auth.users(id),
  valide_le         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index paiements_demande_idx on public.paiements(demande_id);
create index paiements_statut_idx on public.paiements(statut);

create table public.remboursements (
  id                uuid primary key default gen_random_uuid(),
  demande_id        uuid not null references public.demandes(id) on delete restrict,
  montant           bigint not null check (montant > 0),
  date_remboursement date not null,
  moyen             public.moyen_paiement not null,
  motif             text not null,
  justificatif_path text,
  effectue_par      uuid references auth.users(id) default auth.uid(),
  created_at        timestamptz not null default now()
);

create table public.attributions (
  id           uuid primary key default gen_random_uuid(),
  demande_id   uuid not null references public.demandes(id) on delete cascade,
  code_stand   text not null,                 -- code du stand dans le plan (ex. C12)
  zone         text,
  attribue_par uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (demande_id, code_stand)
);

-- -----------------------------------------------------------------------------
-- 8. Calculs automatiques
-- -----------------------------------------------------------------------------

-- Montants et statut d'une demande, recalculés à chaque modification
create or replace function public.demandes_calculs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.montant_brut := new.prix_unitaire * new.quantite;
  new.montant_du   := greatest(0, new.montant_brut - new.remise_montant);
  new.updated_at   := now();

  if new.statut <> 'annulee' then
    if exists (select 1 from public.attributions where demande_id = new.id) then
      new.statut := 'attribuee';
    elsif new.montant_du = 0
       or exists (select 1 from public.paiements where demande_id = new.id and statut = 'valide') then
      new.statut := 'validee';
    else
      new.statut := 'en_attente_paiement';
    end if;
  end if;
  return new;
end $$;
create trigger demandes_calculs before insert or update on public.demandes
  for each row execute function public.demandes_calculs();

-- Toute modification de paiement ou d'attribution relance le calcul de la demande
create or replace function public.toucher_demande() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.demandes set updated_at = now()
  where id = (case when tg_op = 'DELETE' then old.demande_id else new.demande_id end);
  if tg_op = 'UPDATE' and old.demande_id is distinct from new.demande_id then
    update public.demandes set updated_at = now() where id = old.demande_id;
  end if;
  return null;
end $$;
create trigger paiements_toucher_demande after insert or update or delete on public.paiements
  for each row execute function public.toucher_demande();
create trigger attributions_toucher_demande after insert or update or delete on public.attributions
  for each row execute function public.toucher_demande();

-- Règles sur les paiements
create or replace function public.paiements_avant_maj() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.declare_par := auth.uid();
    if not public.est_admin() then
      new.origine := 'exposant';
      new.statut := 'en_attente';
      new.valide_par := null;
      new.valide_le := null;
    end if;
  else
    if old.statut = 'valide' and not public.est_super_admin() and (
         new.montant is distinct from old.montant or new.date_paiement is distinct from old.date_paiement
      or new.moyen is distinct from old.moyen or new.statut is distinct from old.statut
      or new.demande_id is distinct from old.demande_id) then
      raise exception 'Seul un super administrateur peut modifier un paiement déjà validé.';
    end if;
  end if;

  if new.statut = 'rejete' and coalesce(trim(new.motif_rejet), '') = '' then
    raise exception 'Indiquez le motif du rejet.';
  end if;

  if new.statut in ('valide', 'rejete')
     and (tg_op = 'INSERT' or new.statut is distinct from old.statut) then
    new.valide_par := auth.uid();
    new.valide_le := now();
  elsif new.statut = 'en_attente' then
    new.valide_par := null;
    new.valide_le := null;
  end if;

  new.updated_at := now();
  return new;
end $$;
create trigger paiements_avant_maj before insert or update on public.paiements
  for each row execute function public.paiements_avant_maj();

-- Un code de stand n'est attribué qu'une fois par site
create or replace function public.attributions_controle() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_site uuid; v_qte int; v_nb int;
begin
  new.code_stand := upper(trim(new.code_stand));
  select site_id, quantite into v_site, v_qte from public.demandes where id = new.demande_id;
  if exists (
    select 1 from public.attributions a join public.demandes d on d.id = a.demande_id
    where d.site_id = v_site and a.code_stand = new.code_stand and a.id <> new.id and d.statut <> 'annulee'
  ) then
    raise exception 'Le stand % est déjà attribué à une autre demande.', new.code_stand;
  end if;
  select count(*) into v_nb from public.attributions where demande_id = new.demande_id and id <> new.id;
  if v_nb >= v_qte then
    raise exception 'Cette demande a déjà ses % stand(s) attribué(s).', v_qte;
  end if;
  return new;
end $$;
create trigger attributions_controle before insert or update on public.attributions
  for each row execute function public.attributions_controle();

-- -----------------------------------------------------------------------------
-- 9. Journal d'audit
-- -----------------------------------------------------------------------------
create table public.journal_audit (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  table_nom  text not null,
  ligne_id   text,
  action     text not null,
  avant      jsonb,
  apres      jsonb,
  created_at timestamptz not null default now()
);
create index journal_audit_ligne_idx on public.journal_audit(table_nom, ligne_id);
create index journal_audit_date_idx on public.journal_audit(created_at desc);

create or replace function public.audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.journal_audit (user_id, table_nom, ligne_id, action, avant, apres)
  values (
    auth.uid(), tg_table_name,
    case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'id') else (to_jsonb(new) ->> 'id') end,
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['admins','exposants','editions','sites','familles','categories','tarifs',
                           'contrats','demandes','acceptations_contrat','paiements','remboursements','attributions']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I
                    for each row execute function public.audit()', t, t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 10. Vue de suivi financier
-- -----------------------------------------------------------------------------
create or replace view public.v_demandes with (security_invoker = true) as
select
  d.*,
  e.nom || ' ' || e.prenoms           as exposant_nom,
  e.entreprise,
  e.telephone,
  ed.nom                              as edition_nom,
  s.nom                               as site_nom,
  c.nom                               as categorie_nom,
  f.nom                               as famille_nom,
  coalesce(p.encaisse, 0) - coalesce(r.rembourse, 0)                 as total_paye,
  coalesce(p.en_attente, 0)                                          as montant_en_attente,
  coalesce(p.nb_en_attente, 0)                                       as nb_paiements_en_attente,
  d.montant_du - (coalesce(p.encaisse, 0) - coalesce(r.rembourse, 0)) as reste_a_payer,
  case
    when coalesce(p.encaisse, 0) - coalesce(r.rembourse, 0) > d.montant_du then 'trop_percu'
    when coalesce(p.encaisse, 0) - coalesce(r.rembourse, 0) = d.montant_du then 'solde'
    when coalesce(p.encaisse, 0) - coalesce(r.rembourse, 0) > 0 then 'partiel'
    else 'non_paye'
  end                                                                as statut_financier,
  coalesce(a.nb, 0)                                                  as nb_attribues,
  a.codes                                                            as stands_attribues
from public.demandes d
join public.exposants  e  on e.id = d.exposant_id
join public.editions   ed on ed.id = d.edition_id
join public.sites      s  on s.id = d.site_id
join public.categories c  on c.id = d.categorie_id
join public.familles   f  on f.id = c.famille_id
left join lateral (
  select sum(montant) filter (where statut = 'valide')     as encaisse,
         sum(montant) filter (where statut = 'en_attente') as en_attente,
         count(*)     filter (where statut = 'en_attente') as nb_en_attente
  from public.paiements where demande_id = d.id
) p on true
left join lateral (
  select sum(montant) as rembourse from public.remboursements where demande_id = d.id
) r on true
left join lateral (
  select count(*) as nb, string_agg(code_stand, ', ' order by code_stand) as codes
  from public.attributions where demande_id = d.id
) a on true;

-- -----------------------------------------------------------------------------
-- 11. Fonctions appelées par l'application
-- -----------------------------------------------------------------------------

-- Inscription : crée le profil exposant du compte connecté,
-- ou le rattache à un profil créé auparavant par l'organisation avec le même numéro.
create or replace function public.inscrire_exposant(p jsonb) returns public.exposants
language plpgsql security definer set search_path = public as $$
declare
  v_tel  text := public.normaliser_telephone(p ->> 'telephone');
  v_mail text := auth.jwt() ->> 'email';
  v      public.exposants;
begin
  if auth.uid() is null then raise exception 'Vous devez être connecté.'; end if;
  -- le numéro doit être celui du compte (identifiant = <numéro>@…)
  if v_tel is null or split_part(v_mail, '@', 1) <> v_tel then
    raise exception 'Le numéro ne correspond pas au compte.';
  end if;
  if coalesce(trim(p ->> 'nom'), '') = '' or coalesce(trim(p ->> 'prenoms'), '') = ''
     or coalesce(trim(p ->> 'entreprise'), '') = '' then
    raise exception 'Nom, prénoms et entreprise sont obligatoires.';
  end if;

  select * into v from public.exposants where telephone = v_tel;
  if found and v.user_id is not null and v.user_id <> auth.uid() then
    raise exception 'Ce numéro est déjà utilisé par un autre compte.';
  end if;

  if found then
    perform set_config('expo.inscription', 'on', true);   -- autorise le rattachement du compte
    update public.exposants set
      user_id = auth.uid(),
      nom = trim(p ->> 'nom'), prenoms = trim(p ->> 'prenoms'), entreprise = trim(p ->> 'entreprise'),
      telephone_secondaire = coalesce(nullif(p ->> 'telephone_secondaire', ''), telephone_secondaire),
      whatsapp = coalesce(nullif(p ->> 'whatsapp', ''), whatsapp),
      email = coalesce(nullif(p ->> 'email', ''), email),
      ifu = coalesce(nullif(p ->> 'ifu', ''), ifu),
      rccm = coalesce(nullif(p ->> 'rccm', ''), rccm),
      adresse = coalesce(nullif(p ->> 'adresse', ''), adresse),
      ville = coalesce(nullif(p ->> 'ville', ''), ville),
      secteur = coalesce(nullif(p ->> 'secteur', ''), secteur),
      description = coalesce(nullif(p ->> 'description', ''), description)
    where id = v.id
    returning * into v;
    perform set_config('expo.inscription', '', true);
  else
    insert into public.exposants (user_id, nom, prenoms, telephone, entreprise, telephone_secondaire,
                                  whatsapp, email, ifu, rccm, adresse, ville, secteur, description)
    values (auth.uid(), trim(p ->> 'nom'), trim(p ->> 'prenoms'), v_tel, trim(p ->> 'entreprise'),
            nullif(p ->> 'telephone_secondaire', ''), nullif(p ->> 'whatsapp', ''), nullif(p ->> 'email', ''),
            nullif(p ->> 'ifu', ''), nullif(p ->> 'rccm', ''), nullif(p ->> 'adresse', ''),
            nullif(p ->> 'ville', ''), nullif(p ->> 'secteur', ''), nullif(p ->> 'description', ''))
    returning * into v;
  end if;
  return v;
end $$;

-- Création d'une demande avec prix figé et acceptation du contrat, en une seule opération.
-- p_exposant : réservé aux admins (demande saisie pour le compte d'un exposant).
create or replace function public.creer_demande(
  p_edition uuid, p_site uuid, p_categorie uuid, p_quantite integer,
  p_contrat uuid, p_consentement boolean,
  p_note text default null, p_exposant uuid default null
) returns public.demandes
language plpgsql security definer set search_path = public as $$
declare
  v_exposant uuid;
  v_ed       public.editions;
  v_tarif    public.tarifs;
  v_contrat  public.contrats;
  v_num      integer;
  v_dem      public.demandes;
  v_headers  json;
begin
  if p_exposant is not null then
    if not public.est_admin() then raise exception 'Action réservée aux administrateurs.'; end if;
    v_exposant := p_exposant;
  else
    v_exposant := public.mon_exposant_id();
    if v_exposant is null then raise exception 'Complétez d''abord votre profil exposant.'; end if;
  end if;

  if p_quantite is null or p_quantite < 1 then raise exception 'Le nombre de stands doit être au moins 1.'; end if;
  if not coalesce(p_consentement, false) then raise exception 'Vous devez accepter le contrat d''exploitation.'; end if;

  select * into v_ed from public.editions where id = p_edition for update;
  if not found then raise exception 'Édition introuvable.'; end if;
  if v_ed.statut <> 'ouverte' and not public.est_admin() then
    raise exception 'Les inscriptions ne sont pas ouvertes pour cette édition.';
  end if;
  if not exists (select 1 from public.sites where id = p_site and edition_id = p_edition) then
    raise exception 'Site invalide pour cette édition.';
  end if;

  select * into v_tarif from public.tarifs
  where site_id = p_site and categorie_id = p_categorie and edition_id = p_edition
    and public.aujourdhui() between date_debut and date_fin;
  if not found then raise exception 'Aucun tarif en vigueur aujourd''hui pour cette catégorie.'; end if;

  v_contrat := public.contrat_en_vigueur(p_edition);
  if v_contrat.id is null then raise exception 'Aucun contrat publié pour cette édition.'; end if;
  if v_contrat.id <> p_contrat then
    raise exception 'Le contrat a été mis à jour. Veuillez relire et accepter la nouvelle version.';
  end if;

  update public.editions set dernier_numero = dernier_numero + 1
  where id = p_edition returning dernier_numero into v_num;

  insert into public.demandes (numero, exposant_id, edition_id, site_id, categorie_id, quantite,
                               tarif_id, tarif_libelle, prix_unitaire, note_exposant, cree_par)
  values (v_ed.prefixe || '-' || lpad(v_num::text, 4, '0'), v_exposant, p_edition, p_site, p_categorie,
          p_quantite, v_tarif.id, v_tarif.libelle, v_tarif.prix_unitaire, nullif(trim(p_note), ''), auth.uid())
  returning * into v_dem;

  v_headers := nullif(current_setting('request.headers', true), '')::json;
  insert into public.acceptations_contrat (demande_id, exposant_id, contrat_id, consentement,
                                           accepte_par, adresse_ip, navigateur)
  values (v_dem.id, v_exposant, v_contrat.id, true, auth.uid(),
          split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1),
          left(v_headers ->> 'user-agent', 300));

  return v_dem;
end $$;

-- Tarifs en vigueur aujourd'hui (affichage public)
create or replace function public.tarifs_en_vigueur(p_edition uuid)
returns table (tarif_id uuid, site_id uuid, site_nom text, famille_nom text, famille_ordre int,
               categorie_id uuid, categorie_nom text, description text, surface_m2 numeric, categorie_ordre int,
               libelle text, prix_unitaire bigint, date_fin date)
language sql stable security definer set search_path = public as $$
  select t.id, s.id, s.nom, f.nom, f.ordre, c.id, c.nom, c.description, c.surface_m2, c.ordre,
         t.libelle, t.prix_unitaire, t.date_fin
  from public.tarifs t
  join public.sites s on s.id = t.site_id
  join public.categories c on c.id = t.categorie_id and c.actif
  join public.familles f on f.id = c.famille_id
  join public.editions e on e.id = t.edition_id and e.statut <> 'brouillon'
  where t.edition_id = p_edition and public.aujourdhui() between t.date_debut and t.date_fin
  order by s.ordre, f.ordre, c.ordre;
$$;

revoke execute on function public.creer_demande(uuid, uuid, uuid, integer, uuid, boolean, text, uuid) from public, anon;
revoke execute on function public.inscrire_exposant(jsonb) from public, anon;
grant  execute on function public.creer_demande(uuid, uuid, uuid, integer, uuid, boolean, text, uuid) to authenticated;
grant  execute on function public.inscrire_exposant(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 12. Règles d'accès (Row Level Security)
-- -----------------------------------------------------------------------------
alter table public.admins               enable row level security;
alter table public.exposants            enable row level security;
alter table public.editions             enable row level security;
alter table public.sites                enable row level security;
alter table public.familles             enable row level security;
alter table public.categories           enable row level security;
alter table public.tarifs               enable row level security;
alter table public.contrats             enable row level security;
alter table public.demandes             enable row level security;
alter table public.acceptations_contrat enable row level security;
alter table public.paiements            enable row level security;
alter table public.remboursements       enable row level security;
alter table public.attributions         enable row level security;
alter table public.journal_audit        enable row level security;

-- Admins
create policy admins_lecture on public.admins for select using (user_id = auth.uid() or public.est_admin());
create policy admins_gestion on public.admins for all using (public.est_super_admin()) with check (public.est_super_admin());

-- Exposants : chacun son profil, les admins tout
create policy exposants_lecture on public.exposants for select using (user_id = auth.uid() or public.est_admin());
create policy exposants_maj on public.exposants for update using (user_id = auth.uid() or public.est_admin())
  with check (user_id = auth.uid() or public.est_admin());
create policy exposants_creation_admin on public.exposants for insert with check (public.est_admin());
create policy exposants_suppression on public.exposants for delete using (public.est_super_admin());

-- Configuration : lecture publique (hors brouillons), écriture super admin
create policy editions_lecture on public.editions for select using (statut <> 'brouillon' or public.est_admin());
create policy editions_gestion on public.editions for all using (public.est_super_admin()) with check (public.est_super_admin());
create policy sites_lecture on public.sites for select using (true);
create policy sites_gestion on public.sites for all using (public.est_super_admin()) with check (public.est_super_admin());
create policy familles_lecture on public.familles for select using (true);
create policy familles_gestion on public.familles for all using (public.est_super_admin()) with check (public.est_super_admin());
create policy categories_lecture on public.categories for select using (true);
create policy categories_gestion on public.categories for all using (public.est_super_admin()) with check (public.est_super_admin());
create policy tarifs_lecture on public.tarifs for select using (true);
create policy tarifs_gestion on public.tarifs for all using (public.est_super_admin()) with check (public.est_super_admin());
create policy contrats_lecture on public.contrats for select using (publie_le is not null or public.est_admin());
create policy contrats_gestion on public.contrats for all using (public.est_super_admin()) with check (public.est_super_admin());

-- Demandes : création via creer_demande() uniquement ; modification par les admins
create policy demandes_lecture on public.demandes for select
  using (exposant_id = public.mon_exposant_id() or public.est_admin());
create policy demandes_maj_admin on public.demandes for update using (public.est_admin()) with check (public.est_admin());
create policy demandes_suppression on public.demandes for delete using (public.est_super_admin());

create policy acceptations_lecture on public.acceptations_contrat for select
  using (exposant_id = public.mon_exposant_id() or public.est_admin());

-- Paiements : l'exposant déclare sur ses demandes non annulées ; les admins gèrent
create policy paiements_lecture on public.paiements for select
  using (public.est_admin() or exists (
    select 1 from public.demandes d where d.id = demande_id and d.exposant_id = public.mon_exposant_id()));
create policy paiements_declaration on public.paiements for insert
  with check (public.est_admin() or exists (
    select 1 from public.demandes d where d.id = demande_id
      and d.exposant_id = public.mon_exposant_id() and d.statut <> 'annulee'));
create policy paiements_maj_admin on public.paiements for update using (public.est_admin()) with check (public.est_admin());
create policy paiements_suppression on public.paiements for delete using (public.est_super_admin());

create policy remboursements_lecture on public.remboursements for select
  using (public.est_admin() or exists (
    select 1 from public.demandes d where d.id = demande_id and d.exposant_id = public.mon_exposant_id()));
create policy remboursements_gestion on public.remboursements for all using (public.est_admin()) with check (public.est_admin());

create policy attributions_lecture on public.attributions for select
  using (public.est_admin() or exists (
    select 1 from public.demandes d where d.id = demande_id and d.exposant_id = public.mon_exposant_id()));
create policy attributions_gestion on public.attributions for all using (public.est_admin()) with check (public.est_admin());

create policy journal_lecture on public.journal_audit for select using (public.est_super_admin());

-- -----------------------------------------------------------------------------
-- 13. Données initiales : familles et catégories (sans tarifs)
-- -----------------------------------------------------------------------------
insert into public.familles (nom, ordre) values
  ('Stands produits', 1), ('Stands entreprises', 2), ('Stands restauration', 3);

insert into public.categories (famille_id, nom, surface_m2, ordre)
select f.id, c.nom, c.surface, c.ordre
from (values
  ('Stands produits',     'Stand produit 6 m²',          6,    1),
  ('Stands produits',     'Stand produit 12 m²',         12,   2),
  ('Stands entreprises',  'Stand entreprise',            null, 1),
  ('Stands restauration', 'Restauration unique',         null, 1),
  ('Stands restauration', 'Bar unique',                  null, 2),
  ('Stands restauration', 'Bar et restaurant',           null, 3)
) as c(famille, nom, surface, ordre)
join public.familles f on f.nom = c.famille;
