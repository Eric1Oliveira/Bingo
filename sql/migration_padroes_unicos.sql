-- ============================================================================
--  MIGRAÇÃO: cada PADRÃO só pode ser vencido UMA vez por sala (global)
--  Cole isto no SQL Editor do Supabase e clique em "Run".
--  (Já está incluído no schema.sql; este arquivo é só para aplicar a mudança
--   sem rodar o schema inteiro de novo.)
-- ============================================================================

-- 1) Remove duplicatas antigas (mesmo padrão vencido 2x na mesma sala em testes)
delete from winners w
  using winners w2
  where w.room_id = w2.room_id and w.pattern = w2.pattern and w.ctid > w2.ctid;

-- 2) Garante 1 vencedor por padrão por sala
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'winners_room_pattern_unique'
  ) then
    alter table winners add constraint winners_room_pattern_unique unique (room_id, pattern);
  end if;
end $$;

-- 3) Atualiza a função de registro: rejeita padrão já vencido na sala
create or replace function register_winner(
  p_room_id   uuid,
  p_player_id uuid,
  p_card_id   uuid,
  p_player_name text,
  p_pattern   text
)
returns int
language plpgsql
security definer
as $$
declare
  v_place int;
  v_drawn int;
begin
  if exists (select 1 from winners where room_id = p_room_id and pattern = p_pattern) then
    return -1; -- padrão já vencido por alguém nesta sala
  end if;

  select coalesce(array_length(drawn_numbers, 1), 0) into v_drawn
  from rooms where id = p_room_id;

  select winners_count + 1 into v_place from rooms where id = p_room_id for update;

  begin
    insert into winners (room_id, player_id, card_id, player_name, pattern, numbers_drawn, place)
    values (p_room_id, p_player_id, p_card_id, p_player_name, p_pattern, v_drawn, v_place);
  exception when unique_violation then
    return -1;
  end;

  update rooms set winners_count = v_place, updated_at = now() where id = p_room_id;
  update players set bingos = bingos + 1 where id = p_player_id;

  return v_place;
end;
$$;
