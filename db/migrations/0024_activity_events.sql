-- CANTUM — B7 fatia 5 / log de atividade somente leitura (VS-06 RN-10…17; ADR-057 classe C, ADR-063).
-- Decisões do owner adotadas pela RECOMENDAÇÃO da spec, PENDENTES de confirmação do Jota antes de produção:
--   D4 (b): assignment.declined e assignment.replacement_needed só são lidos por quem tem schedule.manage na
--           equipe do serviço; os demais kinds, por qualquer membro ativo da organização (RN-16).
--   D5: o log guarda 90 dias (purga na própria inserção, por organização); a leitura mostra 30 dias, 50 por página.
-- Gerado só pelo servidor (RPCs e triggers via app.log_activity, sem EXECUTE para cantum_user). cantum_user só lê.
-- Guarda só ids + kind (RN-13); títulos vêm por junção na leitura. Repertório pessoal, preparação e disponibilidade
-- nunca geram evento. Excluir a conta deixa actor_user_id nulo ("Ex-membro"). export_my_data não muda (RN-18 não
-- inclui o log). Sai com o serviço e a organização.

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid,
  service_id uuid references public.services(id) on delete cascade,
  entity_id uuid,
  actor_user_id uuid references app.users(id) on delete set null,
  kind text not null check (kind in ('service.ready', 'service.completed', 'service.cancelled',
                                     'assignment.confirmed', 'assignment.declined', 'assignment.replacement_needed',
                                     'rehearsal.created', 'material.added', 'repertoire.updated')),
  -- clock_timestamp: eventos da mesma transação ficam ordenados e a paginação por created_at não empata.
  created_at timestamptz not null default clock_timestamp()
);
create index activity_events_org_created_idx on public.activity_events (organization_id, created_at desc);
create index activity_events_service_idx on public.activity_events (service_id);
create index activity_events_actor_idx on public.activity_events (actor_user_id);
alter table public.activity_events enable row level security;

create policy activity_events_select on public.activity_events for select to cantum_user
  using (app.is_active_in_organization(organization_id)
         and (kind not in ('assignment.declined', 'assignment.replacement_needed')
              -- D4 pela equipe ATUAL do serviço (o serviço pode trocar de equipe); sem serviço, a gravada.
              or app.has_permission(organization_id,
                                    coalesce((select s.team_id from public.services s where s.id = activity_events.service_id), team_id),
                                    'schedule.manage')));
-- Só leitura: sem policy nem grant de escrita (RN-10).
grant select on public.activity_events to cantum_user;

-- RN-12 agrupa repertoire.updated; RN-14 purga > 90 dias da organização. Ignora organização já excluída
-- (cascata de delete da organização dispara os triggers de repertório).
-- ponytail: agrupamento sem lock; duas transações simultâneas podem gravar dois eventos iguais (inofensivo).
create function app.log_activity(p_organization_id uuid, p_team_id uuid, p_service_id uuid, p_entity_id uuid, p_kind text)
  returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_actor uuid := app.current_user_id();
begin
  if not exists (select 1 from public.organizations o where o.id = p_organization_id) then return; end if;
  if p_kind = 'repertoire.updated' and exists (
    select 1 from public.activity_events e
    where e.organization_id = p_organization_id and e.kind = p_kind and e.entity_id = p_entity_id
      and e.actor_user_id is not distinct from v_actor and e.created_at > now() - interval '30 minutes'
  ) then
    return;
  end if;
  -- skip locked: inserções concorrentes da mesma organização não esperam umas pelas outras na purga.
  delete from public.activity_events
  where id in (select e.id from public.activity_events e
               where e.organization_id = p_organization_id and e.created_at < now() - interval '90 days'
               for update skip locked);
  insert into public.activity_events (organization_id, team_id, service_id, entity_id, actor_user_id, kind)
  values (p_organization_id, p_team_id, p_service_id, p_entity_id, v_actor, p_kind);
end;
$$;
revoke all on function app.log_activity(uuid, uuid, uuid, uuid, text) from public;

-- Corpo da 0023 (D2 e registro preservados) + service.ready/completed/cancelled.
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
  if p_to in ('ready', 'completed', 'cancelled') then
    perform app.log_activity(v_service.organization_id, v_service.team_id, v_service.id, v_service.id, 'service.' || p_to);
  end if;
  return v_service;
end;
$$;

-- Corpo da 0006 + assignment.confirmed/declined.
create or replace function public.respond_to_assignment(p_assignment_id uuid, p_response text) returns public.assignments
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_assignment public.assignments;
  v_service public.services;
begin
  if app.current_user_id() is null then raise exception 'authentication required'; end if;

  select a.* into v_assignment from public.assignments a where a.id = p_assignment_id for update;
  select s.* into v_service from public.services s where s.id = v_assignment.service_id for share;
  if v_assignment.id is null or v_assignment.user_id <> app.current_user_id()
     or not app.is_active_team_member(v_service.team_id, app.current_user_id()) then
    raise exception 'assignment not found or not authorized';
  end if;
  if v_service.status in ('completed', 'cancelled') then raise exception 'service is completed or cancelled'; end if;
  if p_response is null or p_response not in ('confirm', 'decline') then raise exception 'invalid assignment response'; end if;
  if v_assignment.status <> 'invited' then raise exception 'invalid assignment transition'; end if;

  update public.assignments
  set status = case p_response when 'confirm' then 'confirmed' else 'declined' end,
      responded_at = now(), updated_at = now()
  where id = p_assignment_id
  returning * into v_assignment;
  perform app.log_activity(v_service.organization_id, v_service.team_id, v_service.id, v_assignment.id, 'assignment.' || v_assignment.status);
  return v_assignment;
end;
$$;

-- Corpo da 0006 + assignment.replacement_needed.
create or replace function public.request_replacement(p_assignment_id uuid) returns public.assignments
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_assignment public.assignments;
  v_service public.services;
begin
  if app.current_user_id() is null then raise exception 'authentication required'; end if;

  select a.* into v_assignment from public.assignments a where a.id = p_assignment_id for update;
  select s.* into v_service from public.services s where s.id = v_assignment.service_id for share;
  if v_assignment.id is null or not (
       (v_assignment.user_id = app.current_user_id() and app.is_active_team_member(v_service.team_id, app.current_user_id()))
       or app.has_permission(v_service.organization_id, v_service.team_id, 'schedule.manage')) then
    raise exception 'assignment not found or not authorized';
  end if;
  if v_service.status in ('completed', 'cancelled') then raise exception 'service is completed or cancelled'; end if;
  if v_assignment.status <> 'confirmed' then raise exception 'invalid assignment transition'; end if;

  update public.assignments set status = 'replacement_needed', updated_at = now()
  where id = p_assignment_id
  returning * into v_assignment;
  perform app.log_activity(v_service.organization_id, v_service.team_id, v_service.id, v_assignment.id, 'assignment.replacement_needed');
  return v_assignment;
end;
$$;

-- Triggers (security definer: cantum_user não executa app.log_activity). Só insert real gera evento:
-- o upsert sem mudança do /sync vira update e não dispara "after insert".
create function app.rehearsals_log() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform app.log_activity(new.organization_id, (select s.team_id from public.services s where s.id = new.service_id),
                           new.service_id, new.id, 'rehearsal.created');
  return null;
end;
$$;
revoke all on function app.rehearsals_log() from public;
create trigger rehearsals_log after insert on public.rehearsals for each row execute function app.rehearsals_log();

create function app.materials_log() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_service_id uuid := coalesce(new.service_id, (select r.service_id from public.rehearsals r where r.id = new.rehearsal_id));
begin
  perform app.log_activity(new.organization_id, (select s.team_id from public.services s where s.id = v_service_id),
                           v_service_id, new.id, 'material.added');
  return null;
end;
$$;
revoke all on function app.materials_log() from public;
create trigger materials_log after insert on public.materials for each row execute function app.materials_log();

-- repertoire.updated (RN-11/12): só repertório da organização; entity_id = repertório.
create function app.repertoires_log() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_row public.repertoires := case tg_op when 'DELETE' then old else new end;
begin
  if v_row.organization_id is not null then
    perform app.log_activity(v_row.organization_id, null, null, v_row.id, 'repertoire.updated');
  end if;
  return null;
end;
$$;
revoke all on function app.repertoires_log() from public;
create trigger repertoires_log_insert_delete after insert or delete on public.repertoires
  for each row execute function app.repertoires_log();
-- Só dados do repertório: troca de autor (exclusão de conta) e upsert sem mudança não geram evento.
create trigger repertoires_log_update after update on public.repertoires
  for each row when (old.name is distinct from new.name) execute function app.repertoires_log();

create function app.repertoire_items_log() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_repertoire_id uuid := case tg_op when 'DELETE' then old.repertoire_id else new.repertoire_id end;
  v_organization_id uuid := (select r.organization_id from public.repertoires r where r.id = v_repertoire_id);
begin
  -- Pessoal (nulo) ou repertório já excluído (cascata): nada.
  if v_organization_id is not null then
    perform app.log_activity(v_organization_id, null, null, v_repertoire_id, 'repertoire.updated');
  end if;
  return null;
end;
$$;
revoke all on function app.repertoire_items_log() from public;
create trigger repertoire_items_log_insert_delete after insert or delete on public.repertoire_items
  for each row execute function app.repertoire_items_log();
create trigger repertoire_items_log_update after update on public.repertoire_items
  for each row when (old.song_id is distinct from new.song_id or old."position" is distinct from new."position")
  execute function app.repertoire_items_log();

-- Leitura (security invoker: a RLS decide, inclusive a D4 e os títulos). 30 dias, 50 por página, mais recente primeiro.
-- Entidade excluída ou invisível → entity_title nulo ("item excluído").
create function public.get_recent_activity(p_organization_id uuid, p_before timestamptz default null) returns jsonb
  language sql stable
  set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'kind', e.kind, 'actor_user_id', e.actor_user_id, 'service_id', e.service_id, 'entity_id', e.entity_id,
    'entity_title', case
      when e.kind like 'service.%' or e.kind like 'assignment.%' then (select s.name from public.services s where s.id = e.service_id)
      when e.kind = 'rehearsal.created' then (select s.name from public.rehearsals r join public.services s on s.id = r.service_id where r.id = e.entity_id)
      when e.kind = 'material.added' then (select m.title from public.materials m where m.id = e.entity_id)
      when e.kind = 'repertoire.updated' then (select r.name from public.repertoires r where r.id = e.entity_id)
    end,
    'created_at', e.created_at) order by e.created_at desc, e.id), '[]')
  from (select * from public.activity_events a
        where a.organization_id = p_organization_id and a.created_at >= now() - interval '30 days'
          and (p_before is null or a.created_at < p_before)
        order by a.created_at desc, a.id
        limit 50) e
$$;
revoke all on function public.get_recent_activity(uuid, timestamptz) from public;
grant execute on function public.get_recent_activity(uuid, timestamptz) to cantum_user;
