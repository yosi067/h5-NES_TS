const fs = require('fs');
const data = fs.readFileSync('roms/0045 - 超時空之鑰 (繁)(Beta)(Goldegg+Emukim).smc');
console.log('File size:', data.length);
console.log('Size mod 1024:', data.length % 1024);
console.log('Has SMC header:', data.length % 1024 === 512);

// Check HiROM header
if (data.length > 0xFFDF) {
  console.log('\n--- HiROM ---');
  console.log('Map byte at $FFD5:', '0x' + data[0xFFD5].toString(16));
  console.log('ROM type at $FFD6:', '0x' + data[0xFFD6].toString(16));
  console.log('ROM size at $FFD7:', data[0xFFD7]);
  console.log('SRAM size at $FFD8:', data[0xFFD8]);
  const titleBytes = data.slice(0xFFC0, 0xFFC0 + 21);
  console.log('Title bytes:', Array.from(titleBytes).map(b => b.toString(16)).join(' '));
  console.log('Title:', titleBytes.toString('ascii'));
  const checksum = (data[0xFFDF] << 8) | data[0xFFDE];
  const complement = (data[0xFFDD] << 8) | data[0xFFDC];
  console.log('Checksum XOR complement:', (checksum ^ complement).toString(16));
}

// Check LoROM header
if (data.length > 0x7FDF) {
  console.log('\n--- LoROM ---');
  console.log('Map byte at $7FD5:', '0x' + data[0x7FD5].toString(16));
  console.log('ROM type at $7FD6:', '0x' + data[0x7FD6].toString(16));
  console.log('ROM size at $7FD7:', data[0x7FD7]);
  console.log('SRAM size at $7FD8:', data[0x7FD8]);
  const titleBytes = data.slice(0x7FC0, 0x7FC0 + 21);
  console.log('Title bytes:', Array.from(titleBytes).map(b => b.toString(16)).join(' '));
  const checksum = (data[0x7FDF] << 8) | data[0x7FDE];
  const complement = (data[0x7FDD] << 8) | data[0x7FDC];
  console.log('Checksum XOR complement:', (checksum ^ complement).toString(16));
}

// Reset vector
console.log('\nReset vector (HiROM $FFFC-$FFFD):', '0x' + ((data[0xFFFD] << 8) | data[0xFFFC]).toString(16));
console.log('Reset vector (LoROM $7FFC-$7FFD):', '0x' + ((data[0x7FFD] << 8) | data[0x7FFC]).toString(16));
