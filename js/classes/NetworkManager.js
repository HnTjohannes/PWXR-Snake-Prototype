  export class NetworkManager {
    constructor(playerId, playerName) {
      this.playerId = playerId;
      this.playerName = playerName;
      this.ws = null;
      this.isConnected = false;
      this.lastStateSent = 0;
      this.onMessage = null;
      this.onStatusChange = null;
    }

    connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(`${protocol}//${window.location.host}`);
      
      this.ws.onopen = () => {
        this.isConnected = true;
        this.onStatusChange?.(true);
        this.send({
          type: "join",
          id: this.playerId,
          name: this.playerName,
          x: 400,
          y: 300
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.onMessage?.(msg);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.onStatusChange?.(false);
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        this.isConnected = false;
        this.onStatusChange?.(false);
      };
    }

    send(data) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(data));
      }
    }

    sendState(head, trail) {
      const now = performance.now();
      if (now - this.lastStateSent > 50) {
        this.send({
          type: "updateState",
          id: this.playerId,
          name: this.playerName,
          x: head.x,
          y: head.y,
          trail: trail.slice(-30)
        });
        this.lastStateSent = now;
      }
    }

    collectPoint(pointId) {
      this.send({
        type: "collectPoint",
        pointId: pointId
      });
    }

    captureStatics(staticIds) {
      this.send({
        type: "captureStatic",
        staticIds: staticIds
      });
    }

    sendShockwave(x, y, radius) {
  this.send({
    type: "shockwave",
    x: x,
    y: y,
    radius: radius
  });
}
  }
