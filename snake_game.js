(() => {
  const playerId = crypto.randomUUID(); // uniek ID voor deze speler
  const canvas = document.getElementById("game");

  const ctx = canvas.getContext("2d");
  const playerName = "Speler";
  let DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    canvas.width = w * DPR;
    canvas.height = h * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // --- Wereld met camerascroll (endless) ---
  const state = {
    points: [],
    statics: [],
    head: { x: 400, y: 300, vx: 0, vy: 0 },
    trail: [],
    maxTrail: 60,
    score: 0,
    debug: false,
    slowmo: false,
    cameraY: 0,
    scrollSpeed: 120,
    bgTime: 0,
    // endless spawns
    lastSpawnY: 0,
    chunkHeight: 320,
    pointsPerChunk: 8,
    staticsPerChunk: 3,
    // minimum density safeguards (altijd genoeg objecten in beeld)
    minPoints: 28,
    minStatics: 8,
  };

  // --- Audio / Beat ---
  const audio = {
    ctx: null,
    running: false,
    bpm: 96,
    nextTime: 0,
    seq: [0, 3, 5, 7, 10, 7, 5, 3],
    idx: 0,
    baseHz: 196,
  };
  let beatPulse = 0; // 0..1 (decay)
  let beatIndex = 0; // telt beats voor deterministische random-schaal per beat

  function startAudio() {
    if (audio.running) return;
    audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    audio.running = true;
    audio.nextTime = audio.ctx.currentTime + 0.05;
  }
  function stopAudio() {
    if (!audio.running) return;
    audio.ctx.close();
    audio.ctx = null;
    audio.running = false;
  }
  function scheduleAudio() {
    if (!audio.running) return;
    const interval = 60 / audio.bpm;
    while (audio.nextTime < audio.ctx.currentTime + 0.12) {
      const n = audio.seq[audio.idx % audio.seq.length];
      const freq = audio.baseHz * Math.pow(2, n / 12);
      const o = audio.ctx.createOscillator();
      const g = audio.ctx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(freq, audio.nextTime);
      g.gain.setValueAtTime(0.001, audio.nextTime);
      g.gain.exponentialRampToValueAtTime(0.2, audio.nextTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, audio.nextTime + 0.18);
      o.connect(g).connect(audio.ctx.destination);
      o.start(audio.nextTime);
      o.stop(audio.nextTime + 0.2);
      // Beat impact voor visuals (op exact audioschema)
      setTimeout(() => {
        beatPulse = 1;
        beatIndex++;
      }, Math.max(0, (audio.nextTime - audio.ctx.currentTime) * 1000));
      audio.nextTime += interval;
      audio.idx++;
    }
  }

  // HUD values
  const uiScore = document.getElementById("score");
  const uiLen = document.getElementById("len");

  // --- WebSocket multiplayer ---
  const ws = new WebSocket("ws://192.168.5.21:8080");

  let otherScores = {}; // scores van andere spelers

  ws.onopen = () => {
    console.log("Verbonden met multiplayer server");
    ws.send(JSON.stringify({ type: "join", id: playerId, score: 0 }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "allScores") {
      otherScores = msg.data;
    }
  };

  ws.onclose = () => {
    // eventueel iets naar server sturen of client cleanup
    delete players[playerId];
    broadcastScores();
  };

  // Update score naar server bij punt
  function sendScore(score) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "updateScore", score }));
    }
  }
  const multiHUD = document.getElementById("multiHUD");

  function drawOtherScores() {
    multiHUD.innerHTML = ""; // clear
    for (const id in otherScores) {
      const player = otherScores[id];
      const div = document.createElement("div");
      div.textContent = `${player.name}:${player.score}`;
      div.style.color = playerId === id ? "#fff" : "#94a3b8"; // jezelf wit
      multiHUD.appendChild(div);
    }
  }

  // Listeners

  let mouse = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
  window.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  window.addEventListener(
    "touchmove",
    (e) => {
      const rect = canvas.getBoundingClientRect();
      // We nemen de eerste aanraking
      const touch = e.touches[0];
      mouse.x = touch.clientX - rect.left;
      mouse.y = touch.clientY - rect.top;
      e.preventDefault(); // voorkomt scrollen op mobiel tijdens touch
    },
    { passive: false }
  );
  window.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R") reset();
    if (e.key === "d" || e.key === "D") state.debug = !state.debug;
    if (e.key === "Shift") state.slowmo = !state.slowmo;
    if (e.key === "s" || e.key === "S") {
      audio.running ? stopAudio() : startAudio();
    }
  });
  window.addEventListener(
    "pointerdown",
    () => {
      if (!audio.running) startAudio();
    },
    { once: true }
  );

  let touchActive = false;

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault(); // voorkom scroll
    touchActive = true;
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!touchActive) return;
    e.preventDefault(); // voorkom scroll
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  canvas.addEventListener("pointerup", (e) => {
    e.preventDefault();
    touchActive = false;
  });

  canvas.addEventListener("pointercancel", (e) => {
    e.preventDefault();
    touchActive = false;
  });

  function reset() {
    state.points = [];
    state.statics = [];
    const W = canvas.clientWidth,
      H = canvas.clientHeight;
    state.cameraY = 0;
    state.bgTime = 0;
    state.lastSpawnY = 0;
    state.head.x = W * 0.5;
    state.head.y = H * 0.5;
    state.head.vx = 0;
    state.head.vy = 0;
    for (let i = 0; i < 16; i++)
      state.points.push(spawnDot(W, state.cameraY - H, state.cameraY + H * 2));
    for (let i = 0; i < 5; i++)
      state.statics.push(
        spawnStatic(W, state.cameraY - H, state.cameraY + H * 2)
      );
    state.trail.length = 0;
    state.maxTrail = 60;
    state.score = 0;
    uiScore.textContent = "0";
    uiLen.textContent = state.maxTrail.toString();
  }

  // Deterministische random op basis van seed & beat
  function randBeat(seed) {
    let x = (seed * 9301 + beatIndex * 49297 + 233280) % 233280;
    return x / 233280;
  }

  function randRange(a, b) {
    return a + Math.random() * (b - a);
  }
  let seedCounter = 1;
  function spawnDot(W, yMin, yMax) {
    const speed = 40 + Math.random() * 80;
    const ang = Math.random() * Math.PI * 2;
    return {
      id: seedCounter++,
      seed: Math.floor(Math.random() * 1e9),
      x: Math.random() * W,
      y: randRange(yMin, yMax),
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed * 0.4,
      r: 6 + Math.random() * 5,
      hue: 200 + Math.random() * 120,
    };
  }
  function spawnStatic(W, yMin, yMax) {
    return {
      id: seedCounter++,
      seed: Math.floor(Math.random() * 1e9),
      x: Math.random() * W,
      y: randRange(yMin, yMax),
      r: 16,
      captured: false,
    };
  }

  function update(dt) {
    const W = canvas.clientWidth,
      H = canvas.clientHeight;
    state.cameraY += state.scrollSpeed * dt;
    state.bgTime += dt;
    scheduleAudio();
    beatPulse = Math.max(0, beatPulse - dt * 3);
    const target = { x: mouse.x, y: mouse.y + state.cameraY };
    const stiffness = 40.0,
      damping = 5.0;
    const dx = target.x - state.head.x,
      dy = target.y - state.head.y;
    //state.head.x = target.x;
    //state.head.y = target.y;
    state.head.vx = 0;
    state.head.vy = 0;
    state.head.y = Math.max(
      state.cameraY,
      Math.min(state.cameraY + H, state.head.y)
    );
    const last = state.trail[state.trail.length - 1];
    const minDist = 1; // minimale afstand voor nieuw trailpunt
    if (
      !last ||
      Math.hypot(state.head.x - last.x, state.head.y - last.y) > minDist
    ) {
      state.trail.push({ x: state.head.x, y: state.head.y });
      while (state.trail.length > state.maxTrail) state.trail.shift();
    }

    const lerp = 0.05; // hoe groter, hoe dichter bij muis
    state.head.x += (target.x - state.head.x) * lerp;
    state.head.y += (target.y - state.head.y) * lerp;
    for (const p of state.points) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < p.r) {
        p.x = p.r;
        p.vx = Math.abs(p.vx);
      }
      if (p.x > W - p.r) {
        p.x = W - p.r;
        p.vx = -Math.abs(p.vx);
      }
    }

    const eatR = 18 * (1 + 0.15 * beatPulse);
    for (let i = state.points.length - 1; i >= 0; i--) {
      const p = state.points[i];
      const ddx = p.x - state.head.x,
        ddy = p.y - state.head.y;
      if (ddx * ddx + ddy * ddy <= (eatR + p.r) * (eatR + p.r)) {
        state.points.splice(i, 1);
        state.score += 1;
        uiScore.textContent = state.score;
        state.maxTrail = Math.min(300, state.maxTrail + 10);
        uiLen.textContent = state.maxTrail;
        state.points.push(
          spawnDot(W, state.cameraY + H + 100, state.cameraY + H * 1.5)
        );
        burst(p.x, p.y, p.hue);
      }
    }

    // Culling onderin (prestaties)
    const cullBelow = state.cameraY + H + 300;
    const cullAbove = state.cameraY - 600;
    for (let i = state.points.length - 1; i >= 0; i--) {
      const y = state.points[i].y;
      if (y > cullBelow || y < cullAbove) state.points.splice(i, 1);
    }
    for (let i = state.statics.length - 1; i >= 0; i--) {
      const y = state.statics[i].y;
      if (y > cullBelow || y < cullAbove) state.statics.splice(i, 1);
    }
    // Endless chunk spawns bovenin (zodra we chunkHeight hebben afgelegd)
    while (state.cameraY - state.lastSpawnY >= state.chunkHeight) {
      const yMin = state.cameraY + H + 100,
        yMax = state.cameraY + H * 1.5;
      for (let k = 0; k < state.pointsPerChunk; k++)
        state.points.push(spawnDot(W, yMin, yMax));
      for (let k = 0; k < state.staticsPerChunk; k++)
        state.statics.push(spawnStatic(W, yMin, yMax));
      state.lastSpawnY += state.chunkHeight;
    }
    // Safeguard: hou altijd genoeg objecten rond de camera (als speler veel opeet)
    const bandMin = state.cameraY + H + 100,
      bandMax = state.cameraY + H * 1.3;
    while (state.points.length < state.minPoints)
      state.points.push(spawnDot(W, bandMin, bandMax));
    while (state.statics.length < state.minStatics)
      state.statics.push(spawnStatic(W, bandMin, bandMax));

    // Omsluiten detectie
    if (state.trail.length > 25) {
      const head = state.trail[state.trail.length - 1];
      const minGap = 18,
        closeDist2 = 20 * 20;
      let loopStart = -1;
      for (let i = 0; i < state.trail.length - minGap; i++) {
        const q = state.trail[i];
        const dx = head.x - q.x,
          dy = head.y - q.y;
        if (dx * dx + dy * dy <= closeDist2) {
          loopStart = i;
        }
      }
      if (loopStart !== -1) {
        const loopPts = state.trail.slice(loopStart);
        for (const s of state.statics) {
          if (s.captured) continue;
          if (
            pointInPolygon([s.x, s.y], loopPts) &&
            !polygonIntersectsCircle(loopPts, s.x, s.y, s.r)
          ) {
            s.captured = true;
            state.score += 5;
            uiScore.textContent = state.score;
            burst(s.x, s.y, 120);
          }
        }
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      q.life -= dt;
      if (q.life <= 0) particles.splice(i, 1);
      else {
        q.x += q.vx * dt;
        q.y += q.vy * dt;
      }
    }

    // Wanneer speler een punt eet:
    state.score += 1;
    uiScore.textContent = state.score;
    state.maxTrail = Math.min(300, state.maxTrail + 10);
    uiLen.textContent = state.maxTrail;

    // Stuur naar server
    sendScore(state.score);
  }

  // Geometrie helpers
  function pointInPolygon(point, vs) {
    let x = point[0],
      y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i].x,
        yi = vs[i].y;
      const xj = vs[j].x,
        yj = vs[j].y;
      const intersect =
        yi > y != yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function segCircleIntersects(ax, ay, bx, by, cx, cy, r) {
    const abx = bx - ax,
      aby = by - ay;
    const acx = cx - ax,
      acy = cy - ay;
    const ab2 = abx * abx + aby * aby;
    const t = Math.max(0, Math.min(1, (acx * abx + acy * aby) / (ab2 || 1)));
    const px = ax + abx * t,
      py = ay + aby * t;
    const dx = px - cx,
      dy = py - cy;
    return dx * dx + dy * dy <= r * r;
  }
  function polygonIntersectsCircle(poly, cx, cy, r) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (segCircleIntersects(a.x, a.y, b.x, b.y, cx, cy, r)) return true;
    }
    return false;
  }

  // Background
  function drawBackground(W, H) {
    ctx.clearRect(0, 0, W, H);
    const grad = ctx.createRadialGradient(
      W * 0.5,
      H * 0.5,
      Math.min(W, H) * 0.2,
      W * 0.5,
      H * 0.5,
      Math.max(W, H) * 0.8
    );
    grad.addColorStop(0, "rgba(30,41,59,0.35)");
    grad.addColorStop(1, "rgba(2,6,12,0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    const stripeW = 80,
      amp = 30,
      sx = Math.sin(state.bgTime * 0.6) * amp;
    for (let x = -stripeW; x < W + stripeW; x += stripeW) {
      const odd = ((x / stripeW) | 0) % 2 === 0;
      ctx.fillStyle = odd ? "rgba(148,163,184,0.05)" : "rgba(148,163,184,0.03)";
      ctx.fillRect(x + sx, 0, stripeW, H);
    }
    const brickH = 36,
      yOffset = -(state.cameraY % brickH);
    ctx.strokeStyle = "rgba(148,163,184,0.10)";
    ctx.lineWidth = 1;
    for (let y = yOffset; y < H; y += brickH) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  // Rendering
  function draw() {
    const W = canvas.clientWidth,
      H = canvas.clientHeight;
    drawBackground(W, H);
    const toScreenY = (wy) => wy - state.cameraY; // punten
    for (const p of state.points) {
      const sy = toScreenY(p.y);
      if (sy < -60 || sy > H + 60) continue; // random tot 4x groter op de beat
      const rf = 1 + beatPulse * (randBeat(p.seed) * 3.0); // 1..4x
      const rGlow = p.r * 2.2 * rf,
        rCore = p.r * rf;
      const g = ctx.createRadialGradient(p.x, sy, 0, p.x, sy, rGlow);
      g.addColorStop(0, `hsla(${p.hue}, 90%, 80%, .95)`);
      g.addColorStop(1, `hsla(${p.hue}, 80%, 50%, .0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, sy, rGlow, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsla(${p.hue}, 95%, 68%, .9)`;
      ctx.beginPath();
      ctx.arc(p.x, sy, rCore, 0, Math.PI * 2);
      ctx.fill();
    }
    // statics
    for (const s of state.statics) {
      const sy = toScreenY(s.y);
      if (sy < -50 || sy > H + 50) continue;
      const rf = 1 + beatPulse * (randBeat(s.seed) * 3.0);
      const drawR = s.r * rf;
      if (s.captured) {
        ctx.fillStyle = "green";
        ctx.beginPath();
        ctx.arc(s.x, sy, drawR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.font = `${Math.max(12, drawR)}px ui-sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("✔", s.x, sy + 2);
      } else {
        ctx.fillStyle = "red";
        ctx.beginPath();
        ctx.arc(s.x, sy, drawR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // trail
    if (state.trail.length > 2) {
      const pts = state.trail;
      const widthBase = 18;
      const headHue = 275;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)],
          p1 = pts[i],
          p2 = pts[i + 1],
          p3 = pts[Math.min(pts.length - 1, i + 2)];
        const t = 0.5;
        const cp1x = p1.x + ((p2.x - p0.x) * t) / 6;
        const cp1y =
          p1.y -
          state.cameraY +
          ((p2.y - state.cameraY - (p0.y - state.cameraY)) * t) / 6;
        const cp2x = p2.x - ((p3.x - p1.x) * t) / 6;
        const cp2y =
          p2.y -
          state.cameraY -
          ((p3.y - state.cameraY - (p1.y - state.cameraY)) * t) / 6;
        if (i === 0) ctx.moveTo(p1.x, p1.y - state.cameraY);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y - state.cameraY);
      }
      ctx.strokeStyle = `hsla(${headHue}, 95%, 75%, .35)`;
      ctx.lineWidth = widthBase;
      ctx.stroke();
      const start = pts[0],
        end = pts[pts.length - 1];
      const lg = ctx.createLinearGradient(
        start.x,
        start.y - state.cameraY,
        end.x,
        end.y - state.cameraY
      );
      lg.addColorStop(0, `hsla(${headHue}, 95%, 72%, .95)`);
      lg.addColorStop(1, `hsla(${headHue}, 80%, 55%, .25)`);
      ctx.strokeStyle = lg;
      ctx.lineWidth = widthBase * 0.6;
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 0.45 - i * 0.12;
        ctx.lineWidth = widthBase * 0.6 - (i + 1) * 4;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const head = end;
      const glow2 = ctx.createRadialGradient(
        head.x,
        head.y - state.cameraY,
        0,
        head.x,
        head.y - state.cameraY,
        28
      );
      glow2.addColorStop(0, "rgba(199, 210, 254, .9)");
      glow2.addColorStop(1, "rgba(199, 210, 254, 0)");
      ctx.fillStyle = glow2;
      ctx.beginPath();
      ctx.arc(head.x, head.y - state.cameraY, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(head.x, head.y - state.cameraY, 6.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (state.debug) {
      ctx.fillStyle = "rgba(255,255,255,.6)";
      for (const p of state.trail) {
        ctx.fillRect(p.x - 1.5, p.y - state.cameraY - 1.5, 3, 3);
      }
    }
    // particles
    for (const q of particles) {
      const sy = q.y - state.cameraY;
      if (sy < -60 || sy > H + 60) continue;
      const g = ctx.createRadialGradient(q.x, sy, 0, q.x, sy, q.r);
      g.addColorStop(0, `hsla(${q.hue}, 100%, 85%, ${q.life / q.max})`);
      g.addColorStop(1, `hsla(${q.hue}, 90%, 50%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(q.x, sy, q.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // particles
  const particles = [];
  function burst(x, y, hue) {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 80 + Math.random() * 180;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        r: 10 + Math.random() * 16,
        hue,
        life: 0.6 + Math.random() * 0.5,
        max: 1,
      });
    }
  }

  // loop
  let last = performance.now();
  function frame(now) {
    const rawDt = Math.min(0.033, (now - last) / 1000);
    last = now;
    const dt = state.slowmo ? rawDt * 0.25 : rawDt;
    update(dt);
    draw();
    drawOtherScores();
    requestAnimationFrame(frame);
  }

  // init
  function fit() {
    resize();
  }
  window.addEventListener("resize", fit);
  fit();
  reset();
  requestAnimationFrame(frame);

  // --- Hier komt ALLE bestaande JavaScript game logica ---
  // Kopieer volledig de originele update(), draw(), reset(), audio en andere functies
  // uit je eerste versie. Zorg dat ze intact blijven.
  // Alle verwijzingen naar <aside class="panel"> kunnen veilig worden verwijderd.
})();
