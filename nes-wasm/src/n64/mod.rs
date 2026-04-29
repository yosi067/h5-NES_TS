// ============================================================
// Nintendo 64 emulator core (early scaffold)
// ============================================================
// This module starts the N64 path with verified ROM loading,
// byte-order normalization, boot/header diagnostics, and a
// unified emulator surface compatible with the existing WASM UI.
// ============================================================

pub mod cartridge;
pub mod cpu;
pub mod emulator;