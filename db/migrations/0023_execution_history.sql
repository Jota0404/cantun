-- CANTUM — B7 fatia 3 / registro da execução (VS-06 RN-01…09, RN-16, RN-18; ADR-057 classe C, ADR-063).
-- Decisões do owner adotadas pela RECOMENDAÇÃO da spec, PENDENTES de confirmação do Jota antes de produção:
--   D1 (a): o tom registrado é o planejado/efetivo do serviço, coalesce(service_items.key, songs.current_key),
--           não a transposição ao vivo do Palco.
--   D2 (b): concluir é BLOQUEADO enquanto houver sessão de Palco lobby/live do serviço ('stage session still open');
--           o Stage não muda. Sessão cujo MD é nulo (conta excluída) ou não é mais membro ativo da organização
--           não bloqueia (ninguém mais a encerraria); ela fica como está.
--   D3 (a): a equipe registrada é só quem está 'confirmed'.
-- O registro é um snapshot imutável gerado só pelo servidor, dentro de transition_service ao concluir. cantum_user
-- só lê (RLS: membro ativo da organização); não há INSERT/UPDATE/DELETE para nenhum papel. Sai com o serviço e a
-- organização (cascade). Referências a usuário e música viram nulas na exclusão (a UI mostra "Ex-membro").
-- Activity log (0024, D4/D5) fica fora desta migration.

create table public.service_executions (
  service_id uuid primary key references public.services(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  completed_at timestamptz not null default now(),
  completed_by_user_id uuid references app.users(id) on delete set null,
  stage_started_at timestamptz,
  stage_ended_at timestamptz
);
create index service_executions_org_completed_idx on public.service_executions (organization_id, completed_at desc);
create index service_executions_completed_by_idx on public.service_executions (completed_by_user_id);

create table public.service_execution_songs (
  service_id uuid not null references public.service_executions(service_id) on delete cascade,
  "position" integer not null,
  song_id uuid references public.songs(id) on delete set null,
  title text not null,
  artist text,
  key text,
  primary key (service_id, "position")
);
create index service_execution_songs_song_idx on public.service_execution_songs (song_id, service_id);

create table public.service_execution_members (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.service_executions(service_id) on delete cascade,
  user_id uuid references app.users(id) on delete set null,
  musical_function text not null
);
create index service_execution_members_service_idx on public.service_execution_members (service_id);
create index service_execution_members_user_idx on public.service_execution_members (user_id);

alter table public.service_executions enable row level security;
alter table public.service_execution_songs enable row level security;
alter table public.service_execution_members enable row level security;

create policy service_executions_select on public.service_executions for select to cantum_user
  using (app.is_active_in_organization(organization_id));
create policy service_execution_songs_select on public.service_execution_songs for select to cantum_user
  using (exists (select 1 from public.service_executions e
                 where e.service_id = service_execution_songs.service_id and app.is_active_in_organization(e.organization_id)));
create policy service_execution_members_select on public.service_execution_members for select to cantum_user
  using (exists (select 1 from public.service_executions e
                 where e.service_id = service_execution_members.service_id and app.is_active_in_organization(e.organization_id)));
-- Só leitura: sem policy nem grant de escrita (RN-02).
grant select on public.service_executions, public.service_execution_songs, public.service_execution_members to cantum_user;

-- Snapshot (RN-03…05). Só transition_service chama (sem EXECUTE para cantum_user); a pk impede duplicar.
create function app.record_service_execution(p_service_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  insert into public.service_executions (service_id, organization_id, completed_at, completed_by_user_id, stage_started_at, stage_ended_at)
  select s.id, s.organization_id, now(), app.current_user_id(),
         (select min(ss.started_at) from public.stage_sessions ss where ss.service_id = s.id),
         (select max(ss.ended_at) from public.stage_sessions ss where ss.service_id = s.id)
  from public.services s
  where s.id = p_service_id and s.status = 'completed';
  if not found then raise exception 'service not completed'; end if;

  insert into public.service_execution_songs (service_id, "position", song_id, title, artist, key)
  select si.service_id, si.position, so.id, so.title, so.artist, coalesce(si.key, so.current_key)
  from public.service_items si join public.songs so on so.id = si.song_id
  where si.service_id = p_service_id and si.type = 'song';

  insert into public.service_execution_members (service_id, user_id, musical_function)
  select a.service_id, a.user_id, sp.musical_function
  from public.assignments a join public.service_positions sp on sp.id = a.position_id
  where a.service_id = p_service_id and a.status = 'confirmed';
end;
$$;
revoke all on function app.record_service_execution(uuid) from public;

-- Corpo da 0005 + D2 (b) + registro na mesma transação (RN-01). Erro no registro aborta a conclusão.
create or replace function public.transition_service(p_service_id uuid, p_to text) returns public.services
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_service public.services;
begin
  if app.current_user_id() is null then raise exception 'authentication required'; end if;

  select s.* into v_service from public.services s where s.id = p_service_id for update;
  if v_service.id is null
     or not app.has_permission(v_service.organization_id, v_service.team_id, 'service.transition') then
    raise exception 'service not found or not authorized';
  end if;

  if p_to is null or p_to not in ('draft', 'ready', 'in_progress', 'completed', 'cancelled') then
    raise exception 'invalid service status';
  end if;
  if (v_service.status, p_to) not in (
    ('draft', 'ready'), ('ready', 'draft'), ('ready', 'in_progress'), ('in_progress', 'completed'),
    ('draft', 'cancelled'), ('ready', 'cancelled'), ('in_progress', 'cancelled')
  ) then
    raise exception 'invalid service transition';
  end if;

  if p_to = 'completed' and exists (
    -- Só bloqueia se o MD ainda pode encerrar: não nulo e ativo na organização (mesma regra de app.is_active_in_organization).
    select 1 from public.stage_sessions ss
    join public.organization_memberships om
      on om.organization_id = v_service.organization_id and om.user_id = ss.md_user_id
    where ss.service_id = p_service_id and ss.status in ('lobby', 'live')
      and (om.role in ('owner', 'admin')
           or not exists (select 1 from public.team_memberships tm join public.teams t on t.id = tm.team_id
                          where t.organization_id = v_service.organization_id and tm.user_id = ss.md_user_id)
           or exists (select 1 from public.team_memberships tm join public.teams t on t.id = tm.team_id
                      where t.organization_id = v_service.organization_id and tm.user_id = ss.md_user_id and tm.status = 'active'))
  ) then
    raise exception 'stage session still open';
  end if;

  update public.services set status = p_to, updated_at = now()
  where id = p_service_id
  returning * into v_service;

  if p_to = 'completed' then perform app.record_service_execution(p_service_id); end if;
  return v_service;
end;
$$;

-- Leituras (security invoker: a RLS decide). Anônimo, outra organização e inativo recebem null/vazio.
create function public.get_service_execution(p_service_id uuid) returns jsonb
  language sql stable
  set search_path = ''
as $$
  select jsonb_build_object(
    'service_id', e.service_id, 'organization_id', e.organization_id, 'completed_at', e.completed_at,
    'completed_by_user_id', e.completed_by_user_id, 'stage_started_at', e.stage_started_at, 'stage_ended_at', e.stage_ended_at,
    'songs', coalesce((select jsonb_agg(jsonb_build_object('position', x.position, 'song_id', x.song_id, 'title', x.title,
                                                           'artist', x.artist, 'key', x.key) order by x.position)
                       from public.service_execution_songs x where x.service_id = e.service_id), '[]'),
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'musical_function', m.musical_function)
                                          order by m.musical_function, m.user_id)
                         from public.service_execution_members m where m.service_id = e.service_id), '[]'))
  from public.service_executions e
  where e.service_id = p_service_id
$$;
revoke all on function public.get_service_execution(uuid) from public;
grant execute on function public.get_service_execution(uuid) to cantum_user;

-- RN-07: última vez, frequência em 12 meses (serviços distintos), tons com contagem e os 5 últimos serviços.
create function public.get_song_history(p_song_id uuid) returns jsonb
  language sql stable
  set search_path = ''
as $$
  with plays as (
    select distinct on (e.service_id) e.service_id, e.completed_at, x.key, s.name, s.starts_at
    from public.service_execution_songs x
    join public.service_executions e on e.service_id = x.service_id
    join public.services s on s.id = e.service_id
    where x.song_id = p_song_id
    order by e.service_id, x.position
  )
  select jsonb_build_object(
    'last_played_at', (select max(p.completed_at) from plays p),
    'plays_last_12_months', (select count(*) from plays p where p.completed_at >= now() - interval '12 months'),
    'keys', coalesce((select jsonb_agg(jsonb_build_object('key', k.key, 'count', k.n) order by k.n desc, k.key)
                      from (select p.key, count(*) as n from plays p group by p.key) k), '[]'),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('service_id', r.service_id, 'service_name', r.name, 'starts_at', r.starts_at,
                                                            'completed_at', r.completed_at, 'key', r.key) order by r.completed_at desc)
                        from (select * from plays p order by p.completed_at desc limit 5) r), '[]'))
$$;
revoke all on function public.get_song_history(uuid) from public;
grant execute on function public.get_song_history(uuid) to cantum_user;

-- export_my_data (corpo da 0020) passa a incluir as participações do titular (RN-18), sem dados de terceiros.
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
      where p.user_id = v_user_id), '[]'),
    'service_participations', coalesce((
      select jsonb_agg(jsonb_build_object('service_id', e.service_id, 'service_name', s.name, 'starts_at', s.starts_at,
                                          'completed_at', e.completed_at, 'musical_function', m.musical_function)
                       order by e.completed_at)
      from public.service_execution_members m
      join public.service_executions e on e.service_id = m.service_id
      join public.services s on s.id = e.service_id
      where m.user_id = v_user_id), '[]')
  );

  -- RN-09: um evento por organização do titular, sem conteúdo.
  insert into public.admin_events (organization_id, actor_user_id, target_user_id, action)
  select m.organization_id, v_user_id, v_user_id, 'account.export'
  from public.organization_memberships m where m.user_id = v_user_id;

  return v_export;
end;
$$;
