/**
 * H5-EMU 進入點：建立應用程式外殼並依序啟動各模組。
 */
import './app/debug-globals';
import { ensureAccess } from './app/access-gate';
import { runtime } from './app/runtime';
import { audioMuted, initAudio, resumeAudio } from './audio/audio-output';
import { n64AudioOutputDiagnostics } from './backends/n64/n64-backend';
import { initWasm } from './backends/native/native-core';
import { setupPerfMonitor } from './features/perf-monitor';
import { setupPlayerFeatures } from './features/player-features';
import { setupKeyboardInput } from './input/keyboard';
import { setupKeyboardShortcuts } from './input/shortcuts';
import { setupRomSelector } from './lobby/lobby-view';
import { saveSram } from './saves/sram';
import { confirmReturnToMachineMenu } from './session/game-loader';
import { setupVirtualController } from './ui/controller-layout';
import { setupDesktopControls, setupFileInput } from './ui/desktop-controls';
import { closeAppDialog, showToast } from './ui/dialogs';
import { setupIOSInstallHint, setupResponsiveModeDetection } from './ui/responsive';

// ===== 初始化 =====

/**
 * 初始化應用程式外殼。ROM 清單必須先於 WASM runtime 顯示，避免手機首次載入核心失敗時卡在占位文字。
 */
function setupAppShell(): boolean {
  // 取得 UI 元素
  runtime.romSelector = document.getElementById('rom-selector');
  runtime.gameboyShell = document.getElementById('gameboy-shell');
  runtime.powerLed = document.getElementById('power-led');

  // 首頁清單不應依賴 Canvas、控制器或音訊 API，部分 Android WebView 可能在後續初始化提早失敗。
  setupRomSelector();

  // 建立畫布
  runtime.canvas = document.getElementById('screen') as HTMLCanvasElement;
  if (!runtime.canvas) {
    console.error('找不到畫布元素');
    return false;
  }
  runtime.wasmCanvas = runtime.canvas;

  runtime.ctx = runtime.canvas.getContext('2d');
  if (!runtime.ctx) {
    console.error('無法取得 Canvas 2D 上下文');
    return false;
  }
  runtime.ctx.imageSmoothingEnabled = false;

  runtime.imageData = runtime.ctx.createImageData(256, 240);  // 預設 NES 尺寸，載入 ROM 後會更新

  // 設定鍵盤輸入（直接對 WASM 控制器操作）
  setupKeyboardInput();

  // 設定虛擬控制器
  setupVirtualController();

  // 設定電腦版控制按鈕
  setupDesktopControls();

  const homeLink = document.getElementById('game-home-link');
  homeLink?.addEventListener('click', confirmReturnToMachineMenu);
  homeLink?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      confirmReturnToMachineMenu();
    }
  });

  document.getElementById('app-dialog-confirm')?.addEventListener('click', () => closeAppDialog(true));
  document.getElementById('app-dialog-cancel')?.addEventListener('click', () => closeAppDialog(false));
  document.getElementById('app-dialog-overlay')?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeAppDialog(false);
    }
  });

  // 設定觸控裝置 RWD 狀態（iPhone Safari 橫版可能仍落在桌機寬度斷點）
  setupIOSInstallHint();
  setupResponsiveModeDetection();

  // 設定檔案選擇器
  setupFileInput();

  return true;
}


// ===== 啟動 =====

document.addEventListener('DOMContentLoaded', async () => {
  // 第一次進站先通關；通過後這台裝置不再詢問。
  await ensureAccess();
  if (!setupAppShell()) return;

  // Safari可能在背景切換或重建backend後再次暫停AudioContext，必須保留解鎖監聽。
  document.addEventListener('click', resumeAudio);
  document.addEventListener('keydown', resumeAudio);
  document.addEventListener('touchstart', resumeAudio, { passive: true });
  document.addEventListener('visibilitychange', () => {
    n64AudioOutputDiagnostics.setLifecycle(runtime.isRunning && !document.hidden, audioMuted);
    if (document.hidden) saveSram();
    else resumeAudio();
  });

  runtime.wasmInitPromise = initWasm().catch((error) => {
    console.error('WASM 核心初始化失敗:', error);
    showToast('核心初始化失敗，仍可瀏覽遊戲列表或使用 FBNeo 遊戲');
    throw error;
  });

  try {
    await runtime.wasmInitPromise;
  } catch {
    // waitForWasmCore() logs the same failure for ROM launch attempts.
  }

  try {
    await initAudio();
  } catch (error) {
    console.warn('音頻初始化失敗:', error);
  }

  setupKeyboardShortcuts();
  setupPlayerFeatures();
  setupPerfMonitor();
  window.nes = runtime.nes;

  // 定期自動儲存 SRAM（每 30 秒）
  setInterval(() => {
    if (runtime.isRunning) saveSram();
  }, 30000);

  // 頁面關閉時儲存 SRAM
  window.addEventListener('beforeunload', () => {
    saveSram();
  });
  window.addEventListener('pagehide', saveSram);
});
