class SnakeGame {
  constructor() {
    this.playerId = 'player_' + Math.random().toString(36).substr(2, 9);
    this.playerName = "Player" + this.playerId.slice(-4);
    
    this.canvas = document.getElementById("game");
    this.ctx = this.canvas.getContext("2d");
    this.DPR = Math.max(CONSTANTS.UI.DPR_MIN, Math.min(CONSTANTS.UI.DPR_MAX, window.devicePixelRatio || 1));
    
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

  update(dt) {
    this.state.bgTime += dt;
    this.audio.update();
    
    this.physics.updatePlayerMovement(this.state, this.canvas, dt);
    this.physics.updateTrail(this.state);
    this.handlePointCollection();
    this.handleStaticCapture();
    this.particles.update(dt);
  }

  handlePointCollection() {
    const eatRadius = CONSTANTS.PHYSICS.EAT_RADIUS_BASE * (1 + 0.15 * this.audio.beatPulse);
    
    for (let i = this.state.points.length - 1; i >= 0; i--) {
      const point = this.state.points[i];
      if (!point) continue;

      const distance = this.physics.getDistance(this.state.head, point);
      if (distance <= eatRadius + (point.r || 8)) {
        this.state.points.splice(i, 1);
        this.state.score += CONSTANTS.GAMEPLAY.POINTS_PER_COLLECTED;
        this.state.maxTrail = Math.min(
          CONSTANTS.GAMEPLAY.MAX_TRAIL_LENGTH, 
          this.state.maxTrail + CONSTANTS.GAMEPLAY.TRAIL_INCREASE_PER_POINT
        );
        
        this.ui.updateScore(this.state.score);
        this.ui.updateLength(this.state.maxTrail);
        this.particles.burst(point.x, point.y, point.hue || 200);
        this.network.collectPoint(point.id);
      }
    }
  }

  handleStaticCapture() {
    if (this.state.trail.length <= CONSTANTS.PHYSICS.MIN_LOOP_LENGTH) return;

    const loopData = this.physics.detectLoop(this.state.trail);
    if (!loopData) return;

    const capturedStatics = [];
    for (const staticObj of this.state.statics) {
      if (staticObj.captured) continue;
      
      if (this.physics.isStaticCaptured(staticObj, loopData.loopPoints)) {
        staticObj.captured = true;
        this.state.score += CONSTANTS.GAMEPLAY.POINTS_PER_STATIC;
        capturedStatics.push(staticObj.id);
        this.particles.burst(staticObj.x, staticObj.y, 120);
      }
    }

    if (capturedStatics.length > 0) {
      this.ui.updateScore(this.state.score);
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
    this.renderer.drawParticles(this.particles.particles);
    
    if (this.state.debug) {
      this.renderer.drawDebug(this.state.trail);
    }
  }

  reset() {
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    
    this.state.reset(W, H);
    this.ui.updateScore(0);
    this.ui.updateLength(this.state.maxTrail);
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