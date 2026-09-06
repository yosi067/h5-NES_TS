//! Opt-in original-ROM research. Never installs a profile or changes the source ROM.
use super::*;

fn clear_traces(core: &mut Emulator) {
    // cfg(test) hardware traces are serialized in native test snapshots too;
    // production WASM has neither vector. Do not accumulate 11,500 frames.
    core.ppu.a12_trace.clear();
    core.apu.test_register_writes.clear();
    core.cpu_ram_write_trace.clear();
    core.ppu_nametable_write_trace.clear();
    core.mapper_cpu_writes.clear();
    core.mapper_scanline_events.clear();
    core.zombie_input_trace.clear();
    core.zombie_text_trace.clear();
    core.zombie_generation_trace.clear();
    core.zombie_mode_trace.clear();
    core.zombie_candidate_read_trace.clear();
    core.resolver_calls.clear();
}

fn set_level(core: &mut Emulator, level: Option<u8>) {
    core.set_game_profile_tuning(&serde_json::json!({
        "profileId":"captain-tsubasa-2-jp", "tsubasaLevel":level
    }).to_string()).unwrap();
}

// Execute on the test core, with an ordinary RTS sentinel. Callers set registers.
fn call(core: &mut Emulator, entry: u16) {
    core.cpu.pc = entry;
    core.cpu.sp = 0xfd;
    core.bus.ram[0x1fe] = 0xff;
    core.bus.ram[0x1ff] = 0x5f;
    core.cpu.cycles = 0;
    core.cpu.nmi_pending = false;
    core.cpu.irq_pending = false;
    for _ in 0..20000 {
        core.cpu_clock();
        if core.cpu.pc == 0x6000 { return; }
    }
    panic!("routine {entry:04x} failed to return");
}

#[test]
#[ignore = "requires legally supplied original CT2 ROM"]
fn ct2_runtime_tuning_original_rom() {
    let rom = std::fs::read("../roms/Captain Tsubasa II - Super Striker (Japan).nes").unwrap();
    assert_eq!(sha256_hex(&rom), crate::game_profile::ct2_tuning::ORIGINAL_SHA);
    let mut core = Emulator::new();
    assert!(core.load_rom(&rom));
    assert_eq!(core.ct2_tuning.level, Some(64));
    for frame in 0..11500 {
        core.set_button(0, crate::controller::BTN_START, (600..604).contains(&frame) || (900..904).contains(&frame));
        core.set_button(0, crate::controller::BTN_A, (1100..9500).contains(&frame) && frame % 120 < 4);
        clear_traces(&mut core);
        core.frame();
        core.consume_audio_samples(); // match the app's per-frame audio draining
    }
    assert_eq!(core.bus.ram[0x36c], 1);
    assert_eq!(core.bus.ram[0x36f], 0, "natural level untouched");
    assert_eq!(u16::from_le_bytes([core.bus.ram[0x36d], core.bus.ram[0x36e]]), 976,
        "original game initializes guts via the tuned calculation, no injected write");
    let save = core.export_persistent_save_state();
    assert!(save.len() < PERSISTENT_STATE_LIMIT, "save bytes={}", save.len());
    let payload = BASE64.decode(&save[PERSISTENT_STATE_PREFIX.len()..]).unwrap();
    let saved: PersistentState = bincode::deserialize(&payload).unwrap();
    assert!(core.ppu.portable_state_compatible(&saved.ppu), "PPU state validation");
    assert!(core.apu.portable_state_compatible(&saved.apu), "APU state validation");
    let temporary = core.export_save_state();
    let ram_before = core.bus.ram;
    let cpu_before = (core.cpu.pc, core.system_clock);
    let other: Vec<_> = (0..7).map(|s| query(&core, 0, s, None)).collect();
    let evidence: serde_json::Value = serde_json::from_str(include_str!("../../src/game-profiles/ct2-stats-evidence.json")).unwrap();
    for level in 1..=64u8 {
        set_level(&mut core, Some(level));
        for selector in 0..23u8 {
            let coefficient = evidence["coefficients"][usize::from(selector)].as_u64().unwrap() as usize;
            let expected = if selector == 0 {
                evidence["staminaCurve"][(coefficient + usize::from(level - 1)).min(95)].as_u64().unwrap()
            } else {
                evidence["abilityCurve"][(coefficient + 2 * usize::from(level - 1)).min(191)].as_u64().unwrap()
            };
            assert_eq!(u64::from(query(&core, 9, selector, None)), expected);
        }
    }
    assert_eq!(core.bus.ram, ram_before);
    assert_eq!((core.cpu.pc, core.system_clock), cpu_before, "hot update does not reset/advance");
    set_level(&mut core, None);
    assert_eq!(query(&core, 9, 1, None), 12);
    assert_eq!(other, (0..7).map(|s| query(&core, 0, s, None)).collect::<Vec<_>>());

    // Synthetic roster permutations across all home positions and team contexts.
    // These exercise the original calculation, not merely the predicate.
    for team in 0..3 {
        for slot in 0..11u8 {
            assert!(core.import_persistent_save_state(&save));
            core.bus.ram[0x2a] = team;
            for byte in 0..12 { core.bus.ram.swap(0x36c + byte, 0x300 + usize::from(slot) * 12 + byte); }
            // Slot 0 is a goalkeeper: the original engine's role/team logic
            // can select different coefficients. Compare with the SAME context
            // using a real level byte on the disposable reference, not a hard-
            // coded outfield shot number for every position.
            set_level(&mut core, None);
            let expected = query(&core, slot, 1, Some(63));
            set_level(&mut core, Some(64));
            assert_eq!(query(&core, slot, 1, None), expected, "team={team} slot={slot}");
            if slot != 9 {
                let unaffected = query(&core, 9, 1, None);
                set_level(&mut core, None);
                assert_eq!(query(&core, 9, 1, None), unaffected);
            }
        }
    }
    assert!(core.import_persistent_save_state(&save));
    set_level(&mut core, Some(64));
    // Original experience->level recomputation; restore its proper MMC3 bank.
    core.cartridge.cpu_write(0x8000, 7);
    core.cartridge.cpu_write(0x8001, 1);
    assert_eq!(core.cartridge.mapper.cpu_read(0xa3b4), Some(0x23b4));
    core.bus.ram[0x36f] = 27;
    core.bus.ram[0xea] = 9;
    core.cpu.a = 1;
    call(&mut core, 0xa3b4);
    assert_eq!(core.bus.ram[0x36f], 0, "original XP recomputation remains authoritative");
    assert_eq!(query(&core, 9, 1, None), 232, "recompute cannot erase tuning");

    // Display hook is the real original LDA, not a patched label/name block.
    core.bus.ram[0x34..0x36].copy_from_slice(&0x36cu16.to_le_bytes());
    core.cpu.pc = 0xabb4;
    core.cpu.cycles = 0;
    while core.cpu.pc != 0xabbb { core.cpu_clock(); }
    assert_eq!(core.cpu.a, 64);

    core.bus.ram[0x36d..0x36f].copy_from_slice(&123u16.to_le_bytes());
    for level in [Some(1), Some(64), None] {
        set_level(&mut core, level);
        query(&core, 9, 0, None);
        assert_eq!(u16::from_le_bytes([core.bus.ram[0x36d],core.bus.ram[0x36e]]), 123);
    }
    assert!(core.import_save_state(&temporary));
    assert_eq!(core.ct2_tuning.level, None, "restore keeps current preference");
    assert_eq!(query(&core, 9, 1, None), 12);
    set_level(&mut core, Some(32));
    assert!(core.import_persistent_save_state(&save));
    assert_eq!(core.ct2_tuning.level, Some(32));
    assert_eq!(core.bus.ram, ram_before);
    core.reset();
    assert_eq!(core.ct2_tuning.level, Some(32));
    assert!(core.load_rom(&rom));
    assert_eq!(core.ct2_tuning.level, Some(64));
    let mut unknown = rom.clone(); unknown[16 + 0x3f509] ^= 1;
    assert!(core.load_rom(&unknown));
    assert!(!core.ct2_tuning.supported);
    assert!(!core.load_rom(&[]));
    assert!(!core.ct2_tuning.supported);
    assert_eq!(sha256_hex(&std::fs::read("../roms/Captain Tsubasa II - Super Striker (Japan).nes").unwrap()), sha256_hex(&rom));
    println!("CT2 runtime: original boot guts976;1472 live-level calculations;33 roster/team permutations;original XP recompute/display;temporary/persistent restore;reset/reload;ROM unchanged");
}

// Execute the original bank-switching calculation entry on an isolated hardware
// copy. This is a subroutine experiment, NOT evidence that gameplay called it.
fn query(source: &Emulator, slot: u8, selector: u8, trial_level: Option<u8>) -> u16 {
    let mut probe = Emulator::new();
    probe.cpu = source.cpu.clone();
    probe.bus = source.bus.clone();
    probe.cartridge = source.cartridge.clone();
    probe.ppu = source.ppu.clone();
    probe.ct2_tuning = source.ct2_tuning;
    if let Some(level) = trial_level {
        // Laboratory input on the disposable copy only, never the running game.
        assert_eq!(probe.bus.ram[0x300 + usize::from(slot) * 12], 1);
        probe.bus.ram[0x303 + usize::from(slot) * 12] = level;
    }
    probe.cpu.pc = 0xc527;
    probe.cpu.a = slot;
    probe.cpu.x = selector;
    probe.cpu.sp = 0xfd;
    probe.bus.ram[0x1fe] = 0xff;
    probe.bus.ram[0x1ff] = 0x5f; // RTS sentinel $6000
    probe.cpu.cycles = 0;
    probe.cpu.nmi_pending = false;
    probe.cpu.irq_pending = false;
    for _ in 0..20000 {
        probe.cpu_clock();
        if probe.cpu.pc == 0x6000 {
            return u16::from_le_bytes([probe.bus.ram[0x32], probe.bus.ram[0x33]]);
        }
    }
    panic!("CT2 calculation did not return: slot={slot} selector={selector}");
}

#[test]
#[ignore = "requires legally supplied original CT2 ROM; read-only research"]
fn ct2_original_stats_diagnostic() {
    let rom = std::fs::read("../roms/Captain Tsubasa II - Super Striker (Japan).nes").unwrap();
    assert_eq!(sha256_hex(&rom), "bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746");
    let mut core = Emulator::new();
    assert!(core.load_rom(&rom));
    // Baseline research deliberately opts out of the production default.
    core.set_game_profile_tuning(r#"{"profileId":"captain-tsubasa-2-jp","tsubasaLevel":null}"#).unwrap();
    let mut writers = std::collections::BTreeSet::new();
    for frame in 0..11500 {
        core.set_button(0, crate::controller::BTN_START, (600..604).contains(&frame) || (900..904).contains(&frame));
        core.set_button(0, crate::controller::BTN_A, frame >= 1100 && frame < 9500 && frame % 120 < 4);
        core.cpu_ram_write_trace.clear();
        core.ppu_nametable_write_trace.clear();
        core.mapper_cpu_writes.clear();
        core.mapper_scanline_events.clear();
        core.zombie_input_trace.clear();
        core.zombie_text_trace.clear();
        core.zombie_generation_trace.clear();
        core.zombie_mode_trace.clear();
        core.zombie_candidate_read_trace.clear();
        core.resolver_calls.clear();
        core.frame();
        for &(_, pc, address, _, physical) in &core.cpu_ram_write_trace {
            if (0x300..0x384).contains(&address) { writers.insert((pc, physical)); }
        }
    }
    let before = core.bus.ram;
    let players: Vec<_> = (0..11u8).map(|slot| {
        let address = 0x300 + usize::from(slot) * 12;
        serde_json::json!({"slot":slot,"address":address,
            "record":&core.bus.ram[address..address+12],
            "maxStamina":query(&core,slot,0,None)})
    }).collect();
    let slots: Vec<_> = (0..11u8).filter(|&slot| core.bus.ram[0x300 + usize::from(slot) * 12] == 1).collect();
    assert_eq!(slots, vec![9], "fresh original Sao Paulo Tsubasa identity");
    assert_eq!(&rom[16 + 0x3f509..16 + 0x3f50d], &[0x12, 0xaf, 0x0b, 0xfc]);
    let evidence: serde_json::Value = serde_json::from_str(include_str!("../../src/game-profiles/ct2-stats-evidence.json")).unwrap();
    let coefficient_offset = evidence["coefficientOffset"].as_u64().unwrap() as usize;
    let mut comparisons = 0;
    for level in 0..64u8 {
        for selector in 0..23u8 {
            let coefficient = usize::from(rom[16 + coefficient_offset + usize::from(selector)]);
            let expected = if selector == 0 {
                let index = (coefficient + usize::from(level)).min(95);
                let offset = 16 + 0x39f0e + index * 2;
                u16::from_le_bytes([rom[offset], rom[offset + 1]])
            } else {
                let index = (coefficient + 2 * usize::from(level)).min(191);
                u16::from(rom[16 + 0x39e4e + index])
            };
            assert_eq!(query(&core,9,selector,Some(level)), expected,
                "original CPU vs extracted formula: level={} selector={selector}", level + 1);
            comparisons += 1;
        }
    }
    let initial: Vec<_> = (0..7).map(|selector| query(&core,9,selector,None)).collect();
    let natural_max: Vec<_> = (0..7).map(|selector| query(&core,9,selector,Some(63))).collect();
    let invalid_byte_ff: Vec<_> = (0..7).map(|selector| query(&core,9,selector,Some(255))).collect();
    assert_eq!(initial, vec![748,12,14,16,11,12,12]);
    assert_eq!(natural_max, vec![976,232,236,238,229,232,232]);
    assert_ne!(invalid_byte_ff, natural_max, "$FF is NOT max level");
    assert_eq!(core.bus.ram, before, "queries must not mutate the running game");
    println!("CT2_STATS_JSON={}", serde_json::json!({"romSha256":sha256_hex(&rom),
        "frames":11500,"route":"fresh boot, pregame; no RAM edits", "players":players,"recordWriters":writers,
        "formulaComparisons":comparisons,"initialSelectors0to6":initial,
        "level64Selectors0to6":natural_max,"unsafeFFSelectors0to6":invalid_byte_ff,
        "scope":"isolated original $C527 calls, not gameplay call trace; selectors not yet all named"}));
}