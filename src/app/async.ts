/**
 * 等待下一幀、取消（AbortSignal）等非同步小工具。
 */

export function waitForNextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}


export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}


export function throwIfSignalAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('遊戲載入已取消', 'AbortError');
  }
}


export function nextAnimationFrameOrTimeout(timeoutMs = 100): Promise<void> {
  return new Promise<void>(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = window.setTimeout(finish, timeoutMs);
    requestAnimationFrame(finish);
  });
}
