const fs = require('fs');
const files = ['roms/100合1.NES', 'roms/64-in-1.nes', 'roms/1200-in-1.nes', 'roms/150-in-1.nes', 'roms/SuperMarioBros3.nes'];
files.forEach(f => {
  const buf = fs.readFileSync(f);
  const flags6 = buf[6];
  const hasTrainer = (flags6 & 4) ? true : false;
  let offset = 16 + (hasTrainer ? 512 : 0);
  const prgBanks = buf[4];
  const chrBanks = buf[5];
  const mapper = (flags6 >> 4) | (buf[7] & 0xF0);
  const prgSize = prgBanks * 16384;
  const prgStart = offset;
  
  // Last PRG bank vectors
  const resetLo = buf[prgStart + prgSize - 4];
  const resetHi = buf[prgStart + prgSize - 3];
  const resetVec = (resetHi << 8) | resetLo;
  
  // First 32KB bank vectors (bank 0)
  const firstResetLo = buf[prgStart + 0x7FFC];
  const firstResetHi = buf[prgStart + 0x7FFD];
  const firstResetVec = (firstResetHi << 8) | firstResetLo;
  
  console.log(`${f}: Mapper=${mapper}, PRG=${prgBanks}x16KB, CHR=${chrBanks}x8KB`);
  console.log(`  Last bank reset vec:  $${resetVec.toString(16).toUpperCase().padStart(4, '0')}`);
  console.log(`  First 32KB reset vec: $${firstResetVec.toString(16).toUpperCase().padStart(4, '0')}`);
  
  // For mapper 15 mode 0, initial state: prg_bank=0, mode=0 (32KB)
  // cpu_read($FFFC) -> bank8k = 0*2 = 0, base = (0 & !3) % total = 0
  // offset = 0 * 8192 + (0xFFFC & 0x7FFF) = 0x7FFC
  // So it should read from PRG offset 0x7FFC
  
  // For mapper 227, initial state: prg_bank=0, mode=0 (32KB)
  // bank32k = 0 >> 1 = 0, offset = 0xFFFC & 0x7FFF = 0x7FFC
  // So it reads from PRG offset 0x7FFC
  
  // For mapper 225, initial state: prg_bank=0, mode=0 (32KB)
  // bank32k = 0 >> 1 = 0, offset = 0xFFFC & 0x7FFF = 0x7FFC
  // So it reads from PRG offset 0x7FFC
  
  // Check first few bytes at the reset vector location in first bank
  const resetOffset = firstResetVec >= 0x8000 ? firstResetVec - 0x8000 : -1;
  if (resetOffset >= 0 && prgStart + resetOffset < buf.length) {
    const bytes = [];
    for (let i = 0; i < 16; i++) {
      bytes.push(buf[prgStart + resetOffset + i].toString(16).padStart(2, '0'));
    }
    console.log(`  Code at reset: ${bytes.join(' ')}`);
  }
});
