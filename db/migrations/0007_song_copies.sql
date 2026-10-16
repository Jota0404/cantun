-- CANTUM — FIX-01 / Fatia A: música do Ministério é uma cópia (ADR-062, P2; PERMISSIONS.md F6–F8, F12).
--
-- 1. songs.organization_id (nulo = pessoal; cascade da organização) e source_song_id (origem).
-- 2. Políticas de songs por escopo (pessoal × cópia da organização), sem organization_songs.
-- 3. RPC copy_song_to_organization (idempotente).
-- 4. Triggers de escopo dos itens de repertório e de serviço.
-- 5. FKs de item → música: RESTRICT vira NO ACTION, para o cascade da organização.
-- 6. PARTE FINAL: limpeza de organization_songs e dos itens de teste (decisão do Jota).

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
-- 6. PARTE FINAL — limpeza de organization_songs (ADR-062 §6; decisão do Jota, 2026-10-16)
--    Só há dados de teste (ADR-059 §1): em vez de converter, apaga os itens de repertório e de
--    serviço que apontavam para músicas, zera as referências do Palco e remove a tabela.
--    As músicas pessoais ficam; as organizações passam a ter cópias só pelo fluxo novo.
-- ===========================================================================

-- Sem a guarda do operador: é manutenção de schema (apagar o item também zera o ponteiro do Palco por FK).
alter table public.stage_session_states disable trigger stage_session_states_operator_guard;
delete from public.repertoire_items;
delete from public.service_items where song_id is not null;
update public.stage_session_states
set current_song_id = null, prepared_song_id = null, revision = revision + 1
where current_song_id is not null or prepared_song_id is not null;
alter table public.stage_session_states enable trigger stage_session_states_operator_guard;

-- Remoção: tabela (as políticas dela caem junto) e as funções que dependiam dela.
drop table public.organization_songs;
drop function app.can_manage_organization_song(uuid, text);
drop function app.is_my_song(uuid);
