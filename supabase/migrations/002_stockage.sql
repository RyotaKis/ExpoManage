-- =============================================================================
-- ExpoManage : stockage des fichiers (logos, justificatifs, contrats PDF)
-- À exécuter après 001_schema.sql.
--
-- Convention de chemin : <bucket>/<id du compte>/<nom de fichier>
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('logos',         'logos',         true,  2097152, array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('justificatifs', 'justificatifs', false, 5242880, array['image/png','image/jpeg','image/webp','application/pdf']),
  ('contrats',      'contrats',      true,  10485760, array['application/pdf'])
on conflict (id) do nothing;

-- Logos : lecture publique, dépôt dans son propre dossier (ou par un admin)
create policy logos_depot on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin()));
create policy logos_maj on storage.objects for update to authenticated
  using (bucket_id = 'logos' and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin()));
create policy logos_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin()));

-- Justificatifs : privés. L'exposant voit et dépose les siens, les admins voient tout.
-- Pas de suppression par l'exposant (traçabilité).
create policy justificatifs_depot on storage.objects for insert to authenticated
  with check (bucket_id = 'justificatifs' and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin()));
create policy justificatifs_lecture on storage.objects for select to authenticated
  using (bucket_id = 'justificatifs' and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin()));
create policy justificatifs_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'justificatifs' and public.est_super_admin());

-- Contrats PDF : lecture publique, gestion super admin
create policy contrats_depot on storage.objects for insert to authenticated
  with check (bucket_id = 'contrats' and public.est_super_admin());
create policy contrats_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'contrats' and public.est_super_admin());
