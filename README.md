# 🎉 Bingo dos Coadjuvantes

O melhor bingo online: rápido, intuitivo, colorido, com **animações**, **música** e
**efeitos sonoros** gerados em tempo real, **confete** na vitória e partidas
**multiplayer ao vivo** via Supabase. Salas com **jogadores ilimitados** e
**cartelas ilimitadas por jogador** (1 a 50). Entre por **código** ou **link de convite**.

![bingo](https://img.shields.io/badge/Bingo-75%20bolas-ff3b6b) ![supabase](https://img.shields.io/badge/Realtime-Supabase-3ecf8e)

---

## ✨ Recursos

- **Criar salas** com nome, avatar, nº de cartelas por jogador, padrão de vitória e sorteio manual/automático.
- **Entrar por código** (`BINGO-XXXX`) ou **link** (`...?room=BINGO-XXXX`).
- **Sorteio ao vivo** — o anfitrião sorteia (botão ou automático a cada N segundos) e todos veem a bola na hora.
- **Marcação automática + manual** das cartelas, com animações de carimbo.
- **Botão BINGO** que pulsa quando você tem vitória, com validação no servidor.
- **8 formas de ganhar**: Linha, Coluna, Diagonal, Quinas (cantos), Cruz, Xis, Moldura e Cartela Cheia — todas **ilustradas**.
- **Placar de vencedores** (1º, 2º, 3º…), confete e fanfarra.
- **Música ambiente** e **efeitos** sintetizados (sem nenhum arquivo de áudio).
- 100% responsivo (celular, tablet, desktop).

---

## 🚀 Como rodar (passo a passo)

### 1. Crie o banco no Supabase
1. Crie um projeto grátis em **https://supabase.com**.
2. No menu lateral, abra **SQL Editor** → **New query**.
3. Copie todo o conteúdo de [`sql/schema.sql`](sql/schema.sql), cole e clique em **Run**.
   - Isso cria as tabelas `rooms`, `players`, `cards`, `winners`, as funções de
     sorteio/registro de vencedor, ativa o **Realtime** e as políticas de acesso.

### 2. Pegue suas chaves
1. **Project Settings → API**.
2. Copie a **Project URL** e a chave **anon public**.

### 3. Configure o site
Abra [`js/config.js`](js/config.js) e cole:
```js
window.BINGO_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "sua_anon_public_key",
  MAX_NUMBER: 75,
  DEFAULT_DRAW_INTERVAL: 5,
};
```

### 4. Abra o site
Use um servidor estático (recomendado, evita travas de alguns navegadores):
```bash
# opção 1 — Node
npx serve .

# opção 2 — Python
python -m http.server 8000
```
Depois abra `http://localhost:8000`.

> Também funciona abrindo o `index.html` direto no navegador, mas alguns recursos
> (como copiar link) funcionam melhor via `http://`.

### 5. (Opcional) Publicar
É um site 100% estático — suba a pasta inteira em **Vercel**, **Netlify**,
**GitHub Pages** ou **Cloudflare Pages**. Não há build: é só servir os arquivos.

---

## 🎮 Como jogar

1. **Anfitrião:** clique em **Criar Sala**, escolha nome, avatar, quantas
   cartelas cada jogador terá e o padrão de vitória. Compartilhe o **código** ou **link**.
2. **Jogadores:** clicam em **Entrar com Código** (ou abrem o link), escolhem nome/avatar.
3. O anfitrião clica em **Começar o Bingo!** → contagem regressiva → começa.
4. O anfitrião **sorteia** os números (ou liga o **automático**). As cartelas se
   marcam sozinhas; você também pode tocar nas células.
5. Quando o padrão estiver completo, o botão **BINGO!** começa a brilhar — clique!
6. O vencedor entra no **placar**, com confete e fanfarra. O anfitrião pode trocar
   o padrão ou iniciar uma **Nova rodada** (gera cartelas novas para todos).

---

## 🗂️ Estrutura

```
Bingo/
├─ index.html          # todas as telas (início, criar, entrar, lobby, jogo)
├─ css/styles.css      # visual, animações e responsividade
├─ js/
│  ├─ config.js        # SUAS chaves do Supabase  ← editar
│  ├─ bingo.js         # cartelas 75 bolas, padrões e validação
│  ├─ audio.js         # música + efeitos (Web Audio API)
│  ├─ confetti.js      # confete em canvas
│  └─ app.js           # fluxo do jogo + Supabase realtime
└─ sql/schema.sql      # rode no SQL Editor do Supabase
```

---

## 🔒 Sobre segurança

- A chave **anon public** é segura no front-end (foi feita para isso).
  **Nunca** use a chave `service_role` aqui.
- Como o jogo é anônimo (sem login), o `schema.sql` libera acesso público via RLS.
  Para um app comercial, adicione autenticação e políticas RLS mais restritas.
- O sorteio e o registro de vencedores acontecem em **funções do banco**
  (`draw_number`, `register_winner`), evitando números repetidos e corrida de cliques.

---

Feito com 💜 para ser o bingo mais divertido da internet.
