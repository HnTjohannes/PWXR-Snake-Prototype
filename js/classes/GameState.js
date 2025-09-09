  export class GameState {
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
  this.isDead = false;
  this.deathTimer = 0;
  this.deathDuration = 3.0; 
  this.totalLifetimeScore = 0; // Track total score across deaths
    }
  }