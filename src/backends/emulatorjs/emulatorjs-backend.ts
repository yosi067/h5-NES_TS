/**
 * EmulatorJS 後端（Snes9x、FCEUmm、Genesis Plus GX）的啟動與停止。
 */
import { type EmulatorJsCore, type Snes9xBackend, startSnes9xBackend } from '../../snes/snes9x-backend';
import { runtime } from '../../app/runtime';
import { stopFbNeoBackend } from '../fbneo/fbneo-backend';
import { stopEmulation } from '../lifecycle';
import { stopN64Backend } from '../n64/n64-backend';
import { resetWasmCore } from '../native/native-core';
import { hideRomSelector } from '../../session/game-loader';
import { onGameStarted } from '../../session/game-session';
import { updateControllerLayout } from '../../ui/controller-layout';
import { showToast } from '../../ui/dialogs';

export let snes9xBackend: Snes9xBackend | null = null;

export let emulatorJsCore: EmulatorJsCore | null = null;


export async function stopSnes9xBackend(): Promise<void> {
  const backend = snes9xBackend;
  if (backend) await backend.stop();
  if (snes9xBackend === backend) snes9xBackend = null;
  emulatorJsCore = null;
  document.getElementById('screen')?.style.removeProperty('display');
}


export async function startSnes9xGame(
  romData: ArrayBuffer,
  core: EmulatorJsCore = 'snes',
  signal?: AbortSignal,
): Promise<void> {
  const screen = document.getElementById('screen');
  const host = screen?.parentElement;
  if (!screen || !host) throw new Error('找不到遊戲畫面容器');

  stopEmulation();
  await stopN64Backend();
  await stopSnes9xBackend();
  stopFbNeoBackend();
  resetWasmCore();
  runtime.activeBackend = 'snes9x';
  emulatorJsCore = core;
  screen.style.display = 'none';
  hideRomSelector();

  try {
    snes9xBackend = await startSnes9xBackend(host, romData, runtime.currentRomFilename, core, signal);
    runtime.isRunning = true;
    hideRomSelector();
    updateControllerLayout();
    runtime.powerLed?.classList.add('on');
    showToast(core === 'genesis' ? 'Mega Drive 核心已啟動' : core === 'nes' ? 'FC 核心已啟動' : 'SFC 核心已啟動');
    onGameStarted();
  } catch (error) {
    runtime.activeBackend = 'wasm';
    await stopSnes9xBackend();
    throw error;
  }
}
