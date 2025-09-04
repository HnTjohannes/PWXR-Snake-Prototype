class UIManager {
  constructor() {
    this.scoreElement = document.getElementById("score");
    this.lengthElement = document.getElementById("len");
    this.statusElement = document.getElementById("connectionStatus");
    this.multiHUD = document.getElementById("multiHUD");
  }

  updateScore(score) {
    if (this.scoreElement) {
      this.scoreElement.textContent = score;
    }
  }

  updateLength(length) {
    if (this.lengthElement) {
      this.lengthElement.textContent = length;
    }
  }

  updateConnectionStatus(connected) {
    if (this.statusElement) {
      this.statusElement.textContent = connected ? "Connected" : "Disconnected";
      this.statusElement.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
    }
  }

  updatePlayerList(playerName, playerScore, otherPlayers) {
    if (!this.multiHUD) return;
    
    this.multiHUD.innerHTML = "";
    
    const ourDiv = document.createElement("div");
    ourDiv.textContent = `${playerName}: ${playerScore}`;
    ourDiv.style.color = "#fff";
    ourDiv.style.marginBottom = "4px";
    this.multiHUD.appendChild(ourDiv);
    
    for (const id in otherPlayers) {
      const player = otherPlayers[id];
      if (player) {
        const div = document.createElement("div");
        div.textContent = `${player.name || 'Player'}: ${player.score || 0}`;
        div.style.color = "#94a3b8";
        div.style.marginBottom = "2px";
        this.multiHUD.appendChild(div);
      }
    }
  }
}