-- CANTUM — B6 fatia 5 / "preparado" por serviço (VS-04-05, RN-15…18, ADR-057 classe A, ADR-063).
-- service_preparations: uma linha por (serviço, usuário) = "preparado"; desmarcar apaga a linha.
-- Gravar (preparation.set_own, P): só a própria linha, membro ATIVO da equipe do serviço, serviço fora de
-- completed/cancelled. Ler (preparation.read_team): o próprio, Owner/Admin da organização do serviço ou Líder
-- ativo da equipe do serviço; Membro comum não lê a dos outros (D4). Não passa por app.has_permission.
-- A linha é do titular: sai com a conta (cascade) e entra em export_my_data.

create table public.service_preparations (
  service_id uuid not null references public.services(id) on delete cascade,
  user_id uuid not null references app.users(id) on delete cascade,
  prepared_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (service_id, user_id)
);
create index service_preparations_user_idx on public.service_preparations (user_id);
alter table public.service_preparations enable row level security;

create function app.can_set_preparation(p_service_id uuid, p_user_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select app.current_user_id() is not null and p_user_id = app.current_user_id() and exists (
    select 1 from public.services s
    join public.team_memberships tm on tm.team_id = s.team_id
    where s.id = p_service_id and s.status not in ('completed', 'cancelled')
      and tm.user_id = app.current_user_id() and tm.status = 'active')
$$;
revoke all on function app.can_set_preparation(uuid, uuid) from public;
grant execute on function app.can_set_preparation(uuid, uuid) to cantum_user;

create function app.can_read_preparation(p_service_id uuid, p_user_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select app.current_user_id() is not null and (
    p_user_id = app.current_user_id()
    or exists (
      select 1 from public.services s
      where s.id = p_service_id and (
        app.has_organization_role(s.organization_id, array['owner', 'admin'])
        or exists (select 1 from public.team_memberships tm
                   where tm.team_id = s.team_id and tm.user_id = app.current_user_id()
                     and tm.role = 'leader' and tm.status = 'active'))))
$$;
revoke all on function app.can_read_preparation(uuid, uuid) from public;
grant execute on function app.can_read_preparation(uuid, uuid) to cantum_user;

create policy service_preparations_select on public.service_preparations for select to cantum_user
  using (app.can_read_preparation(service_id, user_id));
create policy service_preparations_insert on public.service_preparations for insert to cantum_user
  with check (app.can_set_preparation(service_id, user_id));
create policy service_preparations_update on public.service_preparations for update to cantum_user
  using (app.can_set_preparation(service_id, user_id))
  with check (app.can_set_preparation(service_id, user_id));
create policy service_preparations_delete on public.service_preparations for delete to cantum_user
  using (app.can_set_preparation(service_id, user_id));
grant select, insert, update, delete on public.service_preparations to cantum_user;

-- Dono e serviço imutáveis. Compara valores: o upsert do /sync reescreve as colunas e, sem mudança, passa.
create function app.guard_service_preparation() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id or new.service_id is distinct from old.service_id then
    raise exception 'preparation owner and service cannot change' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke all on function app.guard_service_preparation() from public;
create trigger service_preparations_guard before update on public.service_preparations
  for each row execute function app.guard_service_preparation();

-- export_my_data (corpo da 0013) passa a incluir as preparações do titular.
create or replace function public.export_my_data() returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_export jsonb;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;

  v_export := jsonb_build_object(
    'exported_at', now(),
    'profile', (select jsonb_build_object('id', u.id, 'email', u.email, 'display_name', u.display_name, 'created_at', u.created_at)
                from app.users u where u.id = v_user_id),
    'organization_memberships', coalesce((
      select jsonb_agg(jsonb_build_object('organization_id', m.organization_id, 'organization_name', o.name, 'role', m.role, 'created_at', m.created_at) order by m.created_at)
      from public.organization_memberships m join public.organizations o on o.id = m.organization_id
      where m.user_id = v_user_id), '[]'),
    'team_memberships', coalesce((
      select jsonb_agg(jsonb_build_object('team_id', tm.team_id, 'team_name', t.name, 'role', tm.role, 'status', tm.status,
                                          'musical_functions', coalesce((select jsonb_agg(f.musical_function order by f.musical_function)
                                                                         from public.team_musical_functions f where f.team_membership_id = tm.id), '[]'))
                       order by tm.created_at)
      from public.team_memberships tm join public.teams t on t.id = tm.team_id
      where tm.user_id = v_user_id), '[]'),
    'personal_songs', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'artist', s.artist, 'original_key', s.original_key, 'current_key', s.current_key,
                                   'bpm', s.bpm, 'lyrics', s.lyrics, 'notes', s.notes, 'is_favorite', s.is_favorite, 'created_at', s.created_at) order by s.created_at)
      from public.songs s where s.user_id = v_user_id and s.organization_id is null and s.deleted_at is null), '[]'),
    'personal_repertoires', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'created_at', r.created_at,
                                          'song_ids', coalesce((select jsonb_agg(i.song_id order by i."position") from public.repertoire_items i where i.repertoire_id = r.id), '[]'))
                       order by r.created_at)
      from public.repertoires r where r.created_by_user_id = v_user_id and r.organization_id is null), '[]'),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'service_id', a.service_id, 'service_name', s.name, 'starts_at', s.starts_at,
                                          'musical_function', a.musical_function, 'status', a.status) order by s.starts_at)
      from public.assignments a join public.services s on s.id = a.service_id
      where a.user_id = v_user_id), '[]'),
    'availability', coalesce((
      select jsonb_agg(jsonb_build_object('organization_id', v.organization_id, 'date', v.date, 'status', v.status, 'note', v.note) order by v.date)
      from public.member_availability v where v.user_id = v_user_id), '[]'),
    'service_preparations', coalesce((
      select jsonb_agg(jsonb_build_object('service_id', p.service_id, 'service_name', s.name, 'starts_at', s.starts_at, 'prepared_at', p.prepared_at)
                       order by s.starts_at)
      from public.service_preparations p join public.services s on s.id = p.service_id
      where p.user_id = v_user_id), '[]')
  );

  -- RN-09: um evento por organização do titular, sem conteúdo.
  insert into public.admin_events (organization_id, actor_user_id, target_user_id, action)
  select m.organization_id, v_user_id, v_user_id, 'account.export'
  from public.organization_memberships m where m.user_id = v_user_id;

  return v_export;
end;
$$;
