-- CANTUM — no máximo uma sessão de Palco aberta (lobby/live) por serviço (decisão do Jota, 2026-10-22).
-- "Iniciar palco" criava uma sessão nova a cada chamada; uma sessão órfã aberta trava concluir o serviço (D2, 0023).
-- 1. Encerra as duplicadas existentes, mantendo a ao vivo e, entre iguais, a mais recente (created_at desc, id desc).
-- 2. Índice único parcial em stage_sessions(service_id) para status lobby/live.
-- 3. create_target_stage_session fica idempotente: devolve a sessão aberta do serviço (ou a própria, num retry
--    com o mesmo p_session_id) em vez de criar outra. Sessão aberta de MD que não pode mais operar (sem vínculo,
--    conta excluída ou inativo, a mesma regra da D2) é encerrada e dá lugar à nova; senão o serviço travaria.
-- Encerrar sem ser o MD usa app.stage_override, um GUC local à transação definido só por private.close_stage_session.
-- Mesmo nível de confiança de app.user_id: cantum_user não executa SQL livre e o servidor não expõe set_config.

create or replace function private.assert_stage_operator() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_md_user_id uuid;
begin
  if tg_table_name = 'stage_session_states' then
    if current_setting('app.stage_override', true) = new.stage_session_id::text then
      return new;
    end if;
    select ss.md_user_id into v_md_user_id
    from public.stage_sessions ss
    where ss.id = new.stage_session_id;
    if not found then
      return new;
    end if;
  else
    if current_setting('app.stage_override', true) = old.id::text then
      return new;
    end if;
    v_md_user_id := old.md_user_id;
  end if;

  if app.current_user_id() is null then
    raise exception 'authentication required';
  end if;
  if v_md_user_id is null or v_md_user_id <> app.current_user_id() then
    raise exception 'only the current Stage MD can mutate execution state';
  end if;

  return new;
end;
$$;

-- Encerra como target_stage_end (revision + 1 notifica os assinantes, REALTIME_CONTRACT §invariante), sem exigir o MD.
create function private.close_stage_session(p_stage_session_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform set_config('app.stage_override', p_stage_session_id::text, true);
  update public.stage_sessions
  set status = 'ended', ended_at = coalesce(ended_at, now()), updated_at = now()
  where id = p_stage_session_id and status <> 'ended';
  update public.stage_session_states
  set revision = revision + 1, is_running = false, updated_at = now()
  where stage_session_id = p_stage_session_id;
  perform set_config('app.stage_override', '', true);
end;
$$;
revoke all on function private.close_stage_session(uuid) from public;

select private.close_stage_session(d.id)
from (
  select ss.id, row_number() over (partition by ss.service_id order by (ss.status = 'live') desc, ss.created_at desc, ss.id desc) as n
  from public.stage_sessions ss
  where ss.status in ('lobby', 'live')
) d
where d.n > 1;

create unique index stage_sessions_open_service_key on public.stage_sessions (service_id)
  where status in ('lobby', 'live');

create or replace function public.create_target_stage_session(p_service_id uuid, p_session_id uuid DEFAULT gen_random_uuid()) returns public.stage_sessions
    language plpgsql security definer
    set search_path to ''
as $$
declare
  v_service public.services;
  v_stage public.stage_sessions;
begin
  select s.* into v_service
  from public.services s
  join public.organization_memberships om
    on om.organization_id = s.organization_id and om.user_id = app.current_user_id()
  where s.id = p_service_id;

  if v_service.id is null then
    raise exception 'service not found or not authorized';
  end if;

  if not app.has_permission(v_service.organization_id, v_service.team_id, 'stage.start') then
    raise exception 'not authorized to create stage sessions';
  end if;

  -- Locks na ordem de target_stage_start/end (sessão, depois serviço), senão a tomada abaixo pode dar deadlock.
  -- O lock no serviço serializa "Iniciar palco" concorrente: a segunda chamada vê a sessão da primeira.
  perform 1 from public.stage_sessions ss
  where ss.service_id = p_service_id and ss.status in ('lobby', 'live')
  order by ss.id
  for update;
  select s.* into v_service from public.services s where s.id = p_service_id for update;
  if v_service.status in ('completed', 'cancelled') then
    raise exception 'service is not open for Stage';
  end if;

  -- Retry com o mesmo id: devolve a mesma linha.
  select ss.* into v_stage from public.stage_sessions ss where ss.id = p_session_id;
  if v_stage.id is not null then
    if v_stage.service_id <> p_service_id then
      raise exception using errcode = 'unique_violation', message = 'stage session id already in use';
    end if;
    return v_stage;
  end if;

  select ss.* into v_stage
  from public.stage_sessions ss
  where ss.service_id = p_service_id and ss.status in ('lobby', 'live');
  if v_stage.id is not null then
    if exists (
      select 1 from public.organization_memberships om
      where om.organization_id = v_service.organization_id and om.user_id = v_stage.md_user_id
        and (om.role in ('owner', 'admin')
             or not exists (select 1 from public.team_memberships tm join public.teams t on t.id = tm.team_id
                            where t.organization_id = v_service.organization_id and tm.user_id = v_stage.md_user_id)
             or exists (select 1 from public.team_memberships tm join public.teams t on t.id = tm.team_id
                        where t.organization_id = v_service.organization_id and tm.user_id = v_stage.md_user_id
                          and tm.status = 'active'))
    ) then
      return v_stage;
    end if;
    perform private.close_stage_session(v_stage.id);
  end if;

  if not exists (
    select 1 from public.service_items si
    where si.service_id = p_service_id and si.type = 'song'
  ) then
    raise exception 'service must contain at least one song before starting stage';
  end if;

  insert into public.stage_sessions (id, service_id, md_user_id, status, created_at, updated_at)
  values (p_session_id, p_service_id, app.current_user_id(), 'lobby', now(), now())
  returning * into v_stage;

  return v_stage;
end;
$$;
