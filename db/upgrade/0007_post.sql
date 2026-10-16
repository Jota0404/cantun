\set ON_ERROR_STOP on
\o /dev/null
do $$
declare
  v_s1_o1 uuid; v_s1_o2 uuid; v_s3_o1 uuid; v_s4_o1 uuid; v_s2_o1 uuid;
begin
  if to_regclass('public.organization_songs') is not null then raise exception 'organization_songs deveria ter caído'; end if;
  if to_regprocedure('app.is_my_song(uuid)') is not null or to_regprocedure('app.can_manage_organization_song(uuid,text)') is not null then
    raise exception 'funções de organization_songs deveriam ter caído';
  end if;

  -- O1: S1, S2 (vinculadas), S3 (órfã de serviço), S4 (órfã de repertório); O2: S1.
  if (select count(*) from public.songs where organization_id is not null) <> 5 then raise exception 'esperadas 5 cópias'; end if;
  select id into v_s1_o1 from public.songs where organization_id = '10000000-0000-0000-0000-000000000771' and source_song_id = '40000000-0000-0000-0000-000000000771';
  select id into v_s1_o2 from public.songs where organization_id = '10000000-0000-0000-0000-000000000772' and source_song_id = '40000000-0000-0000-0000-000000000771';
  select id into v_s2_o1 from public.songs where organization_id = '10000000-0000-0000-0000-000000000771' and source_song_id = '40000000-0000-0000-0000-000000000772';
  select id into v_s3_o1 from public.songs where organization_id = '10000000-0000-0000-0000-000000000771' and source_song_id = '40000000-0000-0000-0000-000000000773';
  select id into v_s4_o1 from public.songs where organization_id = '10000000-0000-0000-0000-000000000771' and source_song_id = '40000000-0000-0000-0000-000000000774';
  if v_s1_o1 is null or v_s1_o2 is null or v_s2_o1 is null or v_s3_o1 is null or v_s4_o1 is null or v_s1_o1 = v_s1_o2 then
    raise exception 'cópias por (organização, música) faltando ou repetidas';
  end if;
  if exists (select 1 from public.songs where organization_id is not null and source_song_id = '40000000-0000-0000-0000-000000000775') then
    raise exception 'música sem uso não deveria ser copiada';
  end if;

  -- Conteúdo e autoria: user_id = dono da original (a órfã S3 é do B).
  if not exists (select 1 from public.songs where id = v_s1_o1 and title = 'S1' and artist = 'Art' and original_key = 'G'
      and current_key = 'A' and bpm = 70 and lyrics = '[G]s1' and notes = 'n1' and is_favorite
      and user_id = '00000000-0000-0000-0000-000000000771') then raise exception 'conteúdo da cópia S1'; end if;
  if (select user_id from public.songs where id = v_s3_o1) <> '00000000-0000-0000-0000-000000000772' then raise exception 'autor da cópia S3 deve ser o dono da original'; end if;

  -- Itens reapontados, na mesma quantidade e ordem.
  if (select song_id from public.repertoire_items where id = '51000000-0000-0000-0000-000000000771') <> v_s2_o1
     or (select song_id from public.repertoire_items where id = '51000000-0000-0000-0000-000000000772') <> v_s4_o1 then
    raise exception 'itens de repertório não reapontados';
  end if;
  if (select song_id from public.service_items where id = '61000000-0000-0000-0000-000000000771') <> v_s3_o1
     or (select song_id from public.service_items where id = '61000000-0000-0000-0000-000000000772') <> v_s1_o1
     or (select song_id from public.service_items where id = '61000000-0000-0000-0000-000000000773') <> v_s1_o2 then
    raise exception 'itens de serviço não reapontados (a mesma música em duas organizações usa cópias diferentes)';
  end if;

  -- Palco: o estado apontava para a órfã S3 e passa a apontar para a cópia; revisão avança.
  if (select current_song_id from public.stage_session_states where stage_session_id = '70000000-0000-0000-0000-000000000771') <> v_s3_o1 then
    raise exception 'estado do Palco não reapontado';
  end if;
  if (select revision from public.stage_session_states where stage_session_id = '70000000-0000-0000-0000-000000000771') < 1 then
    raise exception 'revisão do Palco deveria avançar para os clientes reler o estado';
  end if;

  -- Originais intactas e pessoais.
  if (select count(*) from public.songs where organization_id is null) <> 5 then raise exception 'originais devem continuar pessoais'; end if;
end $$;
