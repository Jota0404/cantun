-- CANTUM — B4 / VS-03: escala (ADR-053, ADR-057; PERMISSIONS.md §3.5 e E1–E12).
--
-- 1. app.has_permission ganha schedule.manage (equipe do serviço) e availability.set_own.
-- 2. service_positions (vagas) e assignments ligada à vaga, com os estados novos.
--    Atribuição só muda por RPC (escrita direta barrada por privilégio e por RLS).
-- 3. member_availability (membro × dia) com leitura restrita a quem gere a equipe.
-- 4. Stage: get_service_stage_songs lê os estados e a função da vaga (D6, só isso).

-- ---------------------------------------------------------------------------
-- 1. Permissões
-- ---------------------------------------------------------------------------

create or replace function app.has_permission(p_organization_id uuid, p_team_id uuid, p_capability text) returns boolean
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_org_role text;
  v_team_role text;
  v_team_status text;
  v_privileged boolean;
begin
  if v_user_id is null or p_organization_id is null or p_capability is null then
    return false;
  end if;

  select om.role into v_org_role
  from public.organization_memberships om
  where om.organization_id = p_organization_id and om.user_id = v_user_id;
  if v_org_role is null then
    return false;
  end if;

  -- Equipe informada tem de ser da organização (N14), em qualquer escopo.
  if p_team_id is not null and not exists (
    select 1 from public.teams t where t.id = p_team_id and t.organization_id = p_organization_id
  ) then
    return false;
  end if;

  v_privileged := v_org_role in ('owner', 'admin');

  -- Escopo organização
  if p_capability = 'organization.delete' then
    return v_org_role = 'owner';
  elsif p_capability in ('organization.edit', 'team.create', 'song.delete', 'repertoire.delete') then
    return v_privileged;
  elsif p_capability in ('song.edit', 'repertoire.edit') then
    -- L*: Líder ativo de alguma equipe da organização.
    return v_privileged or exists (
      select 1 from public.team_memberships tm
      join public.teams t on t.id = tm.team_id
      where t.organization_id = p_organization_id and tm.user_id = v_user_id
        and tm.role = 'leader' and tm.status = 'active'
    );
  elsif p_capability in ('song.create', 'song.edit_own', 'song.delete_own',
                         'repertoire.create', 'repertoire.edit_own', 'repertoire.delete_own', 'stage.run',
                         'availability.set_own') then
    -- Ativo na organização: sem vínculos de equipe nela ou com ao menos um active.
    return v_privileged or not exists (
      select 1 from public.team_memberships tm
      join public.teams t on t.id = tm.team_id
      where t.organization_id = p_organization_id and tm.user_id = v_user_id
    ) or exists (
      select 1 from public.team_memberships tm
      join public.teams t on t.id = tm.team_id
      where t.organization_id = p_organization_id and tm.user_id = v_user_id and tm.status = 'active'
    );
  end if;

  -- Escopo equipe
  if p_capability not in ('team.rename', 'team.delete', 'team_member.add', 'team_member.set_status',
                          'team_member.set_leader_status', 'team_member.set_role',
                          'team_member.set_functions', 'team_member.set_own_functions',
                          'service.create', 'service.edit', 'service.transition', 'service.delete',
                          'schedule.manage') then
    return false;
  end if;
  if p_team_id is null then
    return false;
  end if;
  if v_privileged then
    return true;
  end if;

  select tm.role, tm.status into v_team_role, v_team_status
  from public.team_memberships tm
  where tm.team_id = p_team_id and tm.user_id = v_user_id;
  if v_team_status is distinct from 'active' then
    return false;
  end if;

  -- service.delete do Líder vale só em draft: a política de delete confere o alvo.
  if p_capability in ('team.rename', 'team_member.add', 'team_member.set_status', 'team_member.set_functions',
                      'service.create', 'service.edit', 'service.transition', 'service.delete',
                      'schedule.manage') then
    return v_team_role = 'leader';
  elsif p_capability = 'team_member.set_own_functions' then
    return true;
  end if;
  return false; -- team.delete, set_role, set_leader_status: só Owner e Admin
end;
$$;
-- Gerir a escala do serviço: schedule.manage na equipe do serviço, serviço não final (RN-08).
create function app.can_manage_schedule(p_service_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce((
    select s.status not in ('completed', 'cancelled')
      and app.has_permission(s.organization_id, s.team_id, 'schedule.manage')
    from public.services s
    where s.id = p_service_id
  ), false)
$$;
revoke all on function app.can_manage_schedule(uuid) from public;
grant execute on function app.can_manage_schedule(uuid) to cantum_user;

create function app.is_active_team_member(p_team_id uuid, p_user_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.team_memberships tm
    where tm.team_id = p_team_id and tm.user_id = p_user_id and tm.status = 'active'
  )
$$;
revoke all on function app.is_active_team_member(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- 2. Vagas
-- ---------------------------------------------------------------------------

create table public.service_positions (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  musical_function text not null check (musical_function in (
    'vocals', 'electric-guitar', 'acoustic-guitar', 'bass', 'drums', 'keys', 'piano', 'strings', 'brass', 'woodwinds', 'other')),
  quantity integer not null check (quantity between 1 and 20),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, musical_function)
);
alter table public.service_positions enable row level security;

create policy service_positions_select on public.service_positions for select to cantum_user
  using (exists (select 1 from public.services s
                 where s.id = service_positions.service_id and app.is_active_in_organization(s.organization_id)));
create policy service_positions_write on public.service_positions to cantum_user
  using (app.can_manage_schedule(service_id))
  with check (app.can_manage_schedule(service_id));
grant select, insert, update, delete on public.service_positions to cantum_user;

-- ---------------------------------------------------------------------------
-- 3. Atribuições ligadas à vaga
-- ---------------------------------------------------------------------------

alter table public.assignments
  add column position_id uuid references public.service_positions(id) on delete no action,
  add column responded_at timestamptz,
  add column replaced_assignment_id uuid references public.assignments(id) on delete set null,
  add column invite_sent_at timestamptz;

-- Bancos de desenvolvimento (ADR-059 §1): cada (serviço, função) vira uma vaga com
-- quantidade = nº de atribuições; função fora das 11 vira 'other'.
update public.assignments
set musical_function = 'other'
where musical_function not in ('vocals', 'electric-guitar', 'acoustic-guitar', 'bass', 'drums', 'keys', 'piano', 'strings', 'brass', 'woodwinds', 'other');
insert into public.service_positions (service_id, musical_function, quantity)
select service_id, musical_function, least(count(*), 20)
from public.assignments
group by service_id, musical_function;
update public.assignments a
set position_id = sp.id
from public.service_positions sp
where sp.service_id = a.service_id and sp.musical_function = a.musical_function;
alter table public.assignments alter column position_id set not null;

alter table public.assignments drop constraint assignments_status_check;
update public.assignments set status = 'invited' where status = 'pending';
update public.assignments set status = 'confirmed' where status = 'accepted';
alter table public.assignments
  alter column status set default 'invited',
  add constraint assignments_status_check check (status in ('invited', 'confirmed', 'declined', 'replacement_needed', 'cancelled'));

-- Estados ativos: uma atribuição ativa por pessoa e vaga (E12).
create unique index assignments_active_position_user_key on public.assignments (position_id, user_id)
  where status in ('invited', 'confirmed', 'replacement_needed');
create index assignments_position_idx on public.assignments (position_id);

-- Serviço e função vêm sempre da vaga.
create function app.sync_assignment_position() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  select sp.service_id, sp.musical_function into new.service_id, new.musical_function
  from public.service_positions sp where sp.id = new.position_id;
  return new;
end;
$$;
revoke all on function app.sync_assignment_position() from public;
create trigger assignments_sync_position before insert or update on public.assignments
  for each row execute function app.sync_assignment_position();

-- Vaga: serviço imutável; função imutável com atribuições; quantidade não fica abaixo
-- das atribuições ativas (invited + confirmed, RN-09).
create function app.guard_service_position() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.service_id is distinct from old.service_id then
    raise exception 'position service cannot change' using errcode = 'insufficient_privilege';
  end if;
  if new.musical_function is distinct from old.musical_function
     and exists (select 1 from public.assignments a where a.position_id = old.id) then
    raise exception 'position function cannot change with assignments';
  end if;
  if new.quantity < (select count(*) from public.assignments a
                      where a.position_id = old.id and a.status in ('invited', 'confirmed')) then
    raise exception 'position quantity is below active assignments';
  end if;
  return new;
end;
$$;
revoke all on function app.guard_service_position() from public;
create trigger service_positions_guard before update on public.service_positions
  for each row execute function app.guard_service_position();

-- Escrita direta barrada (E5); só as RPCs (dono da tabela) mudam a atribuição.
revoke insert, update, delete on public.assignments from cantum_user;

drop policy "organization admins can write assignments" on public.assignments;
drop policy "organization members can read assignments" on public.assignments;
create policy assignments_select on public.assignments for select to cantum_user
  using (exists (select 1 from public.services s
                 where s.id = assignments.service_id and app.is_active_in_organization(s.organization_id)));

-- ---------------------------------------------------------------------------
-- 4. RPCs de atribuição (ADR-053 §3 e §5)
-- ---------------------------------------------------------------------------

-- Inexistente e sem permissão dão a mesma mensagem, para não revelar ids.
create function public.assign_member(p_position_id uuid, p_user_id uuid) returns public.assignments
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_position public.service_positions;
  v_service public.services;
  v_assignment public.assignments;
begin
  if app.current_user_id() is null then raise exception 'authentication required'; end if;

  select sp.* into v_position from public.service_positions sp where sp.id = p_position_id for update;
  select s.* into v_service from public.services s where s.id = v_position.service_id for share;
  if v_position.id is null or not app.has_permission(v_service.organization_id, v_service.team_id, 'schedule.manage') then
    raise exception 'position not found or not authorized';
  end if;
  if v_service.status in ('completed', 'cancelled') then raise exception 'service is completed or cancelled'; end if;
  if not app.is_active_team_member(v_service.team_id, p_user_id) then
    raise exception 'user is not an active member of the service team';
  end if;
  if exists (select 1 from public.assignments a
             where a.position_id = p_position_id and a.user_id = p_user_id
               and a.status in ('invited', 'confirmed', 'replacement_needed')) then
    raise exception 'member already assigned to this position';
  end if;
  if (select count(*) from public.assignments a
      where a.position_id = p_position_id and a.status in ('invited', 'confirmed')) >= v_position.quantity then
    raise exception 'position is full';
  end if;

  insert into public.assignments (service_id, user_id, musical_function, position_id, status)
  values (v_position.service_id, p_user_id, v_position.musical_function, p_position_id, 'invited')
  returning * into v_assignment;
  return v_assignment;
end;
$$;
revoke all on function public.assign_member(uuid, uuid) from public;
grant execute on function public.assign_member(uuid, uuid) to cantum_user;

-- Só o titular, ativo na equipe do serviço, confirma ou recusa (RN-04, E1, E2, E9).
create function public.respond_to_assignment(p_assignment_id uuid, p_response text) returns public.assignments
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
  return v_assignment;
end;
$$;
revoke all on function public.respond_to_assignment(uuid, text) from public;
grant execute on function public.respond_to_assignment(uuid, text) to cantum_user;

-- confirmed → replacement_needed: o titular ativo ou quem gere a escala.
create function public.request_replacement(p_assignment_id uuid) returns public.assignments
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
  return v_assignment;
end;
$$;
revoke all on function public.request_replacement(uuid) from public;
grant execute on function public.request_replacement(uuid) to cantum_user;

-- A anterior vira cancelled e a nova nasce invited, ligada a ela (RN-05).
create function public.replace_assignment(p_assignment_id uuid, p_new_user_id uuid) returns public.assignments
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_old public.assignments;
  v_position public.service_positions;
  v_service public.services;
  v_new public.assignments;
begin
  if app.current_user_id() is null then raise exception 'authentication required'; end if;

  -- Mesma ordem de locks de assign_member: vaga, depois atribuição.
  select sp.* into v_position from public.service_positions sp
  where sp.id = (select a.position_id from public.assignments a where a.id = p_assignment_id) for update;
  select a.* into v_old from public.assignments a where a.id = p_assignment_id for update;
  select s.* into v_service from public.services s where s.id = v_old.service_id for share;
  if v_old.id is null or not app.has_permission(v_service.organization_id, v_service.team_id, 'schedule.manage') then
    raise exception 'assignment not found or not authorized';
  end if;
  if v_service.status in ('completed', 'cancelled') then raise exception 'service is completed or cancelled'; end if;
  if v_old.status not in ('invited', 'confirmed', 'replacement_needed') then raise exception 'invalid assignment transition'; end if;
  if p_new_user_id = v_old.user_id then raise exception 'cannot replace a member with the same member'; end if;
  if not app.is_active_team_member(v_service.team_id, p_new_user_id) then
    raise exception 'user is not an active member of the service team';
  end if;
  if exists (select 1 from public.assignments a
             where a.position_id = v_old.position_id and a.user_id = p_new_user_id
               and a.status in ('invited', 'confirmed', 'replacement_needed')) then
    raise exception 'member already assigned to this position';
  end if;

  update public.assignments set status = 'cancelled', updated_at = now() where id = v_old.id;
  if (select count(*) from public.assignments a
      where a.position_id = v_old.position_id and a.status in ('invited', 'confirmed')) >= v_position.quantity then
    raise exception 'position is full';
  end if;
  insert into public.assignments (service_id, user_id, musical_function, position_id, status, replaced_assignment_id)
  values (v_old.service_id, p_new_user_id, v_position.musical_function, v_old.position_id, 'invited', v_old.id)
  returning * into v_new;
  return v_new;
end;
$$;
revoke all on function public.replace_assignment(uuid, uuid) from public;
grant execute on function public.replace_assignment(uuid, uuid) to cantum_user;

create function public.cancel_assignment(p_assignment_id uuid) returns public.assignments
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
  if v_assignment.id is null or not app.has_permission(v_service.organization_id, v_service.team_id, 'schedule.manage') then
    raise exception 'assignment not found or not authorized';
  end if;
  if v_service.status in ('completed', 'cancelled') then raise exception 'service is completed or cancelled'; end if;
  if v_assignment.status not in ('invited', 'confirmed', 'replacement_needed') then raise exception 'invalid assignment transition'; end if;

  update public.assignments set status = 'cancelled', updated_at = now()
  where id = p_assignment_id
  returning * into v_assignment;
  return v_assignment;
end;
$$;
revoke all on function public.cancel_assignment(uuid) from public;
grant execute on function public.cancel_assignment(uuid) to cantum_user;

-- Dados do e-mail de convite, para o servidor (POST /schedule/assignments/:id/resend-invite).
-- Fica no schema app: fora do /rpc, porque devolve o e-mail do convidado. Quem gere a
-- escala dispara; no máximo um envio por minuto por atribuição; só convite pendente de
-- serviço que já saiu do rascunho.
create function app.assignment_invite_mail(p_assignment_id uuid)
  returns table(email text, display_name text, musical_function text, service_name text, starts_at timestamptz)
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
  if v_assignment.id is null or not app.has_permission(v_service.organization_id, v_service.team_id, 'schedule.manage') then
    raise exception 'assignment not found or not authorized';
  end if;
  if v_service.status in ('completed', 'cancelled') then raise exception 'service is completed or cancelled'; end if;
  if v_service.status = 'draft' then raise exception 'service is still a draft'; end if;
  if v_assignment.status <> 'invited' then raise exception 'invalid assignment transition'; end if;
  if v_assignment.invite_sent_at > now() - interval '1 minute' then raise exception 'invite sent recently'; end if;

  update public.assignments set invite_sent_at = now() where id = p_assignment_id;
  return query
    select u.email, u.display_name, v_assignment.musical_function, v_service.name, v_service.starts_at
    from app.users u where u.id = v_assignment.user_id;
end;
$$;
revoke all on function app.assignment_invite_mail(uuid) from public;
grant execute on function app.assignment_invite_mail(uuid) to cantum_user;

-- ---------------------------------------------------------------------------
-- 5. Disponibilidade (RN-10, RN-11)
-- ---------------------------------------------------------------------------

create table public.member_availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  date date not null,
  status text not null check (status in ('available', 'unavailable', 'tentative')),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, organization_id, date)
);
alter table public.member_availability enable row level security;

-- O próprio membro, ou quem gere uma equipe da qual ele é membro ativo: Owner e Admin da
-- organização, ou Líder ativo (PERMISSIONS.md §3.5). Membro comum não lê a de outros.
create function app.can_read_availability(p_user_id uuid, p_organization_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select app.current_user_id() is not null and (
    p_user_id = app.current_user_id()
    or (app.has_organization_role(p_organization_id, array['owner', 'admin'])
        and exists (select 1 from public.organization_memberships om
                    where om.organization_id = p_organization_id and om.user_id = p_user_id))
    or exists (
      select 1
      from public.team_memberships leader
      join public.teams t on t.id = leader.team_id
      join public.team_memberships target on target.team_id = t.id
      where t.organization_id = p_organization_id
        and leader.user_id = app.current_user_id() and leader.role = 'leader' and leader.status = 'active'
        and target.user_id = p_user_id and target.status = 'active')
  )
$$;
revoke all on function app.can_read_availability(uuid, uuid) from public;
grant execute on function app.can_read_availability(uuid, uuid) to cantum_user;

create policy member_availability_select on public.member_availability for select to cantum_user
  using (app.can_read_availability(user_id, organization_id));
create policy member_availability_write on public.member_availability to cantum_user
  using (user_id = app.current_user_id() and app.has_permission(organization_id, null, 'availability.set_own'))
  with check (user_id = app.current_user_id() and app.has_permission(organization_id, null, 'availability.set_own'));
grant select, insert, update, delete on public.member_availability to cantum_user;

create function app.guard_member_availability() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id or new.organization_id is distinct from old.organization_id then
    raise exception 'availability owner cannot change' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke all on function app.guard_member_availability() from public;
create trigger member_availability_guard before update on public.member_availability
  for each row execute function app.guard_member_availability();

-- ---------------------------------------------------------------------------
-- 6. Stage: estados novos e função da vaga (D6)
-- ---------------------------------------------------------------------------

create or replace function public.get_service_stage_songs(p_stage_session_id uuid) returns table("position" integer, song_id uuid, title text, artist text, original_key text, current_key text, lyrics text, notes text, bpm integer, musical_role text)
  language sql stable security definer
  set search_path = ''
as $$
  select
    si.position,
    s.id,
    s.title,
    s.artist,
    s.original_key,
    s.original_key,
    s.lyrics,
    s.notes,
    s.bpm,
    coalesce(
      (
        select sp.musical_function
        from public.assignments a
        join public.service_positions sp on sp.id = a.position_id
        where a.service_id = svc.id
          and a.user_id = app.current_user_id()
          and (a.service_item_id = si.id or a.service_item_id is null)
          and a.status in ('invited', 'confirmed')
        order by case when a.service_item_id = si.id then 0 else 1 end, a.created_at desc
        limit 1
      ),
      'other'
    )
  from public.stage_sessions ss
  join public.services svc on svc.id = ss.service_id
  join public.service_items si on si.service_id = svc.id and si.type = 'song'
  join public.songs s on s.id = si.song_id
  where ss.id = p_stage_session_id
    and app.has_permission(svc.organization_id, null, 'stage.run')
  order by si.position asc;
$$;
