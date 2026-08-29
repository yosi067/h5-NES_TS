#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const romPath = process.argv[2] ?? path.join(root, 'roms', 'Zombie Hunter (Japan).nes');
const rom = fs.readFileSync(romPath);
const prgStart = 16 + ((rom[6] & 0x04) !== 0 ? 512 : 0);
const prg = rom.subarray(prgStart, prgStart + rom[4] * 0x4000);
const fixedBankStart = prg.length - 0x4000;
const bankArgument = process.argv.find(argument => argument.startsWith('--bank='));
const selectedBank = bankArgument ? Number.parseInt(bankArgument.slice('--bank='.length), 10) : null;
const fixedBankArgument = process.argv.find(argument => argument.startsWith('--fixed-bank='));
const fixedBank = fixedBankArgument
  ? Number.parseInt(fixedBankArgument.slice('--fixed-bank='.length), 10)
  : prg.length / 0x4000 - 1;

function hex(value, width = 0) {
  return value.toString(16).padStart(width, '0');
}

const rows = [
  [['BRK', 'imp'], ['ORA', 'izx'], ['KIL', 'imp'], ['SLO', 'izx'], ['NOP', 'zp'], ['ORA', 'zp'], ['ASL', 'zp'], ['SLO', 'zp'], ['PHP', 'imp'], ['ORA', 'imm'], ['ASL', 'acc'], ['ANC', 'imm'], ['NOP', 'abs'], ['ORA', 'abs'], ['ASL', 'abs'], ['SLO', 'abs']],
  [['BPL', 'rel'], ['ORA', 'izy'], ['KIL', 'imp'], ['SLO', 'izy'], ['NOP', 'zpx'], ['ORA', 'zpx'], ['ASL', 'zpx'], ['SLO', 'zpx'], ['CLC', 'imp'], ['ORA', 'aby'], ['NOP', 'imp'], ['SLO', 'aby'], ['NOP', 'abx'], ['ORA', 'abx'], ['ASL', 'abx'], ['SLO', 'abx']],
  [['JSR', 'abs'], ['AND', 'izx'], ['KIL', 'imp'], ['RLA', 'izx'], ['BIT', 'zp'], ['AND', 'zp'], ['ROL', 'zp'], ['RLA', 'zp'], ['PLP', 'imp'], ['AND', 'imm'], ['ROL', 'acc'], ['ANC', 'imm'], ['BIT', 'abs'], ['AND', 'abs'], ['ROL', 'abs'], ['RLA', 'abs']],
  [['BMI', 'rel'], ['AND', 'izy'], ['KIL', 'imp'], ['RLA', 'izy'], ['NOP', 'zpx'], ['AND', 'zpx'], ['ROL', 'zpx'], ['RLA', 'zpx'], ['SEC', 'imp'], ['AND', 'aby'], ['NOP', 'imp'], ['RLA', 'aby'], ['NOP', 'abx'], ['AND', 'abx'], ['ROL', 'abx'], ['RLA', 'abx']],
  [['RTI', 'imp'], ['EOR', 'izx'], ['KIL', 'imp'], ['SRE', 'izx'], ['NOP', 'zp'], ['EOR', 'zp'], ['LSR', 'zp'], ['SRE', 'zp'], ['PHA', 'imp'], ['EOR', 'imm'], ['LSR', 'acc'], ['ALR', 'imm'], ['JMP', 'abs'], ['EOR', 'abs'], ['LSR', 'abs'], ['SRE', 'abs']],
  [['BVC', 'rel'], ['EOR', 'izy'], ['KIL', 'imp'], ['SRE', 'izy'], ['NOP', 'zpx'], ['EOR', 'zpx'], ['LSR', 'zpx'], ['SRE', 'zpx'], ['CLI', 'imp'], ['EOR', 'aby'], ['NOP', 'imp'], ['SRE', 'aby'], ['NOP', 'abx'], ['EOR', 'abx'], ['LSR', 'abx'], ['SRE', 'abx']],
  [['RTS', 'imp'], ['ADC', 'izx'], ['KIL', 'imp'], ['RRA', 'izx'], ['NOP', 'zp'], ['ADC', 'zp'], ['ROR', 'zp'], ['RRA', 'zp'], ['PLA', 'imp'], ['ADC', 'imm'], ['ROR', 'acc'], ['ARR', 'imm'], ['JMP', 'ind'], ['ADC', 'abs'], ['ROR', 'abs'], ['RRA', 'abs']],
  [['BVS', 'rel'], ['ADC', 'izy'], ['KIL', 'imp'], ['RRA', 'izy'], ['NOP', 'zpx'], ['ADC', 'zpx'], ['ROR', 'zpx'], ['RRA', 'zpx'], ['SEI', 'imp'], ['ADC', 'aby'], ['NOP', 'imp'], ['RRA', 'aby'], ['NOP', 'abx'], ['ADC', 'abx'], ['ROR', 'abx'], ['RRA', 'abx']],
  [['NOP', 'imm'], ['STA', 'izx'], ['NOP', 'imm'], ['SAX', 'izx'], ['STY', 'zp'], ['STA', 'zp'], ['STX', 'zp'], ['SAX', 'zp'], ['DEY', 'imp'], ['NOP', 'imm'], ['TXA', 'imp'], ['XAA', 'imm'], ['STY', 'abs'], ['STA', 'abs'], ['STX', 'abs'], ['SAX', 'abs']],
  [['BCC', 'rel'], ['STA', 'izy'], ['KIL', 'imp'], ['AHX', 'izy'], ['STY', 'zpx'], ['STA', 'zpx'], ['STX', 'zpy'], ['SAX', 'zpy'], ['TYA', 'imp'], ['STA', 'aby'], ['TXS', 'imp'], ['TAS', 'aby'], ['SHY', 'abx'], ['STA', 'abx'], ['SHX', 'aby'], ['AHX', 'aby']],
  [['LDY', 'imm'], ['LDA', 'izx'], ['LDX', 'imm'], ['LAX', 'izx'], ['LDY', 'zp'], ['LDA', 'zp'], ['LDX', 'zp'], ['LAX', 'zp'], ['TAY', 'imp'], ['LDA', 'imm'], ['TAX', 'imp'], ['LAX', 'imm'], ['LDY', 'abs'], ['LDA', 'abs'], ['LDX', 'abs'], ['LAX', 'abs']],
  [['BCS', 'rel'], ['LDA', 'izy'], ['KIL', 'imp'], ['LAX', 'izy'], ['LDY', 'zpx'], ['LDA', 'zpx'], ['LDX', 'zpy'], ['LAX', 'zpy'], ['CLV', 'imp'], ['LDA', 'aby'], ['TSX', 'imp'], ['LAS', 'aby'], ['LDY', 'abx'], ['LDA', 'abx'], ['LDX', 'aby'], ['LAX', 'aby']],
  [['CPY', 'imm'], ['CMP', 'izx'], ['NOP', 'imm'], ['DCP', 'izx'], ['CPY', 'zp'], ['CMP', 'zp'], ['DEC', 'zp'], ['DCP', 'zp'], ['INY', 'imp'], ['CMP', 'imm'], ['DEX', 'imp'], ['AXS', 'imm'], ['CPY', 'abs'], ['CMP', 'abs'], ['DEC', 'abs'], ['DCP', 'abs']],
  [['BNE', 'rel'], ['CMP', 'izy'], ['KIL', 'imp'], ['DCP', 'izy'], ['NOP', 'zpx'], ['CMP', 'zpx'], ['DEC', 'zpx'], ['DCP', 'zpx'], ['CLD', 'imp'], ['CMP', 'aby'], ['NOP', 'imp'], ['DCP', 'aby'], ['NOP', 'abx'], ['CMP', 'abx'], ['DEC', 'abx'], ['DCP', 'abx']],
  [['CPX', 'imm'], ['SBC', 'izx'], ['NOP', 'imm'], ['ISC', 'izx'], ['CPX', 'zp'], ['SBC', 'zp'], ['INC', 'zp'], ['ISC', 'zp'], ['INX', 'imp'], ['SBC', 'imm'], ['NOP', 'imp'], ['USBC', 'imm'], ['CPX', 'abs'], ['SBC', 'abs'], ['INC', 'abs'], ['ISC', 'abs']],
  [['BEQ', 'rel'], ['SBC', 'izy'], ['KIL', 'imp'], ['ISC', 'izy'], ['NOP', 'zpx'], ['SBC', 'zpx'], ['INC', 'zpx'], ['ISC', 'zpx'], ['SED', 'imp'], ['SBC', 'aby'], ['NOP', 'imp'], ['ISC', 'aby'], ['NOP', 'abx'], ['SBC', 'abx'], ['INC', 'abx'], ['ISC', 'abx']],
];
const specs = rows.flat();
const sizes = { imp: 1, acc: 1, imm: 2, zp: 2, zpx: 2, zpy: 2, izx: 2, izy: 2, rel: 2, abs: 3, abx: 3, aby: 3, ind: 3 };

function readCpu(address) {
  if (address >= 0xc000) return prg[fixedBank * 0x4000 + address - 0xc000];
  if (selectedBank !== null && address >= 0x8000) {
    return prg[selectedBank * 0x4000 + address - 0x8000];
  }
  throw new Error(`Address $${address.toString(16)} is outside the fixed bank`);
}

function formatOperand(address, mode, bytes) {
  const byte = bytes[1] ?? 0;
  const word = byte | ((bytes[2] ?? 0) << 8);
  if (mode === 'imp') return '';
  if (mode === 'acc') return 'A';
  if (mode === 'imm') return `#$${hex(byte, 2)}`;
  if (mode === 'zp') return `$${hex(byte, 2)}`;
  if (mode === 'zpx') return `$${hex(byte, 2)},X`;
  if (mode === 'zpy') return `$${hex(byte, 2)},Y`;
  if (mode === 'izx') return `($${hex(byte, 2)},X)`;
  if (mode === 'izy') return `($${hex(byte, 2)}),Y`;
  if (mode === 'ind') return `($${hex(word, 4)})`;
  if (mode === 'rel') {
    const displacement = byte < 0x80 ? byte : byte - 0x100;
    return `$${hex((address + 2 + displacement) & 0xffff, 4)}`;
  }
  if (mode === 'abx') return `$${hex(word, 4)},X`;
  if (mode === 'aby') return `$${hex(word, 4)},Y`;
  return `$${hex(word, 4)}`;
}

function disassemble(start, end) {
  const lines = [];
  let address = start;
  while (address < end) {
    const opcode = readCpu(address);
    const [mnemonic, mode] = specs[opcode];
    const size = sizes[mode];
    const bytes = Array.from({ length: size }, (_, index) => readCpu(address + index));
    const byteText = bytes.map(byte => hex(byte, 2)).join(' ');
    const operand = formatOperand(address, mode, bytes);
    lines.push(`$${hex(address, 4)}  ${byteText.padEnd(8)} ${mnemonic.padEnd(4)} ${operand}`.trimEnd());
    address += size;
  }
  return lines;
}

const requestedRanges = process.argv.slice(3)
  .filter(argument => !argument.startsWith('--bank=') && !argument.startsWith('--fixed-bank='))
  .map(range => {
  const [startText, endText] = range.split(':');
  return [Number.parseInt(startText, 16), Number.parseInt(endText, 16)];
});
const ranges = requestedRanges.length > 0 ? requestedRanges : [
  [0xf300, 0xf700],
  [0xff00, 0x10000],
];
for (const [start, end] of ranges) {
  console.log(`--- $${hex(start, 4)}-$${hex(end - 1, 4)}`);
  console.log(disassemble(start, end).join('\n'));
}