// ============================================================
// Game Gear / Master System 模擬器核心
// ============================================================
// Z80 CPU @ 3.58 MHz
// VDP (TMS9918 衍生) — 內部 256×192, GG 裁切 160×144
// SN76489 PSG — 3 方波 + 1 雜訊, GG 立體聲
// Sega Mapper — 分頁式記憶體映射
// ============================================================

pub mod cpu;
pub mod vdp;
pub mod psg;
pub mod cartridge;
pub mod joypad;
pub mod emulator;
