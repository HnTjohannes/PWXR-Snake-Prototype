class InputHandler {
  constructor(canvas) {
    this.canvas = canvas;
    this.touchActive = false;
    this.onMove = null;
    this.onKeyDown = null;
    this.onPointerDown = null;
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    window.addEventListener("mousemove", (e) => this.handleMouseMove(e));
    window.addEventListener("touchmove", (e) => this.handleTouchMove(e), { passive: false });
    window.addEventListener("keydown", (e) => this.onKeyDown?.(e.key));
    window.addEventListener("pointerdown", () => this.onPointerDown?.(), { once: true });

    this.canvas.addEventListener("pointerdown", (e) => this.handlePointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.handlePointerMove(e));
    this.canvas.addEventListener("pointerup", (e) => this.handlePointerUp(e));
    this.canvas.addEventListener("pointercancel", (e) => this.handlePointerUp(e));
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
}