/**
 * 應用程式對話框與提示訊息（toast）。
 */

let appDialogResolve: ((confirmed: boolean) => void) | null = null;

let appDialogPreviousFocus: HTMLElement | null = null;


export function closeAppDialog(confirmed: boolean): void {
  const overlay = document.getElementById('app-dialog-overlay');
  if (!overlay || overlay.hidden || !appDialogResolve) return;

  overlay.hidden = true;
  const resolve = appDialogResolve;
  appDialogResolve = null;
  resolve(confirmed);
  appDialogPreviousFocus?.focus();
  appDialogPreviousFocus = null;
}


function showAppDialog(
  title: string,
  message: string,
  confirmLabel: string,
  cancelLabel?: string,
): Promise<boolean> {
  if (appDialogResolve) closeAppDialog(false);

  const overlay = document.getElementById('app-dialog-overlay');
  const titleElement = document.getElementById('app-dialog-title');
  const messageElement = document.getElementById('app-dialog-message');
  const confirmButton = document.getElementById('app-dialog-confirm') as HTMLButtonElement | null;
  const cancelButton = document.getElementById('app-dialog-cancel') as HTMLButtonElement | null;
  if (!overlay || !titleElement || !messageElement || !confirmButton || !cancelButton) {
    return Promise.resolve(false);
  }

  titleElement.textContent = title;
  messageElement.textContent = message;
  confirmButton.textContent = confirmLabel;
  cancelButton.textContent = cancelLabel ?? '';
  cancelButton.hidden = cancelLabel === undefined;
  appDialogPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay.hidden = false;

  return new Promise<boolean>((resolve) => {
    appDialogResolve = resolve;
    requestAnimationFrame(() => confirmButton.focus());
  });
}


export function showAppAlert(message: string, title = '發生錯誤'): Promise<boolean> {
  return showAppDialog(title, message, '確定');
}


export function showAppConfirm(message: string, title = '請確認'): Promise<boolean> {
  return showAppDialog(title, message, '是', '否');
}


/**
 * 顯示提示訊息
 */
export function showToast(message: string): void {
  // 移除舊的 toast
  const existingToast = document.querySelector('.toast-message');
  if (existingToast) {
    existingToast.remove();
  }
  
  // 建立新的 toast
  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 15px 30px;
    border-radius: 10px;
    font-size: 16px;
    font-weight: bold;
    z-index: 10000;
    animation: toastFade 1.5s ease-out forwards;
  `;
  
  // 添加動畫樣式
  if (!document.querySelector('#toast-style')) {
    const style = document.createElement('style');
    style.id = 'toast-style';
    style.textContent = `
      @keyframes toastFade {
        0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        70% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(toast);
  
  // 自動移除
  setTimeout(() => toast.remove(), 1500);
}
