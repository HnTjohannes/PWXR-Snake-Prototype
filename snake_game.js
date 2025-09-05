(() => {
  class SnakeGame {
    constructor() {
      this.playerId = 'player_' + Math.random().toString(36).substr(2, 9);
      this.playerName = "Player" + this.playerId.slice(-4);
      
      this.canvas = document.getElementById("game");
      this.ctx = this.canvas.getContext("2d");
      this.DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      
      this.state = new GameState();
      this.renderer = new GameRenderer(this.ctx, this.state);
      this.input = new InputHandler(this.canvas);
      this.audio = new AudioManager();
      this.network = new NetworkManager(this.playerId, this.playerName);
      this.ui = new UIManager();
      this.physics = new Physics();
      this.particles = new ParticleSystem();
      
      this.otherPlayers = {};
      this.lastUpdate = performance.now();
      
      this.init();
    }

    init() {
      this.setupCanvas();
      this.setupEventListeners();
      this.network.connect();
      this.reset();
      this.startGameLoop();
    }

    setupCanvas() {
      const ro = new ResizeObserver(() => this.resizeCanvas());
      ro.observe(this.canvas);
      this.resizeCanvas();
    }

    resizeCanvas() {
      const { clientWidth: w, clientHeight: h } = this.canvas;
      this.canvas.width = w * this.DPR;
      this.canvas.height = h * this.DPR;
      this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    }

    setupEventListeners() {
      this.input.onMove = (x, y) => {
        this.state.mouse.x = x;
        this.state.mouse.y = y;
        this.network.sendState(this.state.head, this.state.trail);
      };

      this.input.onKeyDown = (key) => {
        switch(key.toLowerCase()) {
          case 'r': this.reset(); break;
          case 'd': this.state.debug = !this.state.debug; break;
          case 'shift': this.state.slowmo = !this.state.slowmo; break;
          case 's': this.audio.toggle(); break;
        }
      };

      this.input.onPointerDown = () => {
        if (!this.audio.isRunning) this.audio.start();

        this.startShockwaveCharge();
      };

      this.input.onPointerUp = () => {
        this.releaseShockwave();
};

      this.network.onMessage = (msg) => this.handleNetworkMessage(msg);
      this.network.onStatusChange = (connected) => this.ui.updateConnectionStatus(connected);

      window.addEventListener("resize", () => this.resizeCanvas());
    }

    handleNetworkMessage(msg) {
      switch(msg.type) {
        case "fullGameState":
          this.state.points = msg.gameState.points || [];
          this.state.statics = msg.gameState.statics || [];
          this.state.cameraY = msg.gameState.cameraY || 0;
          this.state.head.y = this.state.cameraY + 300;
          this.otherPlayers = { ...msg.players };
          delete this.otherPlayers[this.playerId];
          break;

        case "gameStateUpdate":
          this.state.points = msg.gameState.points || [];
          this.state.statics = msg.gameState.statics || [];
          this.state.cameraY = msg.gameState.cameraY || 0;
          const filteredPlayers = { ...msg.players };
          delete filteredPlayers[this.playerId];
          this.otherPlayers = filteredPlayers;
          break;

        case "pointCollected":
          this.handlePointCollected(msg);
          break;

        case "staticsCaptured":
        case "staticscaptured":
          this.handleStaticsCaptured(msg);
          break;
        case "shockwave":
          this.handleShockwaveReceived(msg);
          this.handleOtherPlayerShockwave(msg);
          break;
      }
    }

    handlePointCollected(msg) {
      const pointIndex = this.state.points.findIndex(p => p.id === msg.pointId);
      if (pointIndex !== -1) {
        const point = this.state.points[pointIndex];
        this.particles.burst(point.x, point.y, point.hue);
        this.state.points.splice(pointIndex, 1);
        if (msg.newPoint) {
          this.state.points.push(msg.newPoint);
        }
      }
    }

    handleStaticsCaptured(msg) {
      for (const staticId of msg.staticIds) {
        const staticObj = this.state.statics.find(s => s.id === staticId);
        if (staticObj) {
          staticObj.captured = true;
          this.particles.burst(staticObj.x, staticObj.y, 120);
        }
      }
    }

    handleShockwaveReceived(msg) {
  // Calculate if we're hit by the shockwave
  const distance = this.physics.getDistance(
    { x: msg.x, y: msg.y }, 
    { x: this.state.head.x, y: this.state.head.y }
  );
  
  if (distance <= msg.radius) {
    // We got hit! Reduce our trail
    const reduction = Math.floor(this.state.maxTrail * 0.5); // Lose 20% of trail
    this.state.maxTrail = Math.max(20, this.state.maxTrail - reduction);
    this.state.trail = this.state.trail.slice(-this.state.maxTrail);
    
    // Visual feedback
    this.particles.burst(this.state.head.x, this.state.head.y, 25); // Red particles
    this.ui.updateLength(this.state.maxTrail);
  
      // Activate hit effect
    this.state.hitEffect.active = true;
    this.state.hitEffect.blinkCount = 0;
    this.state.hitEffect.blinkTimer = 0;

    // Activate screen flash
    this.state.screenFlash.active = true;
    this.state.screenFlash.intensity = 1.0;
    this.state.screenFlash.timer = 0;
  }

}
    handleOtherPlayerShockwave(msg) {
      if (msg.playerId === this.playerId) return;
  
  // Create visual shockwave effect for other players
      this.particles.shockwaveBurst(msg.x, msg.y, msg.radius);
}

    update(dt) {
      this.state.bgTime += dt;
      this.audio.update();
      
      this.physics.updatePlayerMovement(this.state, this.canvas, dt);
      this.physics.updateTrail(this.state);
      this.handlePointCollection();
      this.handleStaticCapture();
      this.particles.update(dt);
      this.updateShockwave(dt);
      this.updateHitEffect(dt);
      this.updateScreenFlash(dt);
    }

    updateHitEffect(dt) {
  if (this.state.hitEffect.active) {
    this.state.hitEffect.blinkTimer += dt;
    
    if (this.state.hitEffect.blinkTimer >= this.state.hitEffect.blinkDuration) {
      this.state.hitEffect.blinkTimer = 0;
      this.state.hitEffect.blinkCount++;
      
      if (this.state.hitEffect.blinkCount >= 4) { // 2 complete blinks (on-off-on-off)
        this.state.hitEffect.active = false;
        this.state.hitEffect.blinkCount = 0;
      }
    }
  }
}

updateScreenFlash(dt) {
  if (this.state.screenFlash.active) {
    this.state.screenFlash.timer += dt;
    
    // Fade out the flash effect
    const progress = this.state.screenFlash.timer / this.state.screenFlash.duration;
    this.state.screenFlash.intensity = Math.max(0, 1 - progress);
    
    if (this.state.screenFlash.timer >= this.state.screenFlash.duration) {
      this.state.screenFlash.active = false;
      this.state.screenFlash.intensity = 0;
    }
  }
}

    handlePointCollection() {
      const eatRadius = 18 * (1 + 0.15 * this.audio.beatPulse);
      
      for (let i = this.state.points.length - 1; i >= 0; i--) {
        const point = this.state.points[i];
        if (!point) continue;

        const distance = this.physics.getDistance(this.state.head, point);
        if (distance <= eatRadius + (point.r || 8)) {
          this.state.points.splice(i, 1);
          this.state.score += 1;
          this.state.maxTrail = Math.min(300, this.state.maxTrail + 10);
          
          this.ui.updateScore(this.state.score);
          this.ui.updateLength(this.state.maxTrail);
          this.particles.burst(point.x, point.y, point.hue || 200);
          this.network.collectPoint(point.id);
        }
      }
    }

    handleStaticCapture() {
      if (this.state.trail.length <= 25) return;

      const loopData = this.physics.detectLoop(this.state.trail);
      if (!loopData) return;

      const capturedStatics = [];
      for (const staticObj of this.state.statics) {
        if (staticObj.captured) continue;
        
        if (this.physics.isStaticCaptured(staticObj, loopData.loopPoints)) {
          staticObj.captured = true;
          this.state.score += 5;
          capturedStatics.push(staticObj.id);
          this.particles.burst(staticObj.x, staticObj.y, 120);

          this.state.maxTrail = Math.max(60, this.state.maxTrail - 5);
        }
      }

      if (capturedStatics.length > 0) {
        this.ui.updateScore(this.state.score);
        this.ui.updateLength(this.state.maxTrail);
        this.network.captureStatics(capturedStatics);
      }
    }

    render() {
      const W = this.canvas.clientWidth;
      const H = this.canvas.clientHeight;
      
      this.renderer.clear(W, H);
      this.renderer.drawBackground(W, H);
      this.renderer.drawPoints(this.state.points, this.audio.beatPulse);
      this.renderer.drawOtherPlayers(this.otherPlayers, this.playerId);
      this.renderer.drawStatics(this.state.statics, this.audio.beatPulse);
      this.renderer.drawPlayerTrail(this.state.trail);
      this.renderer.drawShockwave(this.state.shockwave);
      this.renderer.drawParticles(this.particles.particles);
      this.renderer.drawScreenFlash(W, H);

      if (this.state.debug) {
        this.renderer.drawDebug(this.state.trail);
      }
    }

    reset() {
      const W = this.canvas.clientWidth;
      const H = this.canvas.clientHeight;
      
      this.state.head.x = W * 0.5;
      this.state.head.y = this.state.cameraY + H * 0.5;
      this.state.head.vx = 0;
      this.state.head.vy = 0;
      this.state.trail.length = 0;
      this.state.maxTrail = 60;
      this.state.score = 0;
      this.state.bgTime = 0;

      this.state.shockwave.charging = false;
      this.state.shockwave.active = false;
      this.state.shockwave.activeTime = 0;
      this.state.shockwave.chargeTime = 0;
      
      this.ui.updateScore(0);
      this.ui.updateLength(this.state.maxTrail);
    }

 startShockwaveCharge() {
  if (this.state.maxTrail <= 20) return; // Need minimum trail to charge
  if (this.state.shockwave.active) return;
  
  this.state.shockwave.charging = true;
  this.state.shockwave.chargeTime = 0;
  this.state.shockwave.x = this.state.head.x;
  this.state.shockwave.y = this.state.head.y;
}

releaseShockwave() {
  if (!this.state.shockwave.charging) return;
  
  const chargeRatio = Math.min(1, this.state.shockwave.chargeTime / this.state.shockwave.maxChargeTime);

    if (chargeRatio < 0.25) {
    this.state.shockwave.charging = false;
    this.state.shockwave.chargeTime = 0;
    return;
  }

  if (chargeRatio < 0.1) {
    this.state.shockwave.charging = false;
    return;
  }
  
  // Calculate shockwave power based on charge time and trail length
  const maxRadius = Math.min(200, this.state.maxTrail * 2);
  const finalRadius = maxRadius * chargeRatio;
  const trailCost = Math.floor(this.state.maxTrail * 0.3 * chargeRatio);
  
  // Reduce our trail
  this.state.maxTrail = Math.max(20, this.state.maxTrail - trailCost);
  this.state.trail = this.state.trail.slice(-this.state.maxTrail);
  
  // Activate shockwave
  this.state.shockwave.charging = false;
  this.state.shockwave.active = true;
  this.state.shockwave.radius = finalRadius;
  this.state.shockwave.activeTime = 0;
  
  // Send shockwave to network
  this.network.sendShockwave(this.state.shockwave.x, this.state.shockwave.y, finalRadius);
  
  // Apply to other players locally
  this.applyShockwaveToOthers(this.state.shockwave.x, this.state.shockwave.y, finalRadius);
  
  this.ui.updateLength(this.state.maxTrail);
}

applyShockwaveToOthers(x, y, radius) {
  for (const id in this.otherPlayers) {
    const player = this.otherPlayers[id];
    if (!player) continue;
    
    const distance = this.physics.getDistance({ x, y }, { x: player.x, y: player.y });
    if (distance <= radius) {
      // Visual effect for hit player
      this.particles.burst(player.x, player.y, 0); // Red particles
    }
  }
}

updateShockwave(dt) {
  if (this.state.shockwave.charging) {
    this.state.shockwave.chargeTime += dt;
    this.state.shockwave.chargeTime = Math.min(this.state.shockwave.chargeTime, this.state.shockwave.maxChargeTime);

    this.state.shockwave.x = this.state.head.x;
    this.state.shockwave.y = this.state.head.y;

    if (this.state.shockwave.chargeTime >= this.state.shockwave.maxChargeTime) {
      this.releaseShockwave();
    }
  }
  
  if (this.state.shockwave.active) {
    this.state.shockwave.activeTime += dt;
    if (this.state.shockwave.activeTime >= this.state.shockwave.duration) {
      this.state.shockwave.active = false;
      this.state.shockwave.activeTime = 0;
    }
  }
}




    startGameLoop() {
      const frame = (now) => {
        const rawDt = Math.min(0.033, (now - this.lastUpdate) / 1000);
        this.lastUpdate = now;
        const dt = this.state.slowmo ? rawDt * 0.25 : rawDt;
        
        this.update(dt);
        this.render();
        this.ui.updatePlayerList(this.playerName, this.state.score, this.otherPlayers);
        
        requestAnimationFrame(frame);
      };
      
      requestAnimationFrame(frame);
    }
  }

  class GameState {
    constructor() {
      this.points = [];
      this.statics = [];
      this.head = { x: 400, y: 300, vx: 0, vy: 0 };
      this.trail = [];
      this.maxTrail = 60;
      this.score = 0;
      this.debug = false;
      this.slowmo = false;
      this.cameraY = 0;
      this.scrollSpeed = 120;
      this.bgTime = 0;
      this.mouse = { x: 0, y: 0 };
  this.shockwave = {
  charging: false,
  chargeTime: 0,
  maxChargeTime: 2.0,
  radius: 0,
  active: false,
  x: 0,
  y: 0,
  duration: 0.5,
  activeTime: 0
};
  this.hitEffect = {
  active: false,
  blinkCount: 0,
  blinkTimer: 0,
  blinkDuration: 0.2 // Duration of each blink
};
this.screenFlash = {
  active: false,
  intensity: 0,
  duration: 0.5,
  timer: 0
};
    }
  }

  class NetworkManager {
    constructor(playerId, playerName) {
      this.playerId = playerId;
      this.playerName = playerName;
      this.ws = null;
      this.isConnected = false;
      this.lastStateSent = 0;
      this.onMessage = null;
      this.onStatusChange = null;
    }

    connect() {
      this.ws = new WebSocket("ws://192.168.5.50:8080");
      
      this.ws.onopen = () => {
        this.isConnected = true;
        this.onStatusChange?.(true);
        this.send({
          type: "join",
          id: this.playerId,
          name: this.playerName,
          x: 400,
          y: 300
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.onMessage?.(msg);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.onStatusChange?.(false);
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        this.isConnected = false;
        this.onStatusChange?.(false);
      };
    }

    send(data) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(data));
      }
    }

    sendState(head, trail) {
      const now = performance.now();
      if (now - this.lastStateSent > 50) {
        this.send({
          type: "updateState",
          id: this.playerId,
          name: this.playerName,
          x: head.x,
          y: head.y,
          trail: trail.slice(-20)
        });
        this.lastStateSent = now;
      }
    }

    collectPoint(pointId) {
      this.send({
        type: "collectPoint",
        pointId: pointId
      });
    }

    captureStatics(staticIds) {
      this.send({
        type: "captureStatic",
        staticIds: staticIds
      });
    }

    sendShockwave(x, y, radius) {
  this.send({
    type: "shockwave",
    x: x,
    y: y,
    radius: radius
  });
}
  }

  class InputHandler {
    constructor(canvas) {
      this.canvas = canvas;
      this.touchActive = false;
      this.mouseDown = false;
      this.onMove = null;
      this.onKeyDown = null;
      this.onPointerDown = null;
      this.onPointerUp = null;
      
      this.setupEventListeners();
    }

    setupEventListeners() {
      window.addEventListener("mousemove", (e) => this.handleMouseMove(e));
      window.addEventListener("touchmove", (e) => this.handleTouchMove(e), { passive: false });
      window.addEventListener("keydown", (e) => this.onKeyDown?.(e.key));
      window.addEventListener("pointerdown", () => this.onPointerDown?.(), { once: true });
      window.addEventListener("mousedown", (e) => this.handleMouseDown(e));
      window.addEventListener("mouseup", (e) => this.handleMouseUp(e));

      this.canvas.addEventListener("pointerdown", (e) => this.handlePointerDown(e));
      this.canvas.addEventListener("pointermove", (e) => this.handlePointerMove(e));
      this.canvas.addEventListener("pointerup", (e) => this.handlePointerUp(e));
      this.canvas.addEventListener("pointercancel", (e) => this.handlePointerUp(e));

      // Add double tap detection for mobile
  this.lastTap = 0;
  this.canvas.addEventListener("touchstart", (e) => {
    const now = Date.now();
    if (now - this.lastTap < 300) {
      // Double tap detected
      this.onPointerDown?.();
    }
    this.lastTap = now;
  });
  
  this.canvas.addEventListener("touchend", (e) => {
    this.onPointerUp?.();
  });
    }



    handleMouseMove(e) {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.onMove?.(x, y);
    }

    handleTouchMove(e) {
      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      this.onMove?.(x, y);
      e.preventDefault();
    }

    handlePointerDown(e) {
      e.preventDefault();
      this.touchActive = true;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.onMove?.(x, y);
    }

    handlePointerMove(e) {
      if (!this.touchActive) return;
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.onMove?.(x, y);
    }

    handlePointerUp(e) {
      e.preventDefault();
      this.touchActive = false;
    }

    handleMouseDown(e) {
      if (e.target === this.canvas) {
    this.mouseDown = true;
    this.onPointerDown?.();
  }
}

    handleMouseUp(e) {
   this.mouseDown = false;
    this.onPointerUp?.();
}
 }

  class AudioManager {
    constructor() {
      this.ctx = null;
      this.isRunning = false;
      this.bpm = 96;
      this.nextTime = 0;
      this.sequence = [0, 3, 5, 7, 10, 7, 5, 3];
      this.index = 0;
      this.baseHz = 196;
      this.beatPulse = 0;
      this.beatIndex = 0;
    }

    start() {
      if (this.isRunning) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.isRunning = true;
        this.nextTime = this.ctx.currentTime + 0.05;
      } catch (e) {
        console.warn('Audio not supported:', e);
      }
    }

    stop() {
      if (!this.isRunning) return;
      try {
        this.ctx?.close();
        this.ctx = null;
        this.isRunning = false;
      } catch (e) {
        console.warn('Error stopping audio:', e);
      }
    }

    toggle() {
      this.isRunning ? this.stop() : this.start();
    }

    update() {
      this.beatPulse = Math.max(0, this.beatPulse - 0.016 * 3);
      this.scheduleNotes();
    }

    scheduleNotes() {
      if (!this.isRunning || !this.ctx) return;
      
      try {
        const interval = 60 / this.bpm;
        while (this.nextTime < this.ctx.currentTime + 0.12) {
          const note = this.sequence[this.index % this.sequence.length];
          const freq = this.baseHz * Math.pow(2, note / 12);
          
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, this.nextTime);
          gain.gain.setValueAtTime(0.001, this.nextTime);
          gain.gain.exponentialRampToValueAtTime(0.2, this.nextTime + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, this.nextTime + 0.18);
          
          osc.connect(gain).connect(this.ctx.destination);
          osc.start(this.nextTime);
          osc.stop(this.nextTime + 0.2);
          
          setTimeout(() => {
            this.beatPulse = 1;
            this.beatIndex++;
          }, Math.max(0, (this.nextTime - this.ctx.currentTime) * 1000));
          
          this.nextTime += interval;
          this.index++;
        }
      } catch (e) {
        console.warn('Error scheduling audio:', e);
      }
    }
  }

  class UIManager {
    constructor() {
      this.scoreElement = document.getElementById("score");
      this.lengthElement = document.getElementById("len");
      this.statusElement = document.getElementById("connectionStatus");
      this.multiHUD = document.getElementById("multiHUD");
    }

    updateScore(score) {
      if (this.scoreElement) {
        this.scoreElement.textContent = score;
      }
    }

    updateLength(length) {
      if (this.lengthElement) {
        this.lengthElement.textContent = length;
      }
    }

    updateConnectionStatus(connected) {
      if (this.statusElement) {
        this.statusElement.textContent = connected ? "Connected" : "Disconnected";
        this.statusElement.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
      }
    }

    updatePlayerList(playerName, playerScore, otherPlayers) {
      if (!this.multiHUD) return;
      
      this.multiHUD.innerHTML = "";
      
      const ourDiv = document.createElement("div");
      ourDiv.textContent = `${playerName}: ${playerScore}`;
      ourDiv.style.color = "#fff";
      ourDiv.style.marginBottom = "4px";
      this.multiHUD.appendChild(ourDiv);
      
      for (const id in otherPlayers) {
        const player = otherPlayers[id];
        if (player) {
          const div = document.createElement("div");
          div.textContent = `${player.name || 'Player'}: ${player.score || 0}`;
          div.style.color = "#94a3b8";
          div.style.marginBottom = "2px";
          this.multiHUD.appendChild(div);
        }
      }
    }
  }

  class Physics {
    updatePlayerMovement(state, canvas, dt) {
      const target = { 
        x: state.mouse.x, 
        y: state.mouse.y + state.cameraY 
      };
      
      const H = canvas.clientHeight;
      state.head.y = Math.max(state.cameraY, Math.min(state.cameraY + H, state.head.y));
      
      const lerp = 0.05;
      state.head.x += (target.x - state.head.x) * lerp;
      state.head.y += (target.y - state.head.y) * lerp;
    }

   updateTrail(state) {
     const last = state.trail[state.trail.length - 1];
     const minDist = 8; // Increase minimum distance
  
    if (!last || this.getDistance(state.head, last) > minDist) {
      state.trail.push({ x: state.head.x, y: state.head.y });
    
    
      const targetLength = Math.floor(state.maxTrail / minDist);
    while (state.trail.length > targetLength) {
      state.trail.shift();
    }
  }
}

    getDistance(p1, p2) {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    detectLoop(trail) {
      if (trail.length <= 25) return null;
      
      const head = trail[trail.length - 1];
      const minGap = 18;
      const closeDist2 = 20 * 20;
      let loopStart = -1;
      
      for (let i = 0; i < trail.length - minGap; i++) {
        const point = trail[i];
        const dx = head.x - point.x;
        const dy = head.y - point.y;
        if (dx * dx + dy * dy <= closeDist2) {
          loopStart = i;
        }
      }
      
      return loopStart !== -1 ? { 
        loopStart, 
        loopPoints: trail.slice(loopStart) 
      } : null;
    }

    isStaticCaptured(staticObj, loopPoints) {
      return this.pointInPolygon([staticObj.x, staticObj.y], loopPoints) && 
             !this.polygonIntersectsCircle(loopPoints, staticObj.x, staticObj.y, staticObj.r || 16);
    }

    pointInPolygon(point, vertices) {
      let x = point[0], y = point[1];
      let inside = false;
      
      for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i].x, yi = vertices[i].y;
        const xj = vertices[j].x, yj = vertices[j].y;
        const intersect = yi > y != yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
      }
      
      return inside;
    }

    polygonIntersectsCircle(poly, cx, cy, r) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        if (this.segmentCircleIntersects(a.x, a.y, b.x, b.y, cx, cy, r)) {
          return true;
        }
      }
      return false;
    }

    segmentCircleIntersects(ax, ay, bx, by, cx, cy, r) {
      const abx = bx - ax, aby = by - ay;
      const acx = cx - ax, acy = cy - ay;
      const ab2 = abx * abx + aby * aby;
      const t = Math.max(0, Math.min(1, (acx * abx + acy * aby) / (ab2 || 1)));
      const px = ax + abx * t, py = ay + aby * t;
      const dx = px - cx, dy = py - cy;
      return dx * dx + dy * dy <= r * r;
    }
  }

  class ParticleSystem {
    constructor() {
      this.particles = [];
    }

    burst(x, y, hue) {
      for (let i = 0; i < 18; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 80 + Math.random() * 180;
        
        this.particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: 10 + Math.random() * 16,
          hue: hue || 200,
          life: 0.6 + Math.random() * 0.5,
          maxLife: 1,
        });
      }
    }

    update(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const particle = this.particles[i];
        particle.life -= dt;
        
        if (particle.life <= 0) {
          this.particles.splice(i, 1);
        } else {
          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
        }
      }
    }

    shockwaveBurst(x, y, radius) {
  const particleCount = Math.min(30, Math.floor(radius / 5));
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2;
    const distance = radius * (0.8 + Math.random() * 0.4);
    const particleX = x + Math.cos(angle) * distance;
    const particleY = y + Math.sin(angle) * distance;
    
    this.particles.push({
      x: particleX,
      y: particleY,
      vx: Math.cos(angle) * 100,
      vy: Math.sin(angle) * 100,
      r: 8 + Math.random() * 12,
      hue: 200, // Blue for shockwave
      life: 0.8 + Math.random() * 0.4,
      maxLife: 1,
    });
  }
}
  }

  class GameRenderer {
    constructor(ctx, state) {
      this.ctx = ctx;
      this.state = state;
    }

    clear(width, height) {
      this.ctx.clearRect(0, 0, width, height);
    }

    drawBackground(width, height) {
      // Radial gradient
      const grad = this.ctx.createRadialGradient(
        width * 0.5, height * 0.5, Math.min(width, height) * 0.2,
        width * 0.5, height * 0.5, Math.max(width, height) * 0.8
      );
      grad.addColorStop(0, "rgba(30,41,59,0.35)");
      grad.addColorStop(1, "rgba(2,6,12,0.0)");
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, width, height);
      
      // Animated stripes
      const stripeWidth = 80;
      const amplitude = 30;
      const offset = Math.sin(this.state.bgTime * 0.6) * amplitude;
      
      for (let x = -stripeWidth; x < width + stripeWidth; x += stripeWidth) {
        const isOdd = ((x / stripeWidth) | 0) % 2 === 0;
        this.ctx.fillStyle = isOdd ? "rgba(148,163,184,0.05)" : "rgba(148,163,184,0.03)";
        this.ctx.fillRect(x + offset, 0, stripeWidth, height);
      }
      
      // Grid lines
      const brickHeight = 36;
      const yOffset = -(this.state.cameraY % brickHeight);
      this.ctx.strokeStyle = "rgba(148,163,184,0.10)";
      this.ctx.lineWidth = 1;
      
      for (let y = yOffset; y < height; y += brickHeight) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(width, y);
        this.ctx.stroke();
      }
    }

    drawPoints(points, beatPulse) {
      const height = this.ctx.canvas.clientHeight;
      
      for (const point of points) {
        if (!point) continue;
        
        const screenY = point.y - this.state.cameraY;
        if (screenY < -60 || screenY > height + 60) continue;
        
        const pulseFactor = 1 + beatPulse * (this.randBeat(point.seed || 0) * 3.0);
        const radius = point.r || 8;
        const glowRadius = radius * 2.2 * pulseFactor;
        const coreRadius = radius * pulseFactor;
        const hue = point.hue || 200;
        
        // Glow effect
        const glowGrad = this.ctx.createRadialGradient(point.x, screenY, 0, point.x, screenY, glowRadius);
        glowGrad.addColorStop(0, `hsla(${hue}, 90%, 80%, .95)`);
        glowGrad.addColorStop(1, `hsla(${hue}, 80%, 50%, .0)`);
        this.ctx.fillStyle = glowGrad;
        this.ctx.beginPath();
        this.ctx.arc(point.x, screenY, glowRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Core
        this.ctx.fillStyle = `hsla(${hue}, 95%, 68%, .9)`;
        this.ctx.beginPath();
        this.ctx.arc(point.x, screenY, coreRadius, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    drawStatics(statics, beatPulse) {
      const height = this.ctx.canvas.clientHeight;
      
      for (const staticObj of statics) {
        if (!staticObj) continue;
        
        const screenY = staticObj.y - this.state.cameraY;
        if (screenY < -50 || screenY > height + 50) continue;
        
        const pulseFactor = 1 + beatPulse * (this.randBeat(staticObj.seed || 0) * 3.0);
        const radius = (staticObj.r || 16) * pulseFactor;
        
        if (staticObj.captured) {
          this.ctx.fillStyle = "green";
          this.ctx.beginPath();
          this.ctx.arc(staticObj.x, screenY, radius, 0, Math.PI * 2);
          this.ctx.fill();
          
          this.ctx.fillStyle = "white";
          this.ctx.font = `${Math.max(12, radius)}px ui-sans-serif`;
          this.ctx.textAlign = "center";
          this.ctx.textBaseline = "middle";
          this.ctx.fillText("✔", staticObj.x, screenY + 2);
        } else {
          this.ctx.fillStyle = "red";
          this.ctx.beginPath();
          this.ctx.arc(staticObj.x, screenY, radius, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
    }

    drawScreenFlash(width, height) {
  if (this.state.screenFlash.active && this.state.screenFlash.intensity > 0) {
    const borderWidth = 20;
    const alpha = this.state.screenFlash.intensity * 0.6;
    
    this.ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
    
    // Draw red borders on all edges
    this.ctx.fillRect(0, 0, width, borderWidth); // Top
    this.ctx.fillRect(0, height - borderWidth, width, borderWidth); // Bottom
    this.ctx.fillRect(0, 0, borderWidth, height); // Left
    this.ctx.fillRect(width - borderWidth, 0, borderWidth, height); // Right
  }
}

    drawPlayerTrail(trail) {
      if (trail.length < 2) return;
      
      const widthBase = 18;
      let hue = 275;

        // Check if we should show red blinking effect
  const shouldShowRed = this.state.hitEffect.active && 
                       (this.state.hitEffect.blinkCount % 2 === 1);
  if (shouldShowRed) {
    hue = 0; // Red hue
  }
      
      this.ctx.lineJoin = "round";
      this.ctx.lineCap = "round";
      
      // Draw smooth trail curve
      this.ctx.beginPath();
      for (let i = 0; i < trail.length - 1; i++) {
        const p0 = trail[Math.max(0, i - 1)];
        const p1 = trail[i];
        const p2 = trail[i + 1];
        const p3 = trail[Math.min(trail.length - 1, i + 2)];
        
        const t = 0.5;
        const cp1x = p1.x + ((p2.x - p0.x) * t) / 6;
        const cp1y = p1.y - this.state.cameraY + ((p2.y - this.state.cameraY - (p0.y - this.state.cameraY)) * t) / 6;
        const cp2x = p2.x - ((p3.x - p1.x) * t) / 6;
        const cp2y = p2.y - this.state.cameraY - ((p3.y - this.state.cameraY - (p1.y - this.state.cameraY)) * t) / 6;
        
        if (i === 0) this.ctx.moveTo(p1.x, p1.y - this.state.cameraY);
        this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y - this.state.cameraY);
      }
      
      // Outer trail
      this.ctx.strokeStyle = `hsla(${hue}, 95%, 75%, .35)`;
      this.ctx.lineWidth = widthBase;
      this.ctx.stroke();
      
      // Inner gradient trail
      const start = trail[0];
      const end = trail[trail.length - 1];
      const gradient = this.ctx.createLinearGradient(
        start.x, start.y - this.state.cameraY,
        end.x, end.y - this.state.cameraY
      );
      gradient.addColorStop(0, `hsla(${hue}, 95%, 72%, .95)`);
      gradient.addColorStop(1, `hsla(${hue}, 80%, 55%, .25)`);
      
      this.ctx.strokeStyle = gradient;
      this.ctx.lineWidth = widthBase * 0.6;
      this.ctx.stroke();
      
      // Multiple inner strokes for depth
      for (let i = 0; i < 3; i++) {
        this.ctx.globalAlpha = 0.45 - i * 0.12;
        this.ctx.lineWidth = widthBase * 0.6 - (i + 1) * 4;
        this.ctx.stroke();
      }
      this.ctx.globalAlpha = 1;
      
      // Draw player head
      const head = end;
      const headScreenY = head.y - this.state.cameraY;
      
      // Head glow
      const headGlow = this.ctx.createRadialGradient(head.x, headScreenY, 0, head.x, headScreenY, 28);
      headGlow.addColorStop(0, "rgba(199, 210, 254, .9)");
      headGlow.addColorStop(1, "rgba(199, 210, 254, 0)");
      this.ctx.fillStyle = headGlow;
      this.ctx.beginPath();
      this.ctx.arc(head.x, headScreenY, 28, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Head core
      this.ctx.fillStyle = "#ffffff";
      this.ctx.beginPath();
      this.ctx.arc(head.x, headScreenY, 6.5, 0, Math.PI * 2);
      this.ctx.fill();
    }

    drawOtherPlayers(otherPlayers, currentPlayerId) {
      const width = this.ctx.canvas.clientWidth;
      const height = this.ctx.canvas.clientHeight;
      
      for (const id in otherPlayers) {
        if (id === currentPlayerId) continue;
        
        const player = otherPlayers[id];
        if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.y)) continue;
        
        const screenY = player.y - this.state.cameraY;
        if (screenY < -100 || screenY > height + 100 || player.x < -100 || player.x > width + 100) continue;
        
        // Draw trail
        if (player.trail && player.trail.length > 2) {
          this.drawOtherPlayerTrail(player.trail, 60);
        }
        
        // Draw player
        const radius = 12;
        
        // Player glow
        const glow = this.ctx.createRadialGradient(player.x, screenY, 0, player.x, screenY, radius * 2.5);
        glow.addColorStop(0, 'rgba(255, 165, 0, 0.8)');
        glow.addColorStop(1, 'rgba(255, 165, 0, 0)');
        this.ctx.fillStyle = glow;
        this.ctx.beginPath();
        this.ctx.arc(player.x, screenY, radius * 2.5, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Player body
        this.ctx.fillStyle = "orange";
        this.ctx.beginPath();
        this.ctx.arc(player.x, screenY, radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Player core
        this.ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        this.ctx.beginPath();
        this.ctx.arc(player.x, screenY, radius * 0.4, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Player name and score
        this.ctx.fillStyle = "white";
        this.ctx.font = "12px ui-sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "bottom";
        this.ctx.fillText(player.name || `Player ${id.slice(-4)}`, player.x, screenY - radius - 8);
        
        this.ctx.textBaseline = "top";
        this.ctx.fillStyle = "#94a3b8";
        this.ctx.fillText(`${player.score || 0}`, player.x, screenY + radius + 8);
      }
    }

    drawOtherPlayerTrail(trail, hue) {
      if (!trail || trail.length < 2) return;
      
      const widthBase = 14;
      this.ctx.lineJoin = "round";
      this.ctx.lineCap = "round";
      
      this.ctx.beginPath();
      for (let i = 0; i < trail.length - 1; i++) {
        const p0 = trail[Math.max(0, i - 1)];
        const p1 = trail[i];
        const p2 = trail[i + 1];
        const p3 = trail[Math.min(trail.length - 1, i + 2)];
        
        const t = 0.5;
        const cp1x = p1.x + ((p2.x - p0.x) * t) / 6;
        const cp1y = p1.y - this.state.cameraY + ((p2.y - this.state.cameraY - (p0.y - this.state.cameraY)) * t) / 6;
        const cp2x = p2.x - ((p3.x - p1.x) * t) / 6;
        const cp2y = p2.y - this.state.cameraY - ((p3.y - this.state.cameraY - (p1.y - this.state.cameraY)) * t) / 6;
        
        if (i === 0) this.ctx.moveTo(p1.x, p1.y - this.state.cameraY);
        this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y - this.state.cameraY);
      }
      
      this.ctx.strokeStyle = `hsla(${hue}, 80%, 60%, .25)`;
      this.ctx.lineWidth = widthBase;
      this.ctx.stroke();
      
      const start = trail[0];
      const end = trail[trail.length - 1];
      const gradient = this.ctx.createLinearGradient(
        start.x, start.y - this.state.cameraY,
        end.x, end.y - this.state.cameraY
      );
      gradient.addColorStop(0, `hsla(${hue}, 95%, 70%, .8)`);
      gradient.addColorStop(1, `hsla(${hue}, 80%, 50%, .2)`);
      this.ctx.strokeStyle = gradient;
      this.ctx.lineWidth = widthBase * 0.6;
      this.ctx.stroke();
    }

    drawParticles(particles) {
      const height = this.ctx.canvas.clientHeight;
      
      for (const particle of particles) {
        const screenY = particle.y - this.state.cameraY;
        if (screenY < -60 || screenY > height + 60) continue;
        
        const gradient = this.ctx.createRadialGradient(particle.x, screenY, 0, particle.x, screenY, particle.r);
        gradient.addColorStop(0, `hsla(${particle.hue}, 100%, 85%, ${particle.life / particle.maxLife})`);
        gradient.addColorStop(1, `hsla(${particle.hue}, 90%, 50%, 0)`);
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(particle.x, screenY, particle.r, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    drawDebug(trail) {
      this.ctx.fillStyle = "rgba(255,255,255,.6)";
      for (const point of trail) {
        this.ctx.fillRect(point.x - 1.5, point.y - this.state.cameraY - 1.5, 3, 3);
      }
    }

    drawShockwave(shockwave) {
  if (shockwave.charging) {
    const chargeRatio = Math.min(1, shockwave.chargeTime / shockwave.maxChargeTime);
    const currentRadius = 50 + (150 * chargeRatio);
    const screenY = shockwave.y - this.state.cameraY;
    
    // Charging ring
    this.ctx.strokeStyle = `hsla(200, 100%, 70%, ${0.3 + chargeRatio * 0.4})`;
    this.ctx.lineWidth = 3 + chargeRatio * 5;
    this.ctx.beginPath();
    this.ctx.arc(shockwave.x, screenY, currentRadius, 0, Math.PI * 2);
    this.ctx.stroke();
    
    // Inner pulse
    this.ctx.fillStyle = `hsla(200, 100%, 80%, ${0.1 + chargeRatio * 0.2})`;
    this.ctx.beginPath();
    this.ctx.arc(shockwave.x, screenY, currentRadius * 0.7, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  if (shockwave.active) {
    const progress = shockwave.activeTime / shockwave.duration;
    const currentRadius = shockwave.radius * (0.5 + progress * 0.5);
    const alpha = 1 - progress;
    const screenY = shockwave.y - this.state.cameraY;
    
    // Expanding shockwave ring
    const gradient = this.ctx.createRadialGradient(
      shockwave.x, screenY, currentRadius * 0.8,
      shockwave.x, screenY, currentRadius
    );
    gradient.addColorStop(0, `hsla(200, 100%, 80%, 0)`);
    gradient.addColorStop(1, `hsla(200, 100%, 80%, ${alpha * 0.8})`);
    
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(shockwave.x, screenY, currentRadius, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Outer ring
    this.ctx.strokeStyle = `hsla(200, 100%, 70%, ${alpha})`;
    this.ctx.lineWidth = 4;
    this.ctx.beginPath();
    this.ctx.arc(shockwave.x, screenY, currentRadius, 0, Math.PI * 2);
    this.ctx.stroke();
  }
}


    randBeat(seed) {
      let x = (seed * 9301 + Date.now() * 49297 + 233280) % 233280;
      return x / 233280;
    }
  }

  // Initialize the game
  new SnakeGame();

  })();