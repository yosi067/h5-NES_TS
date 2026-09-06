//! Opt-in original-ROM evidence. Laboratory trials are separate from boot evidence.
use super::*;

fn clear(core: &mut Emulator) {
    core.ppu.a12_trace.clear(); core.apu.test_register_writes.clear();
    core.cpu_ram_write_trace.clear(); core.ppu_nametable_write_trace.clear();
    core.mapper_cpu_writes.clear(); core.mapper_scanline_events.clear();
    core.zombie_input_trace.clear(); core.zombie_text_trace.clear();
    core.zombie_generation_trace.clear(); core.zombie_mode_trace.clear();
    core.zombie_candidate_read_trace.clear(); core.resolver_calls.clear();
}
fn boot(core: &mut Emulator) {
    for frame in 0..701 {
        core.set_button(0, crate::controller::BTN_START,
            (120..122).contains(&frame) || (240..242).contains(&frame));
        clear(core); core.frame(); core.consume_audio_samples();
    }
    clear(core);
}
fn bank(core: &mut Emulator, value: u8) {
    core.cartridge.cpu_write(0x8000, 0x80);
    for bit in 0..5 { core.cartridge.cpu_write(0x8000, (0x12 >> bit) & 1); }
    for bit in 0..5 { core.cartridge.cpu_write(0xe000, (value >> bit) & 1); }
}
fn run_to(core: &mut Emulator, start: u16, end: u16) {
    core.cpu.pc = start; core.cpu.cycles = 0;
    core.cpu.nmi_pending = false; core.cpu.irq_pending = false;
    for _ in 0..20000 {
        core.cpu_clock();
        if core.cpu.pc == end { return; }
    }
    panic!("routine {start:04x} did not reach {end:04x}");
}
fn call(core: &mut Emulator, entry: u16) {
    core.cpu.sp = 0xfd;
    core.bus.ram[0x1fe] = 0xff; core.bus.ram[0x1ff] = 0x5f;
    run_to(core, entry, 0x6000);
}
fn hp(core: &Emulator, address: usize) -> u16 {
    u16::from(core.bus.ram[address]) + 100 * u16::from(core.bus.ram[address + 1])
}
fn preference(core: &mut Emulator, enabled: bool) {
    core.set_game_profile_tuning(&serde_json::json!({"profileId":"zombie-hunter-jp",
        "maxLevelOnNewGame":enabled}).to_string()).unwrap();
}

#[test]
#[ignore = "requires original Japanese Zombie Hunter ROM"]
fn zombie_original_stats_research() {
    let rom = std::fs::read("../roms/Zombie Hunter (Japan).nes").unwrap();
    assert_eq!(sha256_hex(&rom), zombie_tuning::ORIGINAL_SHA);
    let prg = &rom[16..];
    assert_eq!(&prg[0x1462..0x1469], &[0xa9,0,0x85,0xc0,0x20,0x2b,0xb8]);
    assert_eq!(&prg[0x240e..0x241a], &[0xe6,0xc0,0xa5,0xc0,0xc9,0x20,0x90,4,0xa9,0x1f,0x85,0xc0]);
    let mut samples = Vec::new();
    for enabled in [false, true] {
        let mut core = Emulator::new();
        assert!(core.load_rom(&rom));
        assert!(core.zombie_tuning.enabled);
        preference(&mut core, enabled);
        boot(&mut core);
        let level = if enabled { 31 } else { 0 };
        let power = if enabled { 223 } else { 37 };
        assert_eq!(core.bus.ram[0xc0], level);
        assert_eq!(hp(&core, 0xc2), power);
        assert_eq!(hp(&core, 0xc4), power);
        assert_eq!(&core.bus.ram[0xb9..0xbc], if enabled { &[33,33,11] } else { &[5,5,1] });
        assert_eq!(&core.bus.ram[0xcd..0xd2], if enabled { &[89,11,85,89,11] } else { &[14,1,34,14,8] });
        assert_eq!(&core.bus.ram[0xd2..0xd6], &[0, 0, 0, 0]);
        // Completed-frame original digit tiles, not an overlay.
        assert_eq!(&core.ppu.nametable[0x23c..0x23e], if enabled { &[3, 1] } else { &[0x15, 0] });
        assert_eq!(&core.ppu.nametable[0x226..0x229], if enabled { &[2, 2, 3] } else { &[0x24, 3, 7] });
        println!("original boot: enabled={enabled}, displayed L{level}, POW={power}, defense={:?}, coefficients={:?}",
            &core.bus.ram[0xb9..0xbc], &core.bus.ram[0xcd..0xd2]);
        samples.push(serde_json::json!({"enabled":enabled, "levelRam00C0":level,
            "currentPower00C2":hp(&core,0xc2), "maxPower00C4":hp(&core,0xc4),
            "ram00B9to00BB":&core.bus.ram[0xb9..0xbc], "ram00CDto00D1":&core.bus.ram[0xcd..0xd2],
            "levelTiles":&core.ppu.nametable[0x23c..0x23e], "powerTiles":&core.ppu.nametable[0x226..0x229]}));
        let persistent = core.export_persistent_save_state();
        let temporary = core.export_save_state();
        let saved_ram = core.bus.ram;
        preference(&mut core, !enabled);
        assert_eq!(core.bus.ram, saved_ram, "toggle is not a RAM editor");
        assert!(core.import_persistent_save_state(&persistent));
        assert_eq!(core.bus.ram, saved_ram);
        assert_eq!(core.zombie_tuning.enabled, !enabled);
        assert!(core.import_save_state(&temporary));
        assert_eq!(core.bus.ram, saved_ram);
        assert_eq!(core.zombie_tuning.enabled, !enabled);

        // Native damage, base-100 borrow and death floor.
        preference(&mut core, true);
        bank(&mut core, 2);
        assert_eq!(core.cartridge.mapper.cpu_read(0xdd2f), Some(0xdd2f));
        core.cpu.x = 0; call(&mut core, 0xdd2f);
        assert_eq!(hp(&core, 0xc2), power - 1);
        assert_eq!(hp(&core, 0xc4), power);
        for (low, high, expected) in [(0, 2, 199), (0, 0, 0)] {
            core.bus.ram[0xc2] = low; core.bus.ram[0xc3] = high;
            core.cpu.x = 0; call(&mut core, 0xdd2f);
            assert_eq!(hp(&core, 0xc2), expected);
        }

        // Laboratory trials of original growth for every natural level.
        bank(&mut core, 0);
        assert_eq!(core.cartridge.mapper.cpu_read(0xb871), Some(0x3871));
        assert_eq!(core.cartridge.mapper.cpu_read(0xf900), Some(0x7900));
        core.bus.ram[0xc1] = 0;
        for trial in 0..=31u8 {
            core.bus.ram[0xc0] = trial;
            call(&mut core, 0xb871);
            let index = usize::from(trial);
            let curve = usize::from(prg[0x39c9 + index]);
            assert_eq!(hp(&core, 0xc4), u16::from(prg[0x7a00 + curve]) + 100 * u16::from(prg[0x7900 + curve]));
            for (ram, table) in [(0xcd, 0x3ac9), (0xb9, 0x3bc9), (0xd0, 0x3cc9), (0xba, 0x3dc9), (0xbb, 0x3ec9)] {
                assert_eq!(core.bus.ram[ram], prg[table + index]);
            }
            assert_eq!(hp(&core, 0xc2), 0, "growth does not refill HP");
        }
        for (before, after) in [(0, 1), (30, 31), (31, 31)] {
            core.bus.ram[0xc0] = before;
            run_to(&mut core, 0xa40e, 0xa41a);
            assert_eq!(core.bus.ram[0xc0], after);
        }
        preference(&mut core, false);
        core.reset(); assert!(!core.zombie_tuning.enabled);
        boot(&mut core); assert_eq!(core.bus.ram[0xc0], 0);
        preference(&mut core, true);
        core.reset(); assert!(core.zombie_tuning.enabled);
        boot(&mut core); assert_eq!(core.bus.ram[0xc0], 31);
        core.clear_game_profile(); assert!(core.zombie_tuning.enabled);
        preference(&mut core, false);
        assert!(core.load_rom(&rom)); assert!(core.zombie_tuning.enabled);
        let mut unknown = rom.clone(); unknown[16 + 0x1463] = 1;
        assert!(core.load_rom(&unknown)); assert!(!core.zombie_tuning.supported);
        assert!(!core.load_rom(&[])); assert!(!core.zombie_tuning.enabled);
    }
    assert_eq!(sha256_hex(&std::fs::read("../roms/Zombie Hunter (Japan).nes").unwrap()), zombie_tuning::ORIGINAL_SHA);
    if std::env::var("ZOMBIE_STATS_EVIDENCE").as_deref() == Ok("1") {
        let report = serde_json::json!({"sourceSha256":zombie_tuning::ORIGINAL_SHA,
            "maxLevel":31, "initialization":{"cpuPC":"9462", "prgOffset":"1462", "fileOffset":"1472",
                "bytes":&prg[0x1462..0x1469]},
            "cap":{"cpuPC":"A40E", "prgOffset":"240E", "bytes":&prg[0x240e..0x241a],
                "trials":[[0,1],[30,31],[31,31]]},
            "samples":samples, "laboratoryGrowthTrials":64,
            "verified":["native damage/borrow/death floor", "reset preference", "temporary/persistent restore",
                "unknown/failed ROM load", "source ROM unchanged"]});
        std::fs::write("../artifacts/zombie-stats-native.json", serde_json::to_string_pretty(&report).unwrap()+"\n").unwrap();
    }
    println!("verified: 64 growth trials, natural cap, damage/borrow/death, reset, temp/persistent restore, unknown/failed load, unchanged ROM");
}

#[test]
#[ignore = "requires original Japanese Zombie Hunter ROM"]
fn zombie_original_stats_research_money() {
    let rom = std::fs::read("../roms/Zombie Hunter (Japan).nes").unwrap();
    assert_eq!(sha256_hex(&rom), zombie_tuning::ORIGINAL_SHA);
    let prg = &rom[16..];
    assert_eq!(&prg[0x3833..0x383b], &[0x85,0xc9,0x85,0xca,0xa9,0x1e,0x85,0xc8]);
    assert_eq!(&prg[0x1469..0x146d], &[0xa9,0,0x85,0x12]);
    let set = |core: &mut Emulator, level: bool, money: bool| {
        core.set_game_profile_tuning(&serde_json::json!({"profileId":"zombie-hunter-jp",
            "maxLevelOnNewGame":level,"maxMoneyOnNewGame":money}).to_string()).unwrap();
    };
    let mut samples = Vec::new();
    for level in [false, true] { for money in [false, true] {
        let mut core = Emulator::new(); assert!(core.load_rom(&rom));
        assert!(core.zombie_tuning.money_enabled);
        set(&mut core, level, money); core.reset(); boot(&mut core);
        let expected = if money { [99,99,99,0] } else { [30,0,0,0] };
        assert_eq!(&core.bus.ram[0xc8..0xcc], &expected);
        assert_eq!(core.bus.ram[0xc0], if level {31} else {0});
        assert_eq!(&core.ppu.nametable[0x2a7..0x2ad],
            if money { &[9,9,9,9,9,9] } else { &[0x24,0x24,0x24,0x24,3,0] });
        samples.push(serde_json::json!({"levelEnabled":level,"moneyEnabled":money,
            "ramC8toCB":expected,"moneyTiles":&core.ppu.nametable[0x2a7..0x2ad]}));
        // A spent balance survives both save formats and subsequent frames.
        core.bus.ram[0xc8..0xcc].copy_from_slice(&[45,23,1,0]);
        let temp = core.export_save_state(); let persistent = core.export_persistent_save_state();
        set(&mut core, !level, !money);
        for saved_persistent in [false,true] {
            if saved_persistent { assert!(core.import_persistent_save_state(&persistent)); }
            else { assert!(core.import_save_state(&temp)); }
            for _ in 0..10 { clear(&mut core); core.frame(); core.consume_audio_samples(); }
            assert_eq!(&core.bus.ram[0xc8..0xcc], &[45,23,1,0]);
            assert_eq!(core.zombie_tuning.money_enabled, !money);
        }
        core.clear_game_profile(); assert_eq!(core.zombie_tuning.money_enabled, !money);
        core.reset(); boot(&mut core);
        assert_eq!(&core.bus.ram[0xc8..0xcc], if money { &[30,0,0,0] } else { &[99,99,99,0] });
        assert!(core.load_rom(&rom)); assert!(core.zombie_tuning.money_enabled);
        let mut unknown = rom.clone(); unknown[16+0x1463] = 1;
        assert!(core.load_rom(&unknown)); assert!(!core.zombie_tuning.money_enabled);
        boot(&mut core); assert_eq!(&core.bus.ram[0xc8..0xcc], &[30,0,0,0]);
        assert!(!core.load_rom(&[])); assert!(!core.zombie_tuning.money_enabled);
    }}
    // Actual 6502 arithmetic, not host-side simulations. Native earning has NO
    // saturation: the fourth byte records millions but the HUD shows six digits.
    let mut core = Emulator::new(); assert!(core.load_rom(&rom)); boot(&mut core); bank(&mut core,0);
    assert_eq!(core.cartridge.mapper.cpu_read(0xa3a0), Some(0x23a0));
    for (before, amount, after) in [
        ([98,99,99,0],[1,0,0],[99,99,99,0]),
        ([99,99,99,0],[1,0,0],[0,0,0,1]),
        ([99,99,99,0],[99,99,99],[98,99,99,1]),
    ] {
        core.bus.ram[0xc8..0xcc].copy_from_slice(&before);
        core.bus.ram[0x9b..0x9e].copy_from_slice(&amount); call(&mut core,0xa3a0);
        assert_eq!(&core.bus.ram[0xc8..0xcc], &after);
    }
    for (before, cost, after) in [
        ([99,99,99,0],[30,0,0],[69,99,99,0]),
        ([0,0,1,0],[1,0,0],[99,99,0,0]),
        ([0,0,0,1],[1,0,0],[99,99,99,0]),
        ([30,0,0,0],[31,0,0],[30,0,0,0]),
        ([30,0,0,0],[30,0,0],[0,0,0,0]),
    ] {
        core.bus.ram[0xc8..0xcc].copy_from_slice(&before);
        core.bus.ram[0x9b..0x9e].copy_from_slice(&cost); call(&mut core,0xa3ba);
        assert_eq!(&core.bus.ram[0xc8..0xcc], &after);
    }
    assert_eq!(sha256_hex(&std::fs::read("../roms/Zombie Hunter (Japan).nes").unwrap()), zombie_tuning::ORIGINAL_SHA);
    if std::env::var("ZOMBIE_STATS_EVIDENCE").as_deref() == Ok("1") {
        std::fs::write("../artifacts/zombie-money-native.json", serde_json::to_string_pretty(&serde_json::json!({
            "sourceSha256":zombie_tuning::ORIGINAL_SHA,"maxDisplayedMoney":999999,"nativeEarnSaturates":false,
            "moneyRepresentation":"C8 + 100*C9 + 10000*CA + 1000000*CB; HUD omits CB",
            "initializationPrg1469":&prg[0x1469..0x146d],"earnPrg23A0":&prg[0x23a0..0x23ba],
            "spendPrg23BA":&prg[0x23ba..0x23e0],"displayPrg1971A":&prg[0x1971a..0x19728],
            "samples":samples,"earningTrials":3,"spendingTrials":5,
            "verified":["four independent settings combinations","reset on/off","spent save temp/persistent plus frames",
                "profile clear","reload defaults","wrong hash boot","failed load","ROM unchanged"]
        })).unwrap()+"\n").unwrap();
    }
    println!("money verified: display 999999, native overflow NOT saturation, 3 earning and 5 spending trials, 4 settings combinations, save/reset/hash checks");
}