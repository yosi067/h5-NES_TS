/**
 * 目前啟用的是哪一個模擬後端／核心。
 */
import { runtime } from '../app/runtime';
import { emulatorJsCore } from './emulatorjs-backend';

// 判斷當前是否為 SNES 核心
export function isSnesCore(): boolean {
  return (runtime.activeBackend === 'snes9x' && emulatorJsCore === 'snes') || runtime.nes?.getCoreType() === 'snes';
}


export function isGenesisCore(): boolean {
  return runtime.activeBackend === 'snes9x' && emulatorJsCore === 'genesis';
}


export function usesSixButtonController(): boolean {
  return isSnesCore() || isGenesisCore();
}


export function isMupenN64Active(): boolean {
  return runtime.activeBackend === 'mupen64';
}


export function isFbNeoActive(): boolean {
  return runtime.activeBackend === 'fbneo';
}


export function isSnes9xActive(): boolean {
  return runtime.activeBackend === 'snes9x';
}


export function isEmulatorJsNesActive(): boolean {
  return isSnes9xActive() && emulatorJsCore === 'nes';
}


export function isNativeCoreActive(): boolean {
  if (runtime.activeBackend !== 'wasm' || !runtime.nes || !runtime.currentRomFilename) return false;
  const core = runtime.nes.getCoreType();
  return core === 'nes' || core === 'gb' || core === 'gg' || core === 'snes';
}
