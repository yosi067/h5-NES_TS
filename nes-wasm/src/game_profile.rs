use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashSet;

pub const PROFILE_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NesGameProfile {
    pub schema_version: u32,
    pub id: String,
    pub game: GameIdentity,
    #[serde(default)]
    pub prg_read_overlays: Vec<ByteOverlay>,
    #[serde(default)]
    pub chr_read_overlays: Vec<ByteOverlay>,
    #[serde(default)]
    pub chr_overlay_pages: Vec<ChrOverlayPage>,
    #[serde(default)]
    pub memory_writes: Vec<MemoryWrite>,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameIdentity {
    pub sha256: String,
    #[serde(default)]
    pub sha256_aliases: Vec<String>,
    pub mapper: u8,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ByteOverlay {
    pub id: String,
    pub offset: u32,
    pub expected_original: u8,
    pub value: u8,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChrOverlayPage {
    pub id: String,
    pub guard: NametableGuard,
    pub overlays: Vec<ByteOverlay>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NametableGuard {
    pub address: u16,
    pub value: u8,
    #[serde(default)]
    pub require_active_table: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MemorySpace {
    CpuRam,
    PrgRam,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WriteTiming {
    Reset,
    Frame,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryWrite {
    pub id: String,
    pub space: MemorySpace,
    pub address: u16,
    pub value: u8,
    pub apply: WriteTiming,
}

impl NesGameProfile {
    pub fn parse(json: &str) -> Result<Self, String> {
        let profile: Self = serde_json::from_str(json)
            .map_err(|error| format!("invalid profile JSON: {error}"))?;
        profile.validate()?;
        Ok(profile)
    }

    fn validate(&self) -> Result<(), String> {
        if self.schema_version != PROFILE_SCHEMA_VERSION {
            return Err(format!(
                "unsupported profile schema version {}",
                self.schema_version
            ));
        }
        if self.id.trim().is_empty() {
            return Err("profile id must not be empty".to_string());
        }
        for hash in std::iter::once(&self.game.sha256).chain(self.game.sha256_aliases.iter()) {
            if hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                return Err("game SHA-256 values must contain 64 hexadecimal characters".to_string());
            }
        }

        Self::validate_overlays("PRG", &self.prg_read_overlays)?;
        Self::validate_overlays("CHR", &self.chr_read_overlays)?;
        let mut page_ids = HashSet::new();
        for page in &self.chr_overlay_pages {
            if page.id.trim().is_empty() || !page_ids.insert(page.id.as_str()) {
                return Err("CHR overlay page ids must be non-empty and unique".to_string());
            }
            if !(0x2000..=0x2FFF).contains(&page.guard.address) {
                return Err(format!("CHR overlay page {} has an invalid nametable guard", page.id));
            }
            Self::validate_overlays("CHR page", &page.overlays)?;
        }

        let mut write_keys = HashSet::new();
        for write in &self.memory_writes {
            if write.id.trim().is_empty() {
                return Err("memory write id must not be empty".to_string());
            }
            let valid_address = match write.space {
                MemorySpace::CpuRam => write.address <= 0x07FF,
                MemorySpace::PrgRam => (0x6000..=0x7FFF).contains(&write.address),
            };
            if !valid_address {
                return Err(format!(
                    "memory write {} has an address outside its declared space",
                    write.id
                ));
            }
            if !write_keys.insert((write.space as u8, write.address, write.apply as u8)) {
                return Err(format!("duplicate memory write target for {}", write.id));
            }
        }

        Ok(())
    }

    pub fn matches_sha256(&self, sha256: &str) -> bool {
        self.game.sha256.eq_ignore_ascii_case(sha256)
            || self.game.sha256_aliases.iter().any(|hash| hash.eq_ignore_ascii_case(sha256))
    }

    fn validate_overlays(kind: &str, overlays: &[ByteOverlay]) -> Result<(), String> {
        let mut offsets = HashSet::new();
        for overlay in overlays {
            if overlay.id.trim().is_empty() {
                return Err(format!("{kind} overlay id must not be empty"));
            }
            if !offsets.insert(overlay.offset) {
                return Err(format!("duplicate {kind} overlay offset {:#X}", overlay.offset));
            }
        }
        Ok(())
    }
}

pub fn sha256_hex(data: &[u8]) -> String {
    let digest = Sha256::digest(data);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_PROFILE: &str = r#"{
        "schemaVersion": 1,
        "id": "captain-tsubasa-2-jp",
        "game": {
            "sha256": "bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746",
            "mapper": 4
        },
        "prgReadOverlays": [
            {"id": "test-prg", "offset": 16, "expectedOriginal": 1, "value": 2}
        ],
        "chrOverlayPages": [{
            "id": "opening",
            "guard": {"address": 8809, "value": 128, "requireActiveTable": true},
            "overlays": [{"id": "glyph", "offset": 32, "expectedOriginal": 3, "value": 4}]
        }],
        "memoryWrites": [
            {"id": "test-ram", "space": "cpuRam", "address": 16, "value": 3, "apply": "reset"}
        ]
    }"#;

    #[test]
    fn parses_valid_profile() {
        let profile = NesGameProfile::parse(VALID_PROFILE).expect("profile should parse");
        assert_eq!(profile.game.mapper, 4);
        assert_eq!(profile.prg_read_overlays[0].offset, 16);
        assert_eq!(profile.chr_overlay_pages[0].guard.address, 0x2269);
        assert_eq!(profile.memory_writes[0].space, MemorySpace::CpuRam);
    }

    #[test]
    fn rejects_unknown_fields_and_bad_addresses() {
        let unknown = VALID_PROFILE.replace("\"mapper\": 4", "\"mapper\": 4, \"extra\": true");
        assert!(NesGameProfile::parse(&unknown).is_err());

        let bad_address = VALID_PROFILE.replace("\"address\": 16", "\"address\": 8192");
        assert!(NesGameProfile::parse(&bad_address).is_err());

        let bad_alias = VALID_PROFILE.replace(
            "\"mapper\": 4",
            "\"sha256Aliases\": [\"bad\"], \"mapper\": 4",
        );
        assert!(NesGameProfile::parse(&bad_alias).is_err());
    }

    #[test]
    fn hashes_rom_bytes() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}