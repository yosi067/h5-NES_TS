/**
 * 自製 Rust/WASM 核心（FC、GB、GG、SMS、SFC）：初始化、載入 ROM 與狀態快照。
 */
import { mountCt2RuntimeTuning } from '../../game-profiles/ct2-runtime-tuning';
import { CT2_SOURCE_HASHES, type LocalizationAssets, validateLocalizationAssets } from '../../game-profiles/localization';
import { NesTextOverlay } from '../../game-profiles/text-overlay';
import { type CellMenuCatalog, validateCellMenus, ZOMBIE_HUNTER_HASH } from '../../game-profiles/verified-cell-menus';
import { VerifiedMenuOverlay } from '../../game-profiles/verified-menu-overlay';
import { mountZombieRuntimeTuning } from '../../game-profiles/zombie-runtime-tuning';
import { shouldUseSnes9x } from '../../snes/snes9x-backend';
import init, { EmuWasm } from '../../wasm/nes_wasm.js';
import { runtime } from '../../app/runtime';
import { isAbortError, throwIfSignalAborted } from '../../app/async';
import { sha256Hex } from '../../app/storage';
import { audioContext, audioMuted, clearAudioQueue, resumeAudio } from '../../audio/audio-output';
import { startSnes9xGame, stopSnes9xBackend } from '../emulatorjs-backend';
import { stopFbNeoBackend } from '../fbneo/fbneo-backend';
import { startEmulation } from '../lifecycle';
import { startN64Game, stopN64Backend } from '../n64/n64-backend';
import { activatePreparedGameProfile, prepareGameProfileForRom } from './game-profiles';
import type { PreparedGameProfile } from './game-profiles';
import { NES_OVERSCAN_BOTTOM, NES_OVERSCAN_TOP } from './native-render';
import { isN64RomName } from '../../catalog/machines';
import { resyncNativeButtons } from '../../input/native-input';
import { loadSram } from '../../saves/sram';
import { hideRomSelector } from '../../session/game-loader';
import { onGameStarted } from '../../session/game-session';
import { updateControllerLayout } from '../../ui/controller-layout';
import { showAppAlert } from '../../ui/dialogs';

export function resetWasmCore(): void {
  runtime.gameProfileTuningControls?.dispose();
  runtime.gameProfileTuningControls = null;
  runtime.textOverlay?.dispose();
  runtime.textOverlay = null;
  if (!runtime.nes) return;
  runtime.nes.free();
  runtime.nes = new EmuWasm();
  if (audioContext) runtime.nes.setAudioSampleRate(audioContext.sampleRate);
  window.nes = runtime.nes;
}


/**
 * 初始化模擬器（載入 WASM 模組）
 */
export async function initWasm(): Promise<void> {
  // 初始化 WASM 模組
  await init();

  // 建立統一模擬器實例（支援 NES 及 Game Boy）
  runtime.nes = new EmuWasm();

  if (audioContext) {
    runtime.nes.setAudioSampleRate(audioContext.sampleRate);
  }

  console.log('H5-NES 模擬器已初始化（WASM 核心）');
}


async function waitForWasmCore(): Promise<boolean> {
  if (runtime.nes) return true;

  try {
    if (runtime.wasmInitPromise) {
      await runtime.wasmInitPromise;
    }
  } catch (error) {
    console.error('WASM 核心初始化失敗:', error);
  }

  return runtime.nes !== null;
}


/**
 * 開始遊戲
 */
export async function startGame(
  romData: ArrayBuffer,
  signal?: AbortSignal,
): Promise<void> {
  throwIfSignalAborted(signal);
  runtime.gameProfileTuningControls?.dispose();
  runtime.gameProfileTuningControls = null;
  runtime.textOverlay?.dispose();
  runtime.textOverlay = null;
  runtime.activeGamePresentation = null;
  const romBytes = new Uint8Array(romData);
  
  // 根據副檔名選擇對應的載入方法
  const lower = runtime.currentRomFilename.toLowerCase();
  console.log(`[DEBUG] Loading ROM: "${runtime.currentRomFilename}", lower: "${lower}", size: ${romBytes.length}`);
  if (isN64RomName(runtime.currentRomFilename)) {
    await startN64Game(romData);
    return;
  }

  if (lower.endsWith('.md') || lower.endsWith('.gen') || lower.endsWith('.smd')) {
    await startSnes9xGame(romData, 'genesis', signal);
    return;
  }

  const isSnesRom = lower.endsWith('.smc') || lower.endsWith('.sfc') || lower.endsWith('.fig');
  if (isSnesRom && shouldUseSnes9x(romBytes, runtime.currentRomFilename)) {
    await startSnes9xGame(romData, 'snes', signal);
    return;
  }

  if (!(await waitForWasmCore()) || !runtime.nes) {
    await showAppAlert('模擬器核心尚未初始化完成，請稍候再試。');
    return;
  }

  await stopN64Backend();
  await stopSnes9xBackend();
  stopFbNeoBackend();
  runtime.activeBackend = 'wasm';
  let preparedProfile: PreparedGameProfile | null = null;
  let preparedRomBytes: Uint8Array = romBytes;
  let localizationAssets: LocalizationAssets | null = null;
  let cellMenus: CellMenuCatalog | null = null;
  if (lower.endsWith('.nes')) {
    try {
      const sourceHash = await sha256Hex(romBytes);
      if (sourceHash === ZOMBIE_HUNTER_HASH) {
        const response = await fetch(new URL('game-profiles/zombie-hunter-jp/menus.json', window.location.href), { signal });
        if (!response.ok) throw new Error(`menus HTTP ${response.status}`);
        cellMenus = await response.json();
        validateCellMenus(cellMenus!);
      } else if (CT2_SOURCE_HASHES.includes(sourceHash)) {
        // This route deliberately runs the ORIGINAL ROM. No BPS or font patch.
        const base = 'game-profiles/captain-tsubasa-2-jp/';
        const [catalog, runtime, menus] = await Promise.all(['localization.json', 'text-runtime.json', 'menus.json'].map(async name => {
          const response = await fetch(new URL(base + name, window.location.href), { signal });
          if (!response.ok) throw new Error(`localization HTTP ${response.status}`);
          return response.json();
        }));
        if (menus.sourceSha256 !== CT2_SOURCE_HASHES[0] || menus.format !== 'ct2-original-menu-definitions'
          || !Array.isArray(menus.entries) || menus.entries.length > 1000) throw new Error('選單來源不符');
        localizationAssets = { catalog, runtime, menus };
        validateLocalizationAssets(localizationAssets);
      } else {
        preparedProfile = await prepareGameProfileForRom(romBytes, signal);
        if (preparedProfile) preparedRomBytes = preparedProfile.romBytes;
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      console.warn('[NES] 遊戲設定檔準備失敗，將使用原始 ROM 執行', error);
      preparedProfile = null;
      preparedRomBytes = romBytes;
      localizationAssets = null;
      cellMenus = null;
    }
  }
  let loaded = false;
  if (lower.endsWith('.gg')) {
    loaded = runtime.nes.loadGgRom(romBytes);
  } else if (lower.endsWith('.sms')) {
    loaded = runtime.nes.loadSmsRom(romBytes);
  } else if (isSnesRom) {
    console.log(`[SNES] Attempting loadSnesRom, data size: ${romBytes.length}, first 4 bytes: ${romBytes[0].toString(16)} ${romBytes[1].toString(16)} ${romBytes[2].toString(16)} ${romBytes[3].toString(16)}`);
    try {
      loaded = runtime.nes.loadSnesRom(romBytes);
      console.log(`[SNES] loadSnesRom returned: ${loaded}`);
    } catch (e) {
      console.error('[SNES] loadSnesRom threw:', e);
    }
  } else {
    try {
      loaded = runtime.nes.loadRom(preparedRomBytes);
    } catch (error) {
      if (!lower.endsWith('.nes')) throw error;
      console.warn(`[NES] 原生 WASM 核心拒絕 ${runtime.currentRomFilename}，改用 FCEUmm`, error);
      await startSnes9xGame(romData, 'nes', signal);
      return;
    }
  }

  if (!loaded && isSnesRom) {
    throwIfSignalAborted(signal);
    console.warn(`[SNES] 原生 WASM 核心不支援 ${runtime.currentRomFilename}，改用 Snes9x`);
    await startSnes9xGame(romData, 'snes', signal);
    return;
  }

  if (!loaded && lower.endsWith('.nes')) {
    throwIfSignalAborted(signal);
    console.warn(`[NES] 原生 WASM 核心不支援 ${runtime.currentRomFilename}，改用 FCEUmm`);
    await startSnes9xGame(romData, 'nes', signal);
    return;
  }

  if (loaded) {
    // 取得核心類型及對應的螢幕尺寸
    const coreType = runtime.nes.getCoreType();
    if (coreType === 'nes' && preparedProfile) {
      try {
        activatePreparedGameProfile(preparedProfile);
      } catch (error) {
        if (isAbortError(error)) throw error;
        console.warn(`[NES] 遊戲設定檔載入失敗，將使用原始 ROM 執行`, error);
      }
    }
    const screenW = runtime.nes.getScreenWidth();
    const screenH = runtime.nes.getScreenHeight();
    const displayH = coreType === 'nes'
      ? screenH - NES_OVERSCAN_TOP - NES_OVERSCAN_BOTTOM
      : screenH;
    console.log(`ROM 載入成功 [${coreType.toUpperCase()}] ${screenW}×${screenH}，開始執行`);

    // 更新 Canvas 與 ImageData 為對應尺寸
    if (runtime.canvas && runtime.ctx) {
      runtime.canvas.width = screenW;
      runtime.canvas.height = displayH;
      runtime.ctx.imageSmoothingEnabled = false;
      runtime.imageData = runtime.ctx.createImageData(screenW, displayH);
      runtime.canvas.style.aspectRatio = coreType === 'nes' ? '4 / 3' : `${screenW} / ${displayH}`;
    }

    if (coreType === 'nes' && localizationAssets && runtime.canvas && runtime.nes.enableTextObserver(true)) {
      runtime.textOverlay = new NesTextOverlay(runtime.canvas, localizationAssets);
    }
    if (coreType === 'nes' && cellMenus && runtime.canvas && runtime.nes.enableTextObserver(true)) {
      runtime.textOverlay = new VerifiedMenuOverlay(runtime.canvas, cellMenus);
    }
    if (coreType === 'nes' && runtime.canvas) {
      const tuningAnchor = runtime.canvas.closest('.screen-bezel') ?? runtime.canvas;
      runtime.gameProfileTuningControls = mountZombieRuntimeTuning(runtime.nes, tuningAnchor) ?? mountCt2RuntimeTuning(runtime.nes, tuningAnchor);
    }
    
    // 隱藏選擇器，顯示遊戲畫面
    hideRomSelector();
    
    // 根據核心類型切換控制器外觀
    updateControllerLayout();
    
    // 確保音頻系統設定正確
    if (audioContext) {
      runtime.nes.setAudioSampleRate(audioContext.sampleRate);
      resumeAudio();
    }
    
    // 開啟電源指示燈
    runtime.powerLed?.classList.add('on');
    
    // 重置音頻環形緩衝區（避免上一局殘留音頻）
    clearAudioQueue();
    
    // 開始模擬
    startEmulation();

    // 載入 SRAM（遊戲內建電池存檔）
    loadSram();
    onGameStarted();

  } else {
    console.error('ROM 載入失敗');
    await showAppAlert('此 ROM 格式、Mapper 或特殊晶片目前不受支援。');
  }
}


export function exportNativeSnapshot(): string {
  if (!runtime.nes) return '';
  return runtime.nes.getCoreType() === 'nes' ? runtime.nes.exportPersistentSaveState() : runtime.nes.exportSaveState();
}


export function importNativeSnapshot(snapshot: string): boolean {
  if (!runtime.nes) return false;
  const nativeNes = runtime.nes.getCoreType() === 'nes';
  const ok = nativeNes ? runtime.nes.importPersistentSaveState(snapshot) : runtime.nes.importSaveState(snapshot);
  if (!ok) return false;
  if (nativeNes) runtime.nes.setAudioEnabled(!audioMuted);
  runtime.nes.consumeAudioSamples();
  resyncNativeButtons();
  return true;
}
