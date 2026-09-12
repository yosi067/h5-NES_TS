const N64_AUDIO_PRIME_FRAMES = 1024;
const N64_AUDIO_HIGH_WATER_FRAMES = 6144;
const N64_AUDIO_RESUME_FADE_FRAMES = 64;

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
    this.resumeFadePending = false;
    this.resumeFadeRemaining = 0;
    this.resumeFadeFromLeft = 0;
    this.resumeFadeFromRight = 0;
    this.diagnostics = null;
    this.diagnosticRunning = true;
    this.diagnosticMuted = false;
    this.lifecycleGeneration = null;
    this.heartbeatFrames = 0;

    this.port.onmessage = event => {
      const message = event.data;
      if (message.type === 'lifecycle') {
        this.lifecycleGeneration = message.generation;
        this.heartbeatFrames = sampleRate;
      } else if (message.type === 'diagnostics') {
        if (message.enabled === true && !this.diagnostics) {
          this.diagnostics = {
            renderedFrames: 0, steadyFrames: 0, excludedFrames: 0,
            primingFrames: 0, pausedFrames: 0, mutedFrames: 0, clearEvents: 0,
            underflowFrames: 0, underflowEvents: 0, longestGapFrames: 0,
            gapFrames: 0, droppedFrames: 0, dropEvents: 0,
            queueMinFrames: null, queueMaxFrames: null, sequence: 0,
          };
        } else if (message.enabled !== true) this.diagnostics = null;
      } else if (message.type === 'diagnostics-state') {
        // Measurement exclusions only: never change playback or flush PCM.
        this.diagnosticRunning = message.running === true;
        this.diagnosticMuted = message.muted === true;
        if (this.diagnostics) this.diagnostics.gapFrames = 0;
      } else if (message.type === 'samples') {
        if (!this.running || this.muted || !(message.samples instanceof Float32Array)) return;
        if (message.samples.length < 2) return;
        this.chunks.push(message.samples);
        this.bufferedFrames += message.samples.length / 2;
        while (this.bufferedFrames > N64_AUDIO_HIGH_WATER_FRAMES && this.chunks.length > 1) {
          const dropped = this.chunks.shift();
          const droppedFrames = (dropped.length - this.chunkOffset) / 2;
          this.bufferedFrames -= droppedFrames;
          if (this.diagnostics && this.primed && this.diagnosticRunning && !this.diagnosticMuted) {
            this.diagnostics.droppedFrames += droppedFrames;
            this.diagnostics.dropEvents++;
          }
          this.chunkOffset = 0;
        }
        if (this.primed) this.observeQueue();
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
    if (this.diagnostics) {
      this.diagnostics.gapFrames = 0;
      this.diagnostics.clearEvents++;
    }
    this.chunks.length = 0;
    this.chunkOffset = 0;
    this.bufferedFrames = 0;
    this.primed = false;
    this.lastLeft = 0;
    this.lastRight = 0;
    this.resumeFadePending = false;
    this.resumeFadeRemaining = 0;
    this.resumeFadeFromLeft = 0;
    this.resumeFadeFromRight = 0;
  }

  writeSilentFrame(left, right, index) {
    this.lastLeft *= 0.995;
    this.lastRight *= 0.995;
    left[index] = this.lastLeft;
    right[index] = this.lastRight;
  }

  observeQueue() {
    const d = this.diagnostics;
    if (!d || !this.diagnosticRunning || this.diagnosticMuted) return;
    d.queueMinFrames = Math.min(d.queueMinFrames ?? this.bufferedFrames, this.bufferedFrames);
    d.queueMaxFrames = Math.max(d.queueMaxFrames ?? this.bufferedFrames, this.bufferedFrames);
  }

  recordOutput(frames, queuedBefore, active) {
    if (this.lifecycleGeneration !== null) {
      this.heartbeatFrames += frames;
      if (this.heartbeatFrames >= sampleRate) {
        this.heartbeatFrames = 0;
        this.port.postMessage({ type: 'n64-audio-heartbeat', generation: this.lifecycleGeneration, sampleRate });
      }
    }
    const d = this.diagnostics;
    if (!d) return;
    d.renderedFrames += frames;
    if (active && this.primed && this.diagnosticRunning && !this.diagnosticMuted) {
      d.steadyFrames += frames;
      const consumed = queuedBefore - this.bufferedFrames;
      const missing = frames - consumed;
      if (consumed > 0) d.gapFrames = 0;
      if (missing > 0) {
        if (d.gapFrames === 0) d.underflowEvents++;
        d.underflowFrames += missing;
        d.gapFrames += missing;
        d.longestGapFrames = Math.max(d.longestGapFrames, d.gapFrames);
      }
      d.queueMaxFrames = Math.max(d.queueMaxFrames ?? queuedBefore, queuedBefore);
      this.observeQueue();
    } else {
      d.excludedFrames += frames;
      if (!this.running || !this.diagnosticRunning) d.pausedFrames += frames;
      else if (this.muted || this.diagnosticMuted) d.mutedFrames += frames;
      else d.primingFrames += frames;
      d.gapFrames = 0;
    }
    // Cumulative snapshots, at most once per second of audio render time.
    // No main-thread clock and no per-quantum messages or logging.
    if (d.renderedFrames >= (d.sequence + 1) * sampleRate) {
      d.sequence = Math.floor(d.renderedFrames / sampleRate);
      this.port.postMessage({
        type: 'n64-audio-output', version: 1, mode: 'audio-worklet', sampleRate,
        ...d,
      });
    }
  }

  writeNextFrame(left, right, index) {
    if (!this.primed) {
      if (this.bufferedFrames < N64_AUDIO_PRIME_FRAMES) {
        this.writeSilentFrame(left, right, index);
        return;
      }
      this.primed = true;
    }

    while (this.chunks.length > 0) {
      const chunk = this.chunks[0];
      if (this.chunkOffset + 1 < chunk.length) {
        const incomingLeft = chunk[this.chunkOffset];
        const incomingRight = chunk[this.chunkOffset + 1];
        let outputLeft = incomingLeft;
        let outputRight = incomingRight;
        if (this.resumeFadePending) {
          this.resumeFadeFromLeft = this.lastLeft;
          this.resumeFadeFromRight = this.lastRight;
          this.resumeFadeRemaining = N64_AUDIO_RESUME_FADE_FRAMES;
          this.resumeFadePending = false;
        }
        if (this.resumeFadeRemaining > 0) {
          const progress = 1 - this.resumeFadeRemaining / N64_AUDIO_RESUME_FADE_FRAMES;
          outputLeft = this.resumeFadeFromLeft * (1 - progress) + incomingLeft * progress;
          outputRight = this.resumeFadeFromRight * (1 - progress) + incomingRight * progress;
          this.resumeFadeRemaining--;
        }
        this.lastLeft = outputLeft;
        this.lastRight = outputRight;
        this.chunkOffset += 2;
        this.bufferedFrames--;
        left[index] = outputLeft;
        right[index] = outputRight;
        return;
      }
      this.chunks.shift();
      this.chunkOffset = 0;
    }

    this.resumeFadePending = true;
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
      this.recordOutput(left.length, this.bufferedFrames, false);
      return true;
    }

    const queuedBefore = this.bufferedFrames;
    for (let index = 0; index < left.length; index++) {
      this.writeNextFrame(left, right, index);
    }
    this.recordOutput(left.length, queuedBefore, true);
    return true;
  }
}

registerProcessor('n64-audio-processor', N64AudioProcessor);
