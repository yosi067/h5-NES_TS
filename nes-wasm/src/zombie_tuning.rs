//! Verified Japanese Zombie Hunter new-game default, independent of localization.
use serde::Deserialize;
pub const ORIGINAL_SHA: &str = "91dfb1a0c29f78c5d5b0a582c737c62103c4009ad5e2c20fdecd0c22a8648a48";
pub const MAX_LEVEL: u8 = 31;
pub const MAX_DISPLAY_MONEY: u32 = 999_999;

#[derive(Clone, Copy, Default)]
pub struct ZombieTuning {
    pub supported: bool,
    pub enabled: bool,
    pub money_enabled: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Update {
    profile_id: String,
    max_level_on_new_game: bool,
    #[serde(default, deserialize_with = "optional_bool")]
    max_money_on_new_game: Option<bool>,
}
fn optional_bool<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Option<bool>, D::Error> {
    bool::deserialize(deserializer).map(Some)
}

impl ZombieTuning {
    pub fn for_rom(sha: &str, mapper: u8) -> Self {
        let supported = sha == ORIGINAL_SHA && mapper == 1;
        Self { supported, enabled: supported, money_enabled: supported }
    }
    pub fn update(&mut self, json: &str) -> Result<(), String> {
        let value: Update = serde_json::from_str(json).map_err(|e| e.to_string())?;
        if !self.supported || value.profile_id != "zombie-hunter-jp" {
            return Err("requires verified Japanese Zombie Hunter ROM".into());
        }
        self.enabled = value.max_level_on_new_game;
        if let Some(enabled) = value.max_money_on_new_game { self.money_enabled = enabled; }
        Ok(())
    }
    pub fn status(&self) -> String {
        serde_json::json!({"profileId":"zombie-hunter-jp", "supported":self.supported,
                "maxLevelOnNewGame":self.enabled, "maxLevel":MAX_LEVEL,
                "maxMoneyOnNewGame":self.money_enabled, "maxMoney":MAX_DISPLAY_MONEY}).to_string()
    }
            /// Return from the native new-game initialization; never a frame/save hook.
            pub fn initial_money_instruction(&self, pc: u16, physical: Option<u32>, opcode: u8, operand: u8) -> bool {
            self.supported && self.money_enabled && pc == 0x9469 && physical == Some(0x1469)
                && opcode == 0xa9 && operand == 0
            }
    pub fn initial_instruction(&self, pc: u16, physical: Option<u32>, opcode: u8, operand: u8) -> bool {
        self.supported && self.enabled && pc == 0x9462 && physical == Some(0x1462)
            && opcode == 0xa9 && operand == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn money_identity_boundary_and_independent_preferences() {
        let mut t = ZombieTuning::for_rom(ORIGINAL_SHA, 1);
        assert!(t.initial_money_instruction(0x9469, Some(0x1469), 0xa9, 0));
        for (pc, physical, op, value) in [(0x9462, Some(0x1462), 0xa9, 0),
            (0x9469, Some(0x11469), 0xa9, 0), (0x9469, None, 0xa9, 0),
            (0x9469, Some(0x1469), 0xa2, 0), (0x9469, Some(0x1469), 0xa9, 1)] {
            assert!(!t.initial_money_instruction(pc, physical, op, value));
        }
        for value in ["255", "\"true\"", "[]", "null"] {
            assert!(t.update(&format!(r#"{{"profileId":"zombie-hunter-jp","maxLevelOnNewGame":false,"maxMoneyOnNewGame":{value}}}"#)).is_err());
            assert!(t.enabled && t.money_enabled);
        }
        t.update(r#"{"profileId":"zombie-hunter-jp","maxLevelOnNewGame":false}"#).unwrap();
        assert!(!t.enabled && t.money_enabled); // old level-only clients preserve money
        t.update(r#"{"profileId":"zombie-hunter-jp","maxLevelOnNewGame":true,"maxMoneyOnNewGame":false}"#).unwrap();
        assert!(t.enabled && !t.money_enabled);
        assert!(!t.initial_money_instruction(0x9469, Some(0x1469), 0xa9, 0));
        for t in [ZombieTuning::for_rom(ORIGINAL_SHA,4),ZombieTuning::for_rom("wrong",1)] {
            assert!(!t.initial_money_instruction(0x9469, Some(0x1469), 0xa9, 0));
        }
    }
    #[test]
    fn identity_and_initialization_boundary() {
        let mut t = ZombieTuning::for_rom(ORIGINAL_SHA, 1);
        assert!(t.initial_instruction(0x9462, Some(0x1462), 0xa9, 0));
        for (pc, physical, op, value) in [(0x9464, Some(0x1464), 0x85, 0xc0),
            (0x9462, Some(0x11462), 0xa9, 0), (0x9462, None, 0xa9, 0),
            (0x9462, Some(0x1462), 0xa2, 0), (0x9462, Some(0x1462), 0xa9, 255)] {
            assert!(!t.initial_instruction(pc, physical, op, value));
        }
        for value in ["31", "255", "null", "\"true\""] {
            assert!(t.update(&format!(r#"{{"profileId":"zombie-hunter-jp","maxLevelOnNewGame":{value}}}"#)).is_err());
            assert!(t.enabled);
        }
        t.update(r#"{"profileId":"zombie-hunter-jp","maxLevelOnNewGame":false}"#).unwrap();
        assert!(!t.initial_instruction(0x9462, Some(0x1462), 0xa9, 0));
        assert!(!ZombieTuning::for_rom(ORIGINAL_SHA, 4).supported);
        assert!(!ZombieTuning::for_rom("unverified", 1).supported);
    }
}