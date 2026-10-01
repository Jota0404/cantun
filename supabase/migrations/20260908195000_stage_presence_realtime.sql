-- CANTUM — Tarefa W: autorização do canal Realtime do Modo Banda

drop policy if exists "Band stage members can receive realtime" on realtime.messages;
drop policy if exists "Band stage members can send realtime" on realtime.messages;

create policy "Band stage members can receive realtime"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'band-stage:%'
  and exists (
    select 1
    from public.band_stage_sessions s
    where s.id::text = split_part(realtime.topic(), ':', 2)
      and private.is_band_member(s.band_id)
      and realtime.messages.extension in ('broadcast', 'presence')
  )
);

create policy "Band stage members can send realtime"
on realtime.messages
for insert
to authenticated
with check (
  realtime.topic() like 'band-stage:%'
  and exists (
    select 1
    from public.band_stage_sessions s
    where s.id::text = split_part(realtime.topic(), ':', 2)
      and private.is_band_member(s.band_id)
      and realtime.messages.extension in ('broadcast', 'presence')
  )
);
