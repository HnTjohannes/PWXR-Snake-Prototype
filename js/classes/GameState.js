class GameState {
  constructor() {
    this.points = [];
    this.statics = [];
    this.head = { x: 400, y: 300, vx: 0, vy: 0 };
    this.trail = [];
    this.maxTrail = CONSTANTS.GAMEPLAY.INITIAL_TRAIL_LENGTH;
    this.score = 0;
    this.debug = false;
    this.slowmo = false;
    this.cameraY = 0;
    this.scrollSpeed = CONSTANTS.GAMEPLAY.SCROLL_SPEED;
    this.bgTime = 0;
    this.mouse = { x: 0, y: 0 };
  }

  reset(canvasWidth, canvasHeight) {
    this.head.x = canvasWidth * 0.5;
    this.head.y = this.cameraY + canvasHeight * 0.5;
    this.head.vx = 0;
    this.head.vy = 0;
    this.trail.length = 0;
    this.maxTrail = CONSTANTS.GAMEPLAY.INITIAL_TRAIL_LENGTH;
    this.score = 0;
    this.bgTime = 0;
  }
}