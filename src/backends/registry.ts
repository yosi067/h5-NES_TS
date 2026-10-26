/**
 * 後端登錄表：依 runtime.activeBackend 取得目前的 adapter。
 *
 * 新增一個後端：在 types.ts 的 BackendId 加上代號、實作 EmulatorBackend，
 * 再於下面的 switch 登錄。TypeScript 會檢查每個代號都有對應的 adapter。
 */
import { runtime } from '../app/runtime';
import { emulatorJsAdapter } from './emulatorjs/emulatorjs-adapter';
import { fbneoAdapter } from './fbneo/fbneo-adapter';
import { n64Adapter } from './n64/n64-adapter';
import { nativeAdapter } from './native/native-adapter';
import type { BackendId, EmulatorBackend } from './types';

export function getBackend(id: BackendId): EmulatorBackend {
  // 在函式內取用（而不是模組載入時建表），循環 import 時才不會拿到尚未初始化的 adapter。
  switch (id) {
    case 'wasm': return nativeAdapter;
    case 'fbneo': return fbneoAdapter;
    case 'snes9x': return emulatorJsAdapter;
    case 'mupen64': return n64Adapter;
  }
}


export function getActiveBackend(): EmulatorBackend {
  return getBackend(runtime.activeBackend);
}
