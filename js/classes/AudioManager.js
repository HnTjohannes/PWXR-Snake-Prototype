class AudioManager {
  constructor() {
    this.ctx = null;
    this.isRunning = false;
    this.bpm = CONSTANTS.AUDIO.BPM;
    this.nextTime = 0;
    this.sequence = CONSTANTS.AUDIO.SEQUENCE;
    this.index = 0;
    this.baseHz = CONSTANTS.AUDIO.BASE_FREQUENCY;
    this.beatPulse = 0;
    this.beatIndex = 0;
  }

  start() {
    if (this.isRunning) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.isRunning = true;
      this.nextTime = this.ctx.currentTime + 0.05;
    } catch (e) {
      console.warn('Audio not supported:', e);
    }
  }

  stop() {
    if (!this.isRunning) return;
    try {
      this.ctx?.close();
      this.ctx = null;
      this.isRunning = false;
    } catch (e) {
      console.warn('Error stopping audio:', e);
    }
  }

  toggle() {
    this.isRunning ? this.stop() : this.start();
  }

  update() {
    this.beatPulse = Math.max(0, this.beatPulse - CONSTANTS.AUDIO.BEAT_DECAY);
    this.scheduleNotes();
  }

  scheduleNotes() {
    if (!this.isRunning || !this.ctx) return;
    
    try {
      const interval = 60 / this.bpm;
      while (this.nextTime < this.ctx.currentTime + 0.12) {
        const note = this.sequence[this.index % this.sequence.length];
        const freq = this.baseHz * Math.pow(2, note / 12);
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, this.nextTime);
        gain.gain.setValueAtTime(0.001, this.nextTime);
        gain.gain.exponentialRampToValueAtTime(0.2, this.nextTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, this.nextTime + 0.18);
        
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(this.nextTime);
        osc.stop(this.nextTime + 0.2);
        
        setTimeout(() => {
          this.beatPulse = 1;
          this.beatIndex++;
        }, Math.max(0, (this.nextTime - this.ctx.currentTime) * 1000));
        
        this.nextTime += interval;
        this.index++;
      }
    } catch (e) {
      console.warn('Error scheduling audio:', e);
    }
  }
}