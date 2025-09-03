// server.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080, host: '0.0.0.0' });

let players = {}; // { playerId: {score, name} }
let playerStates = {};

wss.on('connection', (ws) => {
  const playerId = Date.now() + Math.random(); // eenvoudige unieke id
  players[playerId] = { score: 0, name: "Player" + playerId.toString().slice(-4) };

  // Stuur alle huidige scores naar nieuwe speler
  ws.send(JSON.stringify({ type: 'allScores', data: players }));

  ws.on('message', (message) => {
    const msg = JSON.parse(message);

    if (msg.type === 'state') {
      playerStates[msg.id] = {
        head: msg.head,
        trail: msg.trail,
        score: msg.score,
        name: msg.name
      };
      // Broadcast all states to all clients
      const update = JSON.stringify({ type: 'allStates', data: playerStates });
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(update);
      });
  }

    if (msg.type === 'updateScore') {
    players[playerId].score = msg.score;

    // Broadcast scores naar alle verbonden clients
    const update = JSON.stringify({ type: 'allScores', data: players });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(update);
    });
  }

  });

  ws.on('close', () => {
    delete players[playerId];
    const update = JSON.stringify({ type: 'allScores', data: players });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(update);
    });
  });
});

console.log("WebSocket server draait op ws://localhost:8080");
