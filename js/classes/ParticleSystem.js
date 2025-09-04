class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  burst(x, y, hue) {
    for (let i = 0; i < CONSTANTS.PARTICLES.BURST_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = CONSTANTS.PARTICLES.MIN_SPEED + 
                   Math.random() * (CONSTANTS.PARTICLES.MAX_SPEED - CONSTANTS.PARTICLES.MIN_SPEED);
      
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: CONSTANTS.PARTICLES.MIN_RADIUS + 
           Math.random() * (CONSTANTS.PARTICLES.MAX_RADIUS - CONSTANTS.PARTICLES.MIN_RADIUS),
        hue: hue || 200,
        life: CONSTANTS.PARTICLES.MIN_LIFE + 
              Math.random() * (CONSTANTS.PARTICLES.MAX_LIFE - CONSTANTS.PARTICLES.MIN_LIFE),
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
}