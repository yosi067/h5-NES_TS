#!/usr/bin/env node
/**
 * NES ROM 診斷工具
 * 分析 ROM header、mapper 行為、初始 bank 映射、reset vector
 * 並模擬前幾條指令來確認 mapper 是否正常
 */
const fs = require('fs');
const path = require('path');

const ROMS_DIR = path.join(__dirname, '..', 'roms');

// 要分析的 ROM 列表
const TARGET_ROMS = [
  'SuperMarioBros3.nes',
  '100合1.NES',
  '64-in-1.nes',
  '150-in-1.nes',
  '1200-in-1.nes',
];

function parseHeader(data) {
  if (data[0] !== 0x4E || data[1] !== 0x45 || data[2] !== 0x53 || data[3] !== 0x1A) {
    return null;
  }
  const prgBanks = data[4];
  const chrBanks = data[5];
  const flags6 = data[6];
  const flags7 = data[7];
  const mapper = (flags6 >> 4) | (flags7 & 0xF0);
  const mirroring = (flags6 & 1) ? 'Vertical' : 'Horizontal';
  const hasBattery = !!(flags6 & 2);
  const hasTrainer = !!(flags6 & 4);
  const fourScreen = !!(flags6 & 8);
  
  const headerSize = 16;
  const trainerSize = hasTrainer ? 512 : 0;
  const prgStart = headerSize + trainerSize;
  const prgSize = prgBanks * 16384;
  const chrStart = prgStart + prgSize;
  const chrSize = chrBanks * 8192;
  
  return {
    mapper, prgBanks, chrBanks, mirroring, hasBattery,
    hasTrainer, fourScreen, prgStart, prgSize, chrStart, chrSize,
    totalSize: data.length,
  };
}

function readPrgByte(data, header, prgOffset) {
  const idx = header.prgStart + (prgOffset % header.prgSize);
  return data[idx];
}

function readPrgWord(data, header, prgOffset) {
  return readPrgByte(data, header, prgOffset) | (readPrgByte(data, header, prgOffset + 1) << 8);
}

// 模擬 Mapper 的初始 PRG 映射，回傳 CPU 位址 -> PRG 偏移量
function getInitialPrgMapping(header) {
  const mapper = header.mapper;
  const prgBanks = header.prgBanks;
  const prgSize = header.prgSize;
  
  switch (mapper) {
    case 0: // NROM
      if (prgBanks === 1) {
        // 16KB mirrored
        return (addr) => (addr & 0x3FFF);
      }
      return (addr) => (addr & 0x7FFF);
      
    case 4: // MMC3
      // 初始狀態：registers=[0,0,0,0,0,0,0,0], prgRomBankMode=false
      // $8000-$9FFF = register[6] & 0x3F = 0 → bank 0
      // $A000-$BFFF = register[7] & 0x3F = 0 → bank 0
      // $C000-$DFFF = second-to-last 8KB bank
      // $E000-$FFFF = last 8KB bank
      return (addr) => {
        const totalBanks8k = prgBanks * 2;
        if (addr < 0xA000) return 0 * 8192 + (addr & 0x1FFF); // bank 0
        if (addr < 0xC000) return 0 * 8192 + (addr & 0x1FFF); // bank 0
        if (addr < 0xE000) return (totalBanks8k - 2) * 8192 + (addr & 0x1FFF);
        return (totalBanks8k - 1) * 8192 + (addr & 0x1FFF);
      };
      
    case 15: // 100-in-1
      // 初始狀態：prgBank=0, prgMode=0 (32KB mode)
      // bank8k = 0 * 2 = 0, bank8k & ~3 = 0
      // → first 32KB of PRG
      return (addr) => (addr & 0x7FFF) % prgSize;
      
    case 225: // 64-in-1
      // 初始狀態：prgBank=0, chrBank=0, prgMode=0
      // prg_mode=0 → 32KB mode, bank * 32768
      return (addr) => (addr & 0x7FFF) % prgSize;
      
    case 202: // 150-in-1
      // 初始狀態：bank=0
      // $8000-$BFFF = bank * 16384
      // $C000-$FFFF = (bank+1) * 16384
      return (addr) => {
        if (addr < 0xC000) return (addr & 0x3FFF) % prgSize;
        return (1 * 16384 + (addr & 0x3FFF)) % prgSize;
      };
      
    case 227: // 1200-in-1
      // 初始狀態：s=0,o=0,l=0,inner=0,outer=0
      // S=0,O=0 → UNROM-like
      // $8000-$BFFF = outer*8+inner = 0 → bank 0
      // $C000-$FFFF = l?7:0 → bank 0 (l=0)
      return (addr) => (addr & 0x3FFF) % prgSize;
      
    default:
      return (addr) => (addr & 0x7FFF) % prgSize;
  }
}

function disassemble6502(data, header, startAddr, count) {
  const mapping = getInitialPrgMapping(header);
  const result = [];
  let pc = startAddr;
  
  function readByte(addr) {
    if (addr >= 0x8000) {
      return readPrgByte(data, header, mapping(addr));
    }
    return 0; // RAM area
  }
  
  const opcodeNames = {
    0x78: ['SEI', 1, 'imp'], 0xD8: ['CLD', 1, 'imp'], 0x18: ['CLC', 1, 'imp'],
    0xA9: ['LDA', 2, 'imm'], 0xA2: ['LDX', 2, 'imm'], 0xA0: ['LDY', 2, 'imm'],
    0x8D: ['STA', 3, 'abs'], 0x8E: ['STX', 3, 'abs'], 0x8C: ['STY', 3, 'abs'],
    0x85: ['STA', 2, 'zpg'], 0x86: ['STX', 2, 'zpg'], 0x84: ['STY', 2, 'zpg'],
    0x9A: ['TXS', 1, 'imp'], 0xAA: ['TAX', 1, 'imp'], 0xA8: ['TAY', 1, 'imp'],
    0x4C: ['JMP', 3, 'abs'], 0x6C: ['JMP', 3, 'ind'], 0x20: ['JSR', 3, 'abs'],
    0x60: ['RTS', 1, 'imp'], 0x40: ['RTI', 1, 'imp'],
    0xE8: ['INX', 1, 'imp'], 0xC8: ['INY', 1, 'imp'],
    0xCA: ['DEX', 1, 'imp'], 0x88: ['DEY', 1, 'imp'],
    0x10: ['BPL', 2, 'rel'], 0x30: ['BMI', 2, 'rel'],
    0xD0: ['BNE', 2, 'rel'], 0xF0: ['BEQ', 2, 'rel'],
    0x90: ['BCC', 2, 'rel'], 0xB0: ['BCS', 2, 'rel'],
    0xAD: ['LDA', 3, 'abs'], 0xAE: ['LDX', 3, 'abs'], 0xAC: ['LDY', 3, 'abs'],
    0xBD: ['LDA', 3, 'abx'], 0xB9: ['LDA', 3, 'aby'],
    0x29: ['AND', 2, 'imm'], 0x09: ['ORA', 2, 'imm'], 0x49: ['EOR', 2, 'imm'],
    0xC9: ['CMP', 2, 'imm'], 0xE0: ['CPX', 2, 'imm'], 0xC0: ['CPY', 2, 'imm'],
    0xEA: ['NOP', 1, 'imp'],
    0x2C: ['BIT', 3, 'abs'], 0x24: ['BIT', 2, 'zpg'],
    0x48: ['PHA', 1, 'imp'], 0x68: ['PLA', 1, 'imp'],
    0xE9: ['SBC', 2, 'imm'], 0x69: ['ADC', 2, 'imm'],
    0xCE: ['DEC', 3, 'abs'], 0xEE: ['INC', 3, 'abs'],
    0x91: ['STA', 2, 'iny'], 0xB1: ['LDA', 2, 'iny'],
    0x81: ['STA', 2, 'inx'], 0xA1: ['LDA', 2, 'inx'],
    0x01: ['ORA', 2, 'inx'], 0x11: ['ORA', 2, 'iny'],
    0x99: ['STA', 3, 'aby'], 0x9D: ['STA', 3, 'abx'],
    0x38: ['SEC', 1, 'imp'], 0xF8: ['SED', 1, 'imp'],
    0x4A: ['LSR', 1, 'acc'], 0x0A: ['ASL', 1, 'acc'],
    0x6A: ['ROR', 1, 'acc'], 0x2A: ['ROL', 1, 'acc'],
  };
  
  for (let i = 0; i < count && pc < 0x10000; i++) {
    const opcode = readByte(pc);
    const info = opcodeNames[opcode];
    
    if (info) {
      const [name, size, mode] = info;
      let operand = '';
      if (size === 2) {
        const b = readByte(pc + 1);
        if (mode === 'imm') operand = `#$${b.toString(16).padStart(2, '0').toUpperCase()}`;
        else if (mode === 'rel') {
          const target = pc + 2 + ((b > 127) ? b - 256 : b);
          operand = `$${target.toString(16).padStart(4, '0').toUpperCase()}`;
        }
        else if (mode === 'zpg') operand = `$${b.toString(16).padStart(2, '0').toUpperCase()}`;
        else if (mode === 'inx') operand = `($${b.toString(16).padStart(2, '0').toUpperCase()},X)`;
        else if (mode === 'iny') operand = `($${b.toString(16).padStart(2, '0').toUpperCase()}),Y`;
        else operand = `$${b.toString(16).padStart(2, '0').toUpperCase()}`;
      } else if (size === 3) {
        const w = readByte(pc + 1) | (readByte(pc + 2) << 8);
        if (mode === 'abs') operand = `$${w.toString(16).padStart(4, '0').toUpperCase()}`;
        else if (mode === 'abx') operand = `$${w.toString(16).padStart(4, '0').toUpperCase()},X`;
        else if (mode === 'aby') operand = `$${w.toString(16).padStart(4, '0').toUpperCase()},Y`;
        else if (mode === 'ind') operand = `($${w.toString(16).padStart(4, '0').toUpperCase()})`;
        else operand = `$${w.toString(16).padStart(4, '0').toUpperCase()}`;
      }
      result.push(`  $${pc.toString(16).padStart(4, '0').toUpperCase()}: ${name} ${operand}`.trimEnd());
      pc += size;
    } else {
      result.push(`  $${pc.toString(16).padStart(4, '0').toUpperCase()}: .db $${opcode.toString(16).padStart(2, '0').toUpperCase()}`);
      pc += 1;
    }
  }
  return result;
}

// 分析 mapper 15 的 cpu_write 行為
function analyzeMapper15Write(addr, data, prgBanks) {
  const prgMode = addr & 0x03;
  const prgBank = (data & 0x3F) | ((data & 0x80) >> 1);
  const mirror = (data & 0x40) ? 'H' : 'V';
  const bank8k = prgBank * 2;
  const totalBanks = prgBanks * 2;
  
  const modeNames = ['32KB(NROM-256)', 'UNROM(128KB)', '8KB(NROM-64)', '16KB(NROM-128)'];
  let bankInfo = '';
  
  switch (prgMode) {
    case 0:
      bankInfo = `$8000-$FFFF = 32KB bank ${(bank8k & ~3) >> 2}`;
      break;
    case 1:
      bankInfo = `$8000 = 8KB #${bank8k}, $C000 = 8KB #${(bank8k & ~7) | 6}..#${(bank8k & ~7) | 7}`;
      break;
    case 2:
      bankInfo = `$8000 = 8KB #${bank8k} (mirrored 4x)`;
      break;
    case 3:
      bankInfo = `$8000 = 16KB #${bank8k >> 1}, $C000 = same`;
      break;
  }
  
  return `Mode ${prgMode}(${modeNames[prgMode]}), bank=${prgBank}, mirror=${mirror}, ${bankInfo}`;
}

function analyzeRom(filename) {
  const filepath = path.join(ROMS_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.log(`\n❌ ${filename}: 檔案不存在`);
    return;
  }
  
  const data = fs.readFileSync(filepath);
  const header = parseHeader(data);
  if (!header) {
    console.log(`\n❌ ${filename}: 無效的 NES 檔案`);
    return;
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📦 ${filename}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`  Mapper: ${header.mapper}`);
  console.log(`  PRG: ${header.prgBanks} x 16KB = ${header.prgSize / 1024}KB`);
  console.log(`  CHR: ${header.chrBanks} x 8KB = ${header.chrSize / 1024}KB${header.chrBanks === 0 ? ' (CHR RAM)' : ''}`);
  console.log(`  Mirroring: ${header.mirroring}${header.fourScreen ? ' (4-screen)' : ''}`);
  console.log(`  File size: ${data.length} bytes`);
  
  // Reset vector
  const mapping = getInitialPrgMapping(header);
  const resetVecLo = readPrgByte(data, header, mapping(0xFFFC));
  const resetVecHi = readPrgByte(data, header, mapping(0xFFFD));
  const resetVec = (resetVecHi << 8) | resetVecLo;
  
  const nmiVecLo = readPrgByte(data, header, mapping(0xFFFA));
  const nmiVecHi = readPrgByte(data, header, mapping(0xFFFB));
  const nmiVec = (nmiVecHi << 8) | nmiVecLo;
  
  const irqVecLo = readPrgByte(data, header, mapping(0xFFFE));
  const irqVecHi = readPrgByte(data, header, mapping(0xFFFF));
  const irqVec = (irqVecHi << 8) | irqVecLo;
  
  console.log(`\n  Vectors (初始 bank 映射):`);
  console.log(`    NMI:   $${nmiVec.toString(16).padStart(4, '0').toUpperCase()}`);
  console.log(`    RESET: $${resetVec.toString(16).padStart(4, '0').toUpperCase()}`);
  console.log(`    IRQ:   $${irqVec.toString(16).padStart(4, '0').toUpperCase()}`);
  
  // 檢查 reset vector 是否指向有效的 ROM 區域
  if (resetVec < 0x8000) {
    console.log(`  ⚠️  RESET vector 指向 RAM 區域！可能需要不同的初始 bank 映射`);
  }
  if (resetVec === 0xFFFF || resetVec === 0x0000) {
    console.log(`  ❌ RESET vector 看起來是垃圾值！`);
  }
  
  // 反組譯前 20 條指令
  if (resetVec >= 0x8000 && resetVec < 0x10000) {
    console.log(`\n  反組譯 (從 RESET $${resetVec.toString(16).toUpperCase()}):`);
    const lines = disassemble6502(data, header, resetVec, 20);
    lines.forEach(l => console.log(l));
  }
  
  // Mapper 特定分析
  if (header.mapper === 15) {
    console.log(`\n  === Mapper 15 特定分析 ===`);
    // 檢查初始程式碼中是否有寫入 $8000 的指令
    console.log(`  初始 32KB (bank 0) 的向量:`)
    const resetFromBank0 = readPrgWord(data, header, 0x7FFC);
    console.log(`    RESET from first 32KB: $${resetFromBank0.toString(16).padStart(4, '0').toUpperCase()}`);
    const resetFromLastBank = readPrgWord(data, header, header.prgSize - 4);
    console.log(`    RESET from last 32KB:  $${resetFromLastBank.toString(16).padStart(4, '0').toUpperCase()}`);
    
    // 模擬首次寫入 $8000
    console.log(`\n  如果初始碼寫入 $8000, data=$00:`);
    console.log(`    → ${analyzeMapper15Write(0x8000, 0x00, header.prgBanks)}`);
    console.log(`  如果初始碼寫入 $8001, data=$00:`);
    console.log(`    → ${analyzeMapper15Write(0x8001, 0x00, header.prgBanks)}`);
  }
  
  if (header.mapper === 4) {
    console.log(`\n  === Mapper 4 (MMC3) 特定分析 ===`);
    // 確認最後兩個 8KB bank 的內容
    const lastBank = header.prgBanks * 2 - 1;
    const secondLastBank = header.prgBanks * 2 - 2;
    console.log(`  Total 8KB banks: ${header.prgBanks * 2}`);
    console.log(`  $E000-$FFFF = bank #${lastBank} (offset $${(lastBank * 8192).toString(16)})`);
    console.log(`  $C000-$DFFF = bank #${secondLastBank} (offset $${(secondLastBank * 8192).toString(16)})`);
    
    // 確認 RESET vector 來自最後一個 bank
    const resetFromLast = readPrgWord(data, header, (lastBank * 8192) + 0x1FFC);
    console.log(`  RESET from last 8KB bank: $${resetFromLast.toString(16).padStart(4, '0').toUpperCase()}`);
    
    // 看一下 CHR 的組成
    if (header.chrBanks > 0) {
      console.log(`\n  CHR ROM: ${header.chrBanks} banks (${header.chrSize} bytes)`);
      console.log(`  CHR 1KB banks: ${header.chrBanks * 8}`);
    }
  }
  
  if (header.mapper === 225) {
    console.log(`\n  === Mapper 225 特定分析 ===`);
    console.log(`  Total 16KB PRG banks: ${header.prgBanks}`);
    console.log(`  Total 8KB CHR banks: ${header.chrBanks}`);
    
    // 檢查不同 bank 的 reset vector
    console.log(`\n  各 32KB bank 的 reset vector:`);
    const num32k = Math.min(header.prgBanks / 2, 8);
    for (let i = 0; i < num32k; i++) {
      const offset = i * 32768 + 0x7FFC;
      if (offset + 1 < header.prgSize) {
        const vec = readPrgWord(data, header, offset);
        console.log(`    32KB bank #${i}: RESET=$${vec.toString(16).padStart(4, '0').toUpperCase()}`);
      }
    }
  }
  
  if (header.mapper === 227) {
    console.log(`\n  === Mapper 227 特定分析 ===`);
    // 初始狀態：S=0, O=0, L=0 → UNROM-like, bank 0 at both
    console.log(`  初始: S=0,O=0,L=0 → $8000=bank0, $C000=bank0`);
    const reset16k0 = readPrgWord(data, header, 0x3FFC);
    console.log(`  16KB bank 0 reset: $${reset16k0.toString(16).padStart(4, '0').toUpperCase()}`);
    
    // 分析選單寫入地址範例
    console.log(`\n  模擬寫入地址:`)
    // 典型選單操作的地址範例
    const testAddrs = [0x8000, 0x8001, 0x8002, 0x8003, 0x8004, 0x8100, 0x8200];
    for (const a of testAddrs) {
      const s = (a & 0x01) !== 0;
      const m = (a & 0x02) !== 0;
      const p = (a >> 2) & 0x01;
      const pp = (a >> 3) & 0x03;
      const inner = (pp << 1) | p;
      const qq_lo = (a >> 5) & 0x03;
      const q_hi = (a >> 8) & 0x01;
      const outer = qq_lo | (q_hi << 2);
      const o = (a & 0x80) !== 0;
      const l = (a & 0x0200) !== 0;
      console.log(`    $${a.toString(16).toUpperCase()}: S=${s?1:0} M=${m?1:0} inner=${inner} outer=${outer} O=${o?1:0} L=${l?1:0}`);
    }
  }
  
  if (header.mapper === 202) {
    console.log(`\n  === Mapper 202 特定分析 ===`);
    console.log(`  初始: bank=0 → $8000=bank0, $C000=bank1`);
    // 各 bank 的 reset
    const numBanks = Math.min(header.prgBanks, 8);
    console.log(`\n  各 16KB bank 的 RESET vector (在 $BFFC):`)
    for (let i = 0; i < numBanks; i++) {
      const offset = i * 16384 + 0x3FFC;
      if (offset + 1 < header.prgSize) {
        const vec = readPrgWord(data, header, offset);
        console.log(`    bank #${i}: $${vec.toString(16).padStart(4, '0').toUpperCase()}`);
      }
    }
  }
}

console.log('🔍 NES ROM 診斷工具');
console.log('==================');

for (const rom of TARGET_ROMS) {
  analyzeRom(rom);
}
