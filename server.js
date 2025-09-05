// server.js

// const PORT = process.env.PORT || 3000;
// server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080, host: '0.0.0.0' });

let players = {}; // { playerId: {score, name, x, y, trail} }
let gameState = {
  points: [],
  statics: [],
  cameraY: 0,
  scrollSpeed: 120,
  lastSpawnY: 0,
  chunkHeight: 320,
  pointsPerChunk: 8,
  staticsPerChunk: 3,
  minPoints: 28,
  minStatics: 8,
  seedCounter: 1
};

console.log("WebSocket server starting on ws://0.0.0.0:8080");

// Deterministic random functions (same as client)
function randRange(a, b) {
  return a + Math.random() * (b - a);
}

function spawnDot(W = 800, yMin, yMax) {
  const speed = 40 + Math.random() * 80;
  const ang = Math.random() * Math.PI * 2;
  return {
    id: gameState.seedCounter++,
    seed: Math.floor(Math.random() * 1e9),
    x: Math.random() * W,
    y: randRange(yMin, yMax),
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed * 0.4,
    r: 6 + Math.random() * 5,
    hue: 200 + Math.random() * 120,
  };
}

function spawnStatic(W = 800, yMin, yMax) {
  return {
    id: gameState.seedCounter++,
    seed: Math.floor(Math.random() * 1e9),
    x: Math.random() * W,
    y: randRange(yMin, yMax),
    r: 16,
    captured: false,
  };
}

// Initialize game state
function initializeGame() {
  const W = 800, H = 600;
  gameState.cameraY = 0;
  gameState.lastSpawnY = 0;
  gameState.points = [];
  gameState.statics = [];
  
  // Initial spawn
  for (let i = 0; i < 16; i++)
    gameState.points.push(spawnDot(W, gameState.cameraY - H, gameState.cameraY + H * 2));
  for (let i = 0; i < 5; i++)
    gameState.statics.push(spawnStatic(W, gameState.cameraY - H, gameState.cameraY + H * 2));
}

// Update game world
function updateGameWorld(dt) {
  const W = 800, H = 600;
  gameState.cameraY += gameState.scrollSpeed * dt;
  
  // Update points physics
  for (const p of gameState.points) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.x < p.r) {
      p.x = p.r;
      p.vx = Math.abs(p.vx);
    }
    if (p.x > W - p.r) {
      p.x = W - p.r;
      p.vx = -Math.abs(p.vx);
    }
  }

  // Culling
  const cullBelow = gameState.cameraY + H + 300;
  const cullAbove = gameState.cameraY - 600;
  
  for (let i = gameState.points.length - 1; i >= 0; i--) {
    const y = gameState.points[i].y;
    if (y > cullBelow || y < cullAbove) gameState.points.splice(i, 1);
  }
  for (let i = gameState.statics.length - 1; i >= 0; i--) {
    const y = gameState.statics[i].y;
    if (y > cullBelow || y < cullAbove) gameState.statics.splice(i, 1);
  }
  
  // Endless chunk spawns
  while (gameState.cameraY - gameState.lastSpawnY >= gameState.chunkHeight) {
    const yMin = gameState.cameraY + H + 100,
      yMax = gameState.cameraY + H * 1.5;
    for (let k = 0; k < gameState.pointsPerChunk; k++)
      gameState.points.push(spawnDot(W, yMin, yMax));
    for (let k = 0; k < gameState.staticsPerChunk; k++)
      gameState.statics.push(spawnStatic(W, yMin, yMax));
    gameState.lastSpawnY += gameState.chunkHeight;
  }
  
  // Safeguard: maintain minimum objects
  const bandMin = gameState.cameraY + H + 100,
    bandMax = gameState.cameraY + H * 1.3;
  while (gameState.points.length < gameState.minPoints)
    gameState.points.push(spawnDot(W, bandMin, bandMax));
  while (gameState.statics.length < gameState.minStatics)
    gameState.statics.push(spawnStatic(W, bandMin, bandMax));
}

// Geometry helpers for static capture
function pointInPolygon(point, vs) {
  let x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, yi = vs[i].y;
    const xj = vs[j].x, yj = vs[j].y;
    const intersect = yi > y != yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function segCircleIntersects(ax, ay, bx, by, cx, cy, r) {
  const abx = bx - ax, aby = by - ay;
  const acx = cx - ax, acy = cy - ay;
  const ab2 = abx * abx + aby * aby;
  const t = Math.max(0, Math.min(1, (acx * abx + acy * aby) / (ab2 || 1)));
  const px = ax + abx * t, py = ay + aby * t;
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function polygonIntersectsCircle(poly, cx, cy, r) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (segCircleIntersects(a.x, a.y, b.x, b.y, cx, cy, r)) return true;
  }
  return false;
}

// Initialize the game
initializeGame();

wss.on('connection', (ws) => {
  let playerId = null;

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);

      if (msg.type === 'join') {
        playerId = msg.id;
        players[playerId] = { 
          id: playerId,
          score: 0, // Always start with 0 score
          name: msg.name || "Player" + playerId.toString().slice(-4), 
          x: msg.x || 400, 
          y: gameState.cameraY + 300, // Start at current camera position + offset
          trail: [],
          lastUpdate: Date.now()
        };
        
        console.log(`Player ${playerId} joined at camera position ${gameState.cameraY}`);
        
        // Send full game state to new player
        ws.send(JSON.stringify({ 
          type: 'fullGameState', 
          gameState: gameState,
          players: players,
          yourId: playerId
        }));
        
        wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client !== ws) {
      try {
        client.send(JSON.stringify({
          type: 'playerJoined',
          player: players[playerId]
        }));
      } catch (error) {
        console.error('Error notifying clients of new player:', error);
      }
    }
  });

        
      }
      
      if (msg.type === 'collectPoint') {
        // Handle point collection
        const pointIndex = gameState.points.findIndex(p => p.id === msg.pointId);
        if (pointIndex !== -1) {
          // Remove the point from game state
          gameState.points.splice(pointIndex, 1);
          
          // Update player score
          if (players[playerId]) {
            players[playerId].score += 1;
          }
          
          // Add a new point to maintain count
          const W = 800, H = 600;
          gameState.points.push(spawnDot(W, gameState.cameraY + H + 100, gameState.cameraY + H * 1.5));
          
          // Broadcast point collection to all clients
          broadcast({
            type: 'pointCollected',
            pointId: msg.pointId,
            playerId: playerId,
            newPoint: gameState.points[gameState.points.length - 1]
          });
          
          console.log(`Player ${playerId} collected point ${msg.pointId}`);
        }
      }
      
      if (msg.type === 'captureStatic') {
        // Handle static capture
        const capturedStatics = [];
        for (const staticId of msg.staticIds) {
          const staticObj = gameState.statics.find(s => s.id === staticId);
          if (staticObj && !staticObj.captured) {
            staticObj.captured = true;
            capturedStatics.push(staticId);
            
            if (players[playerId]) {
              players[playerId].score += 5;
            }
          }
        }
        
        if (capturedStatics.length > 0) {
          // Broadcast static captures to all clients
          broadcast({
            type: 'staticscaptured',
            staticIds: capturedStatics,
            playerId: playerId
          });
          
          console.log(`Player ${playerId} captured statics:`, capturedStatics);
        }
      }

      if (msg.type === 'shockwave') {
  // Handle shockwave from player
  if (players[playerId]) {
    // Apply shockwave effects to other players
    for (const otherId in players) {
      if (otherId === playerId) continue;
      const otherPlayer = players[otherId];
      const distance = Math.sqrt(
        Math.pow(msg.x - otherPlayer.x, 2) + 
        Math.pow(msg.y - otherPlayer.y, 2)
      );
      
      if (distance <= msg.radius) {
        // Reduce other player's trail (this will be sent in the next state update)
        // For now, we'll let the client handle the visual feedback
      }
    }
    
    // Broadcast shockwave to all other players
    const shockwaveMsg = {
      type: 'shockwave',
      playerId: playerId,
      x: msg.x,
      y: msg.y,
      radius: msg.radius
    };
    
    // Send to all clients except the sender
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client !== ws) {
        try {
          client.send(JSON.stringify(shockwaveMsg));
        } catch (error) {
          console.error('Error sending shockwave to client:', error);
        }
      }
    });
    
    console.log(`Player ${playerId} fired shockwave at (${msg.x}, ${msg.y}) with radius ${msg.radius}`);
  }
}

      if (msg.type === 'updateState') {
        if (msg.id && players[msg.id]) {
          // Update player state with validation
          if (Number.isFinite(msg.x)) players[msg.id].x = msg.x;
          if (Number.isFinite(msg.y)) players[msg.id].y = msg.y;
          if (msg.name) players[msg.id].name = msg.name;
          if (msg.trail && Array.isArray(msg.trail)) {
            players[msg.id].trail = msg.trail;
          }
          
          players[msg.id].lastUpdate = Date.now();
        }
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    if (playerId && players[playerId]) {
      console.log(`Player ${playerId} disconnected`);
      delete players[playerId];
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function broadcast(message) {
  const messageStr = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(messageStr);
      } catch (error) {
        console.error('Error sending to client:', error);
      }
    }
  });
}

// Game loop - update world and broadcast state
let lastUpdate = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.033, (now - lastUpdate) / 1000);
  lastUpdate = now;
  
  // Update game world
  updateGameWorld(dt);
  
  // Remove inactive players
  for (const id in players) {
    if (now - players[id].lastUpdate > 30000) {
      console.log(`Removing inactive player ${id}`);
      delete players[id];
    }
  }
  
  // Broadcast game state to all clients
  if (wss.clients.size > 0) {
    broadcast({
      type: 'gameStateUpdate',
      gameState: {
        points: gameState.points,
        statics: gameState.statics,
        cameraY: gameState.cameraY
      },
      players: players
    });
  }
}, 50); // 20 times per second

// Health check endpoint
const http = require('http');
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      players: Object.keys(players).length,
      connections: wss.clients.size,
      points: gameState.points.length,
      statics: gameState.statics.length
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(8081, '0.0.0.0', () => {
  console.log('Health check server running on http://0.0.0.0:8081/health');
});

console.log("Shared game state server running on ws://0.0.0.0:8080");
console.log("Use 'node server.js' to start the server");