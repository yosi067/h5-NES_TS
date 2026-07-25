class EmulatorAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.chunkOffset = 0;
    this.bufferedFrames = 0;
    this.primed = false;
    this.lastLeft = 0;
    this.lastRight = 0;
    this.running = false;
    this.muted = false;

    this.port.onmessage = event => {
      const message = event.data;
      if (message.type === 'samples') {
        if (!this.muted && message.samples.length > 0) {
          const channels = message.channels === 2 ? 2 : 1;
          this.chunks.push({ samples: message.samples, channels });
          this.bufferedFrames += message.samples.length / channels;
          while (this.chunks.length > 24) {
            const dropped = this.chunks.shift();
            this.bufferedFrames -= (dropped.samples.length - this.chunkOffset) / dropped.channels;
            this.chunkOffset = 0;
          }
        }
      } else if (message.type === 'state') {
        this.running = message.running;
        this.muted = message.muted;
        if (!this.running || this.muted) this.clearQueue();
      } else if (message.type === 'clear') {
        this.clearQueue();
      }
    };
  }

  clearQueue() {
    this.chunks.length = 0;
    this.chunkOffset = 0;
    this.bufferedFrames = 0;
    this.primed = false;
    this.lastLeft = 0;
    this.lastRight = 0;
  }

  writeNextFrame(left, right, index) {
    if (!this.primed) {
      if (this.bufferedFrames < 1024) {
        this.lastLeft *= 0.995;
        this.lastRight *= 0.995;
        left[index] = this.lastLeft;
        right[index] = this.lastRight;
        return;
      }
      this.primed = true;
    }

    while (this.chunks.length > 0) {
      const chunk = this.chunks[0];
      if (this.chunkOffset < chunk.samples.length) {
        this.lastLeft = chunk.samples[this.chunkOffset];
        this.lastRight = chunk.channels === 2
          ? chunk.samples[this.chunkOffset + 1]
          : this.lastLeft;
        this.chunkOffset += chunk.channels;
        this.bufferedFrames--;
        left[index] = this.lastLeft;
        right[index] = this.lastRight;
        return;
      }
      this.chunks.shift();
      this.chunkOffset = 0;
    }

    this.primed = false;
    this.lastLeft *= 0.995;
    this.lastRight *= 0.995;
    left[index] = this.lastLeft;
    right[index] = this.lastRight;
  }

  process(_inputs, outputs) {
    const left = outputs[0][0];
    const right = outputs[0][1];
    if (!left || !right) return true;

    if (!this.running || this.muted) {
      left.fill(0);
      right.fill(0);
      return true;
    }

    for (let index = 0; index < left.length; index++) {
      this.writeNextFrame(left, right, index);
    }
    return true;
  }
}

registerProcessor('emulator-audio-processor', EmulatorAudioProcessor);
