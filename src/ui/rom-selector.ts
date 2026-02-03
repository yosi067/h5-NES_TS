/**
 * ROM 選擇器
 * 
 * 顯示可用的 ROM 列表並處理選擇邏輯
 */

export interface RomInfo {
  name: string;
  file: string;
}

export interface RomListResponse {
  roms: RomInfo[];
}

/**
 * ROM 選擇器類別
 */
export class RomSelector {
  private container: HTMLElement | null = null;
  private romList: RomInfo[] = [];
  private onSelect: ((rom: RomInfo) => void) | null = null;
  private onFileSelect: ((file: File) => void) | null = null;

  /**
   * 建立 ROM 選擇器 UI
   */
  public create(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'rom-selector';
    this.container.innerHTML = `
      <div class="rom-selector-content">
        <div class="rom-selector-header">
          <div class="gameboy-logo">
            <span class="logo-text">Nintendo</span>
            <span class="logo-subtitle">H5-NES</span>
          </div>
          <h2>🎮 選擇遊戲</h2>
        </div>
        
        <div class="rom-list" id="rom-list">
          <div class="rom-loading">載入遊戲列表中...</div>
        </div>
        
        <div class="rom-selector-footer">
          <label class="upload-btn" for="rom-file-input">
            📁 從裝置選擇 ROM
          </label>
          <input type="file" id="rom-file-input" accept=".nes" style="display: none;">
        </div>
      </div>
    `;

    // 綁定檔案選擇事件
    const fileInput = this.container.querySelector('#rom-file-input') as HTMLInputElement;
    fileInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && this.onFileSelect) {
        this.onFileSelect(file);
      }
    });

    // 載入 ROM 列表
    this.loadRomList();

    return this.container;
  }

  /**
   * 設定選擇回調
   */
  public setOnSelect(callback: (rom: RomInfo) => void): void {
    this.onSelect = callback;
  }

  /**
   * 設定檔案選擇回調
   */
  public setOnFileSelect(callback: (file: File) => void): void {
    this.onFileSelect = callback;
  }

  /**
   * 載入 ROM 列表
   */
  private async loadRomList(): Promise<void> {
    try {
      const response = await fetch('/roms.json');
      if (!response.ok) {
        throw new Error('無法載入 ROM 列表');
      }
      
      const data: RomListResponse = await response.json();
      this.romList = data.roms;
      this.renderRomList();
    } catch (error) {
      console.error('載入 ROM 列表失敗:', error);
      this.renderError();
    }
  }

  /**
   * 渲染 ROM 列表
   */
  private renderRomList(): void {
    const listContainer = this.container?.querySelector('#rom-list');
    if (!listContainer) return;

    if (this.romList.length === 0) {
      listContainer.innerHTML = '<div class="rom-empty">沒有可用的遊戲</div>';
      return;
    }

    listContainer.innerHTML = this.romList.map((rom, index) => `
      <button class="rom-item" data-index="${index}">
        <span class="rom-icon">🎮</span>
        <span class="rom-name">${rom.name}</span>
        <span class="rom-arrow">▶</span>
      </button>
    `).join('');

    // 綁定點擊事件
    const items = listContainer.querySelectorAll('.rom-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt((item as HTMLElement).dataset.index || '0');
        const rom = this.romList[index];
        if (rom && this.onSelect) {
          this.onSelect(rom);
        }
      });
    });
  }

  /**
   * 渲染錯誤訊息
   */
  private renderError(): void {
    const listContainer = this.container?.querySelector('#rom-list');
    if (!listContainer) return;

    listContainer.innerHTML = `
      <div class="rom-error">
        <p>⚠️ 無法載入遊戲列表</p>
        <p>請使用下方按鈕選擇 ROM 檔案</p>
      </div>
    `;
  }

  /**
   * 顯示選擇器
   */
  public show(): void {
    if (this.container) {
      this.container.style.display = 'flex';
    }
  }

  /**
   * 隱藏選擇器
   */
  public hide(): void {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  /**
   * 銷毀選擇器
   */
  public destroy(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
  }
}

/**
 * ROM 選擇器 CSS 樣式
 */
export const romSelectorStyles = `
/* ===== ROM 選擇器 ===== */
.rom-selector {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.rom-selector-content {
  width: 100%;
  max-width: 400px;
  max-height: 90vh;
  background: linear-gradient(180deg, #8b956d 0%, #7a8660 100%);
  border-radius: 20px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5),
              inset 0 2px 4px rgba(255, 255, 255, 0.2);
}

.rom-selector-header {
  text-align: center;
  margin-bottom: 15px;
}

.gameboy-logo {
  margin-bottom: 10px;
}

.logo-text {
  font-family: 'Arial Black', sans-serif;
  font-size: 12px;
  color: #1a1a1a;
  letter-spacing: 2px;
  display: block;
}

.logo-subtitle {
  font-family: 'Arial', sans-serif;
  font-size: 24px;
  font-weight: bold;
  font-style: italic;
  color: #1a1a1a;
  display: block;
}

.rom-selector-header h2 {
  font-size: 16px;
  color: #2a2a2a;
  margin: 10px 0;
  font-weight: normal;
}

.rom-list {
  flex: 1;
  overflow-y: auto;
  background: #1a1a2a;
  border-radius: 8px;
  padding: 10px;
  max-height: 400px;
}

.rom-item {
  width: 100%;
  padding: 12px 15px;
  margin-bottom: 8px;
  background: linear-gradient(180deg, #2a2a3a 0%, #1f1f2f 100%);
  border: none;
  border-radius: 8px;
  color: #eee;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.2s;
}

.rom-item:last-child {
  margin-bottom: 0;
}

.rom-item:hover, .rom-item:active {
  background: linear-gradient(180deg, #3a3a4a 0%, #2a2a3a 100%);
  transform: translateX(5px);
}

.rom-icon {
  font-size: 18px;
}

.rom-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rom-arrow {
  color: #e94560;
  font-size: 12px;
}

.rom-loading, .rom-empty, .rom-error {
  text-align: center;
  color: #888;
  padding: 40px 20px;
}

.rom-error {
  color: #e94560;
}

.rom-selector-footer {
  margin-top: 15px;
  text-align: center;
}

.upload-btn {
  display: inline-block;
  padding: 12px 24px;
  background: linear-gradient(180deg, #3a3a3a 0%, #2a2a2a 100%);
  color: #eee;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-btn:hover {
  background: linear-gradient(180deg, #4a4a4a 0%, #3a3a3a 100%);
}

/* 手機版調整 */
@media (max-width: 430px) {
  .rom-selector-content {
    max-width: 95%;
    padding: 15px;
  }
  
  .rom-item {
    padding: 10px 12px;
    font-size: 13px;
  }
  
  .rom-list {
    max-height: 350px;
  }
}
`;
