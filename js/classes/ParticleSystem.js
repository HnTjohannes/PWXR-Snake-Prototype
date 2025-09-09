export class ParticleSystem {
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