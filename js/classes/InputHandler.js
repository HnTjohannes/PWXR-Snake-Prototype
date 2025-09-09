  export class InputHandler {
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