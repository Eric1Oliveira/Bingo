-- ============================================================================
--  MIGRAÇÃO: opção de mostrar/esconder os números já sorteados
--  Cole no SQL Editor do Supabase e clique em "Run".
--  (Já está incluído no schema.sql; este arquivo aplica só esta mudança.)
-- ============================================================================

alter table rooms add column if not exists show_drawn boolean not null default true;
