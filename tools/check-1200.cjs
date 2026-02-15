const fs = require('fs');
const buf = fs.readFileSync('roms/1200-in-1.nes');
const prgStart = 16; // no trainer

// Print bytes at offset 0x7FF0-0x7FFF (first 32KB, vectors)
console.log("First 32KB vectors (offset 0x7FF0-0x7FFF):");
for (let i = 0x7FF0; i < 0x8000; i++) {
  process.stdout.write(buf[prgStart + i].toString(16).padStart(2, '0') + ' ');
}
console.log();

// Last 32KB vectors
const prgSize = 32 * 16384;
console.log("\nLast 32KB vectors (offset " + (prgSize - 16).toString(16) + "-" + (prgSize-1).toString(16) + "):");
for (let i = prgSize - 16; i < prgSize; i++) {
  process.stdout.write(buf[prgStart + i].toString(16).padStart(2, '0') + ' ');
}
console.log();

// Check ALL 32KB blocks for valid reset vectors
console.log("\nAll 32KB block reset vectors:");
for (let block = 0; block < 16; block++) {
  const offset = block * 32768 + 0x7FFC;
  const lo = buf[prgStart + offset];
  const hi = buf[prgStart + offset + 1];
  const vec = (hi << 8) | lo;
  console.log(`  Block ${block}: offset ${offset.toString(16)} -> $${vec.toString(16).toUpperCase().padStart(4, '0')}`);
}

// Also check all 16KB blocks 
console.log("\nAll 16KB block reset vectors:");
for (let block = 0; block < 32; block++) {
  const offset = block * 16384 + 0x3FFC;
  const lo = buf[prgStart + offset];
  const hi = buf[prgStart + offset + 1];
  const vec = (hi << 8) | lo;
  if (vec >= 0x8000 && vec < 0xFFFF) {
    console.log(`  Block ${block}: offset ${offset.toString(16)} -> $${vec.toString(16).toUpperCase().padStart(4, '0')}`);
  }
}
