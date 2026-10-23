/**
 * 倒帶快照環形緩衝。依快照大小自動限制數量，避免大型 NES/SNES 狀態吃光手機記憶體。
 */
export interface RewindOptions {
  /** 每隔幾個模擬幀擷取一次快照。 */
  captureInterval: number;
  /** 最多保留幾秒（以 60fps 估算）。 */
  maxSeconds: number;
  /** 全部快照合計的大約上限（位元組）。 */
  memoryBudget: number;
  /** 即使快照很大，也至少保留幾份。 */
  minSnapshots: number;
}

export const DEFAULT_REWIND_OPTIONS: Readonly<RewindOptions> = Object.freeze({
  captureInterval: 30,
  maxSeconds: 10,
  memoryBudget: 32 * 1024 * 1024,
  minSnapshots: 4,
});

export function snapshotSize(snapshot: string | Uint8Array): number {
  return typeof snapshot === 'string' ? snapshot.length : snapshot.byteLength;
}

export class RewindBuffer<T extends string | Uint8Array> {
  private snapshots: T[] = [];
  private framesSinceCapture = 0;
  private capacity: number;
  readonly options: RewindOptions;

  constructor(options: Partial<RewindOptions> = {}) {
    this.options = { ...DEFAULT_REWIND_OPTIONS, ...options };
    this.capacity = this.maxByTime();
  }

  private maxByTime(): number {
    return Math.max(1, Math.ceil((this.options.maxSeconds * 60) / this.options.captureInterval));
  }

  get length(): number {
    return this.snapshots.length;
  }

  get maxSnapshots(): number {
    return this.capacity;
  }

  /** 每執行一個模擬幀呼叫一次；回傳此幀是否該擷取快照。 */
  tick(): boolean {
    this.framesSinceCapture++;
    if (this.framesSinceCapture < this.options.captureInterval) return false;
    this.framesSinceCapture = 0;
    return true;
  }

  push(snapshot: T): void {
    const size = snapshotSize(snapshot);
    if (size <= 0) return;
    const byBudget = Math.floor(this.options.memoryBudget / size);
    this.capacity = Math.max(this.options.minSnapshots, Math.min(this.maxByTime(), byBudget));
    this.snapshots.push(snapshot);
    while (this.snapshots.length > this.capacity) this.snapshots.shift();
  }

  /** 取出最新的一份快照（倒帶一步）；空時回傳 null。保留最舊的一份，讓長按到底停在最早位置。 */
  pop(): T | null {
    if (this.snapshots.length === 0) return null;
    if (this.snapshots.length === 1) return this.snapshots[0];
    return this.snapshots.pop() ?? null;
  }

  clear(): void {
    this.snapshots = [];
    this.framesSinceCapture = 0;
    this.capacity = this.maxByTime();
  }

  /** 目前緩衝可倒回的大約秒數。 */
  secondsAvailable(): number {
    return (this.snapshots.length * this.options.captureInterval) / 60;
  }
}
