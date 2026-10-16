-- CANTUM — FIX-01 / Fatia A: música do Ministério é uma cópia (ADR-062, P2; PERMISSIONS.md F6–F8, F12).
--
-- 1. songs.organization_id (nulo = pessoal; cascade da organização) e source_song_id (origem).
-- 2. Políticas de songs por escopo (pessoal × cópia da organização), sem organization_songs.
-- 3. RPC copy_song_to_organization (idempotente).
-- 4. Triggers de escopo dos itens de repertório e de serviço.
-- 5. FKs de item → música: RESTRICT vira NO ACTION, para o cascade da organização.
-- 6. PARTE FINAL (isolada, pendente de decisão do Jota): conversão de organization_songs em cópias.

-- ---------------------------------------------------------------------------
-- 1. Colunas e unicidade da cópia
-- ---------------------------------------------------------------------------

alter table public.songs
  add column organization_id uuid references public.organizations(id) on delete cascade,
  add column source_song_id uuid,
  add constraint songs_source_only_for_copies_check check (organization_id is not null or source_song_id is null);

-- Cópia apagada (soft delete) não bloqueia uma nova cópia da mesma origem.
create unique index songs_organization_source_key on public.songs (organization_id, source_song_id)
  where organization_id is not null and source_song_id is not null and deleted_at is null;
create index songs_organization_idx on public.songs (organization_id, updated_at) where organization_id is not null;

-- Autoria, organização e origem não mudam por update. user_id continua sendo o autor da cópia
-- (quem copiou); Líder e Admin editam a MESMA linha, sem trocar o autor (F12).
create or replace function app.guard_content_owner() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- Ifs aninhados: o PL/pgSQL não garante curto-circuito ao resolver campos de new.
  if tg_table_name = 'songs' then
    if new.user_id is distinct from old.user_id or new.id is distinct from old.id
       or new.organization_id is distinct from old.organization_id
       or new.source_song_id is distinct from old.source_song_id then
      raise exception 'song owner, organization and source cannot change' using errcode = 'insufficient_privilege';
    end if;
    -- Exclusão suave de cópia é exclusão: exige song.delete ou o autor com song.delete_own
    -- (senão o update de song.edit contornaria a política de delete).
    if old.organization_id is not null and old.deleted_at is null and new.deleted_at is not null
       and app.current_user_id() is not null
       and not (app.has_permission(old.organization_id, null, 'song.delete')
                or (old.user_id = app.current_user_id() and app.has_permission(old.organization_id, null, 'song.delete_own'))) then
      raise exception 'not authorized to delete this song' using errcode = 'insufficient_privilege';
    end if;
  elsif new.created_by_user_id is distinct from old.created_by_user_id
     or new.organization_id is distinct from old.organization_id then
    raise exception 'repertoire owner and organization cannot change' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Políticas de songs
-- ---------------------------------------------------------------------------

drop policy "Users can create own songs" on public.songs;
drop policy "Users can read own songs" on public.songs;
drop policy "Users can update own songs" on public.songs;
drop policy "Users can delete own songs" on public.songs;
drop policy songs_organization_select on public.songs;
drop policy songs_organization_update on public.songs;
drop policy songs_organization_delete on public.songs;

-- Pessoal (organization_id nulo): só o dono. Cópia da organização: lê membro ativo; edita
-- song.edit (Owner, Admin, L*) ou o autor (song.edit_own); exclui song.delete (Owner, Admin)
-- ou o autor (song.delete_own). Cópia nova só pela RPC copy_song_to_organization.
create policy songs_select on public.songs for select to cantum_user
  using ((organization_id is null and user_id = app.current_user_id())
         or (organization_id is not null and app.is_active_in_organization(organization_id)));
create policy songs_insert on public.songs for insert to cantum_user
  with check (organization_id is null and source_song_id is null and user_id = app.current_user_id());
create policy songs_update on public.songs for update to cantum_user
  using ((organization_id is null and user_id = app.current_user_id())
         or (organization_id is not null and (
              app.has_permission(organization_id, null, 'song.edit')
              or (user_id = app.current_user_id() and app.has_permission(organization_id, null, 'song.edit_own')))))
  with check ((organization_id is null and user_id = app.current_user_id())
         or (organization_id is not null and (
              app.has_permission(organization_id, null, 'song.edit')
              or (user_id = app.current_user_id() and app.has_permission(organization_id, null, 'song.edit_own')))));
create policy songs_delete on public.songs for delete to cantum_user
  using ((organization_id is null and user_id = app.current_user_id())
         or (organization_id is not null and (
              app.has_permission(organization_id, null, 'song.delete')
              or (user_id = app.current_user_id() and app.has_permission(organization_id, null, 'song.delete_own')))));

-- ---------------------------------------------------------------------------
-- 3. RPC de cópia (classe B, só online; ADR-057)
-- ---------------------------------------------------------------------------

-- Devolve a cópia que já existe (mesma origem na mesma organização) ou cria uma nova.
-- Música alheia, já copiada, apagada ou inexistente dão a mesma mensagem (F6).
create function public.copy_song_to_organization(p_song_id uuid, p_organization_id uuid, p_new_id uuid default null)
  returns public.songs
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_source public.songs;
  v_copy public.songs;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;

  select s.* into v_source from public.songs s
  where s.id = p_song_id and s.user_id = v_user_id and s.organization_id is null and s.deleted_at is null;
  if v_source.id is null then raise exception 'song not found or not authorized'; end if;
  if not app.has_permission(p_organization_id, null, 'song.create') then
    raise exception 'not authorized to copy songs to this organization';
  end if;

  -- Corrida entre dois aparelhos: o índice único parcial decide; o perdedor lê o vencedor.
  insert into public.songs (id, user_id, organization_id, source_song_id, title, artist, original_key, current_key,
                            bpm, lyrics, notes, is_favorite, created_at, updated_at)
  values (coalesce(p_new_id, gen_random_uuid()), v_user_id, p_organization_id, v_source.id, v_source.title, v_source.artist,
          v_source.original_key, v_source.current_key, v_source.bpm, v_source.lyrics, v_source.notes, false, now(), now())
  on conflict (organization_id, source_song_id) where organization_id is not null and source_song_id is not null and deleted_at is null
  do nothing
  returning * into v_copy;

  if v_copy.id is null then
    select s.* into v_copy from public.songs s
    where s.organization_id = p_organization_id and s.source_song_id = v_source.id and s.deleted_at is null;
  end if;
  return v_copy;
end;
$$;
revoke all on function public.copy_song_to_organization(uuid, uuid, uuid) from public;
grant execute on function public.copy_song_to_organization(uuid, uuid, uuid) to cantum_user;

-- ---------------------------------------------------------------------------
-- 4. Escopo dos itens
-- ---------------------------------------------------------------------------

-- Repertório da organização só aceita música dela; repertório pessoal (organization_id nulo,
-- Fatia C) só música pessoal do dono. Música inexistente fica com a FK.
create function app.guard_repertoire_item_scope() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_repertoire public.repertoires;
  v_song public.songs;
begin
  select r.* into v_repertoire from public.repertoires r where r.id = new.repertoire_id;
  select s.* into v_song from public.songs s where s.id = new.song_id;
  if v_song.id is null or v_repertoire.id is null then return new; end if;
  if v_repertoire.organization_id is not null then
    if v_song.organization_id is distinct from v_repertoire.organization_id then
      raise exception 'song does not belong to the repertoire organization';
    end if;
  elsif v_song.organization_id is not null or v_song.user_id <> v_repertoire.created_by_user_id then
    raise exception 'personal repertoire only accepts personal songs of its owner';
  end if;
  return new;
end;
$$;
revoke all on function app.guard_repertoire_item_scope() from public;
create trigger repertoire_items_scope before insert or update of song_id, repertoire_id on public.repertoire_items
  for each row execute function app.guard_repertoire_item_scope();

create function app.guard_service_item_scope() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_service public.services;
  v_song public.songs;
begin
  if new.song_id is null then return new; end if;
  select sv.* into v_service from public.services sv where sv.id = new.service_id;
  select s.* into v_song from public.songs s where s.id = new.song_id;
  if v_song.id is null or v_service.id is null then return new; end if;
  if v_song.organization_id is distinct from v_service.organization_id then
    raise exception 'song does not belong to the service organization';
  end if;
  return new;
end;
$$;
revoke all on function app.guard_service_item_scope() from public;
create trigger service_items_scope before insert or update of song_id, service_id on public.service_items
  for each row execute function app.guard_service_item_scope();

-- ---------------------------------------------------------------------------
-- 5. FKs de item → música: NO ACTION (checado ao fim do comando)
-- ---------------------------------------------------------------------------

-- RESTRICT é imediato e barraria o cascade da organização (que apaga cópias, repertórios e
-- serviços no mesmo comando). NO ACTION mantém a proteção contra apagar música em uso.
alter table public.repertoire_items drop constraint repertoire_items_song_id_fkey;
alter table public.repertoire_items add constraint repertoire_items_song_id_fkey
  foreign key (song_id) references public.songs(id) on delete no action;
alter table public.service_items drop constraint service_items_song_id_fkey;
alter table public.service_items add constraint service_items_song_id_fkey
  foreign key (song_id) references public.songs(id) on delete no action;

-- ===========================================================================
-- 6. PARTE FINAL — conversão de organization_songs em cópias (ADR-062 §6)
--    Isolada: o Jota ainda decide entre converter (esta parte) e limpar vínculos e itens de
--    teste. Para "limpar", troque esta parte por: delete dos itens de repertório e de serviço
--    das organizações, e o bloco "remoção" no fim.
-- ===========================================================================

-- 6.1 Cópias: S(O) = vinculadas em O ∪ referenciadas por repertórios de O ∪ referenciadas por
-- serviços de O (cobre itens órfãos, cujas músicas nunca foram vinculadas).
create temp table song_copy_map on commit drop as
with scope as (
  select os.organization_id, os.song_id from public.organization_songs os
  union
  select r.organization_id, ri.song_id
  from public.repertoire_items ri join public.repertoires r on r.id = ri.repertoire_id
  union
  select sv.organization_id, si.song_id
  from public.service_items si join public.services sv on sv.id = si.service_id
  where si.song_id is not null
)
select sc.organization_id, sc.song_id as source_id, gen_random_uuid() as copy_id
from scope sc join public.songs s on s.id = sc.song_id
where s.organization_id is null;

create temp table song_conversion_before on commit drop as
select
  (select count(*) from public.repertoire_items) as repertoire_items,
  (select count(*) from public.service_items where song_id is not null) as service_items,
  (select count(*) from song_copy_map) as copies;

insert into public.songs (id, user_id, organization_id, source_song_id, title, artist, original_key, current_key,
                          bpm, lyrics, notes, is_favorite, created_at, updated_at, deleted_at)
select m.copy_id, s.user_id, m.organization_id, s.id, s.title, s.artist, s.original_key, s.current_key,
       s.bpm, s.lyrics, s.notes, s.is_favorite, s.created_at, s.updated_at, s.deleted_at
from song_copy_map m join public.songs s on s.id = m.source_id;

-- 6.2 Reaponta itens e o estado do Palco (sem a guarda do operador: é manutenção de schema).
update public.repertoire_items ri set song_id = m.copy_id
from public.repertoires r, song_copy_map m
where r.id = ri.repertoire_id and m.organization_id = r.organization_id and m.source_id = ri.song_id;

update public.service_items si set song_id = m.copy_id
from public.services sv, song_copy_map m
where sv.id = si.service_id and m.organization_id = sv.organization_id and m.source_id = si.song_id;

alter table public.stage_session_states disable trigger stage_session_states_operator_guard;
update public.stage_session_states st
set current_song_id = coalesce((select m.copy_id from song_copy_map m where m.organization_id = sv.organization_id and m.source_id = st.current_song_id), st.current_song_id),
    prepared_song_id = coalesce((select m.copy_id from song_copy_map m where m.organization_id = sv.organization_id and m.source_id = st.prepared_song_id), st.prepared_song_id),
    revision = st.revision + 1
from public.stage_sessions ss, public.services sv
where ss.id = st.stage_session_id and sv.id = ss.service_id
  and (st.current_song_id is not null or st.prepared_song_id is not null);
alter table public.stage_session_states enable trigger stage_session_states_operator_guard;

-- 6.3 Conferência: nenhum item pode apontar para música de outro escopo; contagens iguais.
do $$
declare
  v_before record;
begin
  select * into v_before from song_conversion_before;
  if exists (select 1 from public.repertoire_items ri
             join public.repertoires r on r.id = ri.repertoire_id
             join public.songs s on s.id = ri.song_id
             where s.organization_id is distinct from r.organization_id) then
    raise exception 'conversion left a repertoire item pointing to a song of another scope';
  end if;
  if exists (select 1 from public.service_items si
             join public.services sv on sv.id = si.service_id
             join public.songs s on s.id = si.song_id
             where s.organization_id is distinct from sv.organization_id) then
    raise exception 'conversion left a service item pointing to a song of another scope';
  end if;
  if (select count(*) from public.repertoire_items) <> v_before.repertoire_items
     or (select count(*) from public.service_items where song_id is not null) <> v_before.service_items then
    raise exception 'conversion changed the number of items';
  end if;
  if (select count(*) from public.songs where organization_id is not null) <> v_before.copies then
    raise exception 'conversion created an unexpected number of copies';
  end if;
end $$;

-- 6.4 Remoção: tabela (as políticas dela caem junto) e as funções que dependiam dela.
drop table public.organization_songs;
drop function app.can_manage_organization_song(uuid, text);
drop function app.is_my_song(uuid);
