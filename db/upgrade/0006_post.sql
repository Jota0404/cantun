\set ON_ERROR_STOP on
\o /dev/null
do $$
declare
  v_vocals uuid;
  v_other uuid;
begin
  select id into v_vocals from public.service_positions
   where service_id = '60000000-0000-0000-0000-000000000611' and musical_function = 'vocals';
  if v_vocals is null or (select quantity from public.service_positions where id = v_vocals) <> 2 then
    raise exception 'vocals do S1 deveria virar uma vaga de quantidade 2';
  end if;
  -- "Guitarra solo" e "baixo" não são das 11 funções: viram other, numa vaga só.
  select id into v_other from public.service_positions
   where service_id = '60000000-0000-0000-0000-000000000611' and musical_function = 'other';
  if v_other is null or (select quantity from public.service_positions where id = v_other) <> 2 then
    raise exception 'funções livres do S1 deveriam virar other com quantidade 2';
  end if;
  if (select count(*) from public.service_positions) <> 3 then raise exception 'esperadas 3 vagas'; end if;
  if exists (select 1 from public.assignments where position_id is null) then raise exception 'atribuição sem vaga'; end if;
  if (select status from public.assignments where id = 'a1000000-0000-0000-0000-000000000611') <> 'invited' then raise exception 'pending → invited'; end if;
  if (select status from public.assignments where id = 'a1000000-0000-0000-0000-000000000612') <> 'confirmed' then raise exception 'accepted → confirmed'; end if;
  if (select status from public.assignments where id = 'a1000000-0000-0000-0000-000000000613') <> 'declined' then raise exception 'declined fica'; end if;
  if (select musical_function from public.assignments where id = 'a1000000-0000-0000-0000-000000000613') <> 'other' then raise exception 'função normalizada'; end if;
  if (select position_id from public.assignments where id = 'a1000000-0000-0000-0000-000000000611')
     <> (select position_id from public.assignments where id = 'a1000000-0000-0000-0000-000000000612') then
    raise exception 'mesma função no mesmo serviço divide a vaga';
  end if;
end $$;
