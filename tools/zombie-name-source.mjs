// Original Japan ROM bank 6: five-bit item selector, not a text-byte search.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ZOMBIE_HUNTER_HASH } from '../src/game-profiles/verified-cell-menus.ts';

const hiragana = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんゃゅょっ';
const katakana = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンャュョッ';
export const nameTranslations = ['劍','盾','頭盔','護手','短劍','戒指','釘錘','水晶','刀','藥瓶','魔法書','毒藥','鑰','食物','魔杖','水晶杖','雷電','大雷電','火焰魔法','爆裂彈','魔法手環','項鍊','魔法時鐘','鎧甲','壺','生命之水','鋼劍','靴子','手裏劍','炸彈','蠟燭','袋子'];
export function decodeNameSource(rom) {
  assert.equal(crypto.createHash('sha256').update(rom).digest('hex'), ZOMBIE_HUNTER_HASH);
  const prg = rom.subarray(16, 16 + rom[4] * 16384);
  assert.deepEqual([...prg.subarray(0x18c78,0x18c84)], [0xa8,0xb9,0x53,0x93,0xa8,0xb9,0x73,0x93,0xc9,0xfc,0xb0,7]);
  assert.deepEqual([...prg.subarray(0x18db3,0x18dc3)], [0x6e,0x22,0x8e,0x22,0xae,0x22,0xce,0x22,0xee,0x22,0x0e,0x23,0x2e,0x23,0x4e,0x23]);
  return Array.from({length:32}, (_, selector) => {
    const prgOffset = 0x19373 + prg[0x19353 + selector];
    const top = [], body = [], raw = []; let accent = false, source = '';
    for (let p = prgOffset; ; p++) {
      const tile = prg[p]; raw.push(tile);
      assert.ok(raw.length <= 24, 'bounded source');
      if (tile === 255) { assert.ok(!accent); break; }
      if (tile === 252) { assert.ok(!accent); accent = true; continue; }
      assert.ok(tile < 192, 'unknown name control');
      const glyph = tile === 36 ? ' ' : tile === 178 ? 'ー' : tile >= 64 && tile <= 113 ? hiragana[tile-64] : tile >= 128 && tile <= 177 ? katakana[tile-128] : undefined;
      assert.ok(glyph, `unknown glyph ${tile}`);
      source += (glyph + (accent ? '\u3099' : '')).normalize('NFC');
      top.push(accent ? 115 : 36); body.push(tile); accent = false;
    }
    return { selector, source, translation: nameTranslations[selector], tiles: [top, body],
      evidence: { kind: 'original-prg-selector-table', bank: 6, pointerTable: 0x19353, dataBase: 0x19373,
        prgOffset, raw, writer: 0x18c78, controls: {252:'dakuten for next glyph',255:'end; append level'} } };
  });
}

// TEST ONLY. Locate serialized Bus RAM by an independently exported 128-byte
// source signature, requiring uniqueness and known natural initial inventory.
// No production RAM writer, no ROM changes, no framebuffer or text injection.
export function seedFirstInventoryItem(core, item) {
  const state = Buffer.from(core.exportPersistentSaveState().split(':')[1], 'base64');
  const signature = Buffer.from(core.getZombieMenuSource());
  const at = state.indexOf(signature);
  assert.ok(signature.length === 128 && at >= 0 && state.indexOf(signature, at+1) === -1);
  const ram = at - 0x600;
  assert.deepEqual([...state.subarray(ram+0xd6,ram+0xda)], [0,1,2,255]);
  state[ram+0xd8] = item;
  assert.ok(core.importPersistentSaveState('NES-SAVE-1:'+state.toString('base64')));
}