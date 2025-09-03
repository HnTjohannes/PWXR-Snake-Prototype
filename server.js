// server.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080, host: '0.0.0.0' });

let players = {}; // { playerId: {score, name, x, y, trail} }

console.log("WebSocket server starting on ws://0.0.0.0:8080");

wss.on('connection', (ws) => {
  let playerId = null; // Will be set when client sends join message

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);

      if (msg.type === 'join') {
        playerId = msg.id;
        players[playerId] = { 
          id: playerId,
          score: msg.score || 0, 
          name: msg.name || "Player" + playerId.toString().slice(-4), 
          x: msg.x || 400, 
          y: msg.y || 300,
          trail: [],
          lastUpdate: Date.now()
        };
        
        console.log(`Player ${playerId} joined`);
        
        // Send current state to new player
        ws.send(JSON.stringify({ type: 'playerStates', data: players }));
      }
      
      if (msg.type === 'updateScore') {
        if (playerId && players[playerId]) {
          players[playerId].score = msg.score;
          players[playerId].lastUpdate = Date.now();
        }
      }

      if (msg.type === 'updateState') {
        if (msg.id && players[msg.id]) {
          // Update player state with validation
          if (Number.isFinite(msg.x)) players[msg.id].x = msg.x;
          if (Number.isFinite(msg.y)) players[msg.id].y = msg.y;
          if (Number.isFinite(msg.score)) players[msg.id].score = msg.score;
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

// Broadcast player states regularly
setInterval(() => {
  const now = Date.now();
  
  // Remove players that haven't updated in 30 seconds (disconnected)
  for (const id in players) {
    if (now - players[id].lastUpdate > 30000) {
      console.log(`Removing inactive player ${id}`);
      delete players[id];
    }
  }
  
  // Only broadcast if there are active clients
  if (wss.clients.size > 0) {
    const update = JSON.stringify({ type: 'playerStates', data: players });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(update);
        } catch (error) {
          console.error('Error sending to client:', error);
        }
      }
    });
  }
}, 50); // 20 times per second

// Health check endpoint (if needed for monitoring)
const http = require('http');
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      players: Object.keys(players).length,
      connections: wss.clients.size 
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Use the same port for HTTP health checks
server.listen(8081, '0.0.0.0', () => {
  console.log('Health check server running on http://0.0.0.0:8081/health');
});

console.log("WebSocket server running on ws://0.0.0.0:8080");
console.log("Use 'node server.js' to start the server");