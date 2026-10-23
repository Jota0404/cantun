-- CANTUM — Serviço concluído não se exclui (decisão do owner; preserva o registro da execução, D5).
-- Trigger em vez de condição na policy services_delete: a RLS só filtraria (0 linhas, 200 silencioso);
-- o trigger dá erro claro (42501 → 403 service_completed) a quem passaria pela policy, e quem não passa
-- continua sem ver nada. Quem pode excluir (policy de 0005) não muda. Cascatas de FK (exclusão da
-- organização, ADR-063) rodam dentro do trigger de RI (pg_trigger_depth() > 1) e seguem livres.

create function app.prevent_completed_service_delete() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then return old; end if;
  raise exception 'completed service cannot be deleted' using errcode = '42501';
end $$;
revoke all on function app.prevent_completed_service_delete() from public;

create trigger services_prevent_completed_delete before delete on public.services
  for each row when (old.status = 'completed') execute function app.prevent_completed_service_delete();
