const fs = require('fs');
const buf = fs.readFileSync('roms/Mega Man X2 (USA).sfc');

function loRomOffset(bank, addr) { return (bank & 0x7F) * 0x8000 + (addr & 0x7FFF); }
function hex(v, n) { return v.toString(16).padStart(n, '0'); }

// Read vectors
const vecDefs = [
  ['COP_native', 0xFFE4], ['BRK_native', 0xFFE6],
  ['ABT_native', 0xFFE8], ['NMI_native', 0xFFEA],
  ['IRQ_native', 0xFFEE], ['COP_emu', 0xFFF4],
  ['RESET', 0xFFFC], ['IRQ_emu', 0xFFFE],
];

console.log('=== INTERRUPT VECTORS ===');
for (const [name, lo] of vecDefs) {
  const offLo = loRomOffset(0, lo);
  const offHi = loRomOffset(0, lo + 1);
  const addr = buf[offLo] | (buf[offHi] << 8);
  console.log(`  ${name}: $${hex(addr, 4)}`);
}

// Dump boot code starting at reset vector
const resetVec = buf[loRomOffset(0, 0xFFFC)] | (buf[loRomOffset(0, 0xFFFD)] << 8);
console.log(`\n=== BOOT CODE from $${hex(resetVec, 4)} (first 256 bytes) ===`);
const bootStart = loRomOffset(0, resetVec);
for (let row = 0; row < 16; row++) {
  let line = `$${hex(resetVec + row * 16, 4)}: `;
  for (let col = 0; col < 16; col++) {
    line += hex(buf[bootStart + row * 16 + col], 2) + ' ';
  }
  console.log(line);
}

// NMI handler
const nmiVec = buf[loRomOffset(0, 0xFFEA)] | (buf[loRomOffset(0, 0xFFEB)] << 8);
console.log(`\n=== NMI HANDLER from $${hex(nmiVec, 4)} (first 128 bytes) ===`);
const nmiStart = loRomOffset(0, nmiVec);
for (let row = 0; row < 8; row++) {
  let line = `$${hex(nmiVec + row * 16, 4)}: `;
  for (let col = 0; col < 16; col++) {
    line += hex(buf[nmiStart + row * 16 + col], 2) + ' ';
  }
  console.log(line);
}

// BRK handler
const brkVec = buf[loRomOffset(0, 0xFFE6)] | (buf[loRomOffset(0, 0xFFE7)] << 8);
console.log(`\n=== BRK HANDLER from $${hex(brkVec, 4)} (first 64 bytes) ===`);
const brkStart = loRomOffset(0, brkVec);
for (let row = 0; row < 4; row++) {
  let line = `$${hex(brkVec + row * 16, 4)}: `;
  for (let col = 0; col < 16; col++) {
    line += hex(buf[brkStart + row * 16 + col], 2) + ' ';
  }
  console.log(line);
}

// Crash area
console.log(`\n=== CRASH AREA $80F0-$810F ===`);
const crashStart = loRomOffset(0, 0x80F0);
for (let row = 0; row < 2; row++) {
  let line = `$${hex(0x80F0 + row * 16, 4)}: `;
  for (let col = 0; col < 16; col++) {
    line += hex(buf[crashStart + row * 16 + col], 2) + ' ';
  }
  console.log(line);
}

// Simple 65816 disassembly of boot code (first ~50 instructions)
console.log('\n=== BOOT DISASSEMBLY (approximate) ===');
const opcSizes8 = {
  0x78: [1, 'SEI'], 0x18: [1, 'CLC'], 0xFB: [1, 'XCE'],
  0xC2: [2, 'REP'], 0xE2: [2, 'SEP'],
  0x9C: [3, 'STZ abs'], 0x8D: [3, 'STA abs'], 0xAD: [3, 'LDA abs'],
  0xA9: [-1, 'LDA #'], // -1 = depends on M flag
  0xA2: [-2, 'LDX #'], // -2 = depends on X flag
  0xA0: [-3, 'LDY #'], // -3 = depends on X flag
  0x9A: [1, 'TXS'], 0xCA: [1, 'DEX'], 0x88: [1, 'DEY'],
  0xE8: [1, 'INX'], 0xC8: [1, 'INY'],
  0x10: [2, 'BPL'], 0x30: [2, 'BMI'], 0xD0: [2, 'BNE'], 0xF0: [2, 'BEQ'],
  0x80: [2, 'BRA'], 0x90: [2, 'BCC'], 0xB0: [2, 'BCS'],
  0x4C: [3, 'JMP abs'], 0x20: [3, 'JSR abs'], 0x22: [4, 'JSL long'],
  0x5C: [4, 'JML long'], 0x60: [1, 'RTS'], 0x6B: [1, 'RTL'],
  0x40: [1, 'RTI'], 0x48: [1, 'PHA'], 0x68: [1, 'PLA'],
  0xDA: [1, 'PHX'], 0xFA: [1, 'PLX'], 0x5A: [1, 'PHY'], 0x7A: [1, 'PLY'],
  0x8B: [1, 'PHB'], 0xAB: [1, 'PLB'], 0x0B: [1, 'PHD'], 0x2B: [1, 'PLD'],
  0x4B: [1, 'PHK'], 0x08: [1, 'PHP'], 0x28: [1, 'PLP'],
  0xEB: [1, 'XBA'], 0xEA: [1, 'NOP'],
  0x85: [2, 'STA dp'], 0xA5: [2, 'LDA dp'], 0x64: [2, 'STZ dp'],
  0xCB: [1, 'WAI'], 0xDB: [1, 'STP'],
  0x54: [3, 'MVN'], 0x44: [3, 'MVP'],
  0x1A: [1, 'INC A'], 0x3A: [1, 'DEC A'],
};

let pc = resetVec;
let mFlag = true, xFlag = true; // After XCE, both are 1
let emulation = true;
let off = bootStart;
for (let i = 0; i < 60 && off < buf.length; i++) {
  const opc = buf[off];
  let info = opcSizes8[opc];
  let size, name;
  if (info) {
    size = info[0];
    name = info[1];
    if (size === -1) size = mFlag ? 2 : 3; // A size
    if (size === -2 || size === -3) size = xFlag ? 2 : 3; // X size
  } else {
    // Estimate size from opcode patterns
    const addrMode = opc & 0x1F;
    size = 1; // default
    if ((opc & 0x0F) === 0x0F) size = 4; // long
    else if (addrMode === 0x0D || addrMode === 0x0E || addrMode === 0x0C ||
             addrMode === 0x19 || addrMode === 0x1D || addrMode === 0x1E) size = 3;
    else if (addrMode === 0x05 || addrMode === 0x15 || addrMode === 0x01 ||
             addrMode === 0x11 || addrMode === 0x12 || addrMode === 0x07 || 
             addrMode === 0x17) size = 2;
    name = `??? ($${hex(opc, 2)})`;
  }
  
  let operands = '';
  for (let j = 1; j < size; j++) {
    operands += hex(buf[off + j], 2);
  }
  
  let extra = '';
  // Track flag changes
  if (opc === 0xFB) { emulation = false; mFlag = true; xFlag = true; extra = ' → native mode, M=1 X=1'; }
  if (opc === 0xC2 && !emulation) {
    const imm = buf[off + 1];
    if (imm & 0x20) { mFlag = false; extra += ' M→0(16bit-A)'; }
    if (imm & 0x10) { xFlag = false; extra += ' X→0(16bit-XY)'; }
  }
  if (opc === 0xE2 && !emulation) {
    const imm = buf[off + 1];
    if (imm & 0x20) { mFlag = true; extra += ' M→1(8bit-A)'; }
    if (imm & 0x10) { xFlag = true; extra += ' X→1(8bit-XY)'; }
  }
  
  console.log(`  $${hex(pc, 4)}: ${hex(opc, 2)} ${operands.padEnd(8)} ${name} ${operands ? '#$'+operands : ''}${extra}`);
  
  off += size;
  pc += size;
}
