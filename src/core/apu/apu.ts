/**
 * NES APU (Audio Processing Unit) 模擬器
 * 
 * APU 規格：
 * - 2 個脈衝波 (Pulse/Square) 通道
 * - 1 個三角波 (Triangle) 通道
 * - 1 個雜訊 (Noise) 通道
 * - 1 個 DMC (Delta Modulation Channel) 通道
 * 
 * 暫存器映射 ($4000-$4017):
 * $4000-$4003: 脈衝波 1
 * $4004-$4007: 脈衝波 2
 * $4008-$400B: 三角波
 * $400C-$400F: 雜訊
 * $4010-$4013: DMC
 * $4015: 狀態/控制
 * $4017: 幀計數器
 */

import { PulseChannel } from './channels/pulse';
import { TriangleChannel } from './channels/triangle';
import { NoiseChannel } from './channels/noise';
import { DmcChannel } from './channels/dmc';
import { FrameCounter } from './frame-counter';

/**
 * 音頻回調函數類型
 */
export type AudioCallback = (sample: number) => void;

/**
 * APU 類別
 */
export class Apu {
  // ===== 音頻通道 =====
  /** 脈衝波通道 1 */
  private pulse1: PulseChannel;
  
  /** 脈衝波通道 2 */
  private pulse2: PulseChannel;
  
  /** 三角波通道 */
  private triangle: TriangleChannel;
  
  /** 雜訊通道 */
  private noise: NoiseChannel;
  
  /** DMC 通道 */
  private dmc: DmcChannel;

  // ===== 幀計數器 =====
  /** 幀計數器 */
  private frameCounter: FrameCounter;

  // ===== 狀態 =====
  /** 狀態暫存器 ($4015) */
  private statusRegister: number = 0;

  /** 時鐘計數器 */
  private clockCounter: number = 0;

  /** 取樣計數器 */
  private sampleCounter: number = 0;

  /** 取樣率 */
  private sampleRate: number = 44100;

  /** NES CPU 時鐘頻率 */
  private readonly CPU_FREQUENCY: number = 1789773;

  /** 每個取樣的 CPU 週期數 */
  private cyclesPerSample: number;

  /** 音頻回調 */
  private audioCallback: AudioCallback | null = null;

  /** 音頻緩衝區 (環形緩衝區) */
  private audioBuffer: Float32Array;
  private writeIndex: number = 0;
  private readIndex: number = 0;
  private readonly BUFFER_SIZE: number = 8192; // 增大緩衝區

  /** 低通濾波器狀態 */
  private filterAccumulator: number = 0;
  private readonly FILTER_COEFFICIENT: number = 0.9; // 提高濾波強度

  /** 高通濾波器狀態 (移除直流偏移) */
  private highPassPrev: number = 0;
  private highPassOutput: number = 0;
  private readonly HIGHPASS_COEFFICIENT: number = 0.996;



  constructor() {
    this.pulse1 = new PulseChannel(true); // 通道 1 有掃頻否定差異
    this.pulse2 = new PulseChannel(false);
    this.triangle = new TriangleChannel();
    this.noise = new NoiseChannel();
    this.dmc = new DmcChannel();

    this.frameCounter = new FrameCounter();

    this.cyclesPerSample = this.CPU_FREQUENCY / this.sampleRate;
    this.audioBuffer = new Float32Array(this.BUFFER_SIZE);

    this.reset();
  }

  /**
   * 重置 APU
   */
  public reset(): void {
    this.pulse1.reset();
    this.pulse2.reset();
    this.triangle.reset();
    this.noise.reset();
    this.dmc.reset();
    this.frameCounter.reset();

    this.statusRegister = 0;
    this.clockCounter = 0;
    this.sampleCounter = 0;
    this.writeIndex = 0;
    this.readIndex = 0;
    this.filterAccumulator = 0;
    this.highPassPrev = 0;
    this.highPassOutput = 0;
    this.audioBuffer.fill(0);
  }

  /**
   * 設定音頻回調
   */
  public setAudioCallback(callback: AudioCallback): void {
    this.audioCallback = callback;
  }

  /**
   * 設定取樣率
   */
  public setSampleRate(rate: number): void {
    this.sampleRate = rate;
    this.cyclesPerSample = this.CPU_FREQUENCY / rate;
  }

  /**
   * 設定記憶體讀取器 (用於 DMC)
   */
  public setMemoryReader(reader: (address: number) => number): void {
    this.dmc.setMemoryReader(reader);
  }

  /**
   * 設定 IRQ 回調
   */
  public setIrqCallback(callback: () => void): void {
    this.frameCounter.setIrqCallback(callback);
    this.dmc.setIrqCallback(callback);
  }

  /**
   * CPU 時鐘
   * APU 每個 CPU 週期執行一次
   */
  public clock(): void {
    // 三角波每個 CPU 週期更新
    this.triangle.clockTimer();

    // 其他通道每 2 個 CPU 週期更新一次 (APU 週期)
    if (this.clockCounter % 2 === 0) {
      this.pulse1.clockTimer();
      this.pulse2.clockTimer();
      this.noise.clockTimer();
      this.dmc.clockTimer();
    }

    // 幀計數器
    const frameAction = this.frameCounter.clock();
    if (frameAction) {
      this.handleFrameAction(frameAction);
    }

    // 生成取樣
    this.sampleCounter += 1;
    if (this.sampleCounter >= this.cyclesPerSample) {
      this.sampleCounter -= this.cyclesPerSample;
      this.generateSample();
    }

    this.clockCounter++;
  }

  /**
   * 處理幀計數器動作
   */
  private handleFrameAction(action: number): void {
    // Bit 0: 包絡線 & 三角波線性計數器
    if (action & 1) {
      this.pulse1.clockEnvelope();
      this.pulse2.clockEnvelope();
      this.triangle.clockLinearCounter();
      this.noise.clockEnvelope();
    }

    // Bit 1: 長度計數器 & 掃頻
    if (action & 2) {
      this.pulse1.clockLengthCounter();
      this.pulse1.clockSweep();
      this.pulse2.clockLengthCounter();
      this.pulse2.clockSweep();
      this.triangle.clockLengthCounter();
      this.noise.clockLengthCounter();
    }
  }

  /**
   * 生成一個音頻取樣
   */
  private generateSample(): void {
    // 取得各通道輸出 (0-15 範圍)
    const pulse1 = this.pulse1.output();
    const pulse2 = this.pulse2.output();
    const triangle = this.triangle.output();
    const noise = this.noise.output();
    const dmc = this.dmc.output();

    // 混音 (使用 NES 非線性混音公式)
    const pulseOut = this.mixPulse(pulse1, pulse2);
    const tndOut = this.mixTnd(triangle, noise, dmc);

    // 合併 (輸出範圍約 0 到 1)
    let sample = pulseOut + tndOut;
    
    // 應用低通濾波器減少高頻噪音
    this.filterAccumulator = this.filterAccumulator * this.FILTER_COEFFICIENT + 
                             sample * (1 - this.FILTER_COEFFICIENT);
    sample = this.filterAccumulator;

    // 應用高通濾波器移除直流偏移
    const input = sample;
    this.highPassOutput = this.HIGHPASS_COEFFICIENT * this.highPassOutput + 
                          input - this.highPassPrev;
    this.highPassPrev = input;
    sample = this.highPassOutput;
    
    // 縮放到 [-1, 1] 範圍並調整音量
    sample = sample * 1.5; // 適度放大
    
    // 軟削波避免爆音
    if (sample > 0.95) {
      sample = 0.95 + (sample - 0.95) * 0.2;
    } else if (sample < -0.95) {
      sample = -0.95 + (sample + 0.95) * 0.2;
    }
    
    // 最終限制
    sample = Math.max(-1, Math.min(1, sample));

    // 寫入環形緩衝區
    this.audioBuffer[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) % this.BUFFER_SIZE;
  }

  /**
   * 脈衝波混音 (非線性)
   * 輸出範圍: 0 到約 0.26
   */
  private mixPulse(pulse1: number, pulse2: number): number {
    const sum = pulse1 + pulse2;
    if (sum === 0) {
      return 0;
    }
    return 95.88 / (8128 / sum + 100);
  }

  /**
   * 三角波/雜訊/DMC 混音 (非線性)
   * 輸出範圍: 0 到約 0.74
   */
  private mixTnd(triangle: number, noise: number, dmc: number): number {
    if (triangle === 0 && noise === 0 && dmc === 0) {
      return 0;
    }
    const tnd = triangle / 8227 + noise / 12241 + dmc / 22638;
    if (tnd === 0) {
      return 0;
    }
    return 159.79 / (1 / tnd + 100);
  }

  /**
   * CPU 讀取暫存器
   */
  public cpuRead(address: number): number {
    if (address === 0x4015) {
      return this.readStatus();
    }
    return 0;
  }

  /**
   * CPU 寫入暫存器
   */
  public cpuWrite(address: number, data: number): void {
    data &= 0xFF;

    switch (address) {
      // 脈衝波 1
      case 0x4000:
        this.pulse1.writeControl(data);
        break;
      case 0x4001:
        this.pulse1.writeSweep(data);
        break;
      case 0x4002:
        this.pulse1.writeTimerLow(data);
        break;
      case 0x4003:
        this.pulse1.writeTimerHigh(data);
        break;

      // 脈衝波 2
      case 0x4004:
        this.pulse2.writeControl(data);
        break;
      case 0x4005:
        this.pulse2.writeSweep(data);
        break;
      case 0x4006:
        this.pulse2.writeTimerLow(data);
        break;
      case 0x4007:
        this.pulse2.writeTimerHigh(data);
        break;

      // 三角波
      case 0x4008:
        this.triangle.writeControl(data);
        break;
      case 0x400A:
        this.triangle.writeTimerLow(data);
        break;
      case 0x400B:
        this.triangle.writeTimerHigh(data);
        break;

      // 雜訊
      case 0x400C:
        this.noise.writeControl(data);
        break;
      case 0x400E:
        this.noise.writePeriod(data);
        break;
      case 0x400F:
        this.noise.writeLength(data);
        break;

      // DMC
      case 0x4010:
        this.dmc.writeControl(data);
        break;
      case 0x4011:
        this.dmc.writeDirectLoad(data);
        break;
      case 0x4012:
        this.dmc.writeAddress(data);
        break;
      case 0x4013:
        this.dmc.writeLength(data);
        break;

      // 狀態
      case 0x4015:
        this.writeStatus(data);
        break;

      // 幀計數器
      case 0x4017:
        this.frameCounter.write(data);
        break;
    }
  }

  /**
   * 讀取狀態暫存器
   */
  private readStatus(): number {
    let status = 0;

    if (this.pulse1.getLengthCounter() > 0) status |= 0x01;
    if (this.pulse2.getLengthCounter() > 0) status |= 0x02;
    if (this.triangle.getLengthCounter() > 0) status |= 0x04;
    if (this.noise.getLengthCounter() > 0) status |= 0x08;
    if (this.dmc.getBytesRemaining() > 0) status |= 0x10;

    // 幀 IRQ
    if (this.frameCounter.getIrqFlag()) {
      status |= 0x40;
    }
    this.frameCounter.clearIrqFlag();

    // DMC IRQ
    if (this.dmc.getIrqFlag()) {
      status |= 0x80;
    }

    return status;
  }

  /**
   * 寫入狀態暫存器
   */
  private writeStatus(data: number): void {
    this.statusRegister = data;

    this.pulse1.setEnabled((data & 0x01) !== 0);
    this.pulse2.setEnabled((data & 0x02) !== 0);
    this.triangle.setEnabled((data & 0x04) !== 0);
    this.noise.setEnabled((data & 0x08) !== 0);
    this.dmc.setEnabled((data & 0x10) !== 0);
  }

  /**
   * 從環形緩衝區讀取音頻取樣
   * @param outputBuffer 輸出緩衝區
   * @returns 實際讀取的取樣數
   */
  public readSamples(outputBuffer: Float32Array): number {
    let samplesRead = 0;
    const length = outputBuffer.length;
    
    // 計算可用的取樣數
    const available = this.getAvailableSamples();
    
    if (available === 0) {
      // 緩衝區空，靜音輸出（漸變到0避免爆音）
      for (let i = 0; i < length; i++) {
        outputBuffer[i] = 0;
      }
      return 0;
    }
    
    // 如果可用取樣少於需要的量，進行線性插值以避免爆音
    if (available < length) {
      // 讀取所有可用的取樣
      const tempBuffer: number[] = [];
      while (this.readIndex !== this.writeIndex) {
        tempBuffer.push(this.audioBuffer[this.readIndex]);
        this.readIndex = (this.readIndex + 1) % this.BUFFER_SIZE;
      }
      
      // 線性插值以填滿輸出緩衝區
      const ratio = tempBuffer.length / length;
      for (let i = 0; i < length; i++) {
        const pos = i * ratio;
        const index = Math.floor(pos);
        const frac = pos - index;
        const current = tempBuffer[Math.min(index, tempBuffer.length - 1)];
        const next = tempBuffer[Math.min(index + 1, tempBuffer.length - 1)];
        outputBuffer[i] = current * (1 - frac) + next * frac;
      }
      return length;
    }
    
    // 正常情況：直接從緩衝區讀取
    while (samplesRead < length && this.readIndex !== this.writeIndex) {
      outputBuffer[samplesRead] = this.audioBuffer[this.readIndex];
      this.readIndex = (this.readIndex + 1) % this.BUFFER_SIZE;
      samplesRead++;
    }
    
    return samplesRead;
  }

  /**
   * 取得緩衝區中可用的取樣數
   */
  public getAvailableSamples(): number {
    if (this.writeIndex >= this.readIndex) {
      return this.writeIndex - this.readIndex;
    }
    return this.BUFFER_SIZE - this.readIndex + this.writeIndex;
  }

  // ===== 序列化 (用於存檔) =====

  /**
   * 儲存狀態
   */
  public saveState(): object {
    return {
      pulse1: this.pulse1.saveState(),
      pulse2: this.pulse2.saveState(),
      triangle: this.triangle.saveState(),
      noise: this.noise.saveState(),
      dmc: this.dmc.saveState(),
      frameCounter: this.frameCounter.saveState(),
      statusRegister: this.statusRegister,
      clockCounter: this.clockCounter,
    };
  }

  /**
   * 載入狀態
   */
  public loadState(state: any): void {
    this.pulse1.loadState(state.pulse1);
    this.pulse2.loadState(state.pulse2);
    this.triangle.loadState(state.triangle);
    this.noise.loadState(state.noise);
    this.dmc.loadState(state.dmc);
    this.frameCounter.loadState(state.frameCounter);
    this.statusRegister = state.statusRegister;
    this.clockCounter = state.clockCounter;
  }
}
