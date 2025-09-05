// server.js (ES module compatible with Express)
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Game state ---
let players = {}; 
let gameState = { 
  points: [], statics: [], cameraY: 0, scrollSpeed: 120, lastSpawnY: 0, 
  chunkHeight: 320, pointsPerChunk: 8, staticsPerChunk: 3, 
  minPoints: 28, minStatics: 8, seedCounter: 1 
};

// --- Random / spawn functions ---
function randRange(a, b) { return a + Math.random() * (b - a); }

function spawnDot(W = 800, yMin, yMax) {
  const speed = 40 + Math.random() * 80;
  const ang = Math.random() * Math.PI * 2;
  return { 
    id: gameState.seedCounter++, seed: Math.floor(Math.random() * 1e9), 
    x: Math.random() * W, y: randRange(yMin, yMax), 
    vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed * 0.4, 
    r: 6 + Math.random() * 5, hue: 200 + Math.random() * 120 
  };
}

function spawnStatic(W = 800, yMin, yMax) {
  return { 
    id: gameState.seedCounter++, seed: Math.floor(Math.random() * 1e9), 
    x: Math.random() * W, y: randRange(yMin, yMax), r: 16, captured: false 
  };
}

// --- Initialize game ---
function initializeGame() {
  const W = 800, H = 600;
  gameState.cameraY = 0;
  gameState.lastSpawnY = 0;
  gameState.points = [];
  gameState.statics = [];
  for (let i = 0; i < 16; i++) gameState.points.push(spawnDot(W, gameState.cameraY - H, gameState.cameraY + H * 2));
  for (let i = 0; i < 5; i++) gameState.statics.push(spawnStatic(W, gameState.cameraY - H, gameState.cameraY + H * 2));
}
initializeGame();

// --- Express app setup ---
const app = express();
const server = http.createServer(app);

// Serve static files
app.use(express.static(__dirname));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    players: Object.keys(players).length, 
    connections: wss.clients.size, 
    points: gameState.points.length, 
    statics: gameState.statics.length 
  });
});

// --- WebSocket server ---
const wss = new WebSocketServer({ server });
console.log('WebSocket server attached to HTTP server');

// --- Connection handler ---
wss.on('connection', (ws) => {
  let playerId = null;

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);

      if (msg.type === 'join') {
        playerId = msg.id;
        players[playerId] = { 
          id: playerId,
          score: 0,
          name: msg.name || "Player" + playerId.toString().slice(-4),
          x: msg.x || 400,
          y: gameState.cameraY + 300,
          trail: [],
          lastUpdate: Date.now()
        };

        ws.send(JSON.stringify({ type: 'fullGameState', gameState, players, yourId: playerId }));

        wss.clients.forEach(client => {
          if (client.readyState === ws.OPEN && client !== ws) {
            client.send(JSON.stringify({ type: 'playerJoined', player: players[playerId] }));
          }
        });
      }

      if (msg.type === 'updateState' && playerId) {
        if (players[playerId]) {
          players[playerId].x = msg.x;
          players[playerId].y = msg.y;
          players[playerId].trail = msg.trail;
          players[playerId].lastUpdate = Date.now();
        }
      }

      if (msg.type === 'collectPoint') {
        const pointIndex = gameState.points.findIndex(p => p.id === msg.pointId);
        if (pointIndex !== -1) {
          gameState.points.splice(pointIndex, 1);
          if (playerId && players[playerId]) {
            players[playerId].score += 1;
          }
          
          const newPoint = spawnDot(800, gameState.cameraY - 300, gameState.cameraY + 900);
          gameState.points.push(newPoint);
          
          broadcast({ 
            type: 'pointCollected', 
            pointId: msg.pointId, 
            newPoint: newPoint,
            playerId: playerId 
          });
        }
      }

      if (msg.type === 'captureStatic') {
        for (const staticId of msg.staticIds) {
          const staticObj = gameState.statics.find(s => s.id === staticId);
          if (staticObj && !staticObj.captured) {
            staticObj.captured = true;
            if (playerId && players[playerId]) {
              players[playerId].score += 5;
            }
          }
        }
        broadcast({ 
          type: 'staticsCaptured', 
          staticIds: msg.staticIds,
          playerId: playerId 
        });
      }

      if (msg.type === 'shockwave') {
        broadcast({
          type: 'shockwave',
          playerId: playerId,
          x: msg.x,
          y: msg.y,
          radius: msg.radius
        });
      }
      
    } catch (err) { console.error('Message parse error:', err); }
  });

  ws.on('close', () => { if (playerId) delete players[playerId]; });
});

// --- Broadcast helper ---
function broadcast(msg) {
  const str = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c.readyState === c.OPEN) c.send(str); });
}

// --- Game loop ---
let lastUpdate = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.033, (now - lastUpdate) / 1000);
  lastUpdate = now;

  for (const id in players) {
    if (now - players[id].lastUpdate > 30000) delete players[id];
  }

  if (wss.clients.size > 0) {
    broadcast({ 
      type: 'gameStateUpdate', 
      gameState: { 
        points: gameState.points, 
        statics: gameState.statics, 
        cameraY: gameState.cameraY 
      }, 
      players 
    });
  }
}, 50);

// --- Start server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Game available at: http://0.0.0.0:${PORT}/`);
});



/*
hier beneden zit de pre deployment versie van server.js
je kan deze code gebruiken als je server.js wilt omzetten naar een ES module



// server.js (ES module compatible)
import { WebSocketServer } from 'ws';
import http from 'http';

// --- Game state ---
let players = {}; 
let gameState = { 
  points: [], statics: [], cameraY: 0, scrollSpeed: 120, lastSpawnY: 0, 
  chunkHeight: 320, pointsPerChunk: 8, staticsPerChunk: 3, 
  minPoints: 28, minStatics: 8, seedCounter: 1 
};

// --- Random / spawn functions ---
function randRange(a, b) { return a + Math.random() * (b - a); }

function spawnDot(W = 800, yMin, yMax) {
  const speed = 40 + Math.random() * 80;
  const ang = Math.random() * Math.PI * 2;
  return { 
    id: gameState.seedCounter++, seed: Math.floor(Math.random() * 1e9), 
    x: Math.random() * W, y: randRange(yMin, yMax), 
    vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed * 0.4, 
    r: 6 + Math.random() * 5, hue: 200 + Math.random() * 120 
  };
}

function spawnStatic(W = 800, yMin, yMax) {
  return { 
    id: gameState.seedCounter++, seed: Math.floor(Math.random() * 1e9), 
    x: Math.random() * W, y: randRange(yMin, yMax), r: 16, captured: false 
  };
}

// --- Initialize game ---
function initializeGame() {
  const W = 800, H = 600;
  gameState.cameraY = 0;
  gameState.lastSpawnY = 0;
  gameState.points = [];
  gameState.statics = [];
  for (let i = 0; i < 16; i++) gameState.points.push(spawnDot(W, gameState.cameraY - H, gameState.cameraY + H * 2));
  for (let i = 0; i < 5; i++) gameState.statics.push(spawnStatic(W, gameState.cameraY - H, gameState.cameraY + H * 2));
}
initializeGame();

// --- WebSocket server ---
const wss = new WebSocketServer({ port: process.env.WS_PORT || 8080, host: '0.0.0.0' });
console.log(`WebSocket server running on ws://0.0.0.0:${process.env.WS_PORT || 8080}`);

// --- Connection handler ---
wss.on('connection', (ws) => {
  let playerId = null;

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);

      if (msg.type === 'join') {
        playerId = msg.id;
        players[playerId] = { 
          id: playerId,
          score: 0,
          name: msg.name || "Player" + playerId.toString().slice(-4),
          x: msg.x || 400,
          y: gameState.cameraY + 300,
          trail: [],
          lastUpdate: Date.now()
        };

        // Send full game state to new player
        ws.send(JSON.stringify({ type: 'fullGameState', gameState, players, yourId: playerId }));

        // Notify other clients
        wss.clients.forEach(client => {
          if (client.readyState === ws.OPEN && client !== ws) {
            client.send(JSON.stringify({ type: 'playerJoined', player: players[playerId] }));
          }
        });
      }

      // --- Add other message handling (collectPoint, updateState, etc.) here ---
      
    } catch (err) { console.error('Message parse error:', err); }
  });

  ws.on('close', () => { if (playerId) delete players[playerId]; });
});

// --- Broadcast helper ---
function broadcast(msg) {
  const str = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c.readyState === c.OPEN) c.send(str); });
}

// --- Game loop ---
let lastUpdate = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.033, (now - lastUpdate) / 1000);
  lastUpdate = now;

  // Update game world
  // updateGameWorld(dt); // voeg hier jouw updateGameWorld functie toe

  // Remove inactive players
  for (const id in players) {
    if (now - players[id].lastUpdate > 30000) delete players[id];
  }

  // Broadcast game state
  if (wss.clients.size > 0) {
    broadcast({ type: 'gameStateUpdate', gameState: { points: gameState.points, statics: gameState.statics, cameraY: gameState.cameraY }, players });
  }
}, 50);

// --- Health check server ---
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', players: Object.keys(players).length, connections: wss.clients.size, points: gameState.points.length, statics: gameState.statics.length }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => console.log(`Health check server running on http://0.0.0.0:${PORT}/health`));
*/