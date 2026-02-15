#!/usr/bin/env node
/**
 * 簡易 CPU 追蹤器 - 追蹤 NES ROM 前 N 條指令
 * 重點：觀察哪些寫入 mapper 暫存器的指令，以及 CPU 是否卡在迴圈中
 */
const fs = require('fs');
const path = require('path');

const ROMS_DIR = path.join(__dirname, '..', 'roms');

function parseHeader(data) {
  const prgBanks = data[4];
  const chrBanks = data[5];
  const flags6 = data[6];
  const flags7 = data[7];
  const mapper = (flags6 >> 4) | (flags7 & 0xF0);
  const hasTrainer = !!(flags6 & 4);
  const headerSize = 16;
  const trainerSize = hasTrainer ? 512 : 0;
  const prgStart = headerSize + trainerSize;
  const prgSize = prgBanks * 16384;
  const chrStart = prgStart + prgSize;
  const chrSize = chrBanks * 8192;
  const mirroring = (flags6 & 1) ? 1 : 0; // 1=vert, 0=horiz
  return { mapper, prgBanks, chrBanks, prgStart, prgSize, chrStart, chrSize, mirroring };
}

// 簡易 Mapper 模擬
class MapperSim {
  constructor(header, data) {
    this.header = header;
    this.data = data;
    this.mapper = header.mapper;
    // 共用
    this.prgBank = 0;
    this.prgMode = 0;
    this.chrBank = 0;
    this.mirrorMode = header.mirroring;
    // Mapper 15
    this.p_bit = 0;
    // Mapper 4
    this.registers = new Array(8).fill(0);
    this.bankSelect = 0;
    this.prgRomBankMode = false;
    this.chrA12Inversion = false;
  }

  cpuRead(addr) {
    if (addr < 0x2000) return 0; // RAM (would need simulation)
    if (addr >= 0x8000) {
      const offset = this.mapPrg(addr);
      return this.data[this.header.prgStart + (offset % this.header.prgSize)];
    }
    if (addr >= 0x6000 && addr < 0x8000) return 0; // PRG RAM
    return 0; // PPU / APU / etc
  }

  cpuWrite(addr, data) {
    if (addr >= 0x8000) {
      return this.mapperWrite(addr, data);
    }
    return null;
  }

  mapPrg(addr) {
    switch (this.mapper) {
      case 4: return this.mapPrg4(addr);
      case 15: return this.mapPrg15(addr);
      case 225: return this.mapPrg225(addr);
      default: return (addr & 0x7FFF) % this.header.prgSize;
    }
  }

  mapPrg4(addr) {
    const lastBank = this.header.prgBanks * 2 - 1;
    const secondLast = this.header.prgBanks * 2 - 2;
    let bank;
    if (addr < 0xA000) bank = this.prgRomBankMode ? secondLast : (this.registers[6] & 0x3F);
    else if (addr < 0xC000) bank = this.registers[7] & 0x3F;
    else if (addr < 0xE000) bank = this.prgRomBankMode ? (this.registers[6] & 0x3F) : secondLast;
    else bank = lastBank;
    return bank * 8192 + (addr & 0x1FFF);
  }

  mapPrg15(addr) {
    const bank8k = this.prgBank * 2;
    const totalBanks = this.header.prgBanks * 2;
    switch (this.prgMode) {
      case 0: {
        const base = (bank8k & ~3) % totalBanks;
        return base * 8192 + (addr & 0x7FFF);
      }
      case 1: {
        if (addr < 0xC000) {
          return (bank8k % totalBanks) * 8192 + (addr & 0x3FFF);
        } else {
          const last = (bank8k & ~7) | 6;
          return (last % totalBanks) * 8192 + (addr & 0x3FFF);
        }
      }
      case 2: {
        return (bank8k % totalBanks) * 8192 + (addr & 0x1FFF);
      }
      default: {
        return (bank8k % totalBanks) * 8192 + (addr & 0x3FFF);
      }
    }
  }

  mapPrg225(addr) {
    const totalPrg = this.header.prgSize;
    if (this.prgMode === 0) {
      const bank32k = this.prgBank >> 1;
      return ((bank32k * 32768) + (addr & 0x7FFF)) % totalPrg;
    } else {
      return ((this.prgBank * 16384) + (addr & 0x3FFF)) % totalPrg;
    }
  }

  mapperWrite(addr, data) {
    switch (this.mapper) {
      case 4: return this.write4(addr, data);
      case 15: return this.write15(addr, data);
      case 225: return this.write225(addr, data);
    }
    return null;
  }

  write4(addr, data) {
    const even = (addr & 1) === 0;
    const region = (addr >> 13) & 0x03;
    let info = `MMC3: `;
    if (region === 0) {
      if (even) {
        this.bankSelect = data & 0x07;
        this.prgRomBankMode = !!(data & 0x40);
        this.chrA12Inversion = !!(data & 0x80);
        info += `bankSelect=${this.bankSelect}, prgMode=${this.prgRomBankMode?1:0}, chrInv=${this.chrA12Inversion?1:0}`;
      } else {
        this.registers[this.bankSelect] = data;
        info += `R${this.bankSelect}=${data}`;
      }
    } else if (region === 1) {
      if (even) {
        this.mirrorMode = data & 1;
        info += `mirror=${data & 1 ? 'H' : 'V'}`;
      }
    } else if (region === 2) {
      info += even ? `irqLatch=${data}` : `irqReload`;
    } else {
      info += even ? `irqDisable` : `irqEnable`;
    }
    return info;
  }

  write15(addr, data) {
    this.prgMode = addr & 0x03;
    this.prgBank = (data & 0x3F) | ((data & 0x80) >> 1);
    this.mirrorMode = (data & 0x40) ? 1 : 0;
    const modeNames = ['NROM-256(32KB)', 'UNROM', 'NROM-64(8KB)', 'NROM-128(16KB)'];
    return `M15: mode=${this.prgMode}(${modeNames[this.prgMode]}), bank=${this.prgBank}, mir=${this.mirrorMode?'H':'V'}`;
  }

  write225(addr, data) {
    // FCEUX: correct bit layout
    const bank = (addr >> 14) & 1;
    this.chrBank = (addr & 0x3F) | (bank << 6);
    this.prgBank = ((addr >> 6) & 0x3F) | (bank << 6);
    this.prgMode = (addr >> 12) & 1;
    this.mirrorMode = (addr >> 13) & 1;
    return `M225(FCEUX): prg=${this.prgBank}, chr=${this.chrBank}, mode=${this.prgMode}, mir=${this.mirrorMode}`;
  }
}

// 極簡 6502 CPU
class SimpleCpu {
  constructor(mapper) {
    this.mapper = mapper;
    this.a = 0; this.x = 0; this.y = 0;
    this.sp = 0xFD; this.status = 0x24;
    this.ram = new Uint8Array(2048);
    this.prgRam = new Uint8Array(8192);
    
    // 讀 reset vector
    const lo = mapper.cpuRead(0xFFFC);
    const hi = mapper.cpuRead(0xFFFD);
    this.pc = (hi << 8) | lo;
    this.log = [];
    this.steps = 0;
    this.stuckCount = 0;
    this.lastPC = -1;
    this.pcHistory = new Map();
  }

  read(addr) {
    if (addr < 0x2000) return this.ram[addr & 0x7FF];
    if (addr >= 0x6000 && addr < 0x8000) return this.prgRam[addr - 0x6000];
    if (addr >= 0x2000 && addr < 0x4020) return 0; // PPU/APU stub
    return this.mapper.cpuRead(addr);
  }

  write(addr, val) {
    val &= 0xFF;
    if (addr < 0x2000) { this.ram[addr & 0x7FF] = val; return; }
    if (addr >= 0x6000 && addr < 0x8000) { this.prgRam[addr - 0x6000] = val; return; }
    if (addr >= 0x2000 && addr < 0x4020) return; // PPU/APU stub
    const info = this.mapper.cpuWrite(addr, val);
    if (info) {
      this.log.push(`  [MAPPER WRITE] $${addr.toString(16).toUpperCase()} <- $${val.toString(16).padStart(2, '0').toUpperCase()}: ${info}`);
    }
  }

  push(val) { this.write(0x100 + this.sp, val); this.sp = (this.sp - 1) & 0xFF; }
  pull() { this.sp = (this.sp + 1) & 0xFF; return this.read(0x100 + this.sp); }
  push16(val) { this.push((val >> 8) & 0xFF); this.push(val & 0xFF); }
  pull16() { const lo = this.pull(); return lo | (this.pull() << 8); }

  getFlag(bit) { return (this.status >> bit) & 1; }
  setFlag(bit, v) { if (v) this.status |= (1 << bit); else this.status &= ~(1 << bit); }
  setNZ(v) { this.setFlag(1, v === 0); this.setFlag(7, v & 0x80); return v & 0xFF; }

  step() {
    const pc = this.pc;
    
    // 偵測迴圈
    const count = this.pcHistory.get(pc) || 0;
    this.pcHistory.set(pc, count + 1);
    if (count > 100) {
      // 卡在同一個地址超過 100 次，可能是等待 PPU/硬體
      return 'STUCK';
    }

    const op = this.read(pc);
    this.pc = (pc + 1) & 0xFFFF;

    switch (op) {
      case 0x78: this.setFlag(2, true); break; // SEI
      case 0xD8: this.setFlag(3, false); break; // CLD
      case 0x18: this.setFlag(0, false); break; // CLC
      case 0x38: this.setFlag(0, true); break; // SEC
      case 0xF8: this.setFlag(3, true); break; // SED
      case 0xEA: break; // NOP
      
      case 0xA9: this.a = this.setNZ(this.read(this.pc++)); break; // LDA imm
      case 0xA2: this.x = this.setNZ(this.read(this.pc++)); break; // LDX imm
      case 0xA0: this.y = this.setNZ(this.read(this.pc++)); break; // LDY imm
      
      case 0x85: this.write(this.read(this.pc++), this.a); break; // STA zpg
      case 0x86: this.write(this.read(this.pc++), this.x); break; // STX zpg
      case 0x84: this.write(this.read(this.pc++), this.y); break; // STY zpg
      case 0x95: this.write((this.read(this.pc++) + this.x) & 0xFF, this.a); break; // STA zpg,X
      
      case 0x8D: { const a = this.read(this.pc) | (this.read(this.pc+1)<<8); this.pc+=2; this.write(a, this.a); break; } // STA abs
      case 0x8E: { const a = this.read(this.pc) | (this.read(this.pc+1)<<8); this.pc+=2; this.write(a, this.x); break; } // STX abs
      case 0x8C: { const a = this.read(this.pc) | (this.read(this.pc+1)<<8); this.pc+=2; this.write(a, this.y); break; } // STY abs
      case 0x9D: { const a = (this.read(this.pc) | (this.read(this.pc+1)<<8)) + this.x; this.pc+=2; this.write(a & 0xFFFF, this.a); break; } // STA abs,X
      case 0x99: { const a = (this.read(this.pc) | (this.read(this.pc+1)<<8)) + this.y; this.pc+=2; this.write(a & 0xFFFF, this.a); break; } // STA abs,Y
      
      case 0xAD: { const a = this.read(this.pc) | (this.read(this.pc+1)<<8); this.pc+=2; this.a = this.setNZ(this.read(a)); break; } // LDA abs
      case 0xAE: { const a = this.read(this.pc) | (this.read(this.pc+1)<<8); this.pc+=2; this.x = this.setNZ(this.read(a)); break; } // LDX abs
      case 0xAC: { const a = this.read(this.pc) | (this.read(this.pc+1)<<8); this.pc+=2; this.y = this.setNZ(this.read(a)); break; } // LDY abs
      case 0xBD: { const a = (this.read(this.pc) | (this.read(this.pc+1)<<8)); this.pc+=2; this.a = this.setNZ(this.read((a + this.x) & 0xFFFF)); break; } // LDA abs,X
      case 0xB9: { const a = (this.read(this.pc) | (this.read(this.pc+1)<<8)); this.pc+=2; this.a = this.setNZ(this.read((a + this.y) & 0xFFFF)); break; } // LDA abs,Y
      case 0xA5: this.a = this.setNZ(this.read(this.read(this.pc++))); break; // LDA zpg
      case 0xA6: this.x = this.setNZ(this.read(this.read(this.pc++))); break; // LDX zpg
      case 0xA4: this.y = this.setNZ(this.read(this.read(this.pc++))); break; // LDY zpg
      case 0xB5: this.a = this.setNZ(this.read((this.read(this.pc++) + this.x) & 0xFF)); break; // LDA zpg,X
      
      case 0xB1: { // LDA (zpg),Y
        const zp = this.read(this.pc++);
        const base = this.read(zp) | (this.read((zp+1)&0xFF) << 8);
        this.a = this.setNZ(this.read((base + this.y) & 0xFFFF));
        break;
      }
      case 0x91: { // STA (zpg),Y
        const zp = this.read(this.pc++);
        const base = this.read(zp) | (this.read((zp+1)&0xFF) << 8);
        this.write((base + this.y) & 0xFFFF, this.a);
        break;
      }
      
      case 0x9A: this.sp = this.x; break; // TXS
      case 0xBA: this.x = this.setNZ(this.sp); break; // TSX
      case 0xAA: this.x = this.setNZ(this.a); break; // TAX
      case 0xA8: this.y = this.setNZ(this.a); break; // TAY
      case 0x8A: this.a = this.setNZ(this.x); break; // TXA
      case 0x98: this.a = this.setNZ(this.y); break; // TYA
      
      case 0xE8: this.x = this.setNZ((this.x + 1) & 0xFF); break; // INX
      case 0xC8: this.y = this.setNZ((this.y + 1) & 0xFF); break; // INY
      case 0xCA: this.x = this.setNZ((this.x - 1) & 0xFF); break; // DEX
      case 0x88: this.y = this.setNZ((this.y - 1) & 0xFF); break; // DEY
      
      case 0x29: this.a = this.setNZ(this.a & this.read(this.pc++)); break; // AND imm
      case 0x09: this.a = this.setNZ(this.a | this.read(this.pc++)); break; // ORA imm
      case 0x49: this.a = this.setNZ(this.a ^ this.read(this.pc++)); break; // EOR imm
      
      case 0xC9: { const m = this.read(this.pc++); const r = this.a - m; this.setFlag(0, this.a >= m); this.setNZ(r & 0xFF); break; } // CMP imm
      case 0xE0: { const m = this.read(this.pc++); const r = this.x - m; this.setFlag(0, this.x >= m); this.setNZ(r & 0xFF); break; } // CPX imm
      case 0xC0: { const m = this.read(this.pc++); const r = this.y - m; this.setFlag(0, this.y >= m); this.setNZ(r & 0xFF); break; } // CPY imm
      case 0xCD: { const a = this.read(this.pc)|(this.read(this.pc+1)<<8); this.pc+=2; const m = this.read(a); const r = this.a - m; this.setFlag(0, this.a >= m); this.setNZ(r & 0xFF); break; } // CMP abs
      case 0xEC: { const a = this.read(this.pc)|(this.read(this.pc+1)<<8); this.pc+=2; const m = this.read(a); const r = this.x - m; this.setFlag(0, this.x >= m); this.setNZ(r & 0xFF); break; } // CPX abs
      case 0xCC: { const a = this.read(this.pc)|(this.read(this.pc+1)<<8); this.pc+=2; const m = this.read(a); const r = this.y - m; this.setFlag(0, this.y >= m); this.setNZ(r & 0xFF); break; } // CPY abs
      case 0xC5: { const m = this.read(this.read(this.pc++)); const r = this.a - m; this.setFlag(0, this.a >= m); this.setNZ(r & 0xFF); break; } // CMP zpg
      
      // 分支指令
      case 0x10: { const off = this.read(this.pc++); if (!(this.status & 0x80)) this.pc = (this.pc + (off > 127 ? off - 256 : off)) & 0xFFFF; break; } // BPL
      case 0x30: { const off = this.read(this.pc++); if (this.status & 0x80) this.pc = (this.pc + (off > 127 ? off - 256 : off)) & 0xFFFF; break; } // BMI
      case 0xD0: { const off = this.read(this.pc++); if (!(this.status & 0x02)) this.pc = (this.pc + (off > 127 ? off - 256 : off)) & 0xFFFF; break; } // BNE
      case 0xF0: { const off = this.read(this.pc++); if (this.status & 0x02) this.pc = (this.pc + (off > 127 ? off - 256 : off)) & 0xFFFF; break; } // BEQ
      case 0x90: { const off = this.read(this.pc++); if (!(this.status & 0x01)) this.pc = (this.pc + (off > 127 ? off - 256 : off)) & 0xFFFF; break; } // BCC
      case 0xB0: { const off = this.read(this.pc++); if (this.status & 0x01) this.pc = (this.pc + (off > 127 ? off - 256 : off)) & 0xFFFF; break; } // BCS
      
      case 0x4C: { const a = this.read(this.pc) | (this.read(this.pc+1)<<8); this.pc = a; break; } // JMP abs
      case 0x6C: { // JMP ind
        const ptr = this.read(this.pc) | (this.read(this.pc+1)<<8);
        // 6502 bug: if ptr is $xxFF, high byte wraps within page
        const lo = this.read(ptr);
        const hi = this.read((ptr & 0xFF00) | ((ptr + 1) & 0xFF));
        this.pc = (hi << 8) | lo;
        break;
      }
      case 0x20: { const a = this.read(this.pc) | (this.read(this.pc+1)<<8); this.pc+=2; this.push16(this.pc - 1); this.pc = a; break; } // JSR
      case 0x60: this.pc = (this.pull16() + 1) & 0xFFFF; break; // RTS
      case 0x40: this.status = this.pull() | 0x20; this.pc = this.pull16(); break; // RTI
      
      case 0x48: this.push(this.a); break; // PHA
      case 0x68: this.a = this.setNZ(this.pull()); break; // PLA
      case 0x08: this.push(this.status | 0x30); break; // PHP
      case 0x28: this.status = this.pull() | 0x20; break; // PLP
      
      case 0x0A: { const r = this.a << 1; this.setFlag(0, r & 0x100); this.a = this.setNZ(r & 0xFF); break; } // ASL A
      case 0x4A: { this.setFlag(0, this.a & 1); this.a = this.setNZ(this.a >> 1); break; } // LSR A
      case 0x2A: { const r = (this.a << 1) | this.getFlag(0); this.setFlag(0, r & 0x100); this.a = this.setNZ(r & 0xFF); break; } // ROL A
      case 0x6A: { const c = this.getFlag(0); this.setFlag(0, this.a & 1); this.a = this.setNZ((this.a >> 1) | (c << 7)); break; } // ROR A
      
      case 0x69: { // ADC imm
        const m = this.read(this.pc++);
        const c = this.getFlag(0);
        const r = this.a + m + c;
        this.setFlag(0, r > 0xFF);
        this.setFlag(6, (~(this.a ^ m) & (this.a ^ r)) & 0x80);
        this.a = this.setNZ(r & 0xFF);
        break;
      }
      case 0xE9: { // SBC imm
        const m = this.read(this.pc++);
        const c = this.getFlag(0);
        const r = this.a - m - (1 - c);
        this.setFlag(0, r >= 0);
        this.setFlag(6, ((this.a ^ m) & (this.a ^ r)) & 0x80);
        this.a = this.setNZ(r & 0xFF);
        break;
      }
      
      case 0x2C: { // BIT abs
        const a = this.read(this.pc) | (this.read(this.pc+1)<<8); this.pc+=2;
        const m = this.read(a);
        this.setFlag(7, m & 0x80);
        this.setFlag(6, m & 0x40);
        this.setFlag(1, (this.a & m) === 0);
        break;
      }
      case 0x24: { // BIT zpg
        const m = this.read(this.read(this.pc++));
        this.setFlag(7, m & 0x80);
        this.setFlag(6, m & 0x40);
        this.setFlag(1, (this.a & m) === 0);
        break;
      }

      case 0xEE: { const a = this.read(this.pc)|(this.read(this.pc+1)<<8); this.pc+=2; const v = this.setNZ((this.read(a)+1)&0xFF); this.write(a,v); break; } // INC abs
      case 0xCE: { const a = this.read(this.pc)|(this.read(this.pc+1)<<8); this.pc+=2; const v = this.setNZ((this.read(a)-1)&0xFF); this.write(a,v); break; } // DEC abs
      case 0xE6: { const z = this.read(this.pc++); const v = this.setNZ((this.read(z)+1)&0xFF); this.write(z,v); break; } // INC zpg
      case 0xC6: { const z = this.read(this.pc++); const v = this.setNZ((this.read(z)-1)&0xFF); this.write(z,v); break; } // DEC zpg
      
      case 0x25: this.a = this.setNZ(this.a & this.read(this.read(this.pc++))); break; // AND zpg
      case 0x05: this.a = this.setNZ(this.a | this.read(this.read(this.pc++))); break; // ORA zpg
      case 0x45: this.a = this.setNZ(this.a ^ this.read(this.read(this.pc++))); break; // EOR zpg
      case 0x2D: { const a = this.read(this.pc)|(this.read(this.pc+1)<<8); this.pc+=2; this.a = this.setNZ(this.a & this.read(a)); break; } // AND abs
      case 0x0D: { const a = this.read(this.pc)|(this.read(this.pc+1)<<8); this.pc+=2; this.a = this.setNZ(this.a | this.read(a)); break; } // ORA abs
      case 0x4D: { const a = this.read(this.pc)|(this.read(this.pc+1)<<8); this.pc+=2; this.a = this.setNZ(this.a ^ this.read(a)); break; } // EOR abs
      
      case 0x65: { // ADC zpg
        const m = this.read(this.read(this.pc++));
        const c = this.getFlag(0);
        const r = this.a + m + c;
        this.setFlag(0, r > 0xFF);
        this.setFlag(6, (~(this.a ^ m) & (this.a ^ r)) & 0x80);
        this.a = this.setNZ(r & 0xFF);
        break;
      }
      case 0xE5: { // SBC zpg
        const m = this.read(this.read(this.pc++));
        const c = this.getFlag(0);
        const r = this.a - m - (1 - c);
        this.setFlag(0, r >= 0);
        this.setFlag(6, ((this.a ^ m) & (this.a ^ r)) & 0x80);
        this.a = this.setNZ(r & 0xFF);
        break;
      }
      
      default:
        this.log.push(`  ⚠️ 未實作的指令 $${op.toString(16).padStart(2, '0').toUpperCase()} at $${pc.toString(16).padStart(4, '0').toUpperCase()}`);
        return 'UNKNOWN';
    }
    
    this.steps++;
    return 'OK';
  }
}

function traceRom(filename, maxSteps = 2000) {
  const filepath = path.join(ROMS_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.log(`\n❌ ${filename}: 不存在`);
    return;
  }
  const data = fs.readFileSync(filepath);
  const header = parseHeader(data);
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔍 追蹤 ${filename} (Mapper ${header.mapper})`);
  console.log(`${'='.repeat(70)}`);
  
  const mapper = new MapperSim(header, data);
  const cpu = new SimpleCpu(mapper);
  
  console.log(`  RESET vector: $${cpu.pc.toString(16).padStart(4, '0').toUpperCase()}`);
  
  let status = 'OK';
  for (let i = 0; i < maxSteps; i++) {
    status = cpu.step();
    if (status !== 'OK') break;
  }
  
  // 印出 mapper 寫入記錄
  if (cpu.log.length > 0) {
    console.log(`\n  Mapper 寫入 (${cpu.log.length} 次):`);
    cpu.log.forEach(l => console.log(l));
  } else {
    console.log(`\n  無 Mapper 寫入`);
  }
  
  console.log(`\n  結果: ${status} (${cpu.steps} 步)`);
  if (status === 'STUCK') {
    console.log(`  卡在 $${cpu.pc.toString(16).padStart(4, '0').toUpperCase()}`);
    // 顯示卡住的指令
    const op = cpu.read(cpu.pc);
    console.log(`  指令: $${op.toString(16).padStart(2, '0').toUpperCase()}`);
  }
  console.log(`  CPU 狀態: A=$${cpu.a.toString(16).padStart(2, '0')} X=$${cpu.x.toString(16).padStart(2, '0')} Y=$${cpu.y.toString(16).padStart(2, '0')} SP=$${cpu.sp.toString(16).padStart(2, '0')} P=$${cpu.status.toString(16).padStart(2, '0')}`);
}

// 追蹤所有問題 ROM
traceRom('100合1.NES', 3000);
traceRom('64-in-1.nes', 3000);
traceRom('SuperMarioBros3.nes', 3000);
