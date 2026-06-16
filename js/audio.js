// ============================================================================
//  ÁUDIO  —  música ambiente + efeitos sonoros gerados em tempo real
//  Sem nenhum arquivo de áudio: tudo é sintetizado com a Web Audio API.
//  Exposto em window.Sound
// ============================================================================
(function () {
  "use strict";

  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let musicOn = false;
  let sfxOn = true;
  let musicTimer = null;

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(ctx.destination);

      musicGain = ctx.createGain();
      musicGain.gain.value = 0.0;
      musicGain.connect(masterGain);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // ---- bloco básico: toca uma nota ----
  function tone(freq, start, dur, type, gainVal, target) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gainVal, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(target || masterGain);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  // Frequência de uma nota (semitons a partir do Lá 440)
  function note(semitonesFromA4) {
    return 440 * Math.pow(2, semitonesFromA4 / 12);
  }

  // ============================================================================
  //  EFEITOS SONOROS
  // ============================================================================
  const SFX = {
    click() {
      if (!sfxOn) return;
      ensureCtx();
      const t = ctx.currentTime;
      tone(660, t, 0.08, "triangle", 0.18);
    },
    daub() {
      if (!sfxOn) return;
      ensureCtx();
      const t = ctx.currentTime;
      tone(880, t, 0.1, "sine", 0.22);
      tone(1320, t + 0.02, 0.08, "sine", 0.12);
    },
    draw() {
      // som de "bolinha sorteada" — sobe rápido
      if (!sfxOn) return;
      ensureCtx();
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(400, t);
      o.frequency.exponentialRampToValueAtTime(900, t + 0.18);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.25, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g);
      g.connect(masterGain);
      o.start(t);
      o.stop(t + 0.4);
    },
    tick() {
      if (!sfxOn) return;
      ensureCtx();
      const t = ctx.currentTime;
      tone(1200, t, 0.04, "square", 0.06);
    },
    win() {
      // fanfarra de vitória
      if (!sfxOn) return;
      ensureCtx();
      const t = ctx.currentTime;
      const seq = [0, 4, 7, 12, 16, 19]; // arpejo maior
      seq.forEach((s, i) => {
        tone(note(s), t + i * 0.09, 0.4, "triangle", 0.25);
        tone(note(s) * 2, t + i * 0.09, 0.3, "sine", 0.1);
      });
      // brilho final
      tone(note(24), t + seq.length * 0.09, 0.8, "triangle", 0.2);
    },
    lose() {
      if (!sfxOn) return;
      ensureCtx();
      const t = ctx.currentTime;
      tone(300, t, 0.2, "sawtooth", 0.12);
      tone(220, t + 0.12, 0.3, "sawtooth", 0.12);
    },
    join() {
      if (!sfxOn) return;
      ensureCtx();
      const t = ctx.currentTime;
      tone(523, t, 0.12, "sine", 0.18);
      tone(784, t + 0.1, 0.16, "sine", 0.18);
    },
    countdown() {
      if (!sfxOn) return;
      ensureCtx();
      const t = ctx.currentTime;
      tone(440, t, 0.15, "triangle", 0.2);
    },
    go() {
      if (!sfxOn) return;
      ensureCtx();
      const t = ctx.currentTime;
      tone(880, t, 0.4, "triangle", 0.28);
    },
  };

  // ============================================================================
  //  MÚSICA AMBIENTE  —  loop alegre e relaxante gerado em tempo real
  // ============================================================================
  // Progressão de acordes feliz (I–V–vi–IV em Dó maior), com baixo e melodia.
  const CHORDS = [
    [0, 4, 7],   // C
    [7, 11, 14], // G
    [9, 12, 16], // Am
    [5, 9, 12],  // F
  ];
  let chordIndex = 0;

  function playMusicBar() {
    if (!musicOn) return;
    ensureCtx();
    const t = ctx.currentTime;
    const chord = CHORDS[chordIndex % CHORDS.length];
    chordIndex++;

    const beat = 0.5; // segundos por batida
    // pad (acorde sustentado)
    chord.forEach((s) => {
      tone(note(s - 12), t, beat * 4, "sine", 0.05, musicGain);
    });
    // baixo
    tone(note(chord[0] - 24), t, beat * 0.9, "triangle", 0.12, musicGain);
    tone(note(chord[0] - 24), t + beat * 2, beat * 0.9, "triangle", 0.1, musicGain);
    // melodia saltitante
    const mel = [chord[2], chord[1], chord[2] + 12, chord[0] + 12];
    mel.forEach((s, i) => {
      tone(note(s), t + i * beat, beat * 0.6, "triangle", 0.06, musicGain);
    });

    musicTimer = setTimeout(playMusicBar, beat * 4 * 1000);
  }

  function startMusic() {
    ensureCtx();
    musicOn = true;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 1.5);
    if (!musicTimer) playMusicBar();
  }

  function stopMusic() {
    musicOn = false;
    if (ctx && musicGain) {
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 0.8);
    }
    clearTimeout(musicTimer);
    musicTimer = null;
  }

  // ============================================================================
  //  LOCUÇÃO  —  fala o número em português ("dezessete, um sete")
  // ============================================================================
  const UNITS = ["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove"];
  const TEENS = ["dez","onze","doze","treze","catorze","quinze","dezesseis","dezessete","dezoito","dezenove"];
  const TENS  = ["","","vinte","trinta","quarenta","cinquenta","sessenta","setenta","oitenta","noventa"];

  function numberToWordsPt(n) {
    if (n < 10) return UNITS[n];
    if (n < 20) return TEENS[n - 10];
    const d = Math.floor(n / 10), u = n % 10;
    if (u === 0) return TENS[d];
    return TENS[d] + " e " + UNITS[u];
  }
  function digitsToWordsPt(n) {
    return String(n).split("").map((d) => UNITS[+d]).join(", ");
  }

  let voiceOn = true;
  let ptVoice = null;
  let ptAvailable = false;
  const hasTTS = "speechSynthesis" in window;

  // Escolhe a MELHOR voz em português disponível, com prioridade para as
  // vozes naturais (Google / Microsoft Natural / Luciana, etc.).
  function pickVoice() {
    if (!hasTTS) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    const pt = voices.filter((v) => /^pt([-_]|$)/i.test(v.lang)); // qualquer português
    const ptBR = pt.filter((v) => /pt[-_]?BR/i.test(v.lang));     // português do Brasil
    const pool = ptBR.length ? ptBR : pt;
    ptAvailable = pool.length > 0;

    const score = (v) => {
      const n = (v.name || "").toLowerCase();
      let s = 0;
      if (/pt[-_]?br/i.test(v.lang)) s += 100;                 // pt-BR vence pt-PT
      if (/google/.test(n)) s += 60;                            // Google é natural
      if (/natural|online|neural/.test(n)) s += 55;             // Microsoft Natural/Neural
      if (/(maria|francisca|luciana|thalita|brenda|antonio|daniel)/.test(n)) s += 25;
      if (v.localService) s += 5;                               // offline = sem depender de rede
      return s;
    };
    pool.sort((a, b) => score(b) - score(a));
    ptVoice = pool[0] || null;
    return ptVoice;
  }

  if (hasTTS) {
    pickVoice();
    // as vozes costumam carregar de forma assíncrona
    window.speechSynthesis.addEventListener("voiceschanged", pickVoice);
    // alguns navegadores só populam getVoices após a 1ª fala; tentamos de novo
    setTimeout(pickVoice, 300);
    setTimeout(pickVoice, 1200);
  }

  // ---- voz reserva: SpeechSynthesis do navegador (se houver voz pt) ----
  function speakWithBrowser(text) {
    if (!hasTTS) return;
    if (!ptVoice) pickVoice();
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "pt-BR";
      u.rate = 0.9;
      u.pitch = 1.05;
      u.volume = 1.0;
      if (ptVoice) u.voice = ptVoice;
      setTimeout(() => { try { window.speechSynthesis.speak(u); } catch (e) {} }, 50);
    } catch (e) {}
  }

  // ---- voz principal: TTS online do Google em pt-BR (sempre perfeito) ----
  // Reutiliza um único elemento <audio>. Graças ao <meta name="referrer"
  // content="no-referrer"> a requisição vai SEM Referer e o Google responde
  // com o MP3 em português (com Referer ele bloquearia com 404).
  const ttsAudio = typeof Audio !== "undefined" ? new Audio() : null;
  if (ttsAudio) { ttsAudio.preload = "auto"; ttsAudio.volume = 1.0; }

  function googleUrl(text) {
    return "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=pt-BR&q=" +
           encodeURIComponent(text);
  }

  function speakWithGoogle(text) {
    return new Promise((resolve, reject) => {
      if (!ttsAudio) return reject(new Error("no audio"));
      try {
        try { ttsAudio.pause(); } catch (e) {}
        const onErr = () => { cleanup(); reject(new Error("google tts error")); };
        const onEnd = () => { cleanup(); resolve(true); };
        function cleanup() {
          ttsAudio.removeEventListener("error", onErr);
          ttsAudio.removeEventListener("ended", onEnd);
        }
        ttsAudio.addEventListener("error", onErr, { once: true });
        ttsAudio.addEventListener("ended", onEnd, { once: true });
        ttsAudio.src = googleUrl(text);
        ttsAudio.currentTime = 0;
        const p = ttsAudio.play();
        // resolve já no início da reprodução (sucesso); rejeição = bloqueio/erro
        if (p && p.then) p.then(() => resolve(true)).catch(onErr);
      } catch (e) { reject(e); }
    });
  }

  function speakNumber(n) {
    if (!voiceOn) return;
    // Texto em PT-BR: número por extenso + dígitos. Ex.: "dezessete. um, sete."
    let text = numberToWordsPt(n);
    if (n >= 10) text += ". " + digitsToWordsPt(n);

    // SEMPRE tenta a voz do Google (pt-BR perfeita). Só usa a voz do navegador
    // como reserva SE existir uma voz em português — nunca uma voz inglesa.
    speakWithGoogle(text).catch(() => {
      if (ptAvailable) speakWithBrowser(text);
      // sem voz pt no sistema: melhor o silêncio do que sotaque americano
    });
  }

  window.Speech = {
    speakNumber,
    pickVoice,
    hasPtVoice() { return ptAvailable; },
    voiceName() { return ptVoice ? ptVoice.name + " (" + ptVoice.lang + ")" : null; },
    toggle() {
      voiceOn = !voiceOn;
      if (!voiceOn) {
        if (hasTTS) window.speechSynthesis.cancel();
        if (ttsAudio) { try { ttsAudio.pause(); } catch (e) {} }
      }
      return voiceOn;
    },
    isOn() { return voiceOn; },
  };

  window.Sound = {
    init: ensureCtx,
    sfx: SFX,
    startMusic,
    stopMusic,
    toggleMusic() {
      if (musicOn) {
        stopMusic();
        return false;
      }
      startMusic();
      return true;
    },
    toggleSfx() {
      sfxOn = !sfxOn;
      return sfxOn;
    },
    isMusicOn() {
      return musicOn;
    },
    isSfxOn() {
      return sfxOn;
    },
  };
})();
