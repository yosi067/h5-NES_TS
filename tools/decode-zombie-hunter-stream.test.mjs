import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeStreams, decodeSource, parseDirectStream } from './decode-zombie-hunter-stream.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const romPath = path.join(root, 'roms', 'Zombie Hunter (Japan).nes');

test('parses the address-set prefix without promoting its parameters to text', () => {
  const raw = [
    0x00, 0x22, 0xa7, 0x19, 0x1e, 0x1c, 0x11,
    0x24, 0x1c, 0x1d, 0x0a, 0x1b, 0x1d, 0x24,
    0x0b, 0x18, 0x1d, 0x1d, 0x18, 0x17, 0x00, 0x81,
  ];
  const parsed = parseDirectStream(raw);

  assert.deepEqual(parsed.roundTrip, raw);
  assert.deepEqual(parsed.records[0], {
    kind: 'address-set',
    start: 0,
    end: 3,
    raw: raw.slice(0, 3),
    control: 0x22,
    ppuControl: 0x20,
    address: 0x22a7,
    addressHigh: 0x22,
    addressLow: 0xa7,
  });
  assert.equal(parsed.visibleRuns[0].decoded, 'PUSH START BOTTON');
});

test('decodes the verified ROM source with a byte-for-byte round trip', () => {
  const decoded = decodeSource(romPath, 0, 0x8dc5);
  assert.equal(decoded.sha256, '91dfb1a0c29f78c5d5b0a582c737c62103c4009ad5e2c20fdecd0c22a8648a48');
  assert.deepEqual(decoded.roundTrip, decoded.raw);
  assert.equal(decoded.records[0].kind, 'address-set');
  assert.equal(decoded.records[0].address, 0x22a7);
  assert.equal(decoded.visibleRuns[0].decoded, 'PUSH START BOTTON');
});

test('parses repeat, fill, and address/read/fill controls from the setup stream', () => {
  const raw = [
    0x00, 0x23, 0xc0, 0x00, 0xc7, 0x0f, 0xff,
    0x00, 0xc7, 0xf0,
    0x00, 0x84, 0x25, 0x00,
    0x00, 0x85, 0xc0, 0x00, 0xe0, 0x25, 0x00,
    0x00, 0x81,
  ];
  const parsed = parseDirectStream(raw);

  assert.deepEqual(parsed.records.map(({ kind }) => kind), [
    'address-set',
    'repeat-write',
    'direct-write-run',
    'repeat-write',
    'fill-range',
    'address-read-fill',
    'end',
  ]);
  assert.equal(parsed.records[1].control, 0xc7);
  assert.equal(parsed.records[1].data, 0x0f);
  assert.equal(parsed.records[1].count, 7);
  assert.equal(parsed.records[4].control, 0x84);
  assert.equal(parsed.records[5].control, 0x85);
  assert.equal(parsed.records[5].readSlot, 0xe0);
  assert.deepEqual(parsed.roundTrip, raw);
});

test('composes adjacent copy sources by replacing the previous 00 81 terminator', () => {
  const first = [0x00, 0x20, 0x49, 0x40, 0x00, 0x81];
  const second = [0x00, 0x22, 0xa7, 0x19, 0x00, 0x81];
  assert.deepEqual(composeStreams([first, second]), [
    0x00, 0x20, 0x49, 0x40,
    0x00, 0x22, 0xa7, 0x19, 0x00, 0x81,
  ]);
});