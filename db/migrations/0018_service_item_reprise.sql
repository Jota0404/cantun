-- CANTUM — B6 fatia 3 / reprise e medley (VS-04-05, RN-10, RN-11).
-- service_items.type ganha 'reprise' e 'medley': itens não musicais (song_id nulo, title obrigatório pelo
-- service_items_non_song_title_check) que apontam para um item 'song' do MESMO serviço via ref_item_id.
-- Excluir o item referenciado apaga suas reprises/medleys (RN-11). A RLS existente de service_items
-- (service.edit, negado em completed/cancelled) já cobre quem grava; sem capacidade nova.
-- O Palco (D6) segue lendo só type = 'song': get_service_stage_songs e a navegação não mudam.

alter table public.service_items drop constraint service_items_type_check;
alter table public.service_items
  add constraint service_items_type_check
    check (type in ('song', 'opening', 'prayer', 'preaching', 'announcement', 'offering', 'closing', 'other', 'reprise', 'medley'));

alter table public.service_items
  add column ref_item_id uuid,
  add constraint service_items_service_id_id_key unique (service_id, id),
  add constraint service_items_ref_check check ((type in ('reprise', 'medley')) = (ref_item_id is not null)),
  add constraint service_items_ref_fkey foreign key (service_id, ref_item_id)
    references public.service_items (service_id, id) on delete cascade;

create index service_items_ref_idx on public.service_items (service_id, ref_item_id) where ref_item_id is not null;

-- O alvo precisa ser 'song' (a FK composta já garante o mesmo serviço). security definer: o alvo é lido sem RLS.
create function app.service_item_ref_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.ref_item_id is null then return new; end if;
  if not exists (
    select 1 from public.service_items t
    where t.service_id = new.service_id and t.id = new.ref_item_id and t.type = 'song'
  ) then
    raise exception 'reprise/medley target must be a song item of the same service' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function app.service_item_ref_guard() from public;

create trigger service_items_ref_guard before insert or update of ref_item_id, service_id on public.service_items
  for each row execute function app.service_item_ref_guard();

-- Impede que o item referenciado deixe de ser 'song' enquanto houver reprise/medley apontando para ele.
create function app.service_item_ref_target_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.type <> 'song' and exists (
    select 1 from public.service_items r where r.service_id = new.service_id and r.ref_item_id = new.id
  ) then
    raise exception 'item referenced by a reprise/medley must stay a song' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function app.service_item_ref_target_guard() from public;

create trigger service_items_ref_target_guard before update of type on public.service_items
  for each row when (old.type = 'song' and new.type <> 'song')
  execute function app.service_item_ref_target_guard();
