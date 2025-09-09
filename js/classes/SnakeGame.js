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
      this.audio.start();
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
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
   this.DPR = isMobile ? 0.7 : Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  

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
        if (this.state.isDead) return;

        if (this.audio.ctx && this.audio.ctx.state === 'suspended') {
          this.audio.ctx.resume();
        }
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

       // case "staticsCaptured":
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
    const reduction = Math.floor(this.state.maxTrail * 0.5); 
    this.state.maxTrail = Math.max(20, this.state.maxTrail - reduction);
    this.state.trail = this.state.trail.slice(-this.state.maxTrail);

       // Check if player should die
    if (this.state.maxTrail < 100) {
      this.triggerDeath();
      return;
    }
    
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

triggerDeath() {
  this.state.isDead = true;
  this.state.deathTimer = 0;
  this.state.totalLifetimeScore += this.state.score;

  this.state.trail.length = 0;
  
  // Activate death screen flash (different from hit flash)
  this.state.screenFlash.active = true;
  this.state.screenFlash.intensity = 1.0;
  this.state.screenFlash.timer = 0;
  this.state.screenFlash.duration = this.state.deathDuration; // Longer duration for death
}

    update(dt) {
      if (this.state.isDead) {
        this.updateDeath(dt);
        return;
      }
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

    updateDeath(dt) {
      this.state.deathTimer += dt;
      this.updateScreenFlash(dt); // Keep the screen flash going
  
     if (this.state.deathTimer >= this.state.deathDuration) {
        this.respawn();
  }
}

respawn() {
  const W = this.canvas.clientWidth;
  const H = this.canvas.clientHeight;
  
  // Reset position and trail
  this.state.head.x = W * 0.5;
  this.state.head.y = this.state.cameraY + H * 0.5;
  this.state.head.vx = 0;
  this.state.head.vy = 0;
  this.state.trail.length = 0;
  this.state.maxTrail = 60; // Starting length
  
  // Set score to half of total lifetime score
  this.state.score = Math.floor(this.state.totalLifetimeScore * 0.5);
  
  // Reset death state
  this.state.isDead = false;
  this.state.deathTimer = 0;
  
  // Reset effects
  this.state.screenFlash.active = false;
  this.state.screenFlash.intensity = 0;
  this.state.hitEffect.active = false;
  
  // Update UI
  this.ui.updateScore(this.state.score);
  this.ui.updateLength(this.state.maxTrail);
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
       if (!this.state.isDead) {
      this.renderer.drawPlayerTrail(this.state.trail);
      this.renderer.drawShockwave(this.state.shockwave);
       }
      this.renderer.drawParticles(this.particles.particles);
      this.renderer.drawScreenFlash(W, H);

      if (this.state.isDead) {
    this.renderer.drawRespawnTimer(W, H, this.state.deathTimer, this.state.deathDuration);
  }

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