class EmulatorAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.chunkOffset = 0;
    this.bufferedSamples = 0;
    this.primed = false;
    this.lastSample = 0;
    this.running = false;
    this.muted = false;

    this.port.onmessage = event => {
      const message = event.data;
      if (message.type === 'samples') {
        if (!this.muted && message.samples.length > 0) {
          this.chunks.push(message.samples);
          this.bufferedSamples += message.samples.length;
          while (this.chunks.length > 24) {
            const dropped = this.chunks.shift();
            this.bufferedSamples -= dropped.length - this.chunkOffset;
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
    this.bufferedSamples = 0;
    this.primed = false;
    this.lastSample = 0;
  }

  nextSample() {
    if (!this.primed) {
      if (this.bufferedSamples < 1024) {
        this.lastSample *= 0.995;
        return this.lastSample;
      }
      this.primed = true;
    }

    while (this.chunks.length > 0) {
      const chunk = this.chunks[0];
      if (this.chunkOffset < chunk.length) {
        this.lastSample = chunk[this.chunkOffset++];
        this.bufferedSamples--;
        return this.lastSample;
      }
      this.chunks.shift();
      this.chunkOffset = 0;
    }

    this.primed = false;
    this.lastSample *= 0.995;
    return this.lastSample;
  }

  process(_inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;

    if (!this.running || this.muted) {
      output.fill(0);
      return true;
    }

    for (let index = 0; index < output.length; index++) {
      output[index] = this.nextSample();
    }
    return true;
  }
}

registerProcessor('emulator-audio-processor', EmulatorAudioProcessor);
