-- CANTUM — B8 fatia 9: reautenticação com senha para excluir a conta (VS-07 RN-04/RN-13, ADR-065).
--
-- 1. app.sessions.reauth_at: quando a sessão provou a senha pela última vez (nulo ao criar; o login não preenche).
-- 2. delete_my_account (corpo da 0013) passa a exigir reauth de no máximo 5 minutos. O servidor repassa o fato
--    por `set_config('app.session_reauth_at', <iso ou ''>, true)` em cada transação (convenção app.session_*);
--    parâmetro de RPC nunca o altera. Nulo, vazio, ilegível ou expirado: 42501 'recent authentication required'.

alter table app.sessions add column if not exists reauth_at timestamptz;

create or replace function public.delete_my_account() returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
  v_deleted uuid := app.deleted_user_id();
  v_reauth_at timestamptz;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if v_user_id = v_deleted then raise exception 'cannot delete the deleted-user placeholder'; end if;

  -- Falha fechada: valor ausente, vazio ou inválido conta como "nunca reautenticou".
  begin
    v_reauth_at := nullif(current_setting('app.session_reauth_at', true), '')::timestamptz;
  exception when others then
    v_reauth_at := null;
  end;
  if v_reauth_at is null or v_reauth_at > now() or now() - v_reauth_at > interval '5 minutes' then
    raise exception 'recent authentication required' using errcode = 'insufficient_privilege';
  end if;

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
