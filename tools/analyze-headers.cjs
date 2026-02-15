const fs = require("fs");
const path = require("path");

const files = [
  "roms/龙珠Z3-烈战人造人.nes",
  "roms/龙珠Z_强袭赛亚人.nes",
  "roms/64-in-1.nes",
  "roms/100合1.NES",
];

const root = path.join(__dirname, "..");

for (const f of files) {
  const buf = fs.readFileSync(path.join(root, f));
  const header = buf.slice(0, 16);
  if (header[0] !== 0x4E || header[1] !== 0x45 || header[2] !== 0x53 || header[3] !== 0x1A) {
    console.log(f + ": NOT iNES");
    continue;
  }
  const prgBanks = header[4];
  const chrBanks = header[5];
  const flags6 = header[6];
  const flags7 = header[7];
  const mapper = (flags6 >> 4) | (flags7 & 0xF0);
  const mirror = flags6 & 1 ? "Vertical" : "Horizontal";
  const battery = flags6 & 2 ? "Yes" : "No";
  const chrRam = chrBanks === 0 ? "Yes" : "No";
  const prgSize = prgBanks * 16;
  const chrSize = chrBanks * 8;
  const hasTrainer = !!(flags6 & 4);
  const prgStart = 16 + (hasTrainer ? 512 : 0);
  const prgData = buf.slice(prgStart, prgStart + prgBanks * 16384);
  const lastBank = prgData.slice(-16384);
  const resetVec = lastBank[0x3FFC] | (lastBank[0x3FFD] << 8);
  console.log(f);
  console.log("  Mapper:", mapper, " PRG:", prgSize + "KB (" + prgBanks + " banks)",
    " CHR:", chrSize + "KB (" + chrBanks + " banks)", " CHR_RAM:", chrRam);
  console.log("  Mirror:", mirror, " Battery:", battery, " Trainer:", hasTrainer,
    " Reset: $" + resetVec.toString(16).toUpperCase().padStart(4, "0"));
  console.log("  Raw flags6: 0x" + flags6.toString(16).padStart(2, "0"),
    " flags7: 0x" + flags7.toString(16).padStart(2, "0"));
  console.log();
}
