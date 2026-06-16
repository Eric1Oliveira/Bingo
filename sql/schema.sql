-- ============================================================================
--  BINGO MUNDIAL — Schema completo para Supabase
--  Cole tudo isso no SQL Editor do Supabase e clique em "Run".
--  Funciona com jogadores anônimos (sem login), identificados por um UUID
--  gerado no navegador e guardado no localStorage.
-- ============================================================================

-- Extensão para gerar UUIDs (já vem habilitada no Supabase, mas garantimos)
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- LIMPEZA (rode se quiser recomeçar do zero — descomente as linhas abaixo)
-- ----------------------------------------------------------------------------
-- drop table if exists winners cascade;
-- drop table if exists cards   cascade;
-- drop table if exists players cascade;
-- drop table if exists rooms   cascade;

-- ----------------------------------------------------------------------------
-- TABELA: rooms  (as salas de bingo)
-- ----------------------------------------------------------------------------
create table if not exists rooms (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null,                 -- código de convite curto, ex: "BINGO-7K2A"
  name             text not null default 'Sala de Bingo',
  host_id          text not null,                        -- UUID do navegador do anfitrião
  status           text not null default 'waiting',      -- waiting | playing | paused | finished
  pattern          text not null default 'line',         -- padrão de vitória atual
  cards_per_player int  not null default 1 check (cards_per_player between 1 and 50),
  max_number       int  not null default 75,             -- 75 (clássico B-I-N-G-O)
  drawn_numbers    int[] not null default '{}',          -- números já sorteados (em ordem)
  current_number   int,                                  -- último número sorteado
  auto_draw        boolean not null default false,       -- sorteio automático ligado?
  draw_interval    int  not null default 5,              -- segundos entre sorteios automáticos
  allow_late_join  boolean not null default true,        -- pode entrar com jogo em andamento?
  winners_count    int  not null default 0,              -- quantos já bateram bingo
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists rooms_code_idx on rooms (code);

-- ----------------------------------------------------------------------------
-- TABELA: players  (jogadores dentro de uma sala)
-- ----------------------------------------------------------------------------
create table if not exists players (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms(id) on delete cascade,
  client_id   text not null,                  -- UUID do navegador do jogador
  name        text not null default 'Jogador',
  avatar      text not null default '🎉',     -- emoji do avatar
  is_host     boolean not null default false,
  is_ready    boolean not null default false,
  bingos      int not null default 0,         -- quantos bingos esse jogador já fez
  joined_at   timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  unique (room_id, client_id)
);

create index if not exists players_room_idx on players (room_id);

-- ----------------------------------------------------------------------------
-- TABELA: cards  (cartelas — cada jogador pode ter várias)
-- ----------------------------------------------------------------------------
create table if not exists cards (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  card_index  int  not null default 0,        -- 0,1,2... ordem da cartela do jogador
  numbers     jsonb not null,                 -- matriz 5x5, centro = 0 (FREE)
  created_at  timestamptz not null default now()
);

create index if not exists cards_room_idx   on cards (room_id);
create index if not exists cards_player_idx on cards (player_id);

-- ----------------------------------------------------------------------------
-- TABELA: winners  (quem bateu bingo, em que padrão)
-- ----------------------------------------------------------------------------
create table if not exists winners (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  card_id     uuid references cards(id) on delete set null,
  player_name text not null,
  pattern     text not null,
  numbers_drawn int not null,                 -- quantas bolas tinham saído quando bateu
  place       int not null default 1,         -- 1º, 2º, 3º lugar...
  created_at  timestamptz not null default now()
);

create index if not exists winners_room_idx on winners (room_id);

-- Cada PADRÃO só pode ter 1 vencedor por sala. Removemos duplicatas antigas
-- (de testes) e criamos a restrição de unicidade, se ainda não existir.
delete from winners w
  using winners w2
  where w.room_id = w2.room_id and w.pattern = w2.pattern and w.ctid > w2.ctid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'winners_room_pattern_unique'
  ) then
    alter table winners add constraint winners_room_pattern_unique unique (room_id, pattern);
  end if;
end $$;

-- ============================================================================
--  FUNÇÕES (RPC) — chamadas pelo app via supabase.rpc(...)
-- ============================================================================

-- Sorteia o próximo número de uma sala, de forma atômica (sem repetir).
-- Retorna o número sorteado, ou NULL se já saíram todos.
create or replace function draw_number(p_room_id uuid)
returns int
language plpgsql
security definer
as $$
declare
  v_max   int;
  v_drawn int[];
  v_pool  int[];
  v_pick  int;
begin
  select max_number, drawn_numbers into v_max, v_drawn
  from rooms where id = p_room_id
  for update;                       -- trava a linha: evita sorteios simultâneos repetidos

  if v_max is null then
    return null;                    -- sala não existe
  end if;

  -- monta o conjunto de números que ainda NÃO saíram
  select array_agg(n) into v_pool
  from generate_series(1, v_max) as n
  where not (n = any (v_drawn));

  if v_pool is null or array_length(v_pool, 1) is null then
    return null;                    -- todos os números já saíram
  end if;

  -- escolhe um aleatório do pool
  v_pick := v_pool[1 + floor(random() * array_length(v_pool, 1))::int];

  update rooms
    set drawn_numbers = array_append(drawn_numbers, v_pick),
        current_number = v_pick,
        updated_at = now()
  where id = p_room_id;

  return v_pick;
end;
$$;

-- Registra um vencedor de forma segura. CADA PADRÃO só pode ser vencido UMA
-- vez por sala (por qualquer jogador). Devolve a colocação (1º, 2º...), ou
-- -1 se aquele padrão já foi vencido por alguém na sala.
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
  -- se esse padrão já saiu nesta sala, ninguém mais pode batê-lo
  if exists (select 1 from winners where room_id = p_room_id and pattern = p_pattern) then
    return -1;
  end if;

  select coalesce(array_length(drawn_numbers, 1), 0) into v_drawn
  from rooms where id = p_room_id;

  select winners_count + 1 into v_place from rooms where id = p_room_id for update;

  -- a restrição UNIQUE(room_id, pattern) protege contra cliques simultâneos
  begin
    insert into winners (room_id, player_id, card_id, player_name, pattern, numbers_drawn, place)
    values (p_room_id, p_player_id, p_card_id, p_player_name, p_pattern, v_drawn, v_place);
  exception when unique_violation then
    return -1; -- corrida: outro jogador registrou esse padrão um instante antes
  end;

  update rooms set winners_count = v_place, updated_at = now() where id = p_room_id;
  update players set bingos = bingos + 1 where id = p_player_id;

  return v_place;
end;
$$;

-- ============================================================================
--  REALTIME — publica as tabelas para o app receber eventos ao vivo
-- ============================================================================
-- Se a publicação já existir, ignoramos o erro de tabela duplicada.
do $$
begin
  begin execute 'alter publication supabase_realtime add table rooms';   exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table players'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table cards';   exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table winners'; exception when others then null; end;
end $$;

-- Garante que o REPLICA IDENTITY mande a linha completa nos updates/deletes
alter table rooms    replica identity full;
alter table players  replica identity full;
alter table cards    replica identity full;
alter table winners  replica identity full;

-- ============================================================================
--  SEGURANÇA (RLS) — como NÃO há login, liberamos acesso anônimo total.
--  Para um app público de verdade, troque por políticas mais restritas.
-- ============================================================================
alter table rooms    enable row level security;
alter table players  enable row level security;
alter table cards    enable row level security;
alter table winners  enable row level security;

-- Apaga políticas antigas (caso rode o script de novo)
drop policy if exists "rooms_all"   on rooms;
drop policy if exists "players_all" on players;
drop policy if exists "cards_all"   on cards;
drop policy if exists "winners_all" on winners;

create policy "rooms_all"   on rooms   for all using (true) with check (true);
create policy "players_all" on players for all using (true) with check (true);
create policy "cards_all"   on cards   for all using (true) with check (true);
create policy "winners_all" on winners for all using (true) with check (true);

-- ============================================================================
--  (Opcional) LIMPEZA AUTOMÁTICA de salas antigas — rode manualmente quando quiser
-- ============================================================================
-- delete from rooms where created_at < now() - interval '24 hours';

-- Pronto! Agora copie a URL e a anon key do projeto (Settings > API)
-- e cole no arquivo js/config.js do site.
