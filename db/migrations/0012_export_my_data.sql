-- CANTUM — B8 fatia 7: exportação dos dados do titular (VS-07, RN-08, ADR-063).
-- export_my_data() devolve um JSON só com dados do próprio titular (app.current_user_id(), sem parâmetro).
-- Fora do JSON: senha, sessões, tokens e qualquer dado de outra pessoa (nomes e e-mails de outros membros).
-- TODO(RN-09): registrar a exportação em admin_events, sem conteúdo, quando a 0011 (fatia 4) existir.

create function public.export_my_data() returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := app.current_user_id();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;

  return jsonb_build_object(
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
      select jsonb_agg(to_jsonb(s) - 'user_id' order by s.created_at)
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
end;
$$;
revoke all on function public.export_my_data() from public;
grant execute on function public.export_my_data() to cantum_user;
