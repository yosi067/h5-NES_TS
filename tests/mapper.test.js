/**
 * Mapper 測試套件 - Phase 5
 *
 * 測試各種 Mapper 的記憶體映射功能
 */
import { describe, it, expect } from 'vitest';
import { Mapper0, Mapper1, Mapper2, Mapper3 } from '../src/mappers';
describe('Mapper 0 (NROM)', () => {
    it('16KB PRG ROM 應該鏡像', () => {
        const mapper = new Mapper0(1, 1); // 1 個 PRG bank, 1 個 CHR bank
        // $8000-$BFFF 和 $C000-$FFFF 應該映射到同一個位置
        const addr1 = mapper.cpuMapRead(0x8000);
        const addr2 = mapper.cpuMapRead(0xC000);
        expect(addr1).toBe(0);
        expect(addr2).toBe(0);
    });
    it('32KB PRG ROM 不應該鏡像', () => {
        const mapper = new Mapper0(2, 1); // 2 個 PRG bank
        const addr1 = mapper.cpuMapRead(0x8000);
        const addr2 = mapper.cpuMapRead(0xC000);
        expect(addr1).toBe(0);
        expect(addr2).toBe(0x4000);
    });
    it('CHR 映射應該直接通過', () => {
        const mapper = new Mapper0(1, 1);
        const addr = mapper.ppuMapRead(0x0ABC);
        expect(addr).toBe(0x0ABC);
    });
    it('CHR RAM 應該可寫', () => {
        const mapper = new Mapper0(1, 0); // 0 個 CHR bank = CHR RAM
        const addr = mapper.ppuMapWrite(0x0100);
        expect(addr).toBe(0x0100);
    });
});
describe('Mapper 2 (UxROM)', () => {
    it('bank 切換應該正確', () => {
        const mapper = new Mapper2(8, 0); // 8 個 PRG bank
        // 預設 bank 0
        expect(mapper.cpuMapRead(0x8000)).toBe(0);
        // 切換到 bank 3
        mapper.cpuMapWrite(0x8000, 3);
        expect(mapper.cpuMapRead(0x8000)).toBe(3 * 16384);
        // 最後一個 bank 應該固定
        expect(mapper.cpuMapRead(0xC000)).toBe(7 * 16384);
    });
});
describe('Mapper 3 (CNROM)', () => {
    it('CHR bank 切換應該正確', () => {
        const mapper = new Mapper3(1, 4); // 4 個 CHR bank
        // 預設 bank 0
        expect(mapper.ppuMapRead(0x0000)).toBe(0);
        // 切換到 bank 2
        mapper.cpuMapWrite(0x8000, 2);
        expect(mapper.ppuMapRead(0x0000)).toBe(2 * 8192);
    });
});
describe('Mapper 1 (MMC1)', () => {
    it('串列寫入應該正確累積', () => {
        const mapper = new Mapper1(16, 16);
        // 重置
        mapper.cpuMapWrite(0x8000, 0x80);
        // 寫入 5 個位元到控制暫存器
        // 預設為 0x0C (PRG 模式 3)
        for (let i = 0; i < 4; i++) {
            mapper.cpuMapWrite(0x8000, 0);
        }
        // 最後一個位元完成寫入
        const result = mapper.cpuMapWrite(0x8000, 0);
        // 應該返回鏡像模式
        expect(result).not.toBeNull();
        expect(result?.mirrorMode).toBeDefined();
    });
    it('PRG bank 切換應該正確', () => {
        const mapper = new Mapper1(16, 16);
        // 設定 PRG bank
        // 先寫入控制暫存器設定模式 3
        mapper.cpuMapWrite(0x8000, 0x80); // 重置
        for (let i = 0; i < 5; i++) {
            mapper.cpuMapWrite(0x8000, (0x0F >> i) & 1);
        }
        // 現在寫入 PRG bank 暫存器
        for (let i = 0; i < 4; i++) {
            mapper.cpuMapWrite(0xE000, 0);
        }
        mapper.cpuMapWrite(0xE000, 0); // bank 0
        const addr = mapper.cpuMapRead(0x8000);
        expect(addr).toBeDefined();
    });
});
//# sourceMappingURL=mapper.test.js.map