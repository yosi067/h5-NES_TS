/**
 * PPU 測試套件 - Phase 2
 * 
 * 測試 PPU 的基本功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Ppu } from '../src/core/ppu';

describe('PPU 基本功能', () => {
  let ppu: Ppu;

  beforeEach(() => {
    ppu = new Ppu();
  });

  describe('暫存器讀寫', () => {
    it('PPUSTATUS ($2002) 讀取應清除 VBlank 旗標', () => {
      // 模擬進入 VBlank
      for (let i = 0; i < 341 * 242; i++) {
        ppu.clock();
      }

      // 第一次讀取 PPUSTATUS
      const status1 = ppu.cpuRead(0x2002);
      expect(status1 & 0x80).not.toBe(0); // VBlank 應該設定

      // 第二次讀取應該清除
      const status2 = ppu.cpuRead(0x2002);
      expect(status2 & 0x80).toBe(0); // VBlank 應該被清除
    });

    it('PPUADDR ($2006) 應該接受兩次寫入', () => {
      // 寫入位址 $2000
      ppu.cpuWrite(0x2006, 0x20); // 高位元組
      ppu.cpuWrite(0x2006, 0x00); // 低位元組
      
      // 寫入資料
      ppu.cpuWrite(0x2007, 0x42);
      
      // 重新設定位址並讀取
      ppu.cpuWrite(0x2006, 0x20);
      ppu.cpuWrite(0x2006, 0x00);
      
      // PPUDATA 讀取有緩衝延遲
      ppu.cpuRead(0x2007); // 第一次讀取會填充緩衝區
      // 由於是命名表區域，下次讀取才能獲得正確值
    });

    it('PPUSCROLL ($2005) 應該接受兩次寫入', () => {
      // 設定捲動位置
      ppu.cpuWrite(0x2005, 0x10); // X 捲動
      ppu.cpuWrite(0x2005, 0x20); // Y 捲動
      
      // 讀取狀態會重置閂鎖
      ppu.cpuRead(0x2002);
      
      // 可以再次設定
      ppu.cpuWrite(0x2005, 0x30);
      ppu.cpuWrite(0x2005, 0x40);
    });

    it('OAMDATA ($2004) 讀寫', () => {
      // 設定 OAM 位址
      ppu.cpuWrite(0x2003, 0x00);
      
      // 寫入 OAM 資料
      ppu.cpuWrite(0x2004, 0x42);
      
      // 重設位址並讀取
      ppu.cpuWrite(0x2003, 0x00);
      const data = ppu.cpuRead(0x2004);
      expect(data).toBe(0x42);
    });
  });

  describe('調色盤', () => {
    it('應該能讀寫調色盤記憶體', () => {
      // 設定位址到調色盤區域 $3F00
      ppu.cpuWrite(0x2006, 0x3F);
      ppu.cpuWrite(0x2006, 0x00);
      
      // 寫入調色盤值
      ppu.cpuWrite(0x2007, 0x0F);
      
      // 重設位址
      ppu.cpuWrite(0x2006, 0x3F);
      ppu.cpuWrite(0x2006, 0x00);
      
      // 調色盤讀取不需要緩衝
      const color = ppu.cpuRead(0x2007);
      expect(color).toBe(0x0F);
    });

    it('調色盤鏡像應該正確', () => {
      // $3F10 鏡像到 $3F00
      ppu.cpuWrite(0x2006, 0x3F);
      ppu.cpuWrite(0x2006, 0x10);
      ppu.cpuWrite(0x2007, 0x20);
      
      // 讀取 $3F00
      ppu.cpuWrite(0x2006, 0x3F);
      ppu.cpuWrite(0x2006, 0x00);
      const color = ppu.cpuRead(0x2007);
      expect(color).toBe(0x20);
    });
  });

  describe('時序', () => {
    it('一幀應該有正確的週期數', () => {
      let cycles = 0;
      ppu.frameComplete = false;
      
      while (!ppu.frameComplete) {
        ppu.clock();
        cycles++;
      }
      
      // NTSC: 341 PPU 週期/掃描線 × 262 掃描線 = 89342
      // 奇數幀會少 1 個週期
      expect(cycles).toBeGreaterThanOrEqual(89341);
      expect(cycles).toBeLessThanOrEqual(89342);
    });

    it('VBlank 應該在第 241 條掃描線觸發', () => {
      // 執行到第 241 條掃描線
      // 掃描線 -1 到 240 = 242 條掃描線
      for (let i = 0; i < 341 * 242; i++) {
        ppu.clock();
      }
      
      // 檢查 NMI 是否觸發 (需要 PPUCTRL 的 NMI 啟用)
      ppu.cpuWrite(0x2000, 0x80); // 啟用 NMI
      ppu.reset();
      
      // 再執行一幀
      for (let i = 0; i < 341 * 242; i++) {
        ppu.clock();
      }
      
      const nmi = ppu.checkNmi();
      expect(nmi).toBe(true);
    });
  });

  describe('圖案表', () => {
    it('getPatternTable 應該返回正確大小', () => {
      const table = ppu.getPatternTable(0, 0);
      expect(table.length).toBe(128 * 128);
    });
  });
});
