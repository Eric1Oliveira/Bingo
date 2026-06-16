// ============================================================================
//  CONFETE  —  explosão de partículas coloridas em canvas. window.Confetti
// ============================================================================
(function () {
  "use strict";

  let canvas, cctx, particles = [], running = false;
  const COLORS = ["#ff3b6b", "#ffd23f", "#3bd6ff", "#7cff5e", "#b06bff", "#ff8a3b", "#ff5ee0"];

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.id = "confetti-canvas";
    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "9999",
    });
    document.body.appendChild(canvas);
    cctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
  }

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function spawn(x, y, amount) {
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 9;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 6,
        size: 6 + Math.random() * 8,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        life: 1,
        shape: Math.random() > 0.5 ? "rect" : "circle",
      });
    }
  }

  function loop() {
    if (!running) return;
    cctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 0.25;           // gravidade
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 0.008;
      if (p.life <= 0 || p.y > canvas.height + 40) {
        particles.splice(i, 1);
        continue;
      }
      cctx.save();
      cctx.globalAlpha = Math.max(0, p.life);
      cctx.translate(p.x, p.y);
      cctx.rotate(p.rot);
      cctx.fillStyle = p.color;
      if (p.shape === "rect") {
        cctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else {
        cctx.beginPath();
        cctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        cctx.fill();
      }
      cctx.restore();
    }
    if (particles.length > 0) {
      requestAnimationFrame(loop);
    } else {
      running = false;
      cctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function burst(opts) {
    ensureCanvas();
    opts = opts || {};
    const cx = opts.x != null ? opts.x : canvas.width / 2;
    const cy = opts.y != null ? opts.y : canvas.height / 3;
    spawn(cx, cy, opts.amount || 120);
    if (!running) {
      running = true;
      loop();
    }
  }

  // Chuva de confete vinda do topo (celebração prolongada)
  function rain(durationMs) {
    ensureCanvas();
    const end = Date.now() + (durationMs || 2500);
    (function add() {
      for (let i = 0; i < 6; i++) {
        spawn(Math.random() * canvas.width, -10, 1);
      }
      if (!running) {
        running = true;
        loop();
      }
      if (Date.now() < end) setTimeout(add, 80);
    })();
  }

  window.Confetti = { burst, rain };
})();
