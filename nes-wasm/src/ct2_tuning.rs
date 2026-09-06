//! Semantic read-side tuning, separate from translation/name overlays.
//! No roster/experience/guts writes; saves always contain the game's real level.
use serde::Deserialize;

pub const ORIGINAL_SHA: &str = "bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746";
const HEADER_ALIAS_SHA: &str = "ee08f9134ef0e9e3a5f77e4f08244d24739c68d781cb58e2be737916bb3ab5ae";

#[derive(Clone, Copy, Default)]
pub struct Ct2Tuning {
    pub supported: bool,
    pub level: Option<u8>, // displayed level, never an arbitrary byte
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Update {
    profile_id: String,
    tsubasa_level: Option<u8>,
}

impl Ct2Tuning {
    pub fn for_rom(sha: &str, mapper: u8) -> Self {
        let supported = mapper == 4 && matches!(sha, ORIGINAL_SHA | HEADER_ALIAS_SHA);
        Self { supported, level: supported.then_some(64) }
    }

    pub fn update(&mut self, json: &str) -> Result<(), String> {
        let value: Update = serde_json::from_str(json).map_err(|e| e.to_string())?;
        if !self.supported || value.profile_id != "captain-tsubasa-2-jp" {
            return Err("tuning requires the verified original CT2 ROM and profile identity".into());
        }
        if value.tsubasa_level.is_some_and(|level| !(1..=64).contains(&level)) {
            return Err("Tsubasa level must be null (off) or 1..64".into());
        }
        self.level = value.tsubasa_level;
        Ok(())
    }

    pub fn status(&self) -> String {
        serde_json::json!({"profileId":"captain-tsubasa-2-jp",
            "supported":self.supported,"tsubasaLevel":self.level}).to_string()
    }

    // Only invoked during the original LDA ($34),Y at the verified calculation
    // or level-display sites. Restrict to the home XI, never the opponent table.
    pub fn level_read(&self, ram: &[u8; 2048], address: u16) -> Option<u8> {
        let level = self.level?;
        let record = usize::from(u16::from_le_bytes([ram[0x34], ram[0x35]]));
        if self.supported && (0x300..0x384).contains(&record)
            && (record - 0x300) % 12 == 0 && ram[record] == 1
            && usize::from(address) == record + 3
        {
            Some(level - 1)
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_range_and_atomic_updates() {
        for sha in [ORIGINAL_SHA, HEADER_ALIAS_SHA] {
            let mut tuning = Ct2Tuning::for_rom(sha, 4);
            assert_eq!(tuning.level, Some(64));
            for invalid in ["0", "65", "255", "-1", "1.5", "true", "\"64\""] {
                assert!(tuning.update(&format!(r#"{{"profileId":"captain-tsubasa-2-jp","tsubasaLevel":{invalid}}}"#)).is_err());
                assert_eq!(tuning.level, Some(64));
            }
            tuning.update(r#"{"profileId":"captain-tsubasa-2-jp","tsubasaLevel":null}"#).unwrap();
            assert_eq!(tuning.level, None);
        }
        assert!(!Ct2Tuning::for_rom(ORIGINAL_SHA, 0).supported);
        assert!(!Ct2Tuning::for_rom("unverified", 4).supported);
        assert!(Ct2Tuning::default().update(r#"{"profileId":"captain-tsubasa-2-jp","tsubasaLevel":64}"#).is_err());
    }

    #[test]
    fn roster_identity_not_slot_or_team_number() {
        let tuning = Ct2Tuning::for_rom(ORIGINAL_SHA, 4);
        let mut ram = [0u8; 2048];
        for slot in 0..22 {
            let record = 0x300 + slot * 12;
            ram[0x34..0x36].copy_from_slice(&(record as u16).to_le_bytes());
            ram[record] = 1;
            assert_eq!(tuning.level_read(&ram, record as u16 + 3), (slot < 11).then_some(63));
            assert_eq!(tuning.level_read(&ram, record as u16 + 1), None);
            ram[record] = 2;
            assert_eq!(tuning.level_read(&ram, record as u16 + 3), None);
        }
    }
}