/**
 * 模擬後端的共同介面。
 *
 * 每個後端（自製 WASM 核心、FBNeo 街機、EmulatorJS、N64）各自實作一份 adapter，
 * 其他模組只透過 getActiveBackend() 呼叫，不再自行判斷「現在是哪個後端」。
 * 新增一個後端時：實作這個介面，並在 registry.ts 登錄即可。
 */
export type BackendId = 'wasm' | 'fbneo' | 'snes9x' | 'mupen64';

export interface EmulatorBackend {
  readonly id: BackendId;

  /** 是否支援即時存檔欄位與自動存檔快照（N64 只有遊戲內建存檔）。 */
  readonly supportsSaveStates: boolean;
  /** 是否支援快轉。 */
  readonly supportsFastForward: boolean;
  /** 目前遊戲是否有第二玩家。 */
  supportsPlayerTwo(): boolean;
  /** 不能倒帶時回傳要顯示給玩家的原因；可以倒帶時回傳 null。 */
  rewindBlockedReason(): string | null;

  /**
   * 存檔 key 裡的核心標籤，例如 emu_savestate_<tag>_<rom>_<slot>。
   * 決定玩家既有存檔的位置，**不可更改**。
   */
  saveKeyTag(): string;

  /** 開始或繼續執行（呼叫端已恢復音訊）。 */
  resume(): void;
  /** 暫停執行（呼叫端已把 runtime.isRunning 設為 false 並同步音訊狀態）。 */
  pause(): void;
  /** 把目前畫面畫到畫布上；畫面由後端自己的 iframe／WebGL 輸出時不做事。 */
  render(): void;
  /** 選單的「重置遊戲」。 */
  reset(): void;

  /** 同步即時存檔（主控台 window.saveState 與街機觸控存檔鈕）。 */
  saveStateNow(slot: number): boolean;
  loadStateNow(slot: number): boolean;
  /** 玩家操作的即時存檔：可跨重新整理保存。 */
  saveState(slot: number): Promise<boolean>;
  loadState(slot: number): Promise<boolean>;

  /** 自動存檔用的完整快照（必須在核心被拆掉之前同步擷取）。 */
  captureSnapshot(): Uint8Array | null;
  restoreSnapshot(data: Uint8Array): boolean;

  /** 遊戲內建電池存檔（SRAM）。 */
  persistBatterySave(): void;
  restoreBatterySave(): void;

  /** 後端自己處理快轉時套用倍率（1 = 正常速度）；以幀迴圈快轉的後端不做事。 */
  applySpeed(multiplier: number): void;

  /** 主控台 window.exportSaveToFile：把目前狀態下載成檔案。 */
  exportStateFile(): void;
}
