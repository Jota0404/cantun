\set ON_ERROR_STOP on
\o /dev/null
do $$
begin
  if to_regclass('public.organization_songs') is not null then raise exception 'organization_songs deveria ter caído'; end if;
  if to_regprocedure('app.is_my_song(uuid)') is not null or to_regprocedure('app.can_manage_organization_song(uuid,text)') is not null then
    raise exception 'funções de organization_songs deveriam ter caído';
  end if;

  -- Limpeza: nenhum item aponta para música, nenhuma cópia nasce, o Palco perde as referências.
  if (select count(*) from public.repertoire_items) <> 0 then raise exception 'itens de repertório deveriam ter sido apagados'; end if;
  if (select count(*) from public.service_items where song_id is not null) <> 0 then raise exception 'itens de serviço com música deveriam ter sido apagados'; end if;
  if (select count(*) from public.songs where organization_id is not null) <> 0 then raise exception 'a limpeza não cria cópias'; end if;
  if exists (select 1 from public.stage_session_states where current_song_id is not null or prepared_song_id is not null) then
    raise exception 'estado do Palco deveria perder as referências';
  end if;
  if (select revision from public.stage_session_states where stage_session_id = '70000000-0000-0000-0000-000000000771') < 1 then
    raise exception 'revisão do Palco deveria avançar para os clientes reler o estado';
  end if;

  -- Músicas pessoais, repertórios e serviços intactos.
  if (select count(*) from public.songs where organization_id is null) <> 5 then raise exception 'músicas pessoais devem continuar'; end if;
  if (select count(*) from public.repertoires) <> 1 or (select count(*) from public.services) <> 2 then
    raise exception 'repertórios e serviços devem continuar';
  end if;
end $$;
