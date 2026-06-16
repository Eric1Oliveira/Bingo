// ============================================================================
//  CONFIGURAÇÃO DO SUPABASE
//  ------------------------------------------------------------------
//  1. Crie um projeto em https://supabase.com
//  2. Vá em  Project Settings → API
//  3. Copie a "Project URL" e a chave "anon public"
//  4. Cole abaixo no lugar dos valores de exemplo.
//  5. No SQL Editor do Supabase, rode o arquivo  sql/schema.sql
//
//  Dica: a chave "anon public" PODE ficar no front-end — ela é pública
//  por natureza. Nunca use a "service_role" aqui.
// ============================================================================

window.BINGO_CONFIG = {
  SUPABASE_URL: "https://plmfiwptuxfewydvuyog.supabase.co",          // ex: https://abcd1234.supabase.co (sem /rest/v1/)
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsbWZpd3B0dXhmZXd5ZHZ1eW9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NTQzODksImV4cCI6MjA5NzEzMDM4OX0.XMHFo0c4lMARAhChj2viEp4HVpER3ru9soVNMwfjDhQ", // ex: eyJhbGciOi....

  // ---- Ajustes opcionais do jogo ----
  MAX_NUMBER: 75,            // 75 = bingo clássico B-I-N-G-O (5x5)
  DEFAULT_DRAW_INTERVAL: 5,  // segundos entre sorteios no modo automático
};
