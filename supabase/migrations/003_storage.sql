-- Autonexus 003: storage bucket + policies for vehicle photos
-- Object paths MUST be: {dealer_id}/{vehicle_id}/{filename}

insert into storage.buckets (id, name, public)
values ('vehicle-photos', 'vehicle-photos', false)
on conflict (id) do nothing;

-- Members of the dealer (first path segment) can read.
create policy "dealer members read photos"
  on storage.objects for select
  using (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1]::uuid in (select public.user_dealer_ids())
  );

-- Only owner/admin can upload/delete.
create policy "owner/admin upload photos"
  on storage.objects for insert
  with check (
    bucket_id = 'vehicle-photos'
    and public.user_role_in((storage.foldername(name))[1]::uuid) in ('owner', 'admin')
  );

create policy "owner/admin delete photos"
  on storage.objects for delete
  using (
    bucket_id = 'vehicle-photos'
    and public.user_role_in((storage.foldername(name))[1]::uuid) in ('owner', 'admin')
  );
