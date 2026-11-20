-- =============================================================================
-- ExpoManage : compléments pour le branchement de l'application
-- À exécuter après 001_schema.sql et 002_stockage.sql (SQL Editor > New query > Run).
--
-- - règles métier encore manquantes côté base ;
-- - gestion des comptes par l'administration (création d'admin, mot de passe,
--   changement de numéro, suppression) sans clé secrète dans le navigateur.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Règles métier
-- -----------------------------------------------------------------------------

-- Une seule édition ouverte aux inscriptions à la fois
create unique index if not exists une_seule_edition_ouverte on public.editions ((true)) where statut = 'ouverte';

-- Chaque nouvelle édition reçoit un « Site principal »
create or replace function public.editions_site_principal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.sites (edition_id, nom, ordre) values (new.id, 'Site principal', 1)
  on conflict do nothing;
  return null;
end $$;
drop trigger if exists editions_site_principal on public.editions;
create trigger editions_site_principal after insert on public.editions
  for each row execute function public.editions_site_principal();

-- Remise : super admin uniquement, avec motif
create or replace function public.demandes_controle_remise() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.remise_montant is distinct from old.remise_montant then
    if not public.est_super_admin() then
      raise exception 'Seul le super administrateur peut accorder une remise.';
    end if;
    if new.remise_montant > 0 and coalesce(trim(new.remise_motif), '') = '' then
      raise exception 'Indiquez le motif de la remise.';
    end if;
  end if;
  if new.statut = 'annulee' and old.statut <> 'annulee' and coalesce(trim(new.motif_annulation), '') = '' then
    raise exception 'Indiquez le motif de l''annulation.';
  end if;
  return new;
end $$;
drop trigger if exists demandes_controle_remise on public.demandes;
create trigger demandes_controle_remise before update on public.demandes
  for each row execute function public.demandes_controle_remise();

-- Un remboursement ne dépasse pas ce qui a été encaissé
create or replace function public.remboursements_controle() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_paye bigint;
begin
  select coalesce(sum(montant), 0) into v_paye from public.paiements where demande_id = new.demande_id and statut = 'valide';
  select v_paye - coalesce(sum(montant), 0) into v_paye from public.remboursements where demande_id = new.demande_id and id <> new.id;
  if new.montant > v_paye then raise exception 'Le remboursement dépasse le montant payé.'; end if;
  return new;
end $$;
drop trigger if exists remboursements_controle on public.remboursements;
create trigger remboursements_controle before insert or update on public.remboursements
  for each row execute function public.remboursements_controle();
drop trigger if exists remboursements_toucher_demande on public.remboursements;
create trigger remboursements_toucher_demande after insert or update or delete on public.remboursements
  for each row execute function public.toucher_demande();

-- -----------------------------------------------------------------------------
-- 2. Comptes gérés par l'administration
-- -----------------------------------------------------------------------------

-- Crée un compte de connexion (auth.users + identité e-mail), déjà confirmé
create or replace function public._creer_compte(p_email text, p_mdp text) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_id uuid := gen_random_uuid();
begin
  p_email := lower(trim(p_email));
  if exists (select 1 from auth.users where email = p_email) then
    raise exception 'Ce compte existe déjà.';
  end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt(p_mdp, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true), 'email', now(), now(), now());
  return v_id;
end $$;
revoke execute on function public._creer_compte(text, text) from public, anon, authenticated;

-- Liste des administrateurs avec leur e-mail (super admin)
create or replace function public.liste_admins()
returns table (user_id uuid, nom text, role public.role_admin, actif boolean, created_at timestamptz, email text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.est_super_admin() then raise exception 'Action réservée au super administrateur.'; end if;
  return query select a.user_id, a.nom, a.role, a.actif, a.created_at, u.email::text
    from public.admins a join auth.users u on u.id = a.user_id order by a.created_at;
end $$;

-- Création d'un administrateur (super admin)
create or replace function public.creer_admin(p_email text, p_nom text, p_role public.role_admin, p_mdp text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.est_super_admin() then raise exception 'Action réservée au super administrateur.'; end if;
  if coalesce(p_email, '') !~ '^\S+@\S+\.\S+$' then raise exception 'E-mail invalide.'; end if;
  if coalesce(trim(p_nom), '') = '' then raise exception 'Nom obligatoire.'; end if;
  if length(coalesce(p_mdp, '')) < 8 then raise exception 'Mot de passe : 8 caractères minimum.'; end if;
  v_id := public._creer_compte(p_email, p_mdp);
  insert into public.admins (user_id, nom, role) values (v_id, trim(p_nom), coalesce(p_role, 'gestionnaire'));
  return v_id;
end $$;

-- Nouveau mot de passe pour un exposant (admin) ou un administrateur (super admin)
create or replace function public.reinitialiser_mot_de_passe(p_user uuid, p_mdp text)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.est_admin() then raise exception 'Action réservée aux administrateurs.'; end if;
  if exists (select 1 from public.admins where user_id = p_user) and not public.est_super_admin() then
    raise exception 'Action réservée au super administrateur.';
  end if;
  if length(coalesce(p_mdp, '')) < 6 then raise exception '6 caractères minimum.'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_mdp, extensions.gen_salt('bf')), updated_at = now()
  where id = p_user;
  if not found then raise exception 'Compte introuvable.'; end if;
  insert into public.journal_audit (user_id, table_nom, ligne_id, action, apres)
  values (auth.uid(), 'comptes', p_user::text, 'UPDATE', '{"reinitialisation_mot_de_passe": true}');
end $$;

-- Changement du numéro d'un exposant : profil + identifiant de connexion (admin)
create or replace function public.changer_telephone_exposant(p_exposant uuid, p_tel text, p_domaine text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v public.exposants; v_tel text := public.normaliser_telephone(p_tel); v_mail text;
begin
  if not public.est_admin() then raise exception 'Action réservée aux administrateurs.'; end if;
  if v_tel is null or length(v_tel) not between 11 and 13 then raise exception 'Numéro de téléphone invalide.'; end if;
  select * into v from public.exposants where id = p_exposant;
  if not found then raise exception 'Exposant introuvable.'; end if;
  if v.telephone = v_tel then return; end if;
  if exists (select 1 from public.exposants where telephone = v_tel and id <> p_exposant) then
    raise exception 'Ce numéro est déjà utilisé par un autre exposant.';
  end if;
  v_mail := v_tel || '@' || p_domaine;
  if v.user_id is not null then
    if exists (select 1 from auth.users where email = v_mail and id <> v.user_id) then
      raise exception 'Ce numéro est déjà l''identifiant d''un autre compte.';
    end if;
    update auth.users set email = v_mail, updated_at = now() where id = v.user_id;
    update auth.identities set identity_data = identity_data || jsonb_build_object('email', v_mail)
    where user_id = v.user_id and provider = 'email';
  end if;
  update public.exposants set telephone = v_tel where id = p_exposant;
end $$;

-- Suppression d'un exposant sans demande, et de son compte (super admin)
create or replace function public.supprimer_exposant(p_exposant uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid;
begin
  if not public.est_super_admin() then raise exception 'Action réservée au super administrateur.'; end if;
  if exists (select 1 from public.demandes where exposant_id = p_exposant) then
    raise exception 'Cet exposant a des demandes : désactivez-le plutôt.';
  end if;
  delete from public.exposants where id = p_exposant returning user_id into v_user;
  if v_user is not null then delete from auth.users where id = v_user; end if;
end $$;

-- Un administrateur ne peut pas se retirer ses propres droits
create or replace function public.admins_controle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.user_id = auth.uid() and (not new.actif or new.role <> 'super_admin') and old.role = 'super_admin' then
    raise exception 'Vous ne pouvez pas retirer vos propres droits.';
  end if;
  return new;
end $$;
drop trigger if exists admins_controle on public.admins;
create trigger admins_controle before update on public.admins
  for each row execute function public.admins_controle();

revoke execute on function public.creer_admin(text, text, public.role_admin, text) from public, anon;
revoke execute on function public.reinitialiser_mot_de_passe(uuid, text) from public, anon;
revoke execute on function public.changer_telephone_exposant(uuid, text, text) from public, anon;
revoke execute on function public.supprimer_exposant(uuid) from public, anon;
revoke execute on function public.liste_admins() from public, anon;
grant execute on function public.creer_admin(text, text, public.role_admin, text) to authenticated;
grant execute on function public.reinitialiser_mot_de_passe(uuid, text) to authenticated;
grant execute on function public.changer_telephone_exposant(uuid, text, text) to authenticated;
grant execute on function public.supprimer_exposant(uuid) to authenticated;
grant execute on function public.liste_admins() to authenticated;

