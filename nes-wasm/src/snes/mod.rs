// ============================================================
// 超級任天堂 (SNES/SFC) 模擬器核心
// ============================================================
// Ricoh 5A22 (65C816) CPU @ 3.58/2.68 MHz
// PPU: 256×224 (Mode 1/7), 32768 色域, HDMA
// APU: SPC700 @ 1.024 MHz + S-DSP 8 聲道 BRR
// 支援 HiROM/LoROM 映射
// 目標遊戲：超時空之鑰 (Chrono Trigger, 32Mbit HiROM)
// ============================================================

pub mod cpu;
pub mod ppu;
pub mod apu;
pub mod cartridge;
pub mod controller;
pub mod dma;
pub mod dsp1;
pub mod emulator;
