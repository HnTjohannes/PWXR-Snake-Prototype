export class GameRenderer {
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
    const stripeWidth = CONSTANTS.GAMEPLAY.STRIPE_WIDTH;
    const amplitude = CONSTANTS.GAMEPLAY.STRIPE_AMPLITUDE;
    const offset = Math.sin(this.state.bgTime * 0.6) * amplitude;
    
    for (let x = -stripeWidth; x < width + stripeWidth; x += stripeWidth) {
      const isOdd = ((x / stripeWidth) | 0) % 2 === 0;
      this.ctx.fillStyle = isOdd ? "rgba(148,163,184,0.05)" : "rgba(148,163,184,0.03)";
      this.ctx.fillRect(x + offset, 0, stripeWidth, height);
    }
    
    // Grid lines
    const brickHeight = CONSTANTS.GAMEPLAY.BRICK_HEIGHT;
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
      const glowRadius = radius * CONSTANTS.RENDERING.POINT_GLOW_MULTIPLIER * pulseFactor;
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

  drawPlayerTrail(trail) {
    if (trail.length < 2) return;
    
    const widthBase = CONSTANTS.RENDERING.TRAIL_WIDTH_BASE;
    const hue = CONSTANTS.RENDERING.TRAIL_HUE;
    
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
    const headGlow = this.ctx.createRadialGradient(head.x, headScreenY, 0, head.x, headScreenY, CONSTANTS.RENDERING.HEAD_GLOW_RADIUS);
    headGlow.addColorStop(0, "rgba(199, 210, 254, .9)");
    headGlow.addColorStop(1, "rgba(199, 210, 254, 0)");
    this.ctx.fillStyle = headGlow;
    this.ctx.beginPath();
    this.ctx.arc(head.x, headScreenY, CONSTANTS.RENDERING.HEAD_GLOW_RADIUS, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Head core
    this.ctx.fillStyle = "#ffffff";
    this.ctx.beginPath();
    this.ctx.arc(head.x, headScreenY, CONSTANTS.RENDERING.HEAD_RADIUS, 0, Math.PI * 2);
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
        this.drawOtherPlayerTrail(player.trail, CONSTANTS.RENDERING.OTHER_PLAYER_HUE);
      }
      
      // Draw player
      const radius = CONSTANTS.RENDERING.OTHER_PLAYER_RADIUS;
      
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
    
    const widthBase = CONSTANTS.RENDERING.OTHER_PLAYER_TRAIL_WIDTH;
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

  randBeat(seed) {
    let x = (seed * 9301 + Date.now() * 49297 + 233280) % 233280;
    return x / 233280;
  }
}