-- =============================================================================
-- ExpoManage : version 2
-- À exécuter après 003_complements.sql (SQL Editor > New query > coller > Run).
--
-- - inscription avec téléphone + mot de passe seulement ; le profil se complète
--   au moment de la réservation ;
-- - produits et équipements déclarés dans chaque demande (article 6 du contrat) ;
-- - contrat rempli : les informations de la réservation sont figées à la signature ;
-- - plusieurs éditions peuvent être ouvertes en même temps.
-- =============================================================================

-- 1. Profil minimal à l'inscription ----------------------------------------------
alter table public.exposants alter column nom drop not null;
alter table public.exposants alter column prenoms drop not null;
alter table public.exposants alter column entreprise drop not null;

create or replace function public.inscrire_exposant(p jsonb) returns public.exposants
language plpgsql security definer set search_path = public as $$
declare
  v_tel  text := public.normaliser_telephone(p ->> 'telephone');
  v_mail text := auth.jwt() ->> 'email';
  v      public.exposants;
begin
  if auth.uid() is null then raise exception 'Vous devez être connecté.'; end if;
  if v_tel is null or split_part(v_mail, '@', 1) <> v_tel then
    raise exception 'Le numéro ne correspond pas au compte.';
  end if;

  select * into v from public.exposants where telephone = v_tel;
  if found and v.user_id is not null and v.user_id <> auth.uid() then
    raise exception 'Ce numéro est déjà utilisé par un autre compte.';
  end if;

  if found then
    -- profil créé auparavant par l'organisation : on le rattache au compte
    perform set_config('expo.inscription', 'on', true);
    update public.exposants set user_id = auth.uid() where id = v.id returning * into v;
    perform set_config('expo.inscription', '', true);
  else
    insert into public.exposants (user_id, telephone, nom, prenoms, entreprise)
    values (auth.uid(), v_tel, nullif(trim(p ->> 'nom'), ''), nullif(trim(p ->> 'prenoms'), ''),
            nullif(trim(p ->> 'entreprise'), ''))
    returning * into v;
  end if;
  return v;
end $$;

-- 2. Demandes : produits et équipements déclarés ----------------------------------
alter table public.demandes add column if not exists produits text;
alter table public.demandes add column if not exists equipements text;

-- 3. Contrat rempli : informations figées à l'acceptation -------------------------
alter table public.acceptations_contrat add column if not exists donnees jsonb;

drop function if exists public.creer_demande(uuid, uuid, uuid, integer, uuid, boolean, text, uuid);

create or replace function public.creer_demande(
  p_edition uuid, p_site uuid, p_categorie uuid, p_quantite integer,
  p_contrat uuid, p_consentement boolean,
  p_note text default null, p_exposant uuid default null,
  p_produits text default null, p_equipements text default null
) returns public.demandes
language plpgsql security definer set search_path = public as $$
declare
  v_exposant public.exposants;
  v_ed       public.editions;
  v_site     public.sites;
  v_cat      public.categories;
  v_tarif    public.tarifs;
  v_contrat  public.contrats;
  v_num      integer;
  v_dem      public.demandes;
  v_headers  json;
begin
  if p_exposant is not null then
    if not public.est_admin() then raise exception 'Action réservée aux administrateurs.'; end if;
    select * into v_exposant from public.exposants where id = p_exposant;
  else
    select * into v_exposant from public.exposants where id = public.mon_exposant_id();
  end if;
  if v_exposant.id is null then raise exception 'Profil exposant introuvable.'; end if;
  if coalesce(trim(v_exposant.nom), '') = '' or coalesce(trim(v_exposant.prenoms), '') = ''
     or coalesce(trim(v_exposant.entreprise), '') = '' then
    raise exception 'Complétez vos informations (nom, prénoms, entreprise) avant de réserver.';
  end if;
  if coalesce(trim(p_produits), '') = '' then
    raise exception 'Indiquez les produits ou services que vous proposerez sur votre stand.';
  end if;

  if p_quantite is null or p_quantite < 1 then raise exception 'Le nombre de stands doit être au moins 1.'; end if;
  if not coalesce(p_consentement, false) then raise exception 'Vous devez accepter le contrat d''exploitation.'; end if;

  select * into v_ed from public.editions where id = p_edition for update;
  if not found then raise exception 'Édition introuvable.'; end if;
  if v_ed.statut <> 'ouverte' and not public.est_admin() then
    raise exception 'Les inscriptions ne sont pas ouvertes pour cette édition.';
  end if;
  select * into v_site from public.sites where id = p_site and edition_id = p_edition;
  if not found then raise exception 'Site invalide pour cette édition.'; end if;
  select * into v_cat from public.categories where id = p_categorie;

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
                               tarif_id, tarif_libelle, prix_unitaire, note_exposant, cree_par,
                               produits, equipements)
  values (v_ed.prefixe || '-' || lpad(v_num::text, 4, '0'), v_exposant.id, p_edition, p_site, p_categorie,
          p_quantite, v_tarif.id, v_tarif.libelle, v_tarif.prix_unitaire, nullif(trim(p_note), ''), auth.uid(),
          trim(p_produits), nullif(trim(p_equipements), ''))
  returning * into v_dem;

  v_headers := nullif(current_setting('request.headers', true), '')::json;
  insert into public.acceptations_contrat (demande_id, exposant_id, contrat_id, consentement,
                                           accepte_par, adresse_ip, navigateur, donnees)
  values (v_dem.id, v_exposant.id, v_contrat.id, true, auth.uid(),
          split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1),
          left(v_headers ->> 'user-agent', 300),
          jsonb_build_object(
            'numero', v_dem.numero,
            'nom', v_exposant.nom, 'prenoms', v_exposant.prenoms, 'entreprise', v_exposant.entreprise,
            'telephone', v_exposant.telephone, 'adresse', v_exposant.adresse, 'ville', v_exposant.ville,
            'ifu', v_exposant.ifu, 'rccm', v_exposant.rccm,
            'edition', v_ed.nom, 'lieu', v_ed.lieu, 'date_debut', v_ed.date_debut, 'date_fin', v_ed.date_fin,
            'site', v_site.nom, 'categorie', v_cat.nom, 'quantite', p_quantite,
            'prix_unitaire', v_tarif.prix_unitaire, 'montant', v_tarif.prix_unitaire * p_quantite,
            'produits', trim(p_produits), 'equipements', nullif(trim(p_equipements), ''),
            'date', now()));

  return v_dem;
end $$;

revoke execute on function public.creer_demande(uuid, uuid, uuid, integer, uuid, boolean, text, uuid, text, text) from public, anon;
grant  execute on function public.creer_demande(uuid, uuid, uuid, integer, uuid, boolean, text, uuid, text, text) to authenticated;

-- 4. Plusieurs éditions ouvertes en même temps -----------------------------------
drop index if exists public.une_seule_edition_ouverte;

-- 5. Vue de suivi : nom affiché même si le profil est incomplet -------------------
drop view if exists public.v_demandes;
create view public.v_demandes with (security_invoker = true) as
select
  d.*,
  trim(coalesce(e.nom, '') || ' ' || coalesce(e.prenoms, '')) as exposant_nom,
  coalesce(e.entreprise, e.telephone)                          as entreprise,
  e.telephone,
  ed.nom                              as edition_nom,
  ed.prefixe                          as edition_prefixe,
  ed.date_debut                       as edition_date_debut,
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

-- 6. Message exact quand un stand est déjà attribué à la même demande -------------
create or replace function public.attributions_controle() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_site uuid; v_qte int; v_nb int; v_autre text;
begin
  new.code_stand := upper(trim(new.code_stand));
  select site_id, quantite into v_site, v_qte from public.demandes where id = new.demande_id;
  if exists (select 1 from public.attributions where demande_id = new.demande_id and code_stand = new.code_stand and id <> new.id) then
    raise exception 'Le stand % est déjà attribué à cette demande.', new.code_stand;
  end if;
  select d.numero into v_autre from public.attributions a join public.demandes d on d.id = a.demande_id
  where d.site_id = v_site and a.code_stand = new.code_stand and a.id <> new.id and d.statut <> 'annulee' limit 1;
  if v_autre is not null then
    raise exception 'Le stand % est déjà attribué à la demande %.', new.code_stand, v_autre;
  end if;
  select count(*) into v_nb from public.attributions where demande_id = new.demande_id and id <> new.id;
  if v_nb >= v_qte then
    raise exception 'Cette demande a déjà ses % stand(s) attribué(s).', v_qte;
  end if;
  return new;
end $$;
