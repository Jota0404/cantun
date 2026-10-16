\set ON_ERROR_STOP on
\o /dev/null
do $$
begin
  if exists (select 1 from public.service_items where id = '61000000-0000-0000-0000-000000000882') then
    raise exception 'o duplicado deveria ter sido removido';
  end if;
  if not exists (select 1 from public.service_items where id = '61000000-0000-0000-0000-000000000881') then
    raise exception 'o item original deveria continuar';
  end if;
  if exists (select 1 from public.stage_session_states
             where stage_session_id = '70000000-0000-0000-0000-000000000881'
               and (current_service_item_id is not null or prepared_service_item_id is not null)) then
    raise exception 'os ponteiros do Palco para o duplicado deveriam ficar nulos';
  end if;
  if exists (select 1 from public.assignments where id = '72000000-0000-0000-0000-000000000881') then
    raise exception 'a escala presa ao duplicado cai em cascata';
  end if;
  if not exists (select 1 from public.service_positions where id = '71000000-0000-0000-0000-000000000881') then
    raise exception 'a vaga deve continuar';
  end if;
end $$;
