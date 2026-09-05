//! Read-only, ROM-identified script observations. No register, RAM, or ROM writes.
//! Addresses below are from the ORIGINAL CT2 bank 0, not the English disassembly
//! and not Zombie Hunter's unrelated text copier routines.
pub const CT2_HASHES: [&str; 2] = [
    "bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746",
    "ee08f9134ef0e9e3a5f77e4f08244d24739c68d781cb58e2be737916bb3ab5ae",
];

#[derive(Default)]
pub struct TextObserver {
    pub enabled: bool,
    events: Vec<u32>,
}

impl TextObserver {
    pub fn configure(&mut self, enabled: bool, hash: &str) -> bool {
        self.enabled = enabled && CT2_HASHES.contains(&hash);
        self.reset();
        self.enabled
    }

    pub fn reset(&mut self) {
        self.events.clear();
        if self.enabled { self.push(0, 0, 0, 0); }
    }

    /// Four u32 words: kind (0 invalidation, 1 cutscene glyph, 2 control,
    /// 3 experimental battle glyph), physical offset, mirrored cell, byte.
    /// Kind 4 follows a cutscene glyph: expected top generation, cell,
    /// expected bottom generation; generation is captured BEFORE queueing.
    /// Kind 5: queued soft clear (display survives until actual PPU writes).
    /// Kind 6: original $E93D command call (A command/erase flag, X position).
    pub fn push(&mut self, kind: u32, source: u32, cell: u32, value: u32) {
        if !self.enabled { return; }
        if self.events.len() >= 16384 {
            // A slow consumer must never retain stale text or grow unbounded.
            self.events.clear();
            self.events.extend_from_slice(&[0, 0, 0, 0]);
        }
        self.events.extend_from_slice(&[kind, source, cell, value]);
    }

    pub fn take(&mut self) -> Vec<u32> { std::mem::take(&mut self.events) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unknown_rom_and_bounds_queue() {
        let mut observer = TextObserver::default();
        assert!(!observer.configure(true, "wrong"));
        observer.push(1, 1, 1, 1);
        assert!(observer.take().is_empty());
        assert!(observer.configure(true, CT2_HASHES[0]));
        for i in 0..5000 { observer.push(1, i, 0, 0); }
        let events = observer.take();
        assert!(events.len() <= 16384);
        assert_eq!(&events[..4], &[0, 0, 0, 0]);
    }
}