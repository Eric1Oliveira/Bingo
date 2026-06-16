// ============================================================================
//  APP  —  fluxo do jogo + integração Supabase em tempo real
// ============================================================================
(function () {
  "use strict";

  const cfg = window.BINGO_CONFIG || {};
  const AVATARS = ["🎉","🎈","🦄","🐯","🐸","🐙","🦊","🐼","🐵","🐨","🦁","🐧","🐳","🦖","👽","🤖","🎃","👑","⭐","🍀","🌈","🔥","💎","🍕"];

  // --------------------------------------------------------------------------
  //  ESTADO GLOBAL
  // --------------------------------------------------------------------------
  let supa = null;
  const state = {
    clientId: getClientId(),
    name: localStorage.getItem("bingo_name") || "",
    avatar: localStorage.getItem("bingo_avatar") || "🎉",
    room: null,          // linha da tabela rooms
    me: null,            // linha da tabela players (eu)
    players: [],         // todos os jogadores
    cards: [],           // minhas cartelas [{id, card_index, numbers}]
    daubed: [],          // Set de "r,c" marcados manualmente, por cartela
    winners: [],
    channel: null,       // canal realtime
    poller: null,        // intervalo de polling (rede de segurança do tempo real)
    autoDrawTimer: null,
    autoDrawInterval: 5,   // intervalo (s) com que o timer automático está rodando
    lastDrawAt: 0,         // timestamp do último número (para o reloginho)
    timerRAF: null,        // loop de animação do reloginho
  };

  // Padrões já vencidos NA SALA (por qualquer jogador). Cada padrão só sai 1x.
  function roomWonPatterns() {
    const m = {};
    state.winners.forEach((w) => { if (!m[w.pattern]) m[w.pattern] = w; });
    return m;
  }

  // --------------------------------------------------------------------------
  //  UTILIDADES
  // --------------------------------------------------------------------------
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

  function getClientId() {
    let id = localStorage.getItem("bingo_client_id");
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) ||
           ("c-" + Date.now() + "-" + Math.random().toString(36).slice(2));
      localStorage.setItem("bingo_client_id", id);
    }
    return id;
  }

  function genRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 4; i++) s += chars[(Math.random() * chars.length) | 0];
    return "BINGO-" + s;
  }

  function isConfigured() {
    return cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
      !cfg.SUPABASE_URL.includes("COLE_AQUI") &&
      !cfg.SUPABASE_ANON_KEY.includes("COLE_AQUI");
  }

  function showScreen(id) {
    $all(".screen").forEach((s) => (s.hidden = s.id !== "screen-" + id));
    $all(".screen").forEach((s) => s.classList.toggle("active", s.id === "screen-" + id));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Notificação ÚNICA: sempre uma só, no topo. Uma nova substitui a anterior
  // no mesmo lugar (não enfileira) e some rápido.
  let toastTimer = null;
  function toast(msg, emoji) {
    const wrap = $("#toast-wrap");
    wrap.innerHTML = "";          // remove a notificação anterior (substitui no lugar)
    clearTimeout(toastTimer);
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = (emoji ? emoji + " " : "") + msg;
    wrap.appendChild(el);
    toastTimer = setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => { if (el.parentNode) el.remove(); }, 280);
    }, 2200);
  }

  // --------------------------------------------------------------------------
  //  MINI-GRID (preview de padrão)
  // --------------------------------------------------------------------------
  function buildMiniGrid(patternId, large) {
    const grid = document.createElement("div");
    grid.className = "mini-grid" + (large ? " lg" : "");
    const on = new Set();
    const groups = Bingo.PATTERN_CELLS[patternId] || [];
    // mostra a PRIMEIRA possibilidade do padrão como exemplo
    (groups[0] || []).forEach(([r, c]) => on.add(r + "," + c));
    if (patternId === "line") { [0,1,2,3,4].forEach(c => on.add("2," + c)); }
    if (patternId === "column") { [0,1,2,3,4].forEach(r => on.add(r + ",2")); }
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const cell = document.createElement("div");
        cell.className = "mini-cell" + (on.has(r + "," + c) ? " on" : "");
        grid.appendChild(cell);
      }
    }
    return grid;
  }

  // --------------------------------------------------------------------------
  //  INICIALIZAÇÃO
  // --------------------------------------------------------------------------
  function init() {
    if (!isConfigured()) {
      showScreen("setup");
      return;
    }
    supa = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 20 } },
    });

    buildShowcase();
    state.avatar = state.avatar || "🎉";
    $("#create-avatar").textContent = state.avatar;
    $("#join-avatar").textContent = state.avatar;
    if (state.name) {
      $("#create-host-name").value = state.name;
      $("#join-name").value = state.name;
    }
    wireEvents();
    handleDeepLink();
  }

  // entrar direto via ?room=CODIGO no link
  function handleDeepLink() {
    const params = new URLSearchParams(location.search);
    const code = params.get("room");
    if (code) {
      $("#join-code").value = code.toUpperCase();
      showScreen("join");
    }
  }

  // --------------------------------------------------------------------------
  //  SHOWCASE de padrões (home)
  // --------------------------------------------------------------------------
  function buildShowcase() {
    const wrap = $("#pattern-showcase");
    wrap.innerHTML = "";
    Object.values(Bingo.PATTERNS).forEach((p) => {
      const card = document.createElement("div");
      card.className = "pattern-card";
      card.appendChild(buildMiniGrid(p.id, true));
      const h = document.createElement("h4");
      h.textContent = p.name;
      const d = document.createElement("p");
      d.textContent = p.desc;
      card.appendChild(h);
      card.appendChild(d);
      wrap.appendChild(card);
    });
  }

  function buildPatternSelect(sel, selected, onPick) {
    const wrap = $(sel);
    wrap.innerHTML = "";
    Object.values(Bingo.PATTERNS).forEach((p) => {
      const opt = document.createElement("div");
      opt.className = "pattern-opt" + (p.id === selected ? " selected" : "");
      opt.dataset.pattern = p.id;
      opt.appendChild(buildMiniGrid(p.id));
      const name = document.createElement("div");
      name.className = "p-name";
      name.textContent = p.name;
      opt.appendChild(name);
      opt.addEventListener("click", () => {
        wrap.querySelectorAll(".pattern-opt").forEach((o) => o.classList.remove("selected"));
        opt.classList.add("selected");
        Sound.sfx.click();
        onPick(p.id);
      });
      wrap.appendChild(opt);
    });
  }

  // --------------------------------------------------------------------------
  //  EVENTOS DE UI
  // --------------------------------------------------------------------------
  function wireEvents() {
    $("#brand-home").addEventListener("click", goHomeReset);
    $all("[data-go]").forEach((b) => b.addEventListener("click", () => { Sound.sfx.click(); showScreen(b.dataset.go); }));

    $("#btn-go-create").addEventListener("click", () => { Sound.init(); Sound.sfx.click(); showScreen("create"); });
    $("#btn-go-join").addEventListener("click", () => { Sound.init(); Sound.sfx.click(); showScreen("join"); });

    // música / efeitos
    $("#btn-music").addEventListener("click", () => {
      const on = Sound.toggleMusic();
      $("#btn-music").classList.toggle("off", !on);
    });
    $("#btn-sfx").addEventListener("click", () => {
      const on = Sound.toggleSfx();
      $("#btn-sfx").textContent = on ? "🔊" : "🔇";
      $("#btn-sfx").classList.toggle("off", !on);
    });
    $("#btn-voice").addEventListener("click", () => {
      const on = Speech.toggle();
      $("#btn-voice").classList.toggle("off", !on);
      toast(on ? "Locução em português ativada 🇧🇷" : "Locução desligada", "🗣️");
      if (on) Speech.speakNumber(Math.floor(Math.random() * 75) + 1); // teste rápido em pt-BR
    });

    // sliders create
    $("#create-cards").addEventListener("input", (e) => ($("#cards-val").textContent = e.target.value));
    $("#create-interval").addEventListener("input", (e) => ($("#interval-val").textContent = e.target.value));
    $("#create-autodraw").addEventListener("change", (e) => ($("#interval-wrap").hidden = !e.target.checked));

    // avatares
    $("#create-avatar").addEventListener("click", () => openAvatarPicker("create"));
    $("#join-avatar").addEventListener("click", () => openAvatarPicker("join"));
    $("#btn-close-avatars").addEventListener("click", () => ($("#overlay-avatars").hidden = true));

    // criar / entrar
    $("#btn-create-room").addEventListener("click", createRoom);
    $("#btn-join-room").addEventListener("click", () => joinRoom($("#join-code").value.trim().toUpperCase()));

    // lobby
    $("#btn-copy-code").addEventListener("click", copyCode);
    $("#btn-copy-link").addEventListener("click", copyLink);
    $("#btn-start-game").addEventListener("click", startGame);
    $("#btn-leave-lobby").addEventListener("click", leaveRoom);

    // jogo
    $("#btn-draw").addEventListener("click", drawNumber);
    $("#btn-bingo").addEventListener("click", claimBingo);
    $("#btn-leave-game").addEventListener("click", leaveRoom);
    $("#btn-new-round").addEventListener("click", newRound);
    $("#btn-win-close").addEventListener("click", () => ($("#overlay-win").hidden = true));

    $("#game-autodraw").addEventListener("change", toggleAutoDraw);
    // arrastando: só atualiza o rótulo. Ao soltar: grava e aplica o novo tempo.
    $("#game-interval").addEventListener("input", (e) => {
      $("#game-interval-val").textContent = e.target.value;
    });
    $("#game-interval").addEventListener("change", (e) => {
      if (!state.room || !amHost()) return;
      const val = +e.target.value;
      state.room.draw_interval = val;     // aplica já localmente (sem esperar o eco)
      updateRoom({ draw_interval: val }); // propaga para todos
      syncAutoDrawUI();                   // reinicia o timer com o novo intervalo
    });

    window.addEventListener("beforeunload", () => { try { leaveRoomSilent(); } catch (e) {} });
  }

  function openAvatarPicker(which) {
    const grid = $("#avatar-grid");
    grid.innerHTML = "";
    AVATARS.forEach((a) => {
      const b = document.createElement("button");
      b.textContent = a;
      b.addEventListener("click", () => {
        state.avatar = a;
        localStorage.setItem("bingo_avatar", a);
        $("#create-avatar").textContent = a;
        $("#join-avatar").textContent = a;
        $("#overlay-avatars").hidden = true;
        Sound.sfx.click();
      });
      grid.appendChild(b);
    });
    $("#overlay-avatars").hidden = false;
  }

  function goHomeReset() {
    if (state.room) leaveRoom();
    else showScreen("home");
  }

  // --------------------------------------------------------------------------
  //  CRIAR SALA
  // --------------------------------------------------------------------------
  async function createRoom() {
    const name = ($("#create-host-name").value || "Anfitrião").trim();
    const roomName = ($("#create-room-name").value || "Bingo da Galera").trim();
    const cards = +$("#create-cards").value;
    const autoDraw = $("#create-autodraw").checked;
    const interval = +$("#create-interval").value;
    const showDrawn = $("#create-showdrawn").checked;

    state.name = name;
    localStorage.setItem("bingo_name", name);
    Sound.init();
    Sound.sfx.click();
    await leaveRoomSilent(); // limpa qualquer sala anterior (estado/board zerados)

    const btn = $("#btn-create-room");
    btn.disabled = true; btn.textContent = "Criando…";

    try {
      let created, attempts = 0;
      const payload = {
        name: roomName, host_id: state.clientId,
        cards_per_player: cards, max_number: cfg.MAX_NUMBER || 75,
        pattern: "sequence", auto_draw: autoDraw, draw_interval: interval,
        show_drawn: showDrawn, status: "waiting",
      };
      do {
        payload.code = genRoomCode();
        const res = await supa.from("rooms").insert(payload).select().single();
        created = res.data;
        if (res.error) {
          const e = res.error;
          if (e.code === "23505") { attempts++; continue; } // código duplicado → tenta outro
          // coluna show_drawn ainda não existe no banco (migração não rodada) → cria sem ela
          if ("show_drawn" in payload &&
              (e.code === "42703" || e.code === "PGRST204" || /show_drawn/i.test(e.message || ""))) {
            delete payload.show_drawn;
            continue; // tenta de novo sem a coluna (sem contar tentativa)
          }
          throw e;
        }
        attempts++;
      } while (!created && attempts < 5);

      if (!created) throw new Error("Não consegui gerar um código único.");

      state.room = created;
      await enterRoomAsPlayer(true);
      await subscribeRoom();
      enterLobby();
    } catch (err) {
      console.error(err);
      toast("Erro ao criar sala: " + (err.message || err), "⚠️");
    } finally {
      btn.disabled = false; btn.textContent = "🎈 Criar sala e entrar";
    }
  }

  // --------------------------------------------------------------------------
  //  ENTRAR EM SALA
  // --------------------------------------------------------------------------
  async function joinRoom(code) {
    const name = ($("#join-name").value || "Jogador").trim();
    if (!code) { $("#join-error").textContent = "Digite o código da sala."; return; }
    state.name = name;
    localStorage.setItem("bingo_name", name);
    Sound.init();
    Sound.sfx.click();
    $("#join-error").textContent = "";
    await leaveRoomSilent(); // limpa qualquer sala anterior (estado/board zerados)

    const btn = $("#btn-join-room");
    btn.disabled = true; btn.textContent = "Entrando…";

    try {
      const { data: room, error } = await supa.from("rooms").select("*").eq("code", code).maybeSingle();
      if (error) throw error;
      if (!room) { $("#join-error").textContent = "Sala não encontrada 😕"; return; }
      if (room.status === "finished") { $("#join-error").textContent = "Essa sala já terminou."; return; }
      if (room.status !== "waiting" && !room.allow_late_join) {
        $("#join-error").textContent = "O jogo já começou e não permite entrada.";
        return;
      }

      state.room = room;
      const isHost = room.host_id === state.clientId;
      await enterRoomAsPlayer(isHost);
      await subscribeRoom();
      Sound.sfx.join();

      if (room.status === "playing" || room.status === "paused") {
        enterGame();
      } else {
        enterLobby();
      }
    } catch (err) {
      console.error(err);
      $("#join-error").textContent = "Erro: " + (err.message || err);
    } finally {
      btn.disabled = false; btn.textContent = "🎯 Entrar";
    }
  }

  // cria/atualiza meu registro de jogador e gera minhas cartelas
  async function enterRoomAsPlayer(isHost) {
    // upsert do jogador
    const { data: player, error } = await supa.from("players").upsert({
      room_id: state.room.id, client_id: state.clientId,
      name: state.name, avatar: state.avatar, is_host: isHost, last_seen: new Date().toISOString(),
    }, { onConflict: "room_id,client_id" }).select().single();
    if (error) throw error;
    state.me = player;

    // já tenho cartelas nessa sala?
    const { data: existing } = await supa.from("cards").select("*")
      .eq("room_id", state.room.id).eq("player_id", player.id).order("card_index");

    if (existing && existing.length >= state.room.cards_per_player) {
      state.cards = existing.slice(0, state.room.cards_per_player);
    } else {
      // gera as cartelas que faltam
      const need = state.room.cards_per_player - (existing ? existing.length : 0);
      const start = existing ? existing.length : 0;
      const newCards = Bingo.generateCards(need).map((numbers, i) => ({
        room_id: state.room.id, player_id: player.id,
        card_index: start + i, numbers,
      }));
      const { data: inserted, error: cErr } = await supa.from("cards").insert(newCards).select();
      if (cErr) throw cErr;
      state.cards = (existing || []).concat(inserted).sort((a, b) => a.card_index - b.card_index);
    }
    // inicia estrutura de marcação MANUAL (só o centro FREE já vem marcado)
    initDaub();
  }

  // cria os Sets de marcação, cada um já com o centro FREE ("2,2")
  function initDaub() {
    state.daubed = state.cards.map(() => new Set(["2,2"]));
  }

  // --------------------------------------------------------------------------
  //  REALTIME
  // --------------------------------------------------------------------------
  async function subscribeRoom() {
    if (state.channel) { try { await supa.removeChannel(state.channel); } catch (e) {} }
    const roomId = state.room.id;
    state.channel = supa.channel("room-" + roomId)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: "id=eq." + roomId },
        (payload) => onRoomUpdate(payload.new))
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: "room_id=eq." + roomId },
        () => refreshPlayers())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "winners", filter: "room_id=eq." + roomId },
        (payload) => onNewWinner(payload.new))
      .subscribe((status) => {
        // ao (re)conectar, re-sincroniza o estado atual da sala
        if (status === "SUBSCRIBED") syncRoomNow();
      });
    await refreshPlayers();
    await refreshWinners();
    startPolling(); // rede de segurança: garante atualização mesmo se o realtime falhar
  }

  // Busca o estado mais recente da sala e aplica (usado pelo poller e ao reconectar)
  async function syncRoomNow() {
    if (!state.room) return;
    const { data: room } = await supa.from("rooms").select("*").eq("id", state.room.id).maybeSingle();
    if (room) onRoomUpdate(room);
  }

  // Poller leve: a cada 2s confere a sala, jogadores e vencedores.
  function startPolling() {
    stopPolling();
    state.poller = setInterval(async () => {
      if (!state.room) return;
      await syncRoomNow();
      await refreshPlayers();
      await refreshWinners();
    }, 2000);
  }
  function stopPolling() {
    if (state.poller) { clearInterval(state.poller); state.poller = null; }
  }

  function onRoomUpdate(room) {
    const prevDrawnLen = state.room ? state.room.drawn_numbers.length : 0;
    const prevStatus = state.room ? state.room.status : null;
    state.room = room;

    // mudou de status para "playing"? entra no jogo
    if (prevStatus !== "playing" && room.status === "playing") {
      if (!isGameVisible()) runCountdownThen(enterGame);
      else enterGame();
    }
    if (room.status === "waiting" && prevStatus === "playing") {
      // nova rodada → recarrega tudo
      reloadForNewRound();
      return;
    }

    // novo número sorteado
    if (room.drawn_numbers.length > prevDrawnLen) {
      const newNum = room.current_number;
      onNumberDrawn(newNum);
    }

    updateGameChrome();
    syncAutoDrawUI();
  }

  async function refreshPlayers() {
    const { data } = await supa.from("players").select("*").eq("room_id", state.room.id).order("joined_at");
    const prevCount = state.players.length;
    state.players = data || [];
    if (state.players.length > prevCount && prevCount > 0) Sound.sfx.join();
    renderPlayers();
    updateGameChrome();
  }

  async function refreshWinners() {
    const { data } = await supa.from("winners").select("*").eq("room_id", state.room.id).order("place");
    const prevPatterns = state.winners.map((w) => w.pattern).join(",");
    state.winners = data || [];
    renderWinners();
    // se o conjunto de padrões vencidos mudou, atualiza as cartelas e a sequência
    // (um padrão vencido por alguém deixa de valer para TODOS)
    if (state.winners.map((w) => w.pattern).join(",") !== prevPatterns) {
      refreshAvailability();
    }
  }

  function onNewWinner(w) {
    const isNew = !state.winners.find((x) => x.id === w.id);
    if (isNew) state.winners.push(w);
    renderWinners();
    refreshAvailability(); // o padrão vencido sai do jogo para todos
    if (isNew && w.player_id !== (state.me && state.me.id)) {
      toast(`<b>${escapeHtml(w.player_name)}</b> fez ${patternName(w.pattern)}! Esse padrão acabou. 🎉`, "🏆");
      Sound.sfx.tick();
      Confetti.burst({ amount: 60 });
    }
  }

  // re-renderiza o que depende dos padrões disponíveis (só se estiver no jogo)
  function refreshAvailability() {
    if (isGameVisible()) {
      renderCards();
      renderSequence();
      updateBingoButton();
    }
  }

  // --------------------------------------------------------------------------
  //  LOBBY
  // --------------------------------------------------------------------------
  function enterLobby() {
    showScreen("lobby");
    $("#lobby-room-name").textContent = state.room.name;
    $("#lobby-code").textContent = state.room.code;
    $("#lobby-cards").textContent = state.room.cards_per_player;
    $("#lobby-pattern").textContent = "Todos (sequência)";
    $("#lobby-autodraw-pill").textContent = state.room.auto_draw
      ? `⏱️ Auto ${state.room.draw_interval}s` : "⏱️ Manual";
    $("#lobby-hidemode-pill").hidden = state.room.show_drawn !== false ? true : false;
    renderPlayers();
    updateLobbyHostUI();
  }

  function updateLobbyHostUI() {
    const host = amHost();
    $("#btn-start-game").hidden = !host;
    $("#lobby-wait").hidden = host;
  }

  function renderPlayers() {
    // lobby
    const wrap = $("#lobby-players");
    if (wrap) {
      $("#lobby-count").textContent = state.players.length;
      wrap.innerHTML = "";
      state.players.forEach((p) => {
        const row = document.createElement("div");
        row.className = "player-row";
        row.innerHTML = `
          <span class="p-avatar">${p.avatar || "🎉"}</span>
          <span class="p-name">${escapeHtml(p.name)}${p.client_id === state.clientId ? " (você)" : ""}</span>
          ${p.is_host ? '<span class="p-badge">ANFITRIÃO</span>' : ""}
          ${p.bingos ? `<span class="p-bingos">🏆 ${p.bingos}</span>` : ""}`;
        wrap.appendChild(row);
      });
    }
  }

  async function copyCode() {
    await navigator.clipboard.writeText(state.room.code);
    toast("Código copiado!", "📋");
    Sound.sfx.click();
  }
  async function copyLink() {
    const url = location.origin + location.pathname + "?room=" + state.room.code;
    await navigator.clipboard.writeText(url);
    toast("Link de convite copiado!", "🔗");
    Sound.sfx.click();
  }

  // --------------------------------------------------------------------------
  //  COMEÇAR / NOVA RODADA
  // --------------------------------------------------------------------------
  async function startGame() {
    if (!amHost()) return;
    Sound.sfx.go();
    await updateRoom({ status: "playing" });
    runCountdownThen(enterGame);
  }

  async function newRound() {
    if (!amHost()) return;
    Sound.sfx.click();
    // limpa vencedores e números, gera cartelas novas para todos via status waiting
    await supa.from("winners").delete().eq("room_id", state.room.id);
    await supa.from("cards").delete().eq("room_id", state.room.id);
    await updateRoom({
      status: "waiting", drawn_numbers: [], current_number: null,
      winners_count: 0,
    });
    toast("Nova rodada! Gerando cartelas…", "🔄");
  }

  async function reloadForNewRound() {
    // regenera minhas cartelas e volta ao lobby
    stopDrawTimer();
    state.cards = [];
    await enterRoomAsPlayer(amHost());
    await refreshWinners();
    enterLobby();
  }

  function runCountdownThen(cb) {
    const ov = $("#overlay-countdown");
    const num = $("#countdown-num");
    let n = 3;
    ov.hidden = false;
    num.textContent = n;
    Sound.sfx.countdown();
    const tick = () => {
      n--;
      if (n > 0) {
        num.textContent = n;
        num.style.animation = "none";
        void num.offsetWidth;
        num.style.animation = "";
        Sound.sfx.countdown();
        setTimeout(tick, 900);
      } else {
        num.textContent = "🎉";
        Sound.sfx.go();
        setTimeout(() => { ov.hidden = true; cb(); }, 700);
      }
    };
    setTimeout(tick, 900);
  }

  // --------------------------------------------------------------------------
  //  JOGO
  // --------------------------------------------------------------------------
  function isGameVisible() { return !$("#screen-game").hidden; }

  function enterGame() {
    showScreen("game");
    buildBoard();
    renderSequence();
    renderCards();
    renderLastDraws();
    renderWinners();
    updateGameChrome();
    applyShowDrawn();

    // controles do host
    const host = amHost();
    $("#host-controls").hidden = !host;
    if (host) {
      $("#game-interval").value = state.room.draw_interval;
      $("#game-interval-val").textContent = state.room.draw_interval;
      $("#game-autodraw").checked = state.room.auto_draw;
    }
    syncAutoDrawUI();

    // bola atual + reloginho (zera o visual em sala nova/sem sorteio)
    if (state.room.current_number) {
      showCurrentBall(state.room.current_number, false);
    } else {
      $("#cb-letter").textContent = "–";
      $("#cb-number").textContent = "--";
    }
    state.lastDrawAt = Date.now();
    refreshDrawTimerVisibility();
  }

  function updateGameChrome() {
    if ($("#game-room-pill")) $("#game-room-pill").textContent = (state.room.name || "Sala");
    if ($("#game-players-pill")) $("#game-players-pill").textContent = "👥 " + state.players.length;
    if ($("#drawn-count")) $("#drawn-count").textContent = state.room.drawn_numbers.length;
    if ($("#drawn-max")) $("#drawn-max").textContent = state.room.max_number;
  }

  // mostra/esconde o painel de números já sorteados (e os últimos sorteados),
  // conforme a opção escolhida na criação da sala. A bola atual continua visível.
  function applyShowDrawn() {
    const show = !state.room || state.room.show_drawn !== false;
    const board = document.querySelector(".drawn-board");
    if (board) board.hidden = !show;
    const last = $("#last-draws");
    if (last) last.style.display = show ? "" : "none";
  }

  // tabuleiro de números sorteados
  function buildBoard() {
    const grid = $("#board-grid");
    grid.innerHTML = "";
    const drawn = new Set(state.room.drawn_numbers);
    for (let n = 1; n <= state.room.max_number; n++) {
      const cell = document.createElement("div");
      cell.className = "board-cell" + (drawn.has(n) ? " drawn" : "");
      cell.id = "board-" + n;
      cell.textContent = n;
      grid.appendChild(cell);
    }
  }

  // Lista a sequência de padrões; cada padrão só pode ser vencido 1x NA SALA.
  // Mostra quem já levou cada um.
  function renderSequence() {
    const wrap = $("#seq-list");
    if (!wrap) return;
    const taken = roomWonPatterns();
    wrap.innerHTML = "";
    Bingo.PATTERN_ORDER.forEach((pid, i) => {
      const p = Bingo.PATTERNS[pid];
      const winner = taken[pid]; // já vencido por alguém na sala?
      const item = document.createElement("div");
      item.className = "seq-item" + (winner ? " done" : "");
      const grid = buildMiniGrid(pid);
      grid.classList.add("seq-mini");
      item.appendChild(grid);
      const info = document.createElement("div");
      info.className = "seq-info";
      info.innerHTML = `<b>${i + 1}. ${p.name}</b>` +
        (winner ? `<small>🏆 ${escapeHtml(winner.player_name)}</small>` : `<small>disponível</small>`);
      item.appendChild(info);
      const status = document.createElement("span");
      status.className = "seq-status";
      status.textContent = winner ? "✔" : "";
      item.appendChild(status);
      wrap.appendChild(item);
    });
  }

  // --------------------------------------------------------------------------
  //  SORTEIO
  // --------------------------------------------------------------------------
  async function drawNumber() {
    if (!amHost()) return;
    const { data, error } = await supa.rpc("draw_number", { p_room_id: state.room.id });
    if (error) { console.error(error); toast("Erro ao sortear", "⚠️"); return; }
    if (data == null) {
      toast("Todos os números já saíram!", "🎱");
      stopAutoDraw();
      if ($("#game-autodraw")) $("#game-autodraw").checked = false;
    }
    // a atualização chega via realtime (onRoomUpdate)
  }

  function onNumberDrawn(num) {
    showCurrentBall(num, true);
    renderLastDraws();
    // sincroniza o tabuleiro inteiro a partir do estado (idempotente; cobre
    // o caso do poller ter pulado vários números de uma vez)
    syncBoardFromState();
    $("#drawn-count").textContent = state.room.drawn_numbers.length;
    Sound.sfx.draw();
    // fala o número em voz alta em pt-BR ("dezessete, um sete")
    setTimeout(() => Speech.speakNumber(num), 220);
    // NÃO marca automático — o jogador marca por conta própria
    renderCards();
    updateBingoButton();
    // reinicia o reloginho
    state.lastDrawAt = Date.now();
    refreshDrawTimerVisibility();
  }

  // garante que todas as bolas já sorteadas estejam destacadas no tabuleiro
  function syncBoardFromState() {
    if (!state.room) return;
    state.room.drawn_numbers.forEach((n) => {
      const c = $("#board-" + n);
      if (c) c.classList.add("drawn");
    });
  }

  function showCurrentBall(num, animate) {
    const ball = $("#current-ball");
    $("#cb-letter").textContent = Bingo.letterForNumber(num);
    $("#cb-number").textContent = num;
    if (animate) {
      ball.classList.remove("pop");
      void ball.offsetWidth;
      ball.classList.add("pop");
    }
  }

  function renderLastDraws() {
    const wrap = $("#last-draws");
    wrap.innerHTML = "";
    const last = state.room.drawn_numbers.slice(-6, -1).reverse(); // exclui o atual (já está na bola grande)
    last.forEach((n) => {
      const b = document.createElement("div");
      b.className = "mini-ball";
      b.textContent = n;
      wrap.appendChild(b);
    });
  }

  // --------------------------------------------------------------------------
  //  PROGRESSO DA CARTELA (marcação MANUAL + padrões em sequência)
  // --------------------------------------------------------------------------
  // Para uma cartela, considerando os padrões que JÁ saíram na sala (vencidos por
  // qualquer jogador), descobre os padrões completos agora (prontos para reivindicar)
  // e o próximo padrão ainda disponível mais perto de completar.
  function cardProgress(ci) {
    const taken = roomWonPatterns();      // padrões já vencidos na sala
    const marked = state.daubed[ci];
    const completable = [];                // padrões disponíveis já formados nesta cartela
    let nextActive = null;                 // padrão disponível mais próximo de completar
    for (const pid of Bingo.PATTERN_ORDER) {
      if (taken[pid]) continue;            // já foi vencido por alguém → fora do jogo
      const cells = Bingo.checkWinMarks(marked, pid);
      if (cells) {
        completable.push({ pid, cells });
      } else {
        const d = Bingo.distanceMarks(marked, pid);
        if (!nextActive || d < nextActive.dist) nextActive = { pid, dist: d };
      }
    }
    const takenCount = Object.keys(taken).length;
    return { takenCount, total: Bingo.PATTERN_ORDER.length, completable, nextActive };
  }

  // --------------------------------------------------------------------------
  //  RENDER DAS CARTELAS
  // --------------------------------------------------------------------------
  function renderCards() {
    const area = $("#cards-area");
    area.innerHTML = "";

    state.cards.forEach((card, ci) => {
      const prog = cardProgress(ci);
      const el = document.createElement("div");
      el.className = "bcard" + (prog.completable.length ? " win" : "");
      el.dataset.cardIndex = ci;

      // cabeçalho com progresso
      let badge;
      if (prog.completable.length) {
        badge = `✅ BINGO: ${Bingo.PATTERNS[prog.completable[0].pid].name}!`;
      } else if (prog.nextActive) {
        const d = prog.nextActive.dist;
        const pn = Bingo.PATTERNS[prog.nextActive.pid].name;
        badge = d === 1 ? `🔥 falta 1 p/ ${pn}` : `${pn}: faltam ${d}`;
      } else {
        badge = "🏁 todos os padrões já saíram";
      }
      const header = document.createElement("div");
      header.className = "bcard-header";
      header.innerHTML = `<span class="bcard-title">Cartela ${ci + 1} · ${prog.takenCount}/${prog.total} padrões</span>
        <span class="bcard-dist">${badge}</span>`;
      el.appendChild(header);

      // letras B I N G O
      const letters = document.createElement("div");
      letters.className = "bingo-letters";
      Bingo.LETTERS.forEach((L) => {
        const d = document.createElement("div");
        d.className = "bingo-letter";
        d.textContent = L;
        letters.appendChild(d);
      });
      el.appendChild(letters);

      // grade
      const grid = document.createElement("div");
      grid.className = "bcard-grid";
      const winSet = new Set(prog.completable.length ? prog.completable[0].cells : []);
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const n = card.numbers[r][c];
          const key = r + "," + c;
          const isFree = n === 0;
          const daubed = state.daubed[ci].has(key);
          // NÃO sinalizamos números chamados: o jogador precisa prestar atenção
          const cell = document.createElement("div");
          cell.className = "bcell" +
            (isFree ? " free" : "") +
            (daubed ? " daubed" : "") +
            (winSet.has(key) ? " wincell" : "");
          cell.textContent = isFree ? "★" : n;
          cell.dataset.key = key;
          if (!isFree) cell.addEventListener("click", () => toggleDaub(ci, r, c, n));
          grid.appendChild(cell);
        }
      }
      el.appendChild(grid);
      area.appendChild(el);
    });

    updateBingoButton();
  }

  // clique manual: só marca número que JÁ foi sorteado; permite desmarcar engano
  function toggleDaub(ci, r, c, n) {
    if (r === 2 && c === 2) return; // centro FREE
    const drawn = new Set(state.room.drawn_numbers);
    const key = r + "," + c;
    const set = state.daubed[ci];
    if (set.has(key)) {
      set.delete(key);
      Sound.sfx.click();
    } else {
      if (!drawn.has(n)) {
        toast("Esse número ainda não foi sorteado!", "✋");
        return;
      }
      set.add(key);
      Sound.sfx.daub();
    }
    renderCards();
    renderSequence();
    // animação na célula recém-mexida (após o re-render)
    const cell = document.querySelector(`.bcard[data-card-index="${ci}"] .bcell[data-key="${key}"]`);
    if (cell && set.has(key)) {
      cell.classList.add("daub-anim");
      setTimeout(() => cell.classList.remove("daub-anim"), 320);
    }
  }

  // --------------------------------------------------------------------------
  //  BOTÃO BINGO
  // --------------------------------------------------------------------------
  function updateBingoButton() {
    let canWin = false, minDist = Infinity;
    state.cards.forEach((_, ci) => {
      const prog = cardProgress(ci);
      if (prog.completable.length) canWin = true;
      if (prog.nextActive && prog.nextActive.dist < minDist) minDist = prog.nextActive.dist;
    });
    const btn = $("#btn-bingo");
    btn.classList.toggle("ready", canWin);
    $("#bingo-hint").textContent = canWin
      ? "Você completou um padrão! Clique em BINGO 🎉"
      : (minDist === 1 ? "Falta só 1 marcação para um padrão… 🔥" : "Marque os números chamados nas suas cartelas!");
  }

  async function claimBingo() {
    // procura o primeiro padrão completo numa cartela que AINDA esteja disponível na sala
    let claimed = null;
    for (let ci = 0; ci < state.cards.length; ci++) {
      const prog = cardProgress(ci);
      if (prog.completable.length) { claimed = { card: state.cards[ci], pid: prog.completable[0].pid }; break; }
    }

    if (!claimed) {
      Sound.sfx.lose();
      toast("Ainda não há um padrão disponível completo marcado 😅", "🤔");
      $("#btn-bingo").animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "translateX(0)" }],
        { duration: 300 });
      return;
    }

    // registra no servidor — que garante que o padrão só sai 1x por sala
    try {
      const { data: place } = await supa.rpc("register_winner", {
        p_room_id: state.room.id, p_player_id: state.me.id,
        p_card_id: claimed.card.id, p_player_name: state.name, p_pattern: claimed.pid,
      });
      // sincroniza a lista de vencedores (e, com ela, os padrões disponíveis)
      await refreshWinners();

      if (place == null || place <= 0) {
        // alguém registrou esse padrão um instante antes
        Sound.sfx.lose();
        toast("Alguém fez " + patternName(claimed.pid) + " um instante antes! ⚡", "😮");
        refreshAvailability();
        return;
      }
      refreshAvailability();
      celebrateWin(place, claimed.pid);
    } catch (err) {
      console.error(err);
      toast("Erro ao registrar Bingo", "⚠️");
    }
  }

  function celebrateWin(place, pid) {
    Sound.sfx.win();
    Confetti.rain(2600);
    Confetti.burst({ amount: 150 });
    const ord = place === 1 ? "1º lugar! 🥇" : place === 2 ? "2º lugar! 🥈" : place === 3 ? "3º lugar! 🥉" : place + "º lugar!";
    $("#win-title").textContent = "BINGO!";
    $("#win-sub").textContent = "Padrão " + patternName(pid) + " completo — " + ord;
    $("#overlay-win").hidden = false;
  }

  function renderWinners() {
    const wrap = $("#winners-list");
    if (!wrap) return;
    if (!state.winners.length) {
      wrap.innerHTML = '<p class="muted">Ninguém bateu ainda…</p>';
      return;
    }
    wrap.innerHTML = "";
    state.winners.slice().sort((a, b) => a.place - b.place).forEach((w) => {
      const medal = w.place === 1 ? "🥇" : w.place === 2 ? "🥈" : w.place === 3 ? "🥉" : "🏅";
      const row = document.createElement("div");
      row.className = "winner-row" + (w.place === 1 ? " gold" : "");
      row.innerHTML = `<span class="w-place">${medal}</span>
        <div style="flex:1">
          <div class="w-name">${escapeHtml(w.player_name)}</div>
          <div class="w-pattern">${patternName(w.pattern)} · ${w.numbers_drawn} bolas</div>
        </div>`;
      wrap.appendChild(row);
    });
  }

  // --------------------------------------------------------------------------
  //  SORTEIO AUTOMÁTICO
  // --------------------------------------------------------------------------
  function toggleAutoDraw(e) {
    if (!amHost()) return;
    const on = e.target.checked;
    updateRoom({ auto_draw: on });
    if (on) startAutoDraw(); else stopAutoDraw();
  }

  function startAutoDraw() {
    stopAutoDraw();
    state.lastDrawAt = Date.now();
    state.autoDrawInterval = state.room.draw_interval || 5; // intervalo em uso pelo timer
    state.autoDrawTimer = setInterval(() => {
      if (state.room.drawn_numbers.length >= state.room.max_number) { stopAutoDraw(); return; }
      drawNumber();
    }, state.autoDrawInterval * 1000);
  }

  function stopAutoDraw() {
    if (state.autoDrawTimer) { clearInterval(state.autoDrawTimer); state.autoDrawTimer = null; }
  }

  // só o host roda o timer; todos refletem o estado visual
  function syncAutoDrawUI() {
    if ($("#game-autodraw")) $("#game-autodraw").checked = state.room.auto_draw;

    const shouldRun = amHost() && state.room.auto_draw && state.room.status === "playing";
    if (shouldRun && !state.autoDrawTimer) {
      startAutoDraw();
    } else if (shouldRun && state.autoDrawTimer && state.autoDrawInterval !== state.room.draw_interval) {
      // o intervalo mudou no meio do jogo → recria o timer com o novo tempo
      startAutoDraw();
    } else if ((!state.room.auto_draw || state.room.status !== "playing") && state.autoDrawTimer) {
      stopAutoDraw();
    }
    refreshDrawTimerVisibility();
  }

  // --------------------------------------------------------------------------
  //  RELOGINHO (contagem visual para o próximo número, no modo automático)
  // --------------------------------------------------------------------------
  function refreshDrawTimerVisibility() {
    const wrap = $("#draw-timer-wrap");
    if (!wrap) return;
    const show = state.room && state.room.auto_draw && state.room.status === "playing";
    wrap.hidden = !show;
    if (show) startDrawTimer(); else stopDrawTimer();
  }

  function startDrawTimer() {
    if (state.timerRAF) return; // já rodando
    const ring = $("#draw-timer");
    const secsEl = $("#dt-secs");
    const tick = () => {
      const interval = (state.room && state.room.draw_interval || 5) * 1000;
      const elapsed = Date.now() - state.lastDrawAt;
      const remaining = Math.max(0, interval - elapsed);
      const pct = Math.min(100, (elapsed / interval) * 100);
      if (ring) ring.style.setProperty("--pct", pct.toFixed(1) + "%");
      if (secsEl) secsEl.textContent = Math.ceil(remaining / 1000);
      state.timerRAF = requestAnimationFrame(tick);
    };
    state.timerRAF = requestAnimationFrame(tick);
  }

  function stopDrawTimer() {
    if (state.timerRAF) { cancelAnimationFrame(state.timerRAF); state.timerRAF = null; }
  }

  // --------------------------------------------------------------------------
  //  SAIR
  // --------------------------------------------------------------------------
  async function leaveRoom() {
    Sound.sfx.click();
    await leaveRoomSilent();
    showScreen("home");
  }

  async function leaveRoomSilent() {
    stopAutoDraw();
    stopDrawTimer();
    stopPolling();
    try {
      if (state.me) await supa.from("players").delete().eq("id", state.me.id);
      if (state.channel) await supa.removeChannel(state.channel);
    } catch (e) {}
    state.room = null; state.me = null; state.cards = [];
    state.players = []; state.winners = []; state.channel = null;
    history.replaceState({}, "", location.pathname);
  }

  // --------------------------------------------------------------------------
  //  HELPERS
  // --------------------------------------------------------------------------
  function amHost() { return state.room && state.room.host_id === state.clientId; }
  function patternName(id) { return (Bingo.PATTERNS[id] || {}).name || id; }
  async function updateRoom(patch) {
    if (!state.room) return;
    const { error } = await supa.from("rooms").update(patch).eq("id", state.room.id);
    if (error) console.error("updateRoom", error);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  // --------------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", init);
})();
