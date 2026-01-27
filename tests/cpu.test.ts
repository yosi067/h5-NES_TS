/**
 * CPU 測試套件 - Phase 1
 * 
 * 使用 Vitest 測試框架
 * 測試 6502 CPU 的所有指令和定址模式
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Cpu, CpuFlags } from '../src/core/cpu';
import { Bus } from '../src/core/bus';

/**
 * 測試用的簡單匯流排模擬
 * 提供 64KB 記憶體空間
 */
class TestBus extends Bus {
  private memory: Uint8Array = new Uint8Array(65536);

  constructor() {
    super();
    this.memory.fill(0);
  }

  override cpuRead(address: number): number {
    return this.memory[address & 0xFFFF];
  }

  override cpuWrite(address: number, data: number): void {
    this.memory[address & 0xFFFF] = data & 0xFF;
  }

  /** 載入程式到記憶體 */
  loadProgram(program: number[], startAddress: number = 0x8000): void {
    for (let i = 0; i < program.length; i++) {
      this.memory[startAddress + i] = program[i];
    }
    // 設定重置向量
    this.memory[0xFFFC] = startAddress & 0xFF;
    this.memory[0xFFFD] = (startAddress >> 8) & 0xFF;
  }

  /** 取得記憶體值 */
  getMemory(address: number): number {
    return this.memory[address & 0xFFFF];
  }

  /** 設定記憶體值 */
  setMemory(address: number, value: number): void {
    this.memory[address & 0xFFFF] = value & 0xFF;
  }
}

describe('CPU 基本功能', () => {
  let bus: TestBus;
  let cpu: Cpu;

  beforeEach(() => {
    bus = new TestBus();
    cpu = new Cpu(bus);
  });

  describe('重置', () => {
    it('應該正確讀取重置向量', () => {
      bus.loadProgram([0xEA], 0xC000); // NOP
      cpu.reset();
      expect(cpu.pc).toBe(0xC000);
    });

    it('應該初始化暫存器', () => {
      cpu.reset();
      expect(cpu.a).toBe(0);
      expect(cpu.x).toBe(0);
      expect(cpu.y).toBe(0);
      expect(cpu.sp).toBe(0xFD);
    });
  });
});

describe('載入指令', () => {
  let bus: TestBus;
  let cpu: Cpu;

  beforeEach(() => {
    bus = new TestBus();
    cpu = new Cpu(bus);
  });

  describe('LDA (載入累加器)', () => {
    it('立即定址 - 應該載入值到 A', () => {
      bus.loadProgram([0xA9, 0x42]); // LDA #$42
      cpu.reset();
      cpu.step();
      expect(cpu.a).toBe(0x42);
    });

    it('應該設定零旗標', () => {
      bus.loadProgram([0xA9, 0x00]); // LDA #$00
      cpu.reset();
      cpu.step();
      expect(cpu.getFlag(CpuFlags.Z)).toBe(true);
    });

    it('應該設定負數旗標', () => {
      bus.loadProgram([0xA9, 0x80]); // LDA #$80
      cpu.reset();
      cpu.step();
      expect(cpu.getFlag(CpuFlags.N)).toBe(true);
    });

    it('零頁定址 - 應該從零頁載入', () => {
      bus.loadProgram([0xA5, 0x10]); // LDA $10
      bus.setMemory(0x10, 0x55);
      cpu.reset();
      cpu.step();
      expect(cpu.a).toBe(0x55);
    });

    it('絕對定址 - 應該從絕對位址載入', () => {
      bus.loadProgram([0xAD, 0x00, 0x02]); // LDA $0200
      bus.setMemory(0x0200, 0xAA);
      cpu.reset();
      cpu.step();
      expect(cpu.a).toBe(0xAA);
    });
  });

  describe('LDX (載入 X 暫存器)', () => {
    it('立即定址', () => {
      bus.loadProgram([0xA2, 0x33]); // LDX #$33
      cpu.reset();
      cpu.step();
      expect(cpu.x).toBe(0x33);
    });
  });

  describe('LDY (載入 Y 暫存器)', () => {
    it('立即定址', () => {
      bus.loadProgram([0xA0, 0x44]); // LDY #$44
      cpu.reset();
      cpu.step();
      expect(cpu.y).toBe(0x44);
    });
  });
});

describe('儲存指令', () => {
  let bus: TestBus;
  let cpu: Cpu;

  beforeEach(() => {
    bus = new TestBus();
    cpu = new Cpu(bus);
  });

  describe('STA (儲存累加器)', () => {
    it('零頁定址', () => {
      bus.loadProgram([0xA9, 0x42, 0x85, 0x10]); // LDA #$42; STA $10
      cpu.reset();
      cpu.step();
      cpu.step();
      expect(bus.getMemory(0x10)).toBe(0x42);
    });

    it('絕對定址', () => {
      bus.loadProgram([0xA9, 0x55, 0x8D, 0x00, 0x03]); // LDA #$55; STA $0300
      cpu.reset();
      cpu.step();
      cpu.step();
      expect(bus.getMemory(0x0300)).toBe(0x55);
    });
  });

  describe('STX (儲存 X)', () => {
    it('零頁定址', () => {
      bus.loadProgram([0xA2, 0x33, 0x86, 0x20]); // LDX #$33; STX $20
      cpu.reset();
      cpu.step();
      cpu.step();
      expect(bus.getMemory(0x20)).toBe(0x33);
    });
  });

  describe('STY (儲存 Y)', () => {
    it('零頁定址', () => {
      bus.loadProgram([0xA0, 0x44, 0x84, 0x30]); // LDY #$44; STY $30
      cpu.reset();
      cpu.step();
      cpu.step();
      expect(bus.getMemory(0x30)).toBe(0x44);
    });
  });
});

describe('傳送指令', () => {
  let bus: TestBus;
  let cpu: Cpu;

  beforeEach(() => {
    bus = new TestBus();
    cpu = new Cpu(bus);
  });

  it('TAX - 傳送 A 到 X', () => {
    bus.loadProgram([0xA9, 0x42, 0xAA]); // LDA #$42; TAX
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.x).toBe(0x42);
  });

  it('TAY - 傳送 A 到 Y', () => {
    bus.loadProgram([0xA9, 0x42, 0xA8]); // LDA #$42; TAY
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.y).toBe(0x42);
  });

  it('TXA - 傳送 X 到 A', () => {
    bus.loadProgram([0xA2, 0x33, 0x8A]); // LDX #$33; TXA
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0x33);
  });

  it('TYA - 傳送 Y 到 A', () => {
    bus.loadProgram([0xA0, 0x44, 0x98]); // LDY #$44; TYA
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0x44);
  });
});

describe('算術運算', () => {
  let bus: TestBus;
  let cpu: Cpu;

  beforeEach(() => {
    bus = new TestBus();
    cpu = new Cpu(bus);
  });

  describe('ADC (帶進位加法)', () => {
    it('基本加法', () => {
      bus.loadProgram([0x18, 0xA9, 0x10, 0x69, 0x20]); // CLC; LDA #$10; ADC #$20
      cpu.reset();
      cpu.step(); // CLC
      cpu.step(); // LDA
      cpu.step(); // ADC
      expect(cpu.a).toBe(0x30);
    });

    it('加法產生進位', () => {
      bus.loadProgram([0x18, 0xA9, 0xFF, 0x69, 0x01]); // CLC; LDA #$FF; ADC #$01
      cpu.reset();
      cpu.step();
      cpu.step();
      cpu.step();
      expect(cpu.a).toBe(0x00);
      expect(cpu.getFlag(CpuFlags.C)).toBe(true);
      expect(cpu.getFlag(CpuFlags.Z)).toBe(true);
    });

    it('加法產生溢位', () => {
      bus.loadProgram([0x18, 0xA9, 0x7F, 0x69, 0x01]); // CLC; LDA #$7F; ADC #$01
      cpu.reset();
      cpu.step();
      cpu.step();
      cpu.step();
      expect(cpu.a).toBe(0x80);
      expect(cpu.getFlag(CpuFlags.V)).toBe(true);
      expect(cpu.getFlag(CpuFlags.N)).toBe(true);
    });
  });

  describe('SBC (帶借位減法)', () => {
    it('基本減法', () => {
      bus.loadProgram([0x38, 0xA9, 0x30, 0xE9, 0x10]); // SEC; LDA #$30; SBC #$10
      cpu.reset();
      cpu.step(); // SEC
      cpu.step(); // LDA
      cpu.step(); // SBC
      expect(cpu.a).toBe(0x20);
    });

    it('減法產生借位', () => {
      bus.loadProgram([0x38, 0xA9, 0x00, 0xE9, 0x01]); // SEC; LDA #$00; SBC #$01
      cpu.reset();
      cpu.step();
      cpu.step();
      cpu.step();
      expect(cpu.a).toBe(0xFF);
      expect(cpu.getFlag(CpuFlags.C)).toBe(false);
    });
  });

  describe('遞增/遞減', () => {
    it('INX - 遞增 X', () => {
      bus.loadProgram([0xA2, 0x10, 0xE8]); // LDX #$10; INX
      cpu.reset();
      cpu.step();
      cpu.step();
      expect(cpu.x).toBe(0x11);
    });

    it('INY - 遞增 Y', () => {
      bus.loadProgram([0xA0, 0x20, 0xC8]); // LDY #$20; INY
      cpu.reset();
      cpu.step();
      cpu.step();
      expect(cpu.y).toBe(0x21);
    });

    it('DEX - 遞減 X', () => {
      bus.loadProgram([0xA2, 0x10, 0xCA]); // LDX #$10; DEX
      cpu.reset();
      cpu.step();
      cpu.step();
      expect(cpu.x).toBe(0x0F);
    });

    it('DEY - 遞減 Y', () => {
      bus.loadProgram([0xA0, 0x20, 0x88]); // LDY #$20; DEY
      cpu.reset();
      cpu.step();
      cpu.step();
      expect(cpu.y).toBe(0x1F);
    });

    it('INC - 遞增記憶體', () => {
      bus.loadProgram([0xE6, 0x50]); // INC $50
      bus.setMemory(0x50, 0x42);
      cpu.reset();
      cpu.step();
      expect(bus.getMemory(0x50)).toBe(0x43);
    });

    it('DEC - 遞減記憶體', () => {
      bus.loadProgram([0xC6, 0x50]); // DEC $50
      bus.setMemory(0x50, 0x42);
      cpu.reset();
      cpu.step();
      expect(bus.getMemory(0x50)).toBe(0x41);
    });
  });
});

describe('邏輯運算', () => {
  let bus: TestBus;
  let cpu: Cpu;

  beforeEach(() => {
    bus = new TestBus();
    cpu = new Cpu(bus);
  });

  it('AND - 邏輯與', () => {
    bus.loadProgram([0xA9, 0xFF, 0x29, 0x0F]); // LDA #$FF; AND #$0F
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0x0F);
  });

  it('ORA - 邏輯或', () => {
    bus.loadProgram([0xA9, 0xF0, 0x09, 0x0F]); // LDA #$F0; ORA #$0F
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0xFF);
  });

  it('EOR - 邏輯互斥或', () => {
    bus.loadProgram([0xA9, 0xFF, 0x49, 0xF0]); // LDA #$FF; EOR #$F0
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0x0F);
  });
});

describe('移位運算', () => {
  let bus: TestBus;
  let cpu: Cpu;

  beforeEach(() => {
    bus = new TestBus();
    cpu = new Cpu(bus);
  });

  it('ASL - 算術左移 (累加器)', () => {
    bus.loadProgram([0xA9, 0x40, 0x0A]); // LDA #$40; ASL A
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0x80);
  });

  it('LSR - 邏輯右移 (累加器)', () => {
    bus.loadProgram([0xA9, 0x02, 0x4A]); // LDA #$02; LSR A
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0x01);
  });

  it('ROL - 帶進位左旋轉', () => {
    bus.loadProgram([0x38, 0xA9, 0x40, 0x2A]); // SEC; LDA #$40; ROL A
    cpu.reset();
    cpu.step();
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0x81);
  });

  it('ROR - 帶進位右旋轉', () => {
    bus.loadProgram([0x38, 0xA9, 0x02, 0x6A]); // SEC; LDA #$02; ROR A
    cpu.reset();
    cpu.step();
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0x81);
  });
});

describe('比較指令', () => {
  let bus: TestBus;
  let cpu: Cpu;

  beforeEach(() => {
    bus = new TestBus();
    cpu = new Cpu(bus);
  });

  it('CMP - A 等於運算元', () => {
    bus.loadProgram([0xA9, 0x42, 0xC9, 0x42]); // LDA #$42; CMP #$42
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.getFlag(CpuFlags.Z)).toBe(true);
    expect(cpu.getFlag(CpuFlags.C)).toBe(true);
  });

  it('CMP - A 大於運算元', () => {
    bus.loadProgram([0xA9, 0x50, 0xC9, 0x42]); // LDA #$50; CMP #$42
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.getFlag(CpuFlags.Z)).toBe(false);
    expect(cpu.getFlag(CpuFlags.C)).toBe(true);
  });

  it('CMP - A 小於運算元', () => {
    bus.loadProgram([0xA9, 0x30, 0xC9, 0x42]); // LDA #$30; CMP #$42
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.getFlag(CpuFlags.Z)).toBe(false);
    expect(cpu.getFlag(CpuFlags.C)).toBe(false);
  });
});

describe('分支指令', () => {
  let bus: TestBus;
  let cpu: Cpu;

  beforeEach(() => {
    bus = new TestBus();
    cpu = new Cpu(bus);
  });

  it('BEQ - 零旗標設定時跳轉', () => {
    bus.loadProgram([0xA9, 0x00, 0xF0, 0x02, 0xA9, 0x42, 0xA9, 0x55]);
    // LDA #$00; BEQ +2; LDA #$42; LDA #$55
    cpu.reset();
    cpu.step(); // LDA #$00
    cpu.step(); // BEQ
    cpu.step(); // LDA #$55 (跳過 LDA #$42)
    expect(cpu.a).toBe(0x55);
  });

  it('BNE - 零旗標未設定時跳轉', () => {
    bus.loadProgram([0xA9, 0x01, 0xD0, 0x02, 0xA9, 0x42, 0xA9, 0x55]);
    cpu.reset();
    cpu.step(); // LDA #$01
    cpu.step(); // BNE
    cpu.step(); // LDA #$55
    expect(cpu.a).toBe(0x55);
  });

  it('BCC - 進位旗標未設定時跳轉', () => {
    bus.loadProgram([0x18, 0x90, 0x02, 0xA9, 0x42, 0xA9, 0x55]);
    cpu.reset();
    cpu.step(); // CLC
    cpu.step(); // BCC
    cpu.step(); // LDA #$55
    expect(cpu.a).toBe(0x55);
  });

  it('BCS - 進位旗標設定時跳轉', () => {
    bus.loadProgram([0x38, 0xB0, 0x02, 0xA9, 0x42, 0xA9, 0x55]);
    cpu.reset();
    cpu.step(); // SEC
    cpu.step(); // BCS
    cpu.step(); // LDA #$55
    expect(cpu.a).toBe(0x55);
  });
});

describe('跳躍和副程式', () => {
  let bus: TestBus;
  let cpu: Cpu;

  beforeEach(() => {
    bus = new TestBus();
    cpu = new Cpu(bus);
  });

  it('JMP 絕對定址', () => {
    bus.loadProgram([0x4C, 0x10, 0x80]); // JMP $8010
    cpu.reset();
    cpu.step();
    expect(cpu.pc).toBe(0x8010);
  });

  it('JSR/RTS - 呼叫並返回副程式', () => {
    // 主程式: JSR $8010
    // 副程式: LDA #$42; RTS
    bus.loadProgram([
      0x20, 0x10, 0x80,  // JSR $8010
      0xA9, 0x00,        // LDA #$00 (返回後執行)
    ], 0x8000);
    bus.setMemory(0x8010, 0xA9); // LDA #$42
    bus.setMemory(0x8011, 0x42);
    bus.setMemory(0x8012, 0x60); // RTS

    cpu.reset();
    cpu.step(); // JSR
    expect(cpu.pc).toBe(0x8010);
    
    cpu.step(); // LDA #$42
    expect(cpu.a).toBe(0x42);
    
    cpu.step(); // RTS
    expect(cpu.pc).toBe(0x8003);
  });
});

describe('堆疊操作', () => {
  let bus: TestBus;
  let cpu: Cpu;

  beforeEach(() => {
    bus = new TestBus();
    cpu = new Cpu(bus);
  });

  it('PHA/PLA - 推送並彈出累加器', () => {
    bus.loadProgram([0xA9, 0x42, 0x48, 0xA9, 0x00, 0x68]);
    // LDA #$42; PHA; LDA #$00; PLA
    cpu.reset();
    cpu.step(); // LDA #$42
    cpu.step(); // PHA
    cpu.step(); // LDA #$00
    expect(cpu.a).toBe(0x00);
    cpu.step(); // PLA
    expect(cpu.a).toBe(0x42);
  });

  it('PHP/PLP - 推送並彈出狀態暫存器', () => {
    bus.loadProgram([0x38, 0x08, 0x18, 0x28]);
    // SEC; PHP; CLC; PLP
    cpu.reset();
    cpu.step(); // SEC
    expect(cpu.getFlag(CpuFlags.C)).toBe(true);
    cpu.step(); // PHP
    cpu.step(); // CLC
    expect(cpu.getFlag(CpuFlags.C)).toBe(false);
    cpu.step(); // PLP
    expect(cpu.getFlag(CpuFlags.C)).toBe(true);
  });
});

describe('旗標操作', () => {
  let bus: TestBus;
  let cpu: Cpu;

  beforeEach(() => {
    bus = new TestBus();
    cpu = new Cpu(bus);
  });

  it('SEC/CLC - 設定/清除進位旗標', () => {
    bus.loadProgram([0x38, 0x18]); // SEC; CLC
    cpu.reset();
    cpu.step();
    expect(cpu.getFlag(CpuFlags.C)).toBe(true);
    cpu.step();
    expect(cpu.getFlag(CpuFlags.C)).toBe(false);
  });

  it('SEI/CLI - 設定/清除中斷禁用旗標', () => {
    bus.loadProgram([0x78, 0x58]); // SEI; CLI
    cpu.reset();
    cpu.step();
    expect(cpu.getFlag(CpuFlags.I)).toBe(true);
    cpu.step();
    expect(cpu.getFlag(CpuFlags.I)).toBe(false);
  });

  it('SED/CLD - 設定/清除十進位旗標', () => {
    bus.loadProgram([0xF8, 0xD8]); // SED; CLD
    cpu.reset();
    cpu.step();
    expect(cpu.getFlag(CpuFlags.D)).toBe(true);
    cpu.step();
    expect(cpu.getFlag(CpuFlags.D)).toBe(false);
  });

  it('CLV - 清除溢位旗標', () => {
    // 先產生溢位，再清除
    bus.loadProgram([0x18, 0xA9, 0x7F, 0x69, 0x01, 0xB8]);
    // CLC; LDA #$7F; ADC #$01; CLV
    cpu.reset();
    cpu.step(); // CLC
    cpu.step(); // LDA
    cpu.step(); // ADC
    expect(cpu.getFlag(CpuFlags.V)).toBe(true);
    cpu.step(); // CLV
    expect(cpu.getFlag(CpuFlags.V)).toBe(false);
  });
});

describe('定址模式', () => {
  let bus: TestBus;
  let cpu: Cpu;

  beforeEach(() => {
    bus = new TestBus();
    cpu = new Cpu(bus);
  });

  it('零頁 X 索引', () => {
    bus.loadProgram([0xA2, 0x05, 0xB5, 0x10]); // LDX #$05; LDA $10,X
    bus.setMemory(0x15, 0x42);
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0x42);
  });

  it('零頁 Y 索引', () => {
    bus.loadProgram([0xA0, 0x03, 0xB6, 0x20]); // LDY #$03; LDX $20,Y
    bus.setMemory(0x23, 0x55);
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.x).toBe(0x55);
  });

  it('絕對 X 索引', () => {
    bus.loadProgram([0xA2, 0x10, 0xBD, 0x00, 0x02]); // LDX #$10; LDA $0200,X
    bus.setMemory(0x0210, 0xAA);
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0xAA);
  });

  it('絕對 Y 索引', () => {
    bus.loadProgram([0xA0, 0x20, 0xB9, 0x00, 0x03]); // LDY #$20; LDA $0300,Y
    bus.setMemory(0x0320, 0xBB);
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0xBB);
  });

  it('索引間接 (X)', () => {
    // LDX #$04; LDA ($20,X)
    // 在 $24-$25 存放位址 $0300
    // 在 $0300 存放值 $42
    bus.loadProgram([0xA2, 0x04, 0xA1, 0x20]);
    bus.setMemory(0x24, 0x00);
    bus.setMemory(0x25, 0x03);
    bus.setMemory(0x0300, 0x42);
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0x42);
  });

  it('間接索引 (Y)', () => {
    // LDY #$10; LDA ($30),Y
    // 在 $30-$31 存放位址 $0400
    // 在 $0410 存放值 $55
    bus.loadProgram([0xA0, 0x10, 0xB1, 0x30]);
    bus.setMemory(0x30, 0x00);
    bus.setMemory(0x31, 0x04);
    bus.setMemory(0x0410, 0x55);
    cpu.reset();
    cpu.step();
    cpu.step();
    expect(cpu.a).toBe(0x55);
  });

  it('間接定址 (JMP)', () => {
    // JMP ($8010) - 在 $8010 存放目標位址 $8020
    bus.loadProgram([0x6C, 0x10, 0x80]);
    bus.setMemory(0x8010, 0x20);
    bus.setMemory(0x8011, 0x80);
    cpu.reset();
    cpu.step();
    expect(cpu.pc).toBe(0x8020);
  });

  it('間接定址頁面邊界 bug', () => {
    // 6502 的 bug: JMP ($80FF) 會從 $80FF 和 $8000 讀取
    bus.loadProgram([0x6C, 0xFF, 0x80]);
    bus.setMemory(0x80FF, 0x34);
    bus.setMemory(0x8000, 0x12); // 而不是 $8100
    cpu.reset();
    cpu.step();
    expect(cpu.pc).toBe(0x1234);
  });
});
