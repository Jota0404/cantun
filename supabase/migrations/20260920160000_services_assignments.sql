-- CANTUM: operational Service layer.
-- Additive foundation; Stage remains on its legacy Band contracts for now.

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  starts_at timestamptz not null,
  status text not null default 'planned'
    check (status in ('planned', 'confirmed', 'completed', 'cancelled')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_items (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete restrict,
  position integer not null,
  repertoire_id uuid references public.repertoires(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (service_id, position)
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  musical_function text not null,
  service_item_id uuid references public.service_items(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists services_organization_starts_idx
  on public.services (organization_id, starts_at);

create index if not exists service_items_service_position_idx
  on public.service_items (service_id, position);

create index if not exists assignments_service_idx
  on public.assignments (service_id);

create index if not exists assignments_user_idx
  on public.assignments (user_id);

alter table public.services enable row level security;
alter table public.service_items enable row level security;
alter table public.assignments enable row level security;

create policy "organization members can read services"
  on public.services for select
  using (
    exists (
      select 1 from public.organization_memberships om
      where om.organization_id = services.organization_id
        and om.user_id = auth.uid()
    )
  );

create policy "organization admins can write services"
  on public.services for all
  using (
    exists (
      select 1 from public.organization_memberships om
      where om.organization_id = services.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.organization_memberships om
      where om.organization_id = services.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

create policy "organization members can read service items"
  on public.service_items for select
  using (
    exists (
      select 1
      from public.services s
      join public.organization_memberships om on om.organization_id = s.organization_id
      where s.id = service_items.service_id
        and om.user_id = auth.uid()
    )
  );

create policy "organization admins can write service items"
  on public.service_items for all
  using (
    exists (
      select 1
      from public.services s
      join public.organization_memberships om on om.organization_id = s.organization_id
      where s.id = service_items.service_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.services s
      join public.organization_memberships om on om.organization_id = s.organization_id
      where s.id = service_items.service_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

create policy "organization members can read assignments"
  on public.assignments for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.services s
      join public.organization_memberships om on om.organization_id = s.organization_id
      where s.id = assignments.service_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

create policy "organization admins can write assignments"
  on public.assignments for all
  using (
    exists (
      select 1
      from public.services s
      join public.organization_memberships om on om.organization_id = s.organization_id
      where s.id = assignments.service_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.services s
      join public.organization_memberships om on om.organization_id = s.organization_id
      where s.id = assignments.service_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.service_items to authenticated;
grant select, insert, update, delete on public.assignments to authenticated;
