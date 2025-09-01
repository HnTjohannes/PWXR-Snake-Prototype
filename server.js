// server.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

let players = {}; // { playerId: {score, name} }

wss.on('connection', (ws) => {
  const playerId = Date.now() + Math.random(); // eenvoudige unieke id
  players[playerId] = { score: 0, name: "Player" + playerId.toString().slice(-4) };

  // Stuur alle huidige scores naar nieuwe speler
  ws.send(JSON.stringify({ type: 'allScores', data: players }));

  ws.on('message', (message) => {
    const msg = JSON.parse(message);

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
