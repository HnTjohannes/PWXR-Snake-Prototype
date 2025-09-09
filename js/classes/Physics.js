  export class Physics {
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