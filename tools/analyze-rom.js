#!/usr/bin/env node
/**
 * ROM 分析工具
 * 用於檢查 NES ROM 的 Mapper 類型和其他資訊
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function analyzeRom(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    
    // 驗證 iNES 標頭
    if (data[0] !== 0x4E || data[1] !== 0x45 ||
        data[2] !== 0x53 || data[3] !== 0x1A) {
      return { error: '無效的 iNES 標頭' };
    }

    const prgRomBanks = data[4];
    const chrRomBanks = data[5];
    const flags6 = data[6];
    const flags7 = data[7];
    
    const mapperNumber = ((flags6 >> 4) & 0x0F) | (flags7 & 0xF0);
    const mirrorMode = (flags6 & 0x01) ? 'Vertical' : 'Horizontal';
    const hasBattery = (flags6 & 0x02) !== 0;
    const hasTrainer = (flags6 & 0x04) !== 0;
    const fourScreen = (flags6 & 0x08) !== 0;
    const isNes2 = (flags7 & 0x0C) === 0x08;

    // 常見 Mapper 名稱
    const mapperNames = {
      0: 'NROM',
      1: 'MMC1',
      2: 'UxROM',
      3: 'CNROM',
      4: 'MMC3',
      5: 'MMC5',
      7: 'AxROM',
      9: 'MMC2',
      10: 'MMC4',
      11: 'Color Dreams',
      15: '100-in-1 Multicart',
      16: 'Bandai FCG',
      19: 'Namco 163',
      21: 'VRC4a',
      22: 'VRC2a',
      23: 'VRC2b/VRC4',
      24: 'VRC6a',
      25: 'VRC4b/VRC4d',
      26: 'VRC6b',
      34: 'BNROM/NINA-001',
      66: 'GxROM',
      69: 'Sunsoft FME-7',
      71: 'Camerica',
      79: 'NINA-03/06',
      113: 'NINA-03/06 Sachen',
      118: 'TxSROM (MMC3)',
      119: 'TQROM (MMC3)',
      206: 'Namco 118',
      245: 'Waixing MMC3',
      253: 'Waixing VRC4',
    };

    return {
      fileName: path.basename(filePath),
      mapperNumber,
      mapperName: mapperNames[mapperNumber] || '未知',
      prgRomSize: `${prgRomBanks * 16}KB`,
      chrRomSize: chrRomBanks === 0 ? 'CHR RAM' : `${chrRomBanks * 8}KB`,
      mirrorMode: fourScreen ? 'FourScreen' : mirrorMode,
      hasBattery,
      hasTrainer,
      isNes2,
      supported: [0, 1, 2, 3, 4, 7, 11, 15, 16, 23, 66, 71, 113, 245, 253].includes(mapperNumber)
    };
  } catch (e) {
    return { error: e.message };
  }
}

// 主程式
const romsDir = process.argv[2] || path.join(__dirname, '..', 'roms');

if (!fs.existsSync(romsDir)) {
  console.error(`目錄不存在: ${romsDir}`);
  process.exit(1);
}

const files = fs.readdirSync(romsDir).filter(f => f.toLowerCase().endsWith('.nes'));

console.log('=== NES ROM 分析結果 ===\n');
console.log(`目錄: ${romsDir}`);
console.log(`找到 ${files.length} 個 ROM 檔案\n`);

const supported = [];
const unsupported = [];

files.forEach(file => {
  const result = analyzeRom(path.join(romsDir, file));
  if (result.error) {
    console.log(`❌ ${file}: 錯誤 - ${result.error}`);
    unsupported.push({ file, reason: result.error });
  } else {
    const status = result.supported ? '✅' : '⚠️';
    console.log(`${status} ${result.fileName}`);
    console.log(`   Mapper: ${result.mapperNumber} (${result.mapperName})`);
    console.log(`   PRG ROM: ${result.prgRomSize}, CHR: ${result.chrRomSize}`);
    console.log(`   Mirror: ${result.mirrorMode}${result.hasBattery ? ', 電池備份' : ''}`);
    console.log(`   支援狀態: ${result.supported ? '已支援' : '未支援'}`);
    console.log('');
    
    if (result.supported) {
      supported.push(result);
    } else {
      unsupported.push({ file, mapper: result.mapperNumber, mapperName: result.mapperName });
    }
  }
});

console.log('\n=== 總結 ===');
console.log(`已支援: ${supported.length} 個`);
console.log(`未支援: ${unsupported.length} 個`);

if (unsupported.length > 0) {
  console.log('\n需要實作的 Mapper:');
  const mapperSet = new Set();
  unsupported.forEach(u => {
    if (u.mapper !== undefined) {
      mapperSet.add(`Mapper ${u.mapper} (${u.mapperName})`);
    }
  });
  mapperSet.forEach(m => console.log(`  - ${m}`));
}
