(() => {
    const playerId = 'player_' + Math.random().toString(36).substr(2, 9);
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const playerName = "Player" + playerId.slice(-4);
    let DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    let otherPlayers = {};
    let connectionStatus = document.getElementById('connectionStatus');

    function resize() {
      const { clientWidth: w, clientHeight: h } = canvas;
      canvas.width = w * DPR;
      canvas.height = h * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Game state - now synchronized with server
    const state = {
      points: [], // Will be synced from server
      statics: [], // Will be synced from server
      head: { x: 400, y: 300, vx: 0, vy: 0 },
      trail: [],
      maxTrail: 60,
      score: 0,
      debug: false,
      slowmo: false,
      cameraY: 0, // Will be synced from server
      scrollSpeed: 120,
      bgTime: 0,
    };

    // Audio / Beat
    const audio = {
      ctx: null,
      running: false,
      bpm: 96,
      nextTime: 0,
      seq: [0, 3, 5, 7, 10, 7, 5, 3],
      idx: 0,
      baseHz: 196,
    };
    let beatPulse = 0;
    let beatIndex = 0;

    function startAudio() {
      if (audio.running) return;
      try {
        audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
        audio.running = true;
        audio.nextTime = audio.ctx.currentTime + 0.05;
      } catch (e) {
        console.warn('Audio not supported:', e);
      }
    }

    function stopAudio() {
      if (!audio.running) return;
      try {
        audio.ctx.close();
        audio.ctx = null;
        audio.running = false;
      } catch (e) {
        console.warn('Error stopping audio:', e);
      }
    }

    function scheduleAudio() {
      if (!audio.running || !audio.ctx) return;
      try {
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
          setTimeout(() => {
            beatPulse = 1;
            beatIndex++;
          }, Math.max(0, (audio.nextTime - audio.ctx.currentTime) * 1000));
          audio.nextTime += interval;
          audio.idx++;
        }
      } catch (e) {
        console.warn('Error scheduling audio:', e);
      }
    }

    // HUD values
    const uiScore = document.getElementById("score");
    const uiLen = document.getElementById("len");

    // WebSocket multiplayer with shared state
    // Change this IP to your server's IP address
    const ws = new WebSocket("ws://192.168.5.50:8080");
    let isConnected = false;

    ws.onopen = () => {
      console.log("Connected to shared game server");
      isConnected = true;
      connectionStatus.textContent = "Connected";
      connectionStatus.className = "connection-status connected";
      
      ws.send(JSON.stringify({ 
        type: "join", 
        id: playerId, 
        name: playerName,
        x: state.head.x, 
        y: state.head.y 
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        if (msg.type === "fullGameState") {
          // Initial game state when joining
          state.points = msg.gameState.points || [];
          state.statics = msg.gameState.statics || [];
          state.cameraY = msg.gameState.cameraY || 0;
          
          // Set player position to current camera level
          state.head.y = state.cameraY + 300;
          
          otherPlayers = { ...msg.players };
          delete otherPlayers[playerId]; // Remove self
          
          console.log("Received full game state", {
            points: state.points.length,
            statics: state.statics.length,
            cameraY: state.cameraY
          });
        }
        
        if (msg.type === "gameStateUpdate") {
          // Regular game state updates
          state.points = msg.gameState.points || [];
          state.statics = msg.gameState.statics || [];
          state.cameraY = msg.gameState.cameraY || 0;
          
          // Update other players
          const filteredPlayers = { ...msg.players };
          delete filteredPlayers[playerId];
          otherPlayers = filteredPlayers;
        }
        
        if (msg.type === "pointCollected") {
          // A point was collected by someone
          const pointIndex = state.points.findIndex(p => p.id === msg.pointId);
          if (pointIndex !== -1) {
            // Create burst effect at point location
            const point = state.points[pointIndex];
            burst(point.x, point.y, point.hue);
            
            // Remove point and add new one
            state.points.splice(pointIndex, 1);
            if (msg.newPoint) {
              state.points.push(msg.newPoint);
            }
            
            console.log(`Point ${msg.pointId} collected by ${msg.playerId}`);
          }
        }
        
        if (msg.type === "staticsCaptured" || msg.type === "staticscaptured") {
          // Statics were captured by someone
          for (const staticId of msg.staticIds) {
            const staticObj = state.statics.find(s => s.id === staticId);
            if (staticObj) {
              staticObj.captured = true;
              burst(staticObj.x, staticObj.y, 120);
            }
          }
          console.log(`Statics captured by ${msg.playerId}:`, msg.staticIds);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log("Connection closed");
      isConnected = false;
      connectionStatus.textContent = "Disconnected";
      connectionStatus.className = "connection-status disconnected";
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      isConnected = false;
      connectionStatus.textContent = "Connection Error";
      connectionStatus.className = "connection-status disconnected";
    };

    function sendState() {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "updateState",
          id: playerId,
          name: playerName,
          x: state.head.x,
          y: state.head.y,
          trail: state.trail.slice(-20) // Send last 20 trail points
        }));
      }
    }

    let lastStateSent = 0;
    function sendStateThrottled() {
      const now = performance.now();
      if (now - lastStateSent > 50) { // Throttle to 20 times per second
        sendState();
        lastStateSent = now;
      }
    }

    const multiHUD = document.getElementById("multiHUD");

    function drawPlayerScores() {
      if (!multiHUD) return;
      
      multiHUD.innerHTML = "";
      
      // Add our own score
      const ourDiv = document.createElement("div");
      ourDiv.textContent = `${playerName}: ${state.score}`;
      ourDiv.style.color = "#fff";
      ourDiv.style.marginBottom = "4px";
      multiHUD.appendChild(ourDiv);
      
      // Add other players
      for (const id in otherPlayers) {
        const player = otherPlayers[id];
        if (player) {
          const div = document.createElement("div");
          div.textContent = `${player.name || 'Player'}: ${player.score || 0}`;
          div.style.color = "#94a3b8";
          div.style.marginBottom = "2px";
          multiHUD.appendChild(div);
        }
      }
    }

    // Listeners
    let mouse = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
    
    window.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      sendStateThrottled();
    });
    
    window.addEventListener("touchmove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      mouse.x = touch.clientX - rect.left;
      mouse.y = touch.clientY - rect.top;
      sendStateThrottled();
      e.preventDefault();
    }, { passive: false });
    
    window.addEventListener("keydown", (e) => {
      if (e.key === "r" || e.key === "R") reset();
      if (e.key === "d" || e.key === "D") state.debug = !state.debug;
      if (e.key === "Shift") state.slowmo = !state.slowmo;
      if (e.key === "s" || e.key === "S") {
        audio.running ? stopAudio() : startAudio();
      }
    });
    
    window.addEventListener("pointerdown", () => {
      if (!audio.running) startAudio();
    }, { once: true });

    let touchActive = false;

    canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      touchActive = true;
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!touchActive) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      sendStateThrottled();
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
      // Reset only local player state, not shared world state
      const W = canvas.clientWidth, H = canvas.clientHeight;
      state.head.x = W * 0.5;
      state.head.y = state.cameraY + H * 0.5; // Spawn at current camera level
      state.head.vx = 0;
      state.head.vy = 0;
      state.trail.length = 0;
      state.maxTrail = 60;
      state.score = 0;
      state.bgTime = 0;
      if (uiScore) uiScore.textContent = "0";
      if (uiLen) uiLen.textContent = state.maxTrail.toString();
    }

    // Deterministic random for visuals
    function randBeat(seed) {
      let x = (seed * 9301 + beatIndex * 49297 + 233280) % 233280;
      return x / 233280;
    }

    function update(dt) {
      const W = canvas.clientWidth, H = canvas.clientHeight;
      state.bgTime += dt;
      scheduleAudio();
      beatPulse = Math.max(0, beatPulse - dt * 3);
      
      const target = { x: mouse.x, y: mouse.y + state.cameraY };
      
      // Constrain player to camera view
      state.head.y = Math.max(state.cameraY, Math.min(state.cameraY + H, state.head.y));
      
      // Trail management
      const last = state.trail[state.trail.length - 1];
      const minDist = 1;
      if (!last || Math.hypot(state.head.x - last.x, state.head.y - last.y) > minDist) {
        state.trail.push({ x: state.head.x, y: state.head.y });
        while (state.trail.length > state.maxTrail) state.trail.shift();
      }

      // Smooth movement
      const lerp = 0.05;
      state.head.x += (target.x - state.head.x) * lerp;
      state.head.y += (target.y - state.head.y) * lerp;
      
      // Point collection (client-side prediction with server confirmation)
      const eatR = 18 * (1 + 0.15 * beatPulse);
      for (let i = state.points.length - 1; i >= 0; i--) {
        const p = state.points[i];
        if (!p) continue;
        
        const ddx = p.x - state.head.x, ddy = p.y - state.head.y;
        if (ddx * ddx + ddy * ddy <= (eatR + (p.r || 8)) * (eatR + (p.r || 8))) {
          // Immediately remove point for responsive feedback
          state.points.splice(i, 1);
          state.score += 1;
          if (uiScore) uiScore.textContent = state.score;
          state.maxTrail = Math.min(300, state.maxTrail + 10);
          if (uiLen) uiLen.textContent = state.maxTrail;
          
          // Create burst effect
          burst(p.x, p.y, p.hue || 200);
          
          // Notify server
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "collectPoint",
              pointId: p.id
            }));
          }
        }
      }

      // Static enclosure detection
      if (state.trail.length > 25) {
        const head = state.trail[state.trail.length - 1];
        const minGap = 18, closeDist2 = 20 * 20;
        let loopStart = -1;
        
        for (let i = 0; i < state.trail.length - minGap; i++) {
          const q = state.trail[i];
          const dx = head.x - q.x, dy = head.y - q.y;
          if (dx * dx + dy * dy <= closeDist2) {
            loopStart = i;
          }
        }
        
        if (loopStart !== -1) {
          const loopPts = state.trail.slice(loopStart);
          const capturedStatics = [];
          
          for (const s of state.statics) {
            if (s.captured) continue;
            if (pointInPolygon([s.x, s.y], loopPts) && 
                !polygonIntersectsCircle(loopPts, s.x, s.y, s.r || 16)) {
              s.captured = true;
              state.score += 5;
              capturedStatics.push(s.id);
              burst(s.x, s.y, 120);
            }
          }
          
          if (capturedStatics.length > 0) {
            if (uiScore) uiScore.textContent = state.score;
            
            // Notify server
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "captureStatic",
                staticIds: capturedStatics
              }));
            }
          }
        }
      }

      // Update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        q.life -= dt;
        if (q.life <= 0) particles.splice(i, 1);
        else {
          q.x += q.vx * dt;
          q.y += q.vy * dt;
        }
      }
    }

    // Geometry helpers
    function pointInPolygon(point, vs) {
      let x = point[0], y = point[1];
      let inside = false;
      for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i].x, yi = vs[i].y;
        const xj = vs[j].x, yj = vs[j].y;
        const intersect = yi > y != yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    }
    
    function segCircleIntersects(ax, ay, bx, by, cx, cy, r) {
      const abx = bx - ax, aby = by - ay;
      const acx = cx - ax, acy = cy - ay;
      const ab2 = abx * abx + aby * aby;
      const t = Math.max(0, Math.min(1, (acx * abx + acy * aby) / (ab2 || 1)));
      const px = ax + abx * t, py = ay + aby * t;
      const dx = px - cx, dy = py - cy;
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

    // Background rendering
    function drawBackground(W, H) {
      ctx.clearRect(0, 0, W, H);
      const grad = ctx.createRadialGradient(
        W * 0.5, H * 0.5, Math.min(W, H) * 0.2,
        W * 0.5, H * 0.5, Math.max(W, H) * 0.8
      );
      grad.addColorStop(0, "rgba(30,41,59,0.35)");
      grad.addColorStop(1, "rgba(2,6,12,0.0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      
      const stripeW = 80, amp = 30, sx = Math.sin(state.bgTime * 0.6) * amp;
      for (let x = -stripeW; x < W + stripeW; x += stripeW) {
        const odd = ((x / stripeW) | 0) % 2 === 0;
        ctx.fillStyle = odd ? "rgba(148,163,184,0.05)" : "rgba(148,163,184,0.03)";
        ctx.fillRect(x + sx, 0, stripeW, H);
      }
      
      const brickH = 36, yOffset = -(state.cameraY % brickH);
      ctx.strokeStyle = "rgba(148,163,184,0.10)";
      ctx.lineWidth = 1;
      for (let y = yOffset; y < H; y += brickH) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    }

    // Draw other player trails
    function drawOtherPlayerTrail(trail, hue = 60) {
      if (!trail || trail.length < 2) return;
      
      const widthBase = 14;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      
      ctx.beginPath();
      for (let i = 0; i < trail.length - 1; i++) {
        const p0 = trail[Math.max(0, i - 1)];
        const p1 = trail[i];
        const p2 = trail[i + 1];
        const p3 = trail[Math.min(trail.length - 1, i + 2)];
        
        const t = 0.5;
        const cp1x = p1.x + ((p2.x - p0.x) * t) / 6;
        const cp1y = p1.y - state.cameraY + ((p2.y - state.cameraY - (p0.y - state.cameraY)) * t) / 6;
        const cp2x = p2.x - ((p3.x - p1.x) * t) / 6;
        const cp2y = p2.y - state.cameraY - ((p3.y - state.cameraY - (p1.y - state.cameraY)) * t) / 6;
        
        if (i === 0) ctx.moveTo(p1.x, p1.y - state.cameraY);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y - state.cameraY);
      }
      
      ctx.strokeStyle = `hsla(${hue}, 80%, 60%, .25)`;
      ctx.lineWidth = widthBase;
      ctx.stroke();
      
      const start = trail[0];
      const end = trail[trail.length - 1];
      const lg = ctx.createLinearGradient(
        start.x, start.y - state.cameraY,
        end.x, end.y - state.cameraY
      );
      lg.addColorStop(0, `hsla(${hue}, 95%, 70%, .8)`);
      lg.addColorStop(1, `hsla(${hue}, 80%, 50%, .2)`);
      ctx.strokeStyle = lg;
      ctx.lineWidth = widthBase * 0.6;
      ctx.stroke();
    }

    // Main rendering function
    function draw() {
      const W = canvas.clientWidth, H = canvas.clientHeight;
      drawBackground(W, H);
      const toScreenY = (wy) => wy - state.cameraY;
      
      // Draw shared points
      for (const p of state.points) {
        if (!p) continue;
        const sy = toScreenY(p.y);
        if (sy < -60 || sy > H + 60) continue;
        
        const rf = 1 + beatPulse * (randBeat(p.seed || 0) * 3.0);
        const r = p.r || 8;
        const rGlow = r * 2.2 * rf, rCore = r * rf;
        
        const g = ctx.createRadialGradient(p.x, sy, 0, p.x, sy, rGlow);
        g.addColorStop(0, `hsla(${p.hue || 200}, 90%, 80%, .95)`);
        g.addColorStop(1, `hsla(${p.hue || 200}, 80%, 50%, .0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, sy, rGlow, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = `hsla(${p.hue || 200}, 95%, 68%, .9)`;
        ctx.beginPath();
        ctx.arc(p.x, sy, rCore, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Draw other players and their trails
      drawOtherPlayers();
      
      // Draw shared statics
      for (const s of state.statics) {
        if (!s) continue;
        const sy = toScreenY(s.y);
        if (sy < -50 || sy > H + 50) continue;
        
        const rf = 1 + beatPulse * (randBeat(s.seed || 0) * 3.0);
        const drawR = (s.r || 16) * rf;
        
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
      
      // Draw own trail
      if (state.trail.length > 2) {
        const pts = state.trail;
        const widthBase = 18;
        const headHue = 275;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        
        ctx.beginPath();
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)], p1 = pts[i],
                p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
          const t = 0.5;
          const cp1x = p1.x + ((p2.x - p0.x) * t) / 6;
          const cp1y = p1.y - state.cameraY + ((p2.y - state.cameraY - (p0.y - state.cameraY)) * t) / 6;
          const cp2x = p2.x - ((p3.x - p1.x) * t) / 6;
          const cp2y = p2.y - state.cameraY - ((p3.y - state.cameraY - (p1.y - state.cameraY)) * t) / 6;
          if (i === 0) ctx.moveTo(p1.x, p1.y - state.cameraY);
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y - state.cameraY);
        }
        
        ctx.strokeStyle = `hsla(${headHue}, 95%, 75%, .35)`;
        ctx.lineWidth = widthBase;
        ctx.stroke();
        
        const start = pts[0], end = pts[pts.length - 1];
        const lg = ctx.createLinearGradient(
          start.x, start.y - state.cameraY,
          end.x, end.y - state.cameraY
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
        
        // Draw player head
        const head = end;
        const glow2 = ctx.createRadialGradient(
          head.x, head.y - state.cameraY, 0,
          head.x, head.y - state.cameraY, 28
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
      
      // Debug trail points
      if (state.debug) {
        ctx.fillStyle = "rgba(255,255,255,.6)";
        for (const p of state.trail) {
          ctx.fillRect(p.x - 1.5, p.y - state.cameraY - 1.5, 3, 3);
        }
      }
      
      // Draw particles
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

    function drawOtherPlayers() {
      for (const id in otherPlayers) {
        if (id === playerId) continue;
        
        const op = otherPlayers[id];
        if (!op || !Number.isFinite(op.x) || !Number.isFinite(op.y)) {
          console.warn('Invalid player data:', id, op);
          continue;
        }
        
        const sy = op.y - state.cameraY;
        const W = canvas.clientWidth, H = canvas.clientHeight;
        if (sy < -100 || sy > H + 100 || op.x < -100 || op.x > W + 100) {
          continue;
        }
        
        // Draw other player's trail
        if (op.trail && op.trail.length > 2) {
          drawOtherPlayerTrail(op.trail, 60);
        }
        
        // Draw other player
        const playerRadius = 12;
        
        const glow = ctx.createRadialGradient(op.x, sy, 0, op.x, sy, playerRadius * 2.5);
        glow.addColorStop(0, 'rgba(255, 165, 0, 0.8)');
        glow.addColorStop(1, 'rgba(255, 165, 0, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(op.x, sy, playerRadius * 2.5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = "orange";
        ctx.beginPath();
        ctx.arc(op.x, sy, playerRadius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.beginPath();
        ctx.arc(op.x, sy, playerRadius * 0.4, 0, Math.PI * 2);
        ctx.fill();
        
        // Player name and score
        ctx.fillStyle = "white";
        ctx.font = "12px ui-sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(op.name || `Player ${id.slice(-4)}`, op.x, sy - playerRadius - 8);
        
        ctx.textBaseline = "top";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(`${op.score || 0}`, op.x, sy + playerRadius + 8);
      }
    }

    // Particle system
    const particles = [];
    function burst(x, y, hue) {
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 80 + Math.random() * 180;
        particles.push({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          r: 10 + Math.random() * 16,
          hue: hue || 200,
          life: 0.6 + Math.random() * 0.5,
          max: 1,
        });
      }
    }

    // Main game loop
    let last = performance.now();
    function frame(now) {
      const rawDt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const dt = state.slowmo ? rawDt * 0.25 : rawDt;
      
      update(dt);
      draw();
      drawPlayerScores();
      
      requestAnimationFrame(frame);
    }

    // Initialize
    function fit() {
      resize();
    }
    
    window.addEventListener("resize", fit);
    fit();
    reset();
    requestAnimationFrame(frame);

  })();