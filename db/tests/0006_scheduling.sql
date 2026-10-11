-- CANTUM — B4: escala (PERMISSIONS.md §3.5 e E1–E12), transições, disponibilidade e Stage.
\set ON_ERROR_STOP on
\o /dev/null
begin;

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('app.user_id', coalesce(p_id, ''), true) $$;

create function pg_temp.ok(p_condition boolean, p_label text) returns void language plpgsql
as $$ begin if not coalesce(p_condition, false) then raise exception 'falhou: %', p_label; end if; end $$;

-- Falha com o SQLSTATE esperado (e, se informada, a mensagem exata).
create function pg_temp.fails(p_sql text, p_label text, p_state text, p_message text default null) returns void language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state and (p_message is null or sqlerrm = p_message) then return; end if;
    raise exception '%: erro inesperado % "%"', p_label, sqlstate, sqlerrm;
  end;
  raise exception 'deveria falhar: %', p_label;
end $$;

create function pg_temp.affects(p_sql text, p_expected integer, p_label text) returns void language plpgsql
as $$
declare v_count integer;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  if v_count <> p_expected then raise exception '%: % linha(s), esperado %', p_label, v_count, p_expected; end if;
end $$;

-- Atribuição de uma pessoa numa vaga, preferindo a ativa (ignora RLS: é só localizador do teste).
create function pg_temp.aid(p_position text, p_user text) returns uuid language sql security definer
as $$ select id from public.assignments where position_id = p_position::uuid and user_id = p_user::uuid order by (status in ('invited', 'confirmed', 'replacement_needed')) desc, created_at desc, id limit 1 $$;

do $$ begin
  execute format('grant usage on schema %s to cantum_user, cantum_anon', pg_my_temp_schema()::regnamespace);
end $$;

-- Fixtures: o owner · a admin · la Líder de TA · lb Líder de TB · m e m2 membros de TA
-- li Líder inativo de TA · i membro inativo de TA · x outra organização · n sem vínculo
insert into app.users (id, email, display_name) values
  ('00000000-0000-0000-0000-000000000601', 'owner@b4.local', 'Olga'),
  ('00000000-0000-0000-0000-000000000602', 'admin@b4.local', 'Abel'),
  ('00000000-0000-0000-0000-000000000603', 'lidera@b4.local', 'Lia'),
  ('00000000-0000-0000-0000-000000000604', 'liderb@b4.local', 'Lucas'),
  ('00000000-0000-0000-0000-000000000605', 'membro@b4.local', 'Mauro'),
  ('00000000-0000-0000-0000-000000000606', 'membro2@b4.local', 'Mel'),
  ('00000000-0000-0000-0000-000000000607', 'liderinativo@b4.local', 'Lara'),
  ('00000000-0000-0000-0000-000000000608', 'inativo@b4.local', 'Ivo'),
  ('00000000-0000-0000-0000-000000000609', 'outra@b4.local', 'Xena'),
  ('00000000-0000-0000-0000-00000000060a', 'semvinculo@b4.local', 'Nina');

select pg_temp.as_user('00000000-0000-0000-0000-000000000601');
select public.create_organization('10000000-0000-0000-0000-000000000601', 'Igreja B4');
insert into public.teams (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000000601', '10000000-0000-0000-0000-000000000601', 'TA'),
  ('30000000-0000-0000-0000-000000000602', '10000000-0000-0000-0000-000000000601', 'TB');
select pg_temp.as_user('00000000-0000-0000-0000-000000000609');
select public.create_organization('10000000-0000-0000-0000-000000000602', 'Outra igreja');
select pg_temp.as_user(null);

insert into public.organization_memberships (organization_id, user_id, role)
select '10000000-0000-0000-0000-000000000601', u, r from (values
  ('00000000-0000-0000-0000-000000000602'::uuid, 'admin'),
  ('00000000-0000-0000-0000-000000000603', 'member'), ('00000000-0000-0000-0000-000000000604', 'member'),
  ('00000000-0000-0000-0000-000000000605', 'member'), ('00000000-0000-0000-0000-000000000606', 'member'),
  ('00000000-0000-0000-0000-000000000607', 'member'), ('00000000-0000-0000-0000-000000000608', 'member')) v(u, r);
insert into public.team_memberships (team_id, user_id, role, status) values
  ('30000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000603', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000604', 'leader', 'active'),
  ('30000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605', 'member', 'active'),
  ('30000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000606', 'member', 'active'),
  ('30000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000607', 'leader', 'inactive'),
  ('30000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000608', 'member', 'inactive');

insert into public.songs (user_id, id, title, original_key, current_key, lyrics, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000601', '40000000-0000-0000-0000-000000000601', 'Primeira', 'C', 'C', 'C', now(), now());
insert into public.organization_songs (organization_id, song_id) values ('10000000-0000-0000-0000-000000000601', '40000000-0000-0000-0000-000000000601');
-- 0601 S_A ready (TA) · 0602 S_B ready (TB) · 0603 S_F final (TA) · 0604 S_D draft (TA) · 0605 S_C (TA, para cancelar)
insert into public.services (id, organization_id, team_id, name, starts_at, created_by_user_id, status)
select ('6000000' || n)::uuid, '10000000-0000-0000-0000-000000000601', t, nome, now() + interval '3 days',
       '00000000-0000-0000-0000-000000000601', st
from (values
  ('0-0000-0000-0000-000000000601', '30000000-0000-0000-0000-000000000601'::uuid, 'S_A', 'ready'),
  ('0-0000-0000-0000-000000000602', '30000000-0000-0000-0000-000000000602'::uuid, 'S_B', 'ready'),
  ('0-0000-0000-0000-000000000603', '30000000-0000-0000-0000-000000000601'::uuid, 'S_F', 'ready'),
  ('0-0000-0000-0000-000000000604', '30000000-0000-0000-0000-000000000601'::uuid, 'S_D', 'draft'),
  ('0-0000-0000-0000-000000000605', '30000000-0000-0000-0000-000000000601'::uuid, 'S_C', 'ready')) v(n, t, nome, st);
insert into public.service_items (service_id, type, song_id, position)
  values ('60000000-0000-0000-0000-000000000601', 'song', '40000000-0000-0000-0000-000000000601', 0);
-- Vaga da equipe B e vaga com atribuições do serviço que será encerrado, semeadas pelo dono do schema.
insert into public.service_positions (id, service_id, musical_function, quantity) values
  ('70000000-0000-0000-0000-000000000603', '60000000-0000-0000-0000-000000000602', 'vocals', 1),
  ('70000000-0000-0000-0000-000000000604', '60000000-0000-0000-0000-000000000603', 'vocals', 2),
  ('70000000-0000-0000-0000-000000000605', '60000000-0000-0000-0000-000000000604', 'drums', 1),
  ('70000000-0000-0000-0000-000000000606', '60000000-0000-0000-0000-000000000605', 'bass', 1),
  ('70000000-0000-0000-0000-000000000607', '60000000-0000-0000-0000-000000000601', 'piano', 2);
insert into public.assignments (position_id, user_id, status) values
  ('70000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000604', 'invited'),
  ('70000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000605', 'invited'),
  ('70000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000606', 'confirmed'),
  ('70000000-0000-0000-0000-000000000606', '00000000-0000-0000-0000-000000000605', 'invited'),
  -- titular que foi inativado depois do convite (E9) e piano confirmado do serviço A:
  ('70000000-0000-0000-0000-000000000607', '00000000-0000-0000-0000-000000000608', 'invited');
update public.services set status = 'completed' where id = '60000000-0000-0000-0000-000000000603';

-- E12 e unicidade no banco: o índice parcial barra a duplicata mesmo fora das RPCs.
select pg_temp.fails($q$insert into public.assignments (position_id, user_id, status) values ('70000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000605', 'invited')$q$, 'E12 índice parcial', '23505');

set local role cantum_user;

-- ---------------------------------------------------------------------------
-- Líder da equipe: vagas e convites (contraste positivo)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000603');
insert into public.service_positions (id, service_id, musical_function, quantity, notes)
  values ('70000000-0000-0000-0000-000000000601', '60000000-0000-0000-0000-000000000601', 'vocals', 2, 'Vozes');
insert into public.service_positions (id, service_id, musical_function, quantity)
  values ('70000000-0000-0000-0000-000000000602', '60000000-0000-0000-0000-000000000601', 'keys', 1);
select pg_temp.affects($q$update public.service_positions set notes = 'Duas vozes' where id = '70000000-0000-0000-0000-000000000601'$q$, 1, 'Líder edita vaga');
select pg_temp.fails($q$insert into public.service_positions (service_id, musical_function, quantity) values ('60000000-0000-0000-0000-000000000601', 'vocals', 1)$q$, 'uma vaga por função', '23505');
select pg_temp.fails($q$insert into public.service_positions (service_id, musical_function, quantity) values ('60000000-0000-0000-0000-000000000601', 'drums', 0)$q$, 'quantidade 0', '23514');
select pg_temp.fails($q$insert into public.service_positions (service_id, musical_function, quantity) values ('60000000-0000-0000-0000-000000000601', 'drums', 21)$q$, 'quantidade 21', '23514');
select pg_temp.fails($q$insert into public.service_positions (service_id, musical_function, quantity) values ('60000000-0000-0000-0000-000000000601', 'kazoo', 1)$q$, 'função inválida', '23514');
select pg_temp.fails($q$update public.service_positions set service_id = '60000000-0000-0000-0000-000000000604' where id = '70000000-0000-0000-0000-000000000601'$q$, 'vaga muda de serviço', '42501');

select pg_temp.ok((select status = 'invited' and musical_function = 'vocals' and position_id = '70000000-0000-0000-0000-000000000601'
  from public.assign_member('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605')), 'convite nasce invited, com a função da vaga');
select public.assign_member('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000606');

-- E6 — quem não é membro ativo da equipe do serviço
select pg_temp.fails($q$select public.assign_member('70000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000608')$q$, 'E6 inactive', 'P0001', 'user is not an active member of the service team');
select pg_temp.fails($q$select public.assign_member('70000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000607')$q$, 'E6 Líder inactive', 'P0001', 'user is not an active member of the service team');
select pg_temp.fails($q$select public.assign_member('70000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000604')$q$, 'E6 outra equipe', 'P0001', 'user is not an active member of the service team');
select pg_temp.fails($q$select public.assign_member('70000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000609')$q$, 'E6 outra organização', 'P0001', 'user is not an active member of the service team');
select pg_temp.fails($q$select public.assign_member('70000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-00000000060a')$q$, 'E6 sem vínculo', 'P0001', 'user is not an active member of the service team');
select pg_temp.fails($q$select public.assign_member('70000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-0000000000ff')$q$, 'E6 usuário inexistente', 'P0001', 'user is not an active member of the service team');
select pg_temp.fails($q$select public.assign_member('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605')$q$, 'duplicada', 'P0001', 'member already assigned to this position');
select public.assign_member('70000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000605');
select pg_temp.fails($q$select public.assign_member('70000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000606')$q$, 'vaga cheia', 'P0001', 'position is full');
-- Mesma pessoa em duas vagas do mesmo serviço é permitida (RN-02).
select pg_temp.ok((select count(*) = 2 from public.assignments where service_id = '60000000-0000-0000-0000-000000000601' and user_id = '00000000-0000-0000-0000-000000000605'), 'mesma pessoa em duas vagas');

-- Leitura: membro ativo vê a escala inteira do serviço (RN-13)
select pg_temp.as_user('00000000-0000-0000-0000-000000000606');
select pg_temp.ok((select count(*) = 4 from public.assignments where service_id = '60000000-0000-0000-0000-000000000601'), 'membro lê a escala do serviço');
select pg_temp.ok((select count(*) = 3 from public.service_positions where service_id = '60000000-0000-0000-0000-000000000601'), 'membro lê as vagas');

-- ---------------------------------------------------------------------------
-- E1, E2 — responder pelo outro: só o titular
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000606'); -- m2 mexe na de m
select pg_temp.fails(format($q$select public.respond_to_assignment(%L, 'confirm')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605')), 'E1 confirmar a de outro', 'P0001', 'assignment not found or not authorized');
select pg_temp.fails(format($q$select public.respond_to_assignment(%L, 'decline')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605')), 'E1 recusar a de outro', 'P0001', 'assignment not found or not authorized');
select pg_temp.fails(format($q$select public.request_replacement(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605')), 'E1 pedir substituição da de outro', 'P0001', 'assignment not found or not authorized');
select pg_temp.as_user('00000000-0000-0000-0000-000000000603'); -- Líder
select pg_temp.fails(format($q$select public.respond_to_assignment(%L, 'confirm')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605')), 'E2 Líder responde pelo titular', 'P0001', 'assignment not found or not authorized');
select pg_temp.as_user('00000000-0000-0000-0000-000000000602'); -- Admin
select pg_temp.fails(format($q$select public.respond_to_assignment(%L, 'decline')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605')), 'E2 Admin responde pelo titular', 'P0001', 'assignment not found or not authorized');
select pg_temp.as_user('00000000-0000-0000-0000-000000000601'); -- Owner
select pg_temp.fails(format($q$select public.respond_to_assignment(%L, 'confirm')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605')), 'E2 Owner responde pelo titular', 'P0001', 'assignment not found or not authorized');

-- Titular responde; E7 — transições inválidas
select pg_temp.as_user('00000000-0000-0000-0000-000000000605');
select pg_temp.fails(format($q$select public.request_replacement(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605')), 'E7 invited → replacement_needed', 'P0001', 'invalid assignment transition');
select pg_temp.fails(format($q$select public.respond_to_assignment(%L, 'talvez')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605')), 'resposta inválida', 'P0001', 'invalid assignment response');
select pg_temp.ok((select status = 'confirmed' and responded_at is not null
  from public.respond_to_assignment(pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605'), 'confirm')), 'titular confirma');
select pg_temp.fails(format($q$select public.respond_to_assignment(%L, 'confirm')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605')), 'E7 confirmed → confirmed', 'P0001', 'invalid assignment transition');
select pg_temp.fails(format($q$select public.respond_to_assignment(%L, 'decline')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605')), 'E7 confirmed → declined', 'P0001', 'invalid assignment transition');
select pg_temp.as_user('00000000-0000-0000-0000-000000000606');
select pg_temp.ok((select status = 'declined' from public.respond_to_assignment(pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000606'), 'decline')), 'titular recusa');
select pg_temp.fails(format($q$select public.respond_to_assignment(%L, 'confirm')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000606')), 'E7 declined → confirmed', 'P0001', 'invalid assignment transition');
select pg_temp.fails(format($q$select public.request_replacement(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000606')), 'E7 declined → replacement_needed', 'P0001', 'invalid assignment transition');
select pg_temp.as_user('00000000-0000-0000-0000-000000000603');
select pg_temp.fails(format($q$select public.cancel_assignment(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000606')), 'E7 declined → cancelled', 'P0001', 'invalid assignment transition');
select pg_temp.fails(format($q$select public.replace_assignment(%L, '00000000-0000-0000-0000-000000000605')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000606')), 'E7 substituir declined', 'P0001', 'invalid assignment transition');

-- Cancelar e reconvidar: cancelled é final, reconvidar cria outra atribuição
select pg_temp.ok((select status = 'cancelled' from public.cancel_assignment(pg_temp.aid('70000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000605'))), 'Líder cancela');
select pg_temp.as_user('00000000-0000-0000-0000-000000000605');
select pg_temp.fails(format($q$select public.respond_to_assignment(%L, 'confirm')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000605')), 'E7 cancelled → confirmed', 'P0001', 'invalid assignment transition');
select pg_temp.as_user('00000000-0000-0000-0000-000000000603');
select pg_temp.fails(format($q$select public.cancel_assignment(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000605')), 'E7 cancelled → cancelled', 'P0001', 'invalid assignment transition');
select public.assign_member('70000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000605');
select pg_temp.ok((select count(*) = 2 from public.assignments where position_id = '70000000-0000-0000-0000-000000000602'), 'reconvidar cria outra atribuição');

-- Substituição: titular pede, Líder substitui (RN-05)
select pg_temp.as_user('00000000-0000-0000-0000-000000000605');
select pg_temp.ok((select status = 'replacement_needed' from public.request_replacement(pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605'))), 'titular pede substituição');
select pg_temp.as_user('00000000-0000-0000-0000-000000000603');
select pg_temp.fails(format($q$select public.replace_assignment(%L, '00000000-0000-0000-0000-000000000605')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605')), 'substituir pela mesma pessoa', 'P0001', 'cannot replace a member with the same member');
select pg_temp.fails(format($q$select public.replace_assignment(%L, '00000000-0000-0000-0000-000000000608')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605')), 'E6 substituir por inactive', 'P0001', 'user is not an active member of the service team');
select pg_temp.ok((select status = 'invited' and user_id = '00000000-0000-0000-0000-000000000606'
    and replaced_assignment_id = pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605')
  from public.replace_assignment(pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605'), '00000000-0000-0000-0000-000000000606')),
  'substituir cria a nova, ligada à anterior');
select pg_temp.ok((select status = 'cancelled' from public.assignments where user_id = '00000000-0000-0000-0000-000000000605' and position_id = '70000000-0000-0000-0000-000000000601'), 'a anterior fica cancelled');

-- ---------------------------------------------------------------------------
-- E3 — Líder de TA no serviço de TB
-- ---------------------------------------------------------------------------
select pg_temp.fails($q$insert into public.service_positions (service_id, musical_function, quantity) values ('60000000-0000-0000-0000-000000000602', 'drums', 1)$q$, 'E3 cria vaga em TB', '42501');
select pg_temp.affects($q$update public.service_positions set quantity = 2 where id = '70000000-0000-0000-0000-000000000603'$q$, 0, 'E3 edita vaga de TB');
select pg_temp.affects($q$delete from public.service_positions where id = '70000000-0000-0000-0000-000000000603'$q$, 0, 'E3 exclui vaga de TB');
select pg_temp.fails($q$select public.assign_member('70000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000604')$q$, 'E3 atribui em TB', 'P0001', 'position not found or not authorized');
select pg_temp.fails(format($q$select public.cancel_assignment(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000604')), 'E3 cancela em TB', 'P0001', 'assignment not found or not authorized');
select pg_temp.fails(format($q$select public.replace_assignment(%L, '00000000-0000-0000-0000-000000000604')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000604')), 'E3 substitui em TB', 'P0001', 'assignment not found or not authorized');
select pg_temp.fails(format($q$select public.request_replacement(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000604')), 'E3 pede substituição em TB', 'P0001', 'assignment not found or not authorized');

-- E4 — Membro
select pg_temp.as_user('00000000-0000-0000-0000-000000000605');
select pg_temp.fails($q$insert into public.service_positions (service_id, musical_function, quantity) values ('60000000-0000-0000-0000-000000000601', 'drums', 1)$q$, 'E4 cria vaga', '42501');
select pg_temp.affects($q$update public.service_positions set quantity = 3 where id = '70000000-0000-0000-0000-000000000601'$q$, 0, 'E4 edita vaga');
select pg_temp.affects($q$delete from public.service_positions where id = '70000000-0000-0000-0000-000000000602'$q$, 0, 'E4 exclui vaga');
select pg_temp.fails($q$select public.assign_member('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000606')$q$, 'E4 atribui', 'P0001', 'position not found or not authorized');
select pg_temp.fails(format($q$select public.cancel_assignment(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000605')), 'E4 cancela a própria', 'P0001', 'assignment not found or not authorized');
select pg_temp.fails(format($q$select public.replace_assignment(%L, '00000000-0000-0000-0000-000000000606')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000605')), 'E4 substitui', 'P0001', 'assignment not found or not authorized');

-- ---------------------------------------------------------------------------
-- E5 — escrita direta em assignments, por qualquer papel
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000601');
select pg_temp.fails($q$insert into public.assignments (service_id, user_id, musical_function, position_id, status) values ('60000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605', 'keys', '70000000-0000-0000-0000-000000000602', 'confirmed')$q$, 'E5 Owner insert', '42501');
select pg_temp.fails($q$update public.assignments set status = 'confirmed'$q$, 'E5 Owner update', '42501');
select pg_temp.fails($q$delete from public.assignments$q$, 'E5 Owner delete', '42501');
select pg_temp.as_user('00000000-0000-0000-0000-000000000602');
select pg_temp.fails($q$update public.assignments set status = 'confirmed'$q$, 'E5 Admin update', '42501');
select pg_temp.as_user('00000000-0000-0000-0000-000000000603');
select pg_temp.fails($q$update public.assignments set status = 'confirmed'$q$, 'E5 Líder update', '42501');
select pg_temp.fails($q$delete from public.assignments$q$, 'E5 Líder delete', '42501');
select pg_temp.as_user('00000000-0000-0000-0000-000000000605');
select pg_temp.fails($q$update public.assignments set status = 'confirmed' where user_id = app.current_user_id()$q$, 'E5 titular update (sync)', '42501');
select pg_temp.fails($q$insert into public.assignments (service_id, user_id, musical_function, position_id) values ('60000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605', 'keys', '70000000-0000-0000-0000-000000000602')$q$, 'E5 Membro insert', '42501');

-- ---------------------------------------------------------------------------
-- E8 — serviço final (S_F, completed) e cancelado
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000603');
select pg_temp.fails($q$insert into public.service_positions (service_id, musical_function, quantity) values ('60000000-0000-0000-0000-000000000603', 'drums', 1)$q$, 'E8 cria vaga', '42501');
select pg_temp.affects($q$update public.service_positions set quantity = 3 where id = '70000000-0000-0000-0000-000000000604'$q$, 0, 'E8 edita vaga');
select pg_temp.affects($q$delete from public.service_positions where id = '70000000-0000-0000-0000-000000000604'$q$, 0, 'E8 exclui vaga');
select pg_temp.fails($q$select public.assign_member('70000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000605')$q$, 'E8 atribui', 'P0001', 'service is completed or cancelled');
select pg_temp.fails(format($q$select public.cancel_assignment(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000605')), 'E8 cancela', 'P0001', 'service is completed or cancelled');
select pg_temp.fails(format($q$select public.replace_assignment(%L, '00000000-0000-0000-0000-000000000606')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000605')), 'E8 substitui', 'P0001', 'service is completed or cancelled');
select pg_temp.as_user('00000000-0000-0000-0000-000000000606');
select pg_temp.fails(format($q$select public.request_replacement(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000606')), 'E8 pede substituição', 'P0001', 'service is completed or cancelled');
select pg_temp.as_user('00000000-0000-0000-0000-000000000605');
select pg_temp.fails(format($q$select public.respond_to_assignment(%L, 'confirm')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000605')), 'E8 responde', 'P0001', 'service is completed or cancelled');
-- Cancelar o serviço não altera as atribuições (RN-08, histórico).
select pg_temp.as_user('00000000-0000-0000-0000-000000000603');
select public.transition_service('60000000-0000-0000-0000-000000000605', 'cancelled');
select pg_temp.ok((select status = 'invited' from public.assignments where position_id = '70000000-0000-0000-0000-000000000606'), 'serviço cancelado mantém a atribuição');
select pg_temp.fails($q$select public.assign_member('70000000-0000-0000-0000-000000000606', '00000000-0000-0000-0000-000000000606')$q$, 'E8 atribui em cancelado', 'P0001', 'service is completed or cancelled');

-- E9 — Líder inativo e titular inativo
select pg_temp.as_user('00000000-0000-0000-0000-000000000607');
select pg_temp.fails($q$insert into public.service_positions (service_id, musical_function, quantity) values ('60000000-0000-0000-0000-000000000601', 'drums', 1)$q$, 'E9 Líder inativo cria vaga', '42501');
select pg_temp.fails($q$select public.assign_member('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000606')$q$, 'E9 Líder inativo atribui', 'P0001', 'position not found or not authorized');
select pg_temp.fails(format($q$select public.cancel_assignment(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000605')), 'E9 Líder inativo cancela', 'P0001', 'assignment not found or not authorized');
select pg_temp.as_user('00000000-0000-0000-0000-000000000608');
select pg_temp.fails(format($q$select public.respond_to_assignment(%L, 'confirm')$q$, pg_temp.aid('70000000-0000-0000-0000-000000000607', '00000000-0000-0000-0000-000000000608')), 'E9 titular inativo confirma', 'P0001', 'assignment not found or not authorized');
select pg_temp.fails(format($q$select public.request_replacement(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000607', '00000000-0000-0000-0000-000000000608')), 'E9 titular inativo pede substituição', 'P0001', 'assignment not found or not authorized');
select pg_temp.ok((select count(*) = 0 from public.service_positions), 'inativo não lê vagas');
select pg_temp.ok((select count(*) = 0 from public.assignments), 'inativo não lê a escala');

-- Outra organização, sem vínculo e anônimo
select pg_temp.as_user('00000000-0000-0000-0000-000000000609');
select pg_temp.ok((select count(*) = 0 from public.service_positions), 'outra organização não lê vagas');
select pg_temp.ok((select count(*) = 0 from public.assignments), 'outra organização não lê a escala');
select pg_temp.fails($q$select public.assign_member('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000606')$q$, 'outra organização atribui', 'P0001', 'position not found or not authorized');
select pg_temp.as_user('00000000-0000-0000-0000-00000000060a');
select pg_temp.ok((select count(*) = 0 from public.service_positions), 'sem vínculo não lê vagas');
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) = 0 from public.service_positions), 'anônimo não lê vagas');
select pg_temp.fails($q$select public.assign_member('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000606')$q$, 'anônimo atribui', 'P0001', 'authentication required');
select pg_temp.fails($q$select public.respond_to_assignment(gen_random_uuid(), 'confirm')$q$, 'anônimo responde', 'P0001', 'authentication required');

-- ---------------------------------------------------------------------------
-- E11 — quantidade e exclusão de vaga
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000603');
-- vocals do S_A: m2 invited (a nova), m cancelled. Reconvida m: duas ativas.
select public.assign_member('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000605');
select pg_temp.fails($q$update public.service_positions set quantity = 1 where id = '70000000-0000-0000-0000-000000000601'$q$, 'E11 abaixo das ativas', 'P0001', 'position quantity is below active assignments');
select pg_temp.fails($q$update public.service_positions set musical_function = 'bass' where id = '70000000-0000-0000-0000-000000000601'$q$, 'função muda com atribuições', 'P0001', 'position function cannot change with assignments');
select pg_temp.fails($q$delete from public.service_positions where id = '70000000-0000-0000-0000-000000000601'$q$, 'E11 exclui vaga com atribuição', '23503');
select pg_temp.fails($q$delete from public.service_positions where id = '70000000-0000-0000-0000-000000000602'$q$, 'E11 exclui vaga com histórico', '23503');
select pg_temp.affects($q$update public.service_positions set quantity = 2 where id = '70000000-0000-0000-0000-000000000601'$q$, 1, 'quantidade igual às ativas');
insert into public.service_positions (id, service_id, musical_function, quantity) values ('70000000-0000-0000-0000-000000000608', '60000000-0000-0000-0000-000000000601', 'drums', 1);
select pg_temp.affects($q$delete from public.service_positions where id = '70000000-0000-0000-0000-000000000608'$q$, 1, 'exclui vaga sem atribuições');

-- ---------------------------------------------------------------------------
-- Disponibilidade (E10)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000605');
insert into public.member_availability (user_id, organization_id, date, status, note)
  values ('00000000-0000-0000-0000-000000000605', '10000000-0000-0000-0000-000000000601', '2026-12-06', 'unavailable', 'Viagem');
insert into public.member_availability (user_id, organization_id, date, status)
  values ('00000000-0000-0000-0000-000000000605', '10000000-0000-0000-0000-000000000601', '2026-12-13', 'tentative');
select pg_temp.affects($q$update public.member_availability set status = 'available', note = null where date = '2026-12-06'$q$, 1, 'membro edita a própria');
select pg_temp.affects($q$update public.member_availability set status = 'unavailable', note = 'Viagem' where date = '2026-12-06'$q$, 1, 'membro edita a própria (2)');
select pg_temp.ok((select count(*) = 2 from public.member_availability), 'membro lê a própria');
select pg_temp.fails($q$insert into public.member_availability (user_id, organization_id, date, status) values ('00000000-0000-0000-0000-000000000605', '10000000-0000-0000-0000-000000000601', '2026-12-06', 'available')$q$, 'um registro por dia', '23505');
select pg_temp.fails($q$insert into public.member_availability (user_id, organization_id, date, status) values ('00000000-0000-0000-0000-000000000605', '10000000-0000-0000-0000-000000000601', '2026-12-20', 'maybe')$q$, 'estado inválido', '23514');
select pg_temp.fails($q$insert into public.member_availability (user_id, organization_id, date, status, note) values ('00000000-0000-0000-0000-000000000605', '10000000-0000-0000-0000-000000000601', '2026-12-20', 'available', repeat('x', 201))$q$, 'nota > 200', '23514');
select pg_temp.fails($q$insert into public.member_availability (user_id, organization_id, date, status) values ('00000000-0000-0000-0000-000000000606', '10000000-0000-0000-0000-000000000601', '2026-12-20', 'available')$q$, 'E10 escreve a de outra pessoa', '42501');
select pg_temp.fails($q$update public.member_availability set user_id = '00000000-0000-0000-0000-000000000606' where date = '2026-12-13'$q$, 'E10 passa a linha para outra pessoa', '42501');
select pg_temp.fails($q$insert into public.member_availability (user_id, organization_id, date, status) values ('00000000-0000-0000-0000-000000000605', '10000000-0000-0000-0000-000000000602', '2026-12-20', 'available')$q$, 'organização de que não é membro', '42501');

select pg_temp.as_user('00000000-0000-0000-0000-000000000606'); -- outro membro comum
select pg_temp.ok((select count(*) = 0 from public.member_availability), 'E10 membro comum não lê a de outro');
select pg_temp.affects($q$update public.member_availability set status = 'available'$q$, 0, 'E10 membro comum não altera a de outro');
select pg_temp.affects($q$delete from public.member_availability$q$, 0, 'E10 membro comum não apaga a de outro');
select pg_temp.as_user('00000000-0000-0000-0000-000000000603'); -- Líder da equipe do membro
select pg_temp.ok((select count(*) = 2 and bool_or(note = 'Viagem') from public.member_availability), 'Líder da equipe lê, com a nota');
select pg_temp.fails($q$insert into public.member_availability (user_id, organization_id, date, status) values ('00000000-0000-0000-0000-000000000605', '10000000-0000-0000-0000-000000000601', '2026-12-27', 'available')$q$, 'Líder não escreve a do membro', '42501');
select pg_temp.as_user('00000000-0000-0000-0000-000000000604'); -- Líder de outra equipe
select pg_temp.ok((select count(*) = 0 from public.member_availability), 'E10 Líder de equipe da qual o alvo não faz parte');
select pg_temp.as_user('00000000-0000-0000-0000-000000000607'); -- Líder inativo
select pg_temp.ok((select count(*) = 0 from public.member_availability), 'E10 Líder inativo');
select pg_temp.as_user('00000000-0000-0000-0000-000000000602'); -- Admin
select pg_temp.ok((select count(*) = 2 from public.member_availability), 'Admin lê');
select pg_temp.as_user('00000000-0000-0000-0000-000000000601'); -- Owner
select pg_temp.ok((select count(*) = 2 from public.member_availability), 'Owner lê');
select pg_temp.as_user('00000000-0000-0000-0000-000000000609'); -- outra organização
select pg_temp.ok((select count(*) = 0 from public.member_availability), 'E10 outra organização');
select pg_temp.fails($q$insert into public.member_availability (user_id, organization_id, date, status) values ('00000000-0000-0000-0000-000000000609', '10000000-0000-0000-0000-000000000601', '2026-12-20', 'available')$q$, 'E10 outra organização escreve', '42501');
select pg_temp.as_user('00000000-0000-0000-0000-000000000608'); -- inativo em todas
select pg_temp.fails($q$insert into public.member_availability (user_id, organization_id, date, status) values ('00000000-0000-0000-0000-000000000608', '10000000-0000-0000-0000-000000000601', '2026-12-20', 'available')$q$, 'inativo não informa disponibilidade', '42501');
select pg_temp.as_user(null);
select pg_temp.ok((select count(*) = 0 from public.member_availability), 'E10 anônimo');
reset role;
set local role cantum_anon;
select pg_temp.fails($q$select 1 from public.member_availability$q$, 'E10 cantum_anon lê', '42501');
select pg_temp.fails($q$select 1 from public.service_positions$q$, 'cantum_anon lê vagas', '42501');
reset role;
set local role cantum_user;

-- ---------------------------------------------------------------------------
-- E-mail de convite (servidor): app.assignment_invite_mail
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000603');
select public.assign_member('70000000-0000-0000-0000-000000000607', '00000000-0000-0000-0000-000000000606');
select pg_temp.ok((select email = 'membro2@b4.local' and display_name = 'Mel' and musical_function = 'piano' and service_name = 'S_A'
  from app.assignment_invite_mail(pg_temp.aid('70000000-0000-0000-0000-000000000607', '00000000-0000-0000-0000-000000000606'))), 'dados do e-mail de convite');
select pg_temp.fails(format($q$select * from app.assignment_invite_mail(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000607', '00000000-0000-0000-0000-000000000606')), 'no máximo um por minuto', 'P0001', 'invite sent recently');
select pg_temp.as_user('00000000-0000-0000-0000-000000000605');
select pg_temp.fails(format($q$select * from app.assignment_invite_mail(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000607', '00000000-0000-0000-0000-000000000606')), 'membro não reenvia', 'P0001', 'assignment not found or not authorized');
select pg_temp.as_user('00000000-0000-0000-0000-000000000604');
select pg_temp.fails(format($q$select * from app.assignment_invite_mail(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000607', '00000000-0000-0000-0000-000000000606')), 'Líder de outra equipe não reenvia', 'P0001', 'assignment not found or not authorized');
select pg_temp.as_user('00000000-0000-0000-0000-000000000606');
select pg_temp.ok((select status = 'confirmed' from public.respond_to_assignment(pg_temp.aid('70000000-0000-0000-0000-000000000607', '00000000-0000-0000-0000-000000000606'), 'confirm')), 'm2 confirma o piano');
select pg_temp.as_user('00000000-0000-0000-0000-000000000603');
select pg_temp.fails(format($q$select * from app.assignment_invite_mail(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000607', '00000000-0000-0000-0000-000000000606')), 'só convite pendente', 'P0001', 'invalid assignment transition');
select pg_temp.fails(format($q$select * from app.assignment_invite_mail(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000606')), 'serviço final', 'P0001', 'service is completed or cancelled');
-- Rascunho: o convite só sai quando o serviço passa de draft.
select pg_temp.as_user('00000000-0000-0000-0000-000000000601');
select public.assign_member('70000000-0000-0000-0000-000000000605', '00000000-0000-0000-0000-000000000606');
select pg_temp.fails(format($q$select * from app.assignment_invite_mail(%L)$q$, pg_temp.aid('70000000-0000-0000-0000-000000000605', '00000000-0000-0000-0000-000000000606')), 'serviço em rascunho', 'P0001', 'service is still a draft');

-- ---------------------------------------------------------------------------
-- Stage: musical_role vem da vaga da atribuição ativa (D6)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-000000000601');
select public.create_target_stage_session('60000000-0000-0000-0000-000000000601', '80000000-0000-0000-0000-000000000601');
select pg_temp.as_user('00000000-0000-0000-0000-000000000606'); -- confirmada no piano e convidada em vocals
select pg_temp.ok((select musical_role in ('piano', 'vocals') from public.get_service_stage_songs('80000000-0000-0000-0000-000000000601')), 'Stage: função da vaga confirmada');
select pg_temp.as_user('00000000-0000-0000-0000-000000000605'); -- convidado em vocals e keys
select pg_temp.ok((select musical_role in ('vocals', 'keys') from public.get_service_stage_songs('80000000-0000-0000-0000-000000000601')), 'Stage: função da vaga convidada');
select pg_temp.as_user('00000000-0000-0000-0000-000000000601'); -- Owner sem atribuição
select pg_temp.ok((select musical_role = 'other' from public.get_service_stage_songs('80000000-0000-0000-0000-000000000601')), 'Stage: sem atribuição ativa → other');
select pg_temp.as_user('00000000-0000-0000-0000-000000000603');
select public.cancel_assignment(pg_temp.aid('70000000-0000-0000-0000-000000000607', '00000000-0000-0000-0000-000000000606'));
select public.cancel_assignment(pg_temp.aid('70000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000606'));
select pg_temp.as_user('00000000-0000-0000-0000-000000000606');
select pg_temp.ok((select musical_role = 'other' from public.get_service_stage_songs('80000000-0000-0000-0000-000000000601')), 'Stage: atribuição cancelada não conta');

reset role;
rollback;
