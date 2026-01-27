/**
 * NES 6502 CPU 模擬器
 * 
 * 6502 是一個 8 位元處理器，具有：
 * - 8 位元資料匯流排
 * - 16 位元位址匯流排 (可定址 64KB)
 * - 3 個通用暫存器: A (累加器), X, Y
 * - 堆疊指標 SP (指向 $0100-$01FF)
 * - 程式計數器 PC (16 位元)
 * - 狀態暫存器 P (8 個旗標位元)
 */

import type { Bus } from '../bus';

/**
 * CPU 狀態旗標
 * 使用位元遮罩表示各旗標在狀態暫存器中的位置
 */
export enum CpuFlags {
  /** 進位旗標 (Carry) - bit 0 */
  C = 1 << 0,
  /** 零旗標 (Zero) - bit 1 */
  Z = 1 << 1,
  /** 中斷禁用 (Interrupt Disable) - bit 2 */
  I = 1 << 2,
  /** 十進位模式 (Decimal) - bit 3，NES 不使用 */
  D = 1 << 3,
  /** Break 指令 (Break) - bit 4 */
  B = 1 << 4,
  /** 未使用 - bit 5，永遠為 1 */
  U = 1 << 5,
  /** 溢位旗標 (Overflow) - bit 6 */
  V = 1 << 6,
  /** 負數旗標 (Negative) - bit 7 */
  N = 1 << 7,
}

/**
 * 定址模式枚舉
 * 6502 支援多種定址模式來存取記憶體
 */
export enum AddressingMode {
  /** 隱含定址 - 操作數隱含在指令中 */
  Implicit,
  /** 累加器定址 - 操作數是 A 暫存器 */
  Accumulator,
  /** 立即定址 - 操作數直接跟在指令後 */
  Immediate,
  /** 零頁定址 - 8 位元位址，存取 $0000-$00FF */
  ZeroPage,
  /** 零頁 X 索引 - 零頁位址加上 X 暫存器 */
  ZeroPageX,
  /** 零頁 Y 索引 - 零頁位址加上 Y 暫存器 */
  ZeroPageY,
  /** 相對定址 - 用於分支指令，8 位元有號偏移 */
  Relative,
  /** 絕對定址 - 完整 16 位元位址 */
  Absolute,
  /** 絕對 X 索引 - 絕對位址加上 X */
  AbsoluteX,
  /** 絕對 Y 索引 - 絕對位址加上 Y */
  AbsoluteY,
  /** 間接定址 - 用於 JMP，從位址讀取目標位址 */
  Indirect,
  /** 索引間接 (X) - (零頁位址 + X) 指向的位址 */
  IndexedIndirectX,
  /** 間接索引 (Y) - 零頁位址指向的位址 + Y */
  IndirectIndexedY,
}

/**
 * 指令資訊結構
 */
interface Instruction {
  /** 指令助記符 */
  name: string;
  /** 執行函數 */
  execute: () => void;
  /** 定址模式 */
  mode: AddressingMode;
  /** 基本週期數 */
  cycles: number;
}

/**
 * 6502 CPU 類別
 */
export class Cpu {
  // ===== 暫存器 =====
  /** 累加器 (Accumulator) */
  public a: number = 0x00;
  /** X 索引暫存器 */
  public x: number = 0x00;
  /** Y 索引暫存器 */
  public y: number = 0x00;
  /** 堆疊指標 (Stack Pointer)，指向 $0100-$01FF */
  public sp: number = 0xFD;
  /** 程式計數器 (Program Counter) */
  public pc: number = 0x0000;
  /** 狀態暫存器 (Status Register) */
  public status: number = 0x24; // U 旗標預設為 1

  // ===== 內部狀態 =====
  /** 剩餘週期數 */
  private cycles: number = 0;
  /** 當前操作數的位址 */
  private absoluteAddress: number = 0x0000;
  /** 相對定址偏移量 */
  private relativeAddress: number = 0x0000;
  /** 當前操作碼 */
  private opcode: number = 0x00;
  /** 取得的資料 */
  private fetchedData: number = 0x00;

  /** 記憶體匯流排參考 */
  private bus: Bus;

  /** 指令查找表 */
  private instructions: Instruction[];

  /** 總執行週期數 (用於除錯) */
  public totalCycles: number = 0;

  constructor(bus: Bus) {
    this.bus = bus;
    this.instructions = this.buildInstructionTable();
  }

  // ===== 旗標操作方法 =====

  /** 取得指定旗標的值 */
  public getFlag(flag: CpuFlags): boolean {
    return (this.status & flag) !== 0;
  }

  /** 設定指定旗標 */
  public setFlag(flag: CpuFlags, value: boolean): void {
    if (value) {
      this.status |= flag;
    } else {
      this.status &= ~flag;
    }
  }

  // ===== 記憶體存取 =====

  /** 從記憶體讀取一個位元組 */
  private read(address: number): number {
    return this.bus.cpuRead(address & 0xFFFF);
  }

  /** 寫入一個位元組到記憶體 */
  private write(address: number, data: number): void {
    this.bus.cpuWrite(address & 0xFFFF, data & 0xFF);
  }

  // ===== 堆疊操作 =====

  /** 推送一個位元組到堆疊 */
  private pushStack(data: number): void {
    this.write(0x0100 + this.sp, data);
    this.sp = (this.sp - 1) & 0xFF;
  }

  /** 從堆疊彈出一個位元組 */
  private popStack(): number {
    this.sp = (this.sp + 1) & 0xFF;
    return this.read(0x0100 + this.sp);
  }

  /** 推送 16 位元值到堆疊 (高位元組先) */
  private pushStack16(data: number): void {
    this.pushStack((data >> 8) & 0xFF);
    this.pushStack(data & 0xFF);
  }

  /** 從堆疊彈出 16 位元值 */
  private popStack16(): number {
    const lo = this.popStack();
    const hi = this.popStack();
    return (hi << 8) | lo;
  }

  // ===== CPU 控制方法 =====

  /**
   * 重置 CPU
   * 讀取 $FFFC-$FFFD 的重置向量作為新的 PC
   */
  public reset(): void {
    // 讀取重置向量
    const lo = this.read(0xFFFC);
    const hi = this.read(0xFFFD);
    this.pc = (hi << 8) | lo;

    // 重置暫存器
    this.a = 0;
    this.x = 0;
    this.y = 0;
    this.sp = 0xFD;
    this.status = 0x24; // U 旗標設為 1

    // 重置需要 8 個週期
    this.cycles = 8;
    this.totalCycles = 0;
  }

  /**
   * 中斷請求 (IRQ)
   * 僅在 I 旗標未設定時觸發
   */
  public irq(): void {
    if (!this.getFlag(CpuFlags.I)) {
      // 儲存 PC 和狀態
      this.pushStack16(this.pc);
      this.setFlag(CpuFlags.B, false);
      this.setFlag(CpuFlags.U, true);
      this.pushStack(this.status);
      this.setFlag(CpuFlags.I, true);

      // 讀取 IRQ 向量
      const lo = this.read(0xFFFE);
      const hi = this.read(0xFFFF);
      this.pc = (hi << 8) | lo;

      this.cycles = 7;
    }
  }

  /**
   * 非遮蔽中斷 (NMI)
   * 無法被禁用，PPU VBlank 時觸發
   */
  public nmi(): void {
    // 儲存 PC 和狀態
    this.pushStack16(this.pc);
    this.setFlag(CpuFlags.B, false);
    this.setFlag(CpuFlags.U, true);
    this.pushStack(this.status);
    this.setFlag(CpuFlags.I, true);

    // 讀取 NMI 向量
    const lo = this.read(0xFFFA);
    const hi = this.read(0xFFFB);
    this.pc = (hi << 8) | lo;

    this.cycles = 8;
  }

  /**
   * 執行一個時鐘週期
   * @returns 是否完成一條指令
   */
  public clock(): boolean {
    if (this.cycles === 0) {
      // 讀取下一個操作碼
      this.opcode = this.read(this.pc);
      this.pc = (this.pc + 1) & 0xFFFF;

      // 確保 U 旗標永遠為 1
      this.setFlag(CpuFlags.U, true);

      // 取得指令資訊
      const instruction = this.instructions[this.opcode];
      this.cycles = instruction.cycles;

      // 執行定址模式
      this.executeAddressingMode(instruction.mode);
      
      // 執行指令
      instruction.execute.call(this);

      // 確保 U 旗標永遠為 1
      this.setFlag(CpuFlags.U, true);

      this.totalCycles += this.cycles;
      return true;
    }

    this.cycles--;
    return false;
  }

  /**
   * 執行一條完整指令
   */
  public step(): number {
    const startCycles = this.totalCycles;
    do {
      this.clock();
    } while (this.cycles > 0);
    return this.totalCycles - startCycles;
  }

  // ===== 定址模式實作 =====

  private executeAddressingMode(mode: AddressingMode): number {
    switch (mode) {
      case AddressingMode.Implicit:
        return this.addrImplicit();
      case AddressingMode.Accumulator:
        return this.addrAccumulator();
      case AddressingMode.Immediate:
        return this.addrImmediate();
      case AddressingMode.ZeroPage:
        return this.addrZeroPage();
      case AddressingMode.ZeroPageX:
        return this.addrZeroPageX();
      case AddressingMode.ZeroPageY:
        return this.addrZeroPageY();
      case AddressingMode.Relative:
        return this.addrRelative();
      case AddressingMode.Absolute:
        return this.addrAbsolute();
      case AddressingMode.AbsoluteX:
        return this.addrAbsoluteX();
      case AddressingMode.AbsoluteY:
        return this.addrAbsoluteY();
      case AddressingMode.Indirect:
        return this.addrIndirect();
      case AddressingMode.IndexedIndirectX:
        return this.addrIndexedIndirectX();
      case AddressingMode.IndirectIndexedY:
        return this.addrIndirectIndexedY();
      default:
        return 0;
    }
  }

  // 隱含定址 - 無需額外位址
  private addrImplicit(): number {
    this.fetchedData = this.a;
    return 0;
  }

  // 累加器定址 - 操作 A 暫存器
  private addrAccumulator(): number {
    this.fetchedData = this.a;
    return 0;
  }

  // 立即定址 - 操作數在指令後
  private addrImmediate(): number {
    this.absoluteAddress = this.pc;
    this.pc = (this.pc + 1) & 0xFFFF;
    return 0;
  }

  // 零頁定址
  private addrZeroPage(): number {
    this.absoluteAddress = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    this.absoluteAddress &= 0x00FF;
    return 0;
  }

  // 零頁 X 索引
  private addrZeroPageX(): number {
    this.absoluteAddress = (this.read(this.pc) + this.x) & 0xFF;
    this.pc = (this.pc + 1) & 0xFFFF;
    return 0;
  }

  // 零頁 Y 索引
  private addrZeroPageY(): number {
    this.absoluteAddress = (this.read(this.pc) + this.y) & 0xFF;
    this.pc = (this.pc + 1) & 0xFFFF;
    return 0;
  }

  // 相對定址 (用於分支)
  private addrRelative(): number {
    this.relativeAddress = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    // 轉換為有號數
    if (this.relativeAddress & 0x80) {
      this.relativeAddress |= 0xFF00;
    }
    return 0;
  }

  // 絕對定址
  private addrAbsolute(): number {
    const lo = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    const hi = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    this.absoluteAddress = (hi << 8) | lo;
    return 0;
  }

  // 絕對 X 索引
  private addrAbsoluteX(): number {
    const lo = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    const hi = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    this.absoluteAddress = ((hi << 8) | lo) + this.x;
    this.absoluteAddress &= 0xFFFF;

    // 跨頁時需要額外週期
    if ((this.absoluteAddress & 0xFF00) !== (hi << 8)) {
      return 1;
    }
    return 0;
  }

  // 絕對 Y 索引
  private addrAbsoluteY(): number {
    const lo = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    const hi = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    this.absoluteAddress = ((hi << 8) | lo) + this.y;
    this.absoluteAddress &= 0xFFFF;

    // 跨頁時需要額外週期
    if ((this.absoluteAddress & 0xFF00) !== (hi << 8)) {
      return 1;
    }
    return 0;
  }

  // 間接定址 (僅用於 JMP)
  private addrIndirect(): number {
    const ptrLo = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    const ptrHi = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    const ptr = (ptrHi << 8) | ptrLo;

    // 6502 的 bug：如果指標在頁面邊界，高位元組會從同頁面的開始讀取
    if (ptrLo === 0xFF) {
      this.absoluteAddress = (this.read(ptr & 0xFF00) << 8) | this.read(ptr);
    } else {
      this.absoluteAddress = (this.read(ptr + 1) << 8) | this.read(ptr);
    }
    return 0;
  }

  // 索引間接 (Indexed Indirect) - (zp,X)
  private addrIndexedIndirectX(): number {
    const zp = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    const lo = this.read((zp + this.x) & 0xFF);
    const hi = this.read((zp + this.x + 1) & 0xFF);
    this.absoluteAddress = (hi << 8) | lo;
    return 0;
  }

  // 間接索引 (Indirect Indexed) - (zp),Y
  private addrIndirectIndexedY(): number {
    const zp = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    const lo = this.read(zp);
    const hi = this.read((zp + 1) & 0xFF);
    this.absoluteAddress = ((hi << 8) | lo) + this.y;
    this.absoluteAddress &= 0xFFFF;

    // 跨頁時需要額外週期
    if ((this.absoluteAddress & 0xFF00) !== (hi << 8)) {
      return 1;
    }
    return 0;
  }

  // ===== 輔助方法 =====

  /** 從目標位址取得資料 */
  private fetch(): number {
    const instruction = this.instructions[this.opcode];
    if (instruction.mode !== AddressingMode.Implicit &&
        instruction.mode !== AddressingMode.Accumulator) {
      this.fetchedData = this.read(this.absoluteAddress);
    }
    return this.fetchedData;
  }

  /** 分支輔助函數 */
  private branch(): void {
    this.cycles++;
    this.absoluteAddress = (this.pc + this.relativeAddress) & 0xFFFF;

    // 跨頁需要額外週期
    if ((this.absoluteAddress & 0xFF00) !== (this.pc & 0xFF00)) {
      this.cycles++;
    }

    this.pc = this.absoluteAddress;
  }

  // ===== 指令實作 =====

  // 載入/儲存指令
  private LDA(): void {
    this.a = this.fetch();
    this.setFlag(CpuFlags.Z, this.a === 0);
    this.setFlag(CpuFlags.N, (this.a & 0x80) !== 0);
  }

  private LDX(): void {
    this.x = this.fetch();
    this.setFlag(CpuFlags.Z, this.x === 0);
    this.setFlag(CpuFlags.N, (this.x & 0x80) !== 0);
  }

  private LDY(): void {
    this.y = this.fetch();
    this.setFlag(CpuFlags.Z, this.y === 0);
    this.setFlag(CpuFlags.N, (this.y & 0x80) !== 0);
  }

  private STA(): void {
    this.write(this.absoluteAddress, this.a);
  }

  private STX(): void {
    this.write(this.absoluteAddress, this.x);
  }

  private STY(): void {
    this.write(this.absoluteAddress, this.y);
  }

  // 傳送指令
  private TAX(): void {
    this.x = this.a;
    this.setFlag(CpuFlags.Z, this.x === 0);
    this.setFlag(CpuFlags.N, (this.x & 0x80) !== 0);
  }

  private TAY(): void {
    this.y = this.a;
    this.setFlag(CpuFlags.Z, this.y === 0);
    this.setFlag(CpuFlags.N, (this.y & 0x80) !== 0);
  }

  private TXA(): void {
    this.a = this.x;
    this.setFlag(CpuFlags.Z, this.a === 0);
    this.setFlag(CpuFlags.N, (this.a & 0x80) !== 0);
  }

  private TYA(): void {
    this.a = this.y;
    this.setFlag(CpuFlags.Z, this.a === 0);
    this.setFlag(CpuFlags.N, (this.a & 0x80) !== 0);
  }

  private TSX(): void {
    this.x = this.sp;
    this.setFlag(CpuFlags.Z, this.x === 0);
    this.setFlag(CpuFlags.N, (this.x & 0x80) !== 0);
  }

  private TXS(): void {
    this.sp = this.x;
  }

  // 堆疊操作
  private PHA(): void {
    this.pushStack(this.a);
  }

  private PHP(): void {
    this.pushStack(this.status | CpuFlags.B | CpuFlags.U);
  }

  private PLA(): void {
    this.a = this.popStack();
    this.setFlag(CpuFlags.Z, this.a === 0);
    this.setFlag(CpuFlags.N, (this.a & 0x80) !== 0);
  }

  private PLP(): void {
    this.status = this.popStack();
    this.setFlag(CpuFlags.U, true);
    this.setFlag(CpuFlags.B, false);
  }

  // 算術運算
  private ADC(): void {
    const data = this.fetch();
    const result = this.a + data + (this.getFlag(CpuFlags.C) ? 1 : 0);
    
    this.setFlag(CpuFlags.C, result > 0xFF);
    this.setFlag(CpuFlags.Z, (result & 0xFF) === 0);
    this.setFlag(CpuFlags.V, ((~(this.a ^ data) & (this.a ^ result)) & 0x80) !== 0);
    this.setFlag(CpuFlags.N, (result & 0x80) !== 0);
    
    this.a = result & 0xFF;
  }

  private SBC(): void {
    const data = this.fetch() ^ 0xFF; // 取反
    const result = this.a + data + (this.getFlag(CpuFlags.C) ? 1 : 0);
    
    this.setFlag(CpuFlags.C, result > 0xFF);
    this.setFlag(CpuFlags.Z, (result & 0xFF) === 0);
    this.setFlag(CpuFlags.V, ((~(this.a ^ data) & (this.a ^ result)) & 0x80) !== 0);
    this.setFlag(CpuFlags.N, (result & 0x80) !== 0);
    
    this.a = result & 0xFF;
  }

  private CMP(): void {
    const data = this.fetch();
    const result = this.a - data;
    this.setFlag(CpuFlags.C, this.a >= data);
    this.setFlag(CpuFlags.Z, (result & 0xFF) === 0);
    this.setFlag(CpuFlags.N, (result & 0x80) !== 0);
  }

  private CPX(): void {
    const data = this.fetch();
    const result = this.x - data;
    this.setFlag(CpuFlags.C, this.x >= data);
    this.setFlag(CpuFlags.Z, (result & 0xFF) === 0);
    this.setFlag(CpuFlags.N, (result & 0x80) !== 0);
  }

  private CPY(): void {
    const data = this.fetch();
    const result = this.y - data;
    this.setFlag(CpuFlags.C, this.y >= data);
    this.setFlag(CpuFlags.Z, (result & 0xFF) === 0);
    this.setFlag(CpuFlags.N, (result & 0x80) !== 0);
  }

  // 遞增/遞減
  private INC(): void {
    const data = (this.fetch() + 1) & 0xFF;
    this.write(this.absoluteAddress, data);
    this.setFlag(CpuFlags.Z, data === 0);
    this.setFlag(CpuFlags.N, (data & 0x80) !== 0);
  }

  private INX(): void {
    this.x = (this.x + 1) & 0xFF;
    this.setFlag(CpuFlags.Z, this.x === 0);
    this.setFlag(CpuFlags.N, (this.x & 0x80) !== 0);
  }

  private INY(): void {
    this.y = (this.y + 1) & 0xFF;
    this.setFlag(CpuFlags.Z, this.y === 0);
    this.setFlag(CpuFlags.N, (this.y & 0x80) !== 0);
  }

  private DEC(): void {
    const data = (this.fetch() - 1) & 0xFF;
    this.write(this.absoluteAddress, data);
    this.setFlag(CpuFlags.Z, data === 0);
    this.setFlag(CpuFlags.N, (data & 0x80) !== 0);
  }

  private DEX(): void {
    this.x = (this.x - 1) & 0xFF;
    this.setFlag(CpuFlags.Z, this.x === 0);
    this.setFlag(CpuFlags.N, (this.x & 0x80) !== 0);
  }

  private DEY(): void {
    this.y = (this.y - 1) & 0xFF;
    this.setFlag(CpuFlags.Z, this.y === 0);
    this.setFlag(CpuFlags.N, (this.y & 0x80) !== 0);
  }

  // 邏輯運算
  private AND(): void {
    this.a &= this.fetch();
    this.setFlag(CpuFlags.Z, this.a === 0);
    this.setFlag(CpuFlags.N, (this.a & 0x80) !== 0);
  }

  private ORA(): void {
    this.a |= this.fetch();
    this.setFlag(CpuFlags.Z, this.a === 0);
    this.setFlag(CpuFlags.N, (this.a & 0x80) !== 0);
  }

  private EOR(): void {
    this.a ^= this.fetch();
    this.setFlag(CpuFlags.Z, this.a === 0);
    this.setFlag(CpuFlags.N, (this.a & 0x80) !== 0);
  }

  private BIT(): void {
    const data = this.fetch();
    this.setFlag(CpuFlags.Z, (this.a & data) === 0);
    this.setFlag(CpuFlags.N, (data & 0x80) !== 0);
    this.setFlag(CpuFlags.V, (data & 0x40) !== 0);
  }

  // 移位運算
  private ASL(): void {
    const data = this.fetch();
    const result = (data << 1) & 0xFF;
    this.setFlag(CpuFlags.C, (data & 0x80) !== 0);
    this.setFlag(CpuFlags.Z, result === 0);
    this.setFlag(CpuFlags.N, (result & 0x80) !== 0);
    
    if (this.instructions[this.opcode].mode === AddressingMode.Accumulator) {
      this.a = result;
    } else {
      this.write(this.absoluteAddress, result);
    }
  }

  private LSR(): void {
    const data = this.fetch();
    const result = data >> 1;
    this.setFlag(CpuFlags.C, (data & 0x01) !== 0);
    this.setFlag(CpuFlags.Z, result === 0);
    this.setFlag(CpuFlags.N, false);
    
    if (this.instructions[this.opcode].mode === AddressingMode.Accumulator) {
      this.a = result;
    } else {
      this.write(this.absoluteAddress, result);
    }
  }

  private ROL(): void {
    const data = this.fetch();
    const result = ((data << 1) | (this.getFlag(CpuFlags.C) ? 1 : 0)) & 0xFF;
    this.setFlag(CpuFlags.C, (data & 0x80) !== 0);
    this.setFlag(CpuFlags.Z, result === 0);
    this.setFlag(CpuFlags.N, (result & 0x80) !== 0);
    
    if (this.instructions[this.opcode].mode === AddressingMode.Accumulator) {
      this.a = result;
    } else {
      this.write(this.absoluteAddress, result);
    }
  }

  private ROR(): void {
    const data = this.fetch();
    const result = (data >> 1) | (this.getFlag(CpuFlags.C) ? 0x80 : 0);
    this.setFlag(CpuFlags.C, (data & 0x01) !== 0);
    this.setFlag(CpuFlags.Z, result === 0);
    this.setFlag(CpuFlags.N, (result & 0x80) !== 0);
    
    if (this.instructions[this.opcode].mode === AddressingMode.Accumulator) {
      this.a = result;
    } else {
      this.write(this.absoluteAddress, result);
    }
  }

  // 跳躍和呼叫
  private JMP(): void {
    this.pc = this.absoluteAddress;
  }

  private JSR(): void {
    this.pushStack16((this.pc - 1) & 0xFFFF);
    this.pc = this.absoluteAddress;
  }

  private RTS(): void {
    this.pc = (this.popStack16() + 1) & 0xFFFF;
  }

  // 分支指令
  private BCC(): void {
    if (!this.getFlag(CpuFlags.C)) this.branch();
  }

  private BCS(): void {
    if (this.getFlag(CpuFlags.C)) this.branch();
  }

  private BEQ(): void {
    if (this.getFlag(CpuFlags.Z)) this.branch();
  }

  private BMI(): void {
    if (this.getFlag(CpuFlags.N)) this.branch();
  }

  private BNE(): void {
    if (!this.getFlag(CpuFlags.Z)) this.branch();
  }

  private BPL(): void {
    if (!this.getFlag(CpuFlags.N)) this.branch();
  }

  private BVC(): void {
    if (!this.getFlag(CpuFlags.V)) this.branch();
  }

  private BVS(): void {
    if (this.getFlag(CpuFlags.V)) this.branch();
  }

  // 旗標操作
  private CLC(): void {
    this.setFlag(CpuFlags.C, false);
  }

  private CLD(): void {
    this.setFlag(CpuFlags.D, false);
  }

  private CLI(): void {
    this.setFlag(CpuFlags.I, false);
  }

  private CLV(): void {
    this.setFlag(CpuFlags.V, false);
  }

  private SEC(): void {
    this.setFlag(CpuFlags.C, true);
  }

  private SED(): void {
    this.setFlag(CpuFlags.D, true);
  }

  private SEI(): void {
    this.setFlag(CpuFlags.I, true);
  }

  // 系統指令
  private BRK(): void {
    this.pc = (this.pc + 1) & 0xFFFF;
    this.pushStack16(this.pc);
    this.setFlag(CpuFlags.B, true);
    this.pushStack(this.status | CpuFlags.B | CpuFlags.U);
    this.setFlag(CpuFlags.I, true);
    const lo = this.read(0xFFFE);
    const hi = this.read(0xFFFF);
    this.pc = (hi << 8) | lo;
  }

  private NOP(): void {
    // 什麼都不做
  }

  private RTI(): void {
    this.status = this.popStack();
    this.setFlag(CpuFlags.B, false);
    this.setFlag(CpuFlags.U, true);
    this.pc = this.popStack16();
  }

  // 非法指令 (用於未實作的操作碼)
  private XXX(): void {
    // 非法指令，當作 NOP 處理
  }

  // ===== 指令表建立 =====

  private buildInstructionTable(): Instruction[] {
    const table: Instruction[] = new Array(256);

    // 預設所有指令為非法指令
    for (let i = 0; i < 256; i++) {
      table[i] = {
        name: 'XXX',
        execute: this.XXX,
        mode: AddressingMode.Implicit,
        cycles: 2,
      };
    }

    // 定義合法指令
    // 格式: [操作碼, 名稱, 執行函數, 定址模式, 週期數]
    const instructions: [number, string, () => void, AddressingMode, number][] = [
      // 載入指令
      [0xA9, 'LDA', this.LDA, AddressingMode.Immediate, 2],
      [0xA5, 'LDA', this.LDA, AddressingMode.ZeroPage, 3],
      [0xB5, 'LDA', this.LDA, AddressingMode.ZeroPageX, 4],
      [0xAD, 'LDA', this.LDA, AddressingMode.Absolute, 4],
      [0xBD, 'LDA', this.LDA, AddressingMode.AbsoluteX, 4],
      [0xB9, 'LDA', this.LDA, AddressingMode.AbsoluteY, 4],
      [0xA1, 'LDA', this.LDA, AddressingMode.IndexedIndirectX, 6],
      [0xB1, 'LDA', this.LDA, AddressingMode.IndirectIndexedY, 5],

      [0xA2, 'LDX', this.LDX, AddressingMode.Immediate, 2],
      [0xA6, 'LDX', this.LDX, AddressingMode.ZeroPage, 3],
      [0xB6, 'LDX', this.LDX, AddressingMode.ZeroPageY, 4],
      [0xAE, 'LDX', this.LDX, AddressingMode.Absolute, 4],
      [0xBE, 'LDX', this.LDX, AddressingMode.AbsoluteY, 4],

      [0xA0, 'LDY', this.LDY, AddressingMode.Immediate, 2],
      [0xA4, 'LDY', this.LDY, AddressingMode.ZeroPage, 3],
      [0xB4, 'LDY', this.LDY, AddressingMode.ZeroPageX, 4],
      [0xAC, 'LDY', this.LDY, AddressingMode.Absolute, 4],
      [0xBC, 'LDY', this.LDY, AddressingMode.AbsoluteX, 4],

      // 儲存指令
      [0x85, 'STA', this.STA, AddressingMode.ZeroPage, 3],
      [0x95, 'STA', this.STA, AddressingMode.ZeroPageX, 4],
      [0x8D, 'STA', this.STA, AddressingMode.Absolute, 4],
      [0x9D, 'STA', this.STA, AddressingMode.AbsoluteX, 5],
      [0x99, 'STA', this.STA, AddressingMode.AbsoluteY, 5],
      [0x81, 'STA', this.STA, AddressingMode.IndexedIndirectX, 6],
      [0x91, 'STA', this.STA, AddressingMode.IndirectIndexedY, 6],

      [0x86, 'STX', this.STX, AddressingMode.ZeroPage, 3],
      [0x96, 'STX', this.STX, AddressingMode.ZeroPageY, 4],
      [0x8E, 'STX', this.STX, AddressingMode.Absolute, 4],

      [0x84, 'STY', this.STY, AddressingMode.ZeroPage, 3],
      [0x94, 'STY', this.STY, AddressingMode.ZeroPageX, 4],
      [0x8C, 'STY', this.STY, AddressingMode.Absolute, 4],

      // 傳送指令
      [0xAA, 'TAX', this.TAX, AddressingMode.Implicit, 2],
      [0xA8, 'TAY', this.TAY, AddressingMode.Implicit, 2],
      [0x8A, 'TXA', this.TXA, AddressingMode.Implicit, 2],
      [0x98, 'TYA', this.TYA, AddressingMode.Implicit, 2],
      [0xBA, 'TSX', this.TSX, AddressingMode.Implicit, 2],
      [0x9A, 'TXS', this.TXS, AddressingMode.Implicit, 2],

      // 堆疊操作
      [0x48, 'PHA', this.PHA, AddressingMode.Implicit, 3],
      [0x08, 'PHP', this.PHP, AddressingMode.Implicit, 3],
      [0x68, 'PLA', this.PLA, AddressingMode.Implicit, 4],
      [0x28, 'PLP', this.PLP, AddressingMode.Implicit, 4],

      // 算術運算
      [0x69, 'ADC', this.ADC, AddressingMode.Immediate, 2],
      [0x65, 'ADC', this.ADC, AddressingMode.ZeroPage, 3],
      [0x75, 'ADC', this.ADC, AddressingMode.ZeroPageX, 4],
      [0x6D, 'ADC', this.ADC, AddressingMode.Absolute, 4],
      [0x7D, 'ADC', this.ADC, AddressingMode.AbsoluteX, 4],
      [0x79, 'ADC', this.ADC, AddressingMode.AbsoluteY, 4],
      [0x61, 'ADC', this.ADC, AddressingMode.IndexedIndirectX, 6],
      [0x71, 'ADC', this.ADC, AddressingMode.IndirectIndexedY, 5],

      [0xE9, 'SBC', this.SBC, AddressingMode.Immediate, 2],
      [0xE5, 'SBC', this.SBC, AddressingMode.ZeroPage, 3],
      [0xF5, 'SBC', this.SBC, AddressingMode.ZeroPageX, 4],
      [0xED, 'SBC', this.SBC, AddressingMode.Absolute, 4],
      [0xFD, 'SBC', this.SBC, AddressingMode.AbsoluteX, 4],
      [0xF9, 'SBC', this.SBC, AddressingMode.AbsoluteY, 4],
      [0xE1, 'SBC', this.SBC, AddressingMode.IndexedIndirectX, 6],
      [0xF1, 'SBC', this.SBC, AddressingMode.IndirectIndexedY, 5],

      // 比較指令
      [0xC9, 'CMP', this.CMP, AddressingMode.Immediate, 2],
      [0xC5, 'CMP', this.CMP, AddressingMode.ZeroPage, 3],
      [0xD5, 'CMP', this.CMP, AddressingMode.ZeroPageX, 4],
      [0xCD, 'CMP', this.CMP, AddressingMode.Absolute, 4],
      [0xDD, 'CMP', this.CMP, AddressingMode.AbsoluteX, 4],
      [0xD9, 'CMP', this.CMP, AddressingMode.AbsoluteY, 4],
      [0xC1, 'CMP', this.CMP, AddressingMode.IndexedIndirectX, 6],
      [0xD1, 'CMP', this.CMP, AddressingMode.IndirectIndexedY, 5],

      [0xE0, 'CPX', this.CPX, AddressingMode.Immediate, 2],
      [0xE4, 'CPX', this.CPX, AddressingMode.ZeroPage, 3],
      [0xEC, 'CPX', this.CPX, AddressingMode.Absolute, 4],

      [0xC0, 'CPY', this.CPY, AddressingMode.Immediate, 2],
      [0xC4, 'CPY', this.CPY, AddressingMode.ZeroPage, 3],
      [0xCC, 'CPY', this.CPY, AddressingMode.Absolute, 4],

      // 遞增/遞減
      [0xE6, 'INC', this.INC, AddressingMode.ZeroPage, 5],
      [0xF6, 'INC', this.INC, AddressingMode.ZeroPageX, 6],
      [0xEE, 'INC', this.INC, AddressingMode.Absolute, 6],
      [0xFE, 'INC', this.INC, AddressingMode.AbsoluteX, 7],
      [0xE8, 'INX', this.INX, AddressingMode.Implicit, 2],
      [0xC8, 'INY', this.INY, AddressingMode.Implicit, 2],

      [0xC6, 'DEC', this.DEC, AddressingMode.ZeroPage, 5],
      [0xD6, 'DEC', this.DEC, AddressingMode.ZeroPageX, 6],
      [0xCE, 'DEC', this.DEC, AddressingMode.Absolute, 6],
      [0xDE, 'DEC', this.DEC, AddressingMode.AbsoluteX, 7],
      [0xCA, 'DEX', this.DEX, AddressingMode.Implicit, 2],
      [0x88, 'DEY', this.DEY, AddressingMode.Implicit, 2],

      // 邏輯運算
      [0x29, 'AND', this.AND, AddressingMode.Immediate, 2],
      [0x25, 'AND', this.AND, AddressingMode.ZeroPage, 3],
      [0x35, 'AND', this.AND, AddressingMode.ZeroPageX, 4],
      [0x2D, 'AND', this.AND, AddressingMode.Absolute, 4],
      [0x3D, 'AND', this.AND, AddressingMode.AbsoluteX, 4],
      [0x39, 'AND', this.AND, AddressingMode.AbsoluteY, 4],
      [0x21, 'AND', this.AND, AddressingMode.IndexedIndirectX, 6],
      [0x31, 'AND', this.AND, AddressingMode.IndirectIndexedY, 5],

      [0x09, 'ORA', this.ORA, AddressingMode.Immediate, 2],
      [0x05, 'ORA', this.ORA, AddressingMode.ZeroPage, 3],
      [0x15, 'ORA', this.ORA, AddressingMode.ZeroPageX, 4],
      [0x0D, 'ORA', this.ORA, AddressingMode.Absolute, 4],
      [0x1D, 'ORA', this.ORA, AddressingMode.AbsoluteX, 4],
      [0x19, 'ORA', this.ORA, AddressingMode.AbsoluteY, 4],
      [0x01, 'ORA', this.ORA, AddressingMode.IndexedIndirectX, 6],
      [0x11, 'ORA', this.ORA, AddressingMode.IndirectIndexedY, 5],

      [0x49, 'EOR', this.EOR, AddressingMode.Immediate, 2],
      [0x45, 'EOR', this.EOR, AddressingMode.ZeroPage, 3],
      [0x55, 'EOR', this.EOR, AddressingMode.ZeroPageX, 4],
      [0x4D, 'EOR', this.EOR, AddressingMode.Absolute, 4],
      [0x5D, 'EOR', this.EOR, AddressingMode.AbsoluteX, 4],
      [0x59, 'EOR', this.EOR, AddressingMode.AbsoluteY, 4],
      [0x41, 'EOR', this.EOR, AddressingMode.IndexedIndirectX, 6],
      [0x51, 'EOR', this.EOR, AddressingMode.IndirectIndexedY, 5],

      [0x24, 'BIT', this.BIT, AddressingMode.ZeroPage, 3],
      [0x2C, 'BIT', this.BIT, AddressingMode.Absolute, 4],

      // 移位運算
      [0x0A, 'ASL', this.ASL, AddressingMode.Accumulator, 2],
      [0x06, 'ASL', this.ASL, AddressingMode.ZeroPage, 5],
      [0x16, 'ASL', this.ASL, AddressingMode.ZeroPageX, 6],
      [0x0E, 'ASL', this.ASL, AddressingMode.Absolute, 6],
      [0x1E, 'ASL', this.ASL, AddressingMode.AbsoluteX, 7],

      [0x4A, 'LSR', this.LSR, AddressingMode.Accumulator, 2],
      [0x46, 'LSR', this.LSR, AddressingMode.ZeroPage, 5],
      [0x56, 'LSR', this.LSR, AddressingMode.ZeroPageX, 6],
      [0x4E, 'LSR', this.LSR, AddressingMode.Absolute, 6],
      [0x5E, 'LSR', this.LSR, AddressingMode.AbsoluteX, 7],

      [0x2A, 'ROL', this.ROL, AddressingMode.Accumulator, 2],
      [0x26, 'ROL', this.ROL, AddressingMode.ZeroPage, 5],
      [0x36, 'ROL', this.ROL, AddressingMode.ZeroPageX, 6],
      [0x2E, 'ROL', this.ROL, AddressingMode.Absolute, 6],
      [0x3E, 'ROL', this.ROL, AddressingMode.AbsoluteX, 7],

      [0x6A, 'ROR', this.ROR, AddressingMode.Accumulator, 2],
      [0x66, 'ROR', this.ROR, AddressingMode.ZeroPage, 5],
      [0x76, 'ROR', this.ROR, AddressingMode.ZeroPageX, 6],
      [0x6E, 'ROR', this.ROR, AddressingMode.Absolute, 6],
      [0x7E, 'ROR', this.ROR, AddressingMode.AbsoluteX, 7],

      // 跳躍和呼叫
      [0x4C, 'JMP', this.JMP, AddressingMode.Absolute, 3],
      [0x6C, 'JMP', this.JMP, AddressingMode.Indirect, 5],
      [0x20, 'JSR', this.JSR, AddressingMode.Absolute, 6],
      [0x60, 'RTS', this.RTS, AddressingMode.Implicit, 6],

      // 分支指令
      [0x90, 'BCC', this.BCC, AddressingMode.Relative, 2],
      [0xB0, 'BCS', this.BCS, AddressingMode.Relative, 2],
      [0xF0, 'BEQ', this.BEQ, AddressingMode.Relative, 2],
      [0x30, 'BMI', this.BMI, AddressingMode.Relative, 2],
      [0xD0, 'BNE', this.BNE, AddressingMode.Relative, 2],
      [0x10, 'BPL', this.BPL, AddressingMode.Relative, 2],
      [0x50, 'BVC', this.BVC, AddressingMode.Relative, 2],
      [0x70, 'BVS', this.BVS, AddressingMode.Relative, 2],

      // 旗標操作
      [0x18, 'CLC', this.CLC, AddressingMode.Implicit, 2],
      [0xD8, 'CLD', this.CLD, AddressingMode.Implicit, 2],
      [0x58, 'CLI', this.CLI, AddressingMode.Implicit, 2],
      [0xB8, 'CLV', this.CLV, AddressingMode.Implicit, 2],
      [0x38, 'SEC', this.SEC, AddressingMode.Implicit, 2],
      [0xF8, 'SED', this.SED, AddressingMode.Implicit, 2],
      [0x78, 'SEI', this.SEI, AddressingMode.Implicit, 2],

      // 系統指令
      [0x00, 'BRK', this.BRK, AddressingMode.Implicit, 7],
      [0xEA, 'NOP', this.NOP, AddressingMode.Implicit, 2],
      [0x40, 'RTI', this.RTI, AddressingMode.Implicit, 6],
    ];

    // 填入指令表
    for (const [opcode, name, execute, mode, cycles] of instructions) {
      table[opcode] = { name, execute, mode, cycles };
    }

    return table;
  }

  // ===== 除錯方法 =====

  /** 取得當前 CPU 狀態的字串表示 */
  public getState(): string {
    const flags = [
      this.getFlag(CpuFlags.N) ? 'N' : '-',
      this.getFlag(CpuFlags.V) ? 'V' : '-',
      '-',
      this.getFlag(CpuFlags.B) ? 'B' : '-',
      this.getFlag(CpuFlags.D) ? 'D' : '-',
      this.getFlag(CpuFlags.I) ? 'I' : '-',
      this.getFlag(CpuFlags.Z) ? 'Z' : '-',
      this.getFlag(CpuFlags.C) ? 'C' : '-',
    ].join('');

    return `PC:${this.pc.toString(16).padStart(4, '0').toUpperCase()} ` +
           `A:${this.a.toString(16).padStart(2, '0').toUpperCase()} ` +
           `X:${this.x.toString(16).padStart(2, '0').toUpperCase()} ` +
           `Y:${this.y.toString(16).padStart(2, '0').toUpperCase()} ` +
           `SP:${this.sp.toString(16).padStart(2, '0').toUpperCase()} ` +
           `[${flags}]`;
  }

  /** 反組譯指定位址的指令 */
  public disassemble(address: number): { instruction: string; bytes: number } {
    const opcode = this.read(address);
    const instruction = this.instructions[opcode];
    let bytes = 1;
    let operand = '';

    switch (instruction.mode) {
      case AddressingMode.Immediate:
        operand = `#$${this.read(address + 1).toString(16).padStart(2, '0').toUpperCase()}`;
        bytes = 2;
        break;
      case AddressingMode.ZeroPage:
        operand = `$${this.read(address + 1).toString(16).padStart(2, '0').toUpperCase()}`;
        bytes = 2;
        break;
      case AddressingMode.ZeroPageX:
        operand = `$${this.read(address + 1).toString(16).padStart(2, '0').toUpperCase()},X`;
        bytes = 2;
        break;
      case AddressingMode.ZeroPageY:
        operand = `$${this.read(address + 1).toString(16).padStart(2, '0').toUpperCase()},Y`;
        bytes = 2;
        break;
      case AddressingMode.Absolute:
        const absAddr = this.read(address + 1) | (this.read(address + 2) << 8);
        operand = `$${absAddr.toString(16).padStart(4, '0').toUpperCase()}`;
        bytes = 3;
        break;
      case AddressingMode.AbsoluteX:
        const absXAddr = this.read(address + 1) | (this.read(address + 2) << 8);
        operand = `$${absXAddr.toString(16).padStart(4, '0').toUpperCase()},X`;
        bytes = 3;
        break;
      case AddressingMode.AbsoluteY:
        const absYAddr = this.read(address + 1) | (this.read(address + 2) << 8);
        operand = `$${absYAddr.toString(16).padStart(4, '0').toUpperCase()},Y`;
        bytes = 3;
        break;
      case AddressingMode.Indirect:
        const indAddr = this.read(address + 1) | (this.read(address + 2) << 8);
        operand = `($${indAddr.toString(16).padStart(4, '0').toUpperCase()})`;
        bytes = 3;
        break;
      case AddressingMode.IndexedIndirectX:
        operand = `($${this.read(address + 1).toString(16).padStart(2, '0').toUpperCase()},X)`;
        bytes = 2;
        break;
      case AddressingMode.IndirectIndexedY:
        operand = `($${this.read(address + 1).toString(16).padStart(2, '0').toUpperCase()}),Y`;
        bytes = 2;
        break;
      case AddressingMode.Relative:
        let offset = this.read(address + 1);
        if (offset & 0x80) offset = offset - 256;
        const target = address + 2 + offset;
        operand = `$${target.toString(16).padStart(4, '0').toUpperCase()}`;
        bytes = 2;
        break;
      case AddressingMode.Accumulator:
        operand = 'A';
        break;
    }

    return {
      instruction: `${instruction.name} ${operand}`.trim(),
      bytes,
    };
  }

  // ===== 序列化 (存檔) =====

  /** 儲存狀態 */
  public saveState(): object {
    return {
      a: this.a,
      x: this.x,
      y: this.y,
      sp: this.sp,
      pc: this.pc,
      status: this.status,
      cycles: this.cycles,
      absoluteAddress: this.absoluteAddress,
      relativeAddress: this.relativeAddress,
      opcode: this.opcode,
      fetchedData: this.fetchedData,
      totalCycles: this.totalCycles,
    };
  }

  /** 載入狀態 */
  public loadState(state: any): void {
    this.a = state.a;
    this.x = state.x;
    this.y = state.y;
    this.sp = state.sp;
    this.pc = state.pc;
    this.status = state.status;
    this.cycles = state.cycles;
    this.absoluteAddress = state.absoluteAddress;
    this.relativeAddress = state.relativeAddress;
    this.opcode = state.opcode;
    this.fetchedData = state.fetchedData;
    this.totalCycles = state.totalCycles;
  }
}
