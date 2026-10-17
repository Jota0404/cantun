-- CANTUM — B8 fatia 5: exclusão da própria conta (VS-07 RN-03/05/06/09, ADR-063; D2, D3, D4).
--
-- 1. Usuário sentinela "Ex-membro": autor do conteúdo do Ministério depois da exclusão. Sem
--    credencial (check), sem vínculos; fora de listas porque só existe em autoria.
-- 2. admin_events ganha as ações account.delete e account.export; export_my_data passa a registrar.
-- 3. guard_content_owner deixa o dono da tabela (funções security definer) reatribuir autoria;
--    o cliente (cantum_user) continua sem poder mudá-la.
-- 4. delete_my_account: bloqueia o único Owner, reatribui autoria ao sentinela, apaga o resto na hora.
--    user_consents (fatia 3) deve nascer com `references app.users(id) on delete cascade`.

create function app.deleted_user_id() returns uuid
  language sql immutable
  set search_path = ''
as $$ select 'deadbeef-0000-4000-8000-000000000000'::uuid $$;
revoke all on function app.deleted_user_id() from public;
grant execute on function app.deleted_user_id() to cantum_user;

insert into app.users (id, email, display_name)
values ('deadbeef-0000-4000-8000-000000000000', 'deleted@invalid', 'Ex-membro');

-- Sem senha e sem e-mail verificado não há login, nem por redefinição de senha.
alter table app.users add constraint users_deleted_placeholder_no_login
  check (id <> 'deadbeef-0000-4000-8000-000000000000'::uuid or (password_hash is null and email_verified_at is null));

alter table public.admin_events drop constraint admin_events_action_check;
alter table public.admin_events add constraint admin_events_action_check
  check (action in ('team_member.remove', 'account.delete', 'account.export'));

-- Igual à 0007, exceto: o dono da tabela pode trocar autoria e origem (exclusão de conta).
create or replace function app.guard_content_owner() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_table_owner boolean := current_user = (select pg_catalog.pg_get_userbyid(c.relowner) from pg_catalog.pg_class c where c.oid = tg_relid);
begin
  -- Ifs aninhados: o PL/pgSQL não garante curto-circuito ao resolver campos de new.
  if tg_table_name = 'songs' then
    if not v_table_owner then
      if new.user_id is distinct from old.user_id or new.id is distinct from old.id
         or new.organization_id is distinct from old.organization_id
         or new.source_song_id is distinct from old.source_song_id then
        raise exception 'song owner, organization and source cannot change' using errcode = 'insufficient_privilege';
      end if;
    end if;
    if old.organization_id is not null and old.deleted_at is null and new.deleted_at is not null
       and app.current_user_id() is not null
       and not (app.has_permission(old.organization_id, null, 'song.delete')
                or (old.user_id = app.current_user_id() and app.has_permission(old.organization_id, null, 'song.delete_own'))) then
      raise exception 'not authorized to delete this song' using errcode = 'insufficient_privilege';
    end if;
  elsif not v_table_owner then
    if new.created_by_user_id is distinct from old.created_by_user_id
       or new.organization_id is distinct from old.organization_id then
      raise exception 'repertoire owner and organization cannot change' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

-- export_my_data (0012) passa a registrar account.export (RN-09); volátil porque grava.
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
      from public.member_availability v where v.user_id = v_user_id), '[]')
  );

  -- RN-09: um evento por organização do titular, sem conteúdo.
  insert into public.admin_events (organization_id, actor_user_id, target_user_id, action)
  select m.organization_id, v_user_id, v_user_id, 'account.export'
  from public.organization_memberships m where m.user_id = v_user_id;

  return v_export;
end;
$$;

create function public.delete_my_account() returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_deleted uuid := app.deleted_user_id();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if v_user_id = v_deleted then raise exception 'cannot delete the deleted-user placeholder'; end if;
  perform 1 from app.users u where u.id = v_user_id for update;
  if not found then raise exception 'authentication required'; end if;

  -- D4: nunca deixar organização sem Owner. Trava os Owners dessas organizações (ordem fixa)
  -- para que dois Owners não saiam ao mesmo tempo.
  perform 1 from public.organization_memberships m
  where m.role = 'owner' and m.organization_id in (select o.organization_id from public.organization_memberships o
                                                   where o.user_id = v_user_id and o.role = 'owner')
  order by m.id for update;
  if exists (select 1 from public.organization_memberships me
             where me.user_id = v_user_id and me.role = 'owner'
               and not exists (select 1 from public.organization_memberships o
                               where o.organization_id = me.organization_id and o.role = 'owner' and o.user_id <> v_user_id)) then
    raise exception 'sole owner of an organization: transfer ownership first';
  end if;

  -- RN-09: um evento por organização do titular, sem titular nem conteúdo.
  insert into public.admin_events (organization_id, action)
  select m.organization_id, 'account.delete' from public.organization_memberships m where m.user_id = v_user_id;

  -- D2: conteúdo do Ministério fica com o sentinela (updated_at novo para os aparelhos convergirem).
  -- Cópias já não apontam para a música pessoal que vai ser apagada.
  update public.songs c set source_song_id = null
  where c.source_song_id in (select p.id from public.songs p where p.user_id = v_user_id and p.organization_id is null);
  update public.songs set user_id = v_deleted, updated_at = now()
  where user_id = v_user_id and organization_id is not null;
  update public.repertoires set created_by_user_id = v_deleted, updated_at = now()
  where created_by_user_id = v_user_id and organization_id is not null;
  update public.services set created_by_user_id = v_deleted, updated_at = now()
  where created_by_user_id = v_user_id;

  -- RN-05: Palco aberto segue vivo; o MD fica vago. REALTIME_CONTRACT §4: mudar md_user_id incrementa a
  -- revision na mesma transação, e antes de liberar o MD (o guard de estado exige que quem muda seja o MD).
  update public.stage_session_states st set revision = st.revision + 1, updated_at = now()
  from public.stage_sessions ss where ss.id = st.stage_session_id and ss.md_user_id = v_user_id;
  update public.stage_sessions set md_user_id = null, updated_at = now() where md_user_id = v_user_id;

  -- D3: o que é pessoal sai agora (itens de repertório saem em cascata; sobraram só músicas pessoais).
  delete from public.repertoires where created_by_user_id = v_user_id and organization_id is null;
  delete from public.songs where user_id = v_user_id;

  -- Vínculos, escalas (RN-06: a vaga fica aberta), disponibilidade, convites emitidos, sessões e tokens
  -- saem por cascade; autor/alvo em admin_events e quem aceitou convite viram nulos.
  delete from app.users where id = v_user_id;
end;
$$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to cantum_user;
