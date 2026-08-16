class N64AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.chunkOffset = 0;
    this.bufferedFrames = 0;
    this.primed = false;
    this.lastLeft = 0;
    this.lastRight = 0;
    this.running = true;
    this.muted = false;

    this.port.onmessage = event => {
      const message = event.data;
      if (message.type === 'samples') {
        if (!this.running || this.muted || !(message.samples instanceof Float32Array)) return;
        if (message.samples.length < 2) return;
        this.chunks.push(message.samples);
        this.bufferedFrames += message.samples.length / 2;
        while (this.bufferedFrames > 6144 && this.chunks.length > 1) {
          const dropped = this.chunks.shift();
          this.bufferedFrames -= (dropped.length - this.chunkOffset) / 2;
          this.chunkOffset = 0;
        }
      } else if (message.type === 'state') {
        this.running = message.running === true;
        this.muted = message.muted === true;
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

  writeSilentFrame(left, right, index) {
    this.lastLeft *= 0.995;
    this.lastRight *= 0.995;
    left[index] = this.lastLeft;
    right[index] = this.lastRight;
  }

  writeNextFrame(left, right, index) {
    if (!this.primed) {
      if (this.bufferedFrames < 1024) {
        this.writeSilentFrame(left, right, index);
        return;
      }
      this.primed = true;
    }

    while (this.chunks.length > 0) {
      const chunk = this.chunks[0];
      if (this.chunkOffset + 1 < chunk.length) {
        this.lastLeft = chunk[this.chunkOffset];
        this.lastRight = chunk[this.chunkOffset + 1];
        this.chunkOffset += 2;
        this.bufferedFrames--;
        left[index] = this.lastLeft;
        right[index] = this.lastRight;
        return;
      }
      this.chunks.shift();
      this.chunkOffset = 0;
    }

    this.primed = false;
    this.writeSilentFrame(left, right, index);
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output?.[0];
    const right = output?.[1] ?? left;
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

registerProcessor('n64-audio-processor', N64AudioProcessor);
