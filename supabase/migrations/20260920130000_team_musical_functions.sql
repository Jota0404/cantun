create table public.team_musical_functions (
  id uuid primary key default gen_random_uuid(),
  team_membership_id uuid not null references public.team_memberships(id) on delete cascade,
  musical_function text not null check (musical_function in (
    'vocals','electric-guitar','acoustic-guitar','bass','drums',
    'keys','piano','strings','brass','woodwinds','other'
  )),
  created_at timestamptz not null default now(),
  unique (team_membership_id, musical_function)
);

create index team_musical_functions_membership_idx
  on public.team_musical_functions(team_membership_id);

alter table public.team_musical_functions enable row level security;
revoke all on table public.team_musical_functions from anon;
grant select, insert, delete on table public.team_musical_functions to authenticated;

create policy "Team members can read musical functions"
on public.team_musical_functions for select to authenticated
using (
  exists (
    select 1 from public.team_memberships tm
    where tm.id = team_musical_functions.team_membership_id
      and tm.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id
    join public.organization_memberships om on om.organization_id = t.organization_id
    where tm.id = team_musical_functions.team_membership_id
      and om.user_id = auth.uid()
      and om.role in ('owner','admin')
  )
);

create policy "Team members can add own musical functions"
on public.team_musical_functions for insert to authenticated
with check (
  exists (
    select 1 from public.team_memberships tm
    where tm.id = team_musical_functions.team_membership_id
      and tm.user_id = auth.uid()
  )
);

create policy "Team members can remove own musical functions"
on public.team_musical_functions for delete to authenticated
using (
  exists (
    select 1 from public.team_memberships tm
    where tm.id = team_musical_functions.team_membership_id
      and tm.user_id = auth.uid()
  )
);

create or replace function public.get_my_team_musical_functions(p_team_id uuid)
returns table (musical_function text)
language sql stable security definer set search_path = ''
as $$
  select tmf.musical_function
  from public.team_musical_functions tmf
  join public.team_memberships tm on tm.id = tmf.team_membership_id
  where tm.team_id = p_team_id
    and tm.user_id = auth.uid()
  order by tmf.musical_function;
$$;

create or replace function public.set_my_team_musical_functions(
  p_team_id uuid,
  p_musical_functions text[]
)
returns table (musical_function text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_membership_id uuid;
  v_function text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select tm.id into v_membership_id
  from public.team_memberships tm
  where tm.team_id = p_team_id and tm.user_id = auth.uid();

  if v_membership_id is null then raise exception 'team membership not found'; end if;

  delete from public.team_musical_functions
  where team_membership_id = v_membership_id;

  foreach v_function in array p_musical_functions loop
    if v_function not in (
      'vocals','electric-guitar','acoustic-guitar','bass','drums',
      'keys','piano','strings','brass','woodwinds','other'
    ) then raise exception 'invalid musical function'; end if;

    insert into public.team_musical_functions(team_membership_id, musical_function)
    values (v_membership_id, v_function)
    on conflict do nothing;
  end loop;

  return query
    select tmf.musical_function
    from public.team_musical_functions tmf
    where tmf.team_membership_id = v_membership_id
    order by tmf.musical_function;
end;
$$;

revoke all on function public.get_my_team_musical_functions(uuid),
  public.set_my_team_musical_functions(uuid, text[]) from public, anon;
grant execute on function public.get_my_team_musical_functions(uuid),
  public.set_my_team_musical_functions(uuid, text[]) to authenticated;

insert into public.team_musical_functions (team_membership_id, musical_function)
select l.team_membership_id, bm.musical_role
from private.legacy_band_member_mappings l
join public.band_members bm on bm.id = l.band_member_id
where bm.musical_role is not null
on conflict do nothing;
