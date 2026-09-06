// Run the installed production WASM, offline; never change the source archives.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import init from '@mantou/fbneo/fbneo-arcade.js';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const output = new URL('artifacts/arcade-runtime/', root);
mkdirSync(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const wasmBinary = readFileSync(new URL('node_modules/@mantou/fbneo/em-out/fbneo-arcade.wasm', root));
const runtime = {
  package: '@mantou/fbneo',
  version: JSON.parse(readFileSync(new URL('node_modules/@mantou/fbneo/package.json', root), 'utf8')).version,
  wasmSha256: hash(wasmBinary),
  definitionsSha256: hash(readFileSync(new URL('node_modules/@mantou/fbneo/em-out/games.txt', root))),
};
const results = [];
for (const [archive, driver] of [['nbbatman', 'nbbatmanu']]) {
  const bytes = readFileSync(new URL(`roms/${archive}.zip`, root));
  const log = [];
  let module, props, frame, draws = 0, audioCallbacks = 0;
  module = await init({
    wasmBinary,
    print: text => log.push(text), printErr: text => log.push(text),
    start: () => {},
    setRomProps: (width, height, rotate, flipped, depth) => { props = { width, height, rotate, flipped, depth }; },
    setVisibleSize: () => {}, setAspectRatio: () => {},
    addFile: () => {}, addInput: () => {}, addArchive: () => {},
    audioCallback: () => { audioCallbacks++; },
    drawScreen: ptr => {
      draws++;
      frame = Buffer.from(new Uint8Array(module.HEAP8.buffer, ptr, props.width * props.height * (props.depth === 16 ? 2 : 4)));
    },
  });
  module.FS.mkdir('/roms');
  module.FS.writeFile(`/roms/${driver}.zip`, bytes);
  const result = { archive: `${archive}.zip`, driver, runtime, sha256: hash(bytes), stages: [] };
  const step = (count, input = 0) => {
    for (let i = 0; i < count; i++) {
      module._setEmInput(0, input, 0, 0, 0, 0);
      module._setEmInput(1, 0, 0, 0, 0, 0);
      module._collectGameInputs(); module._doLoop();
    }
  };
  const snapshot = async stage => {
    if (!frame) { result.stages.push({ stage, draws, frame: null }); return; }
    const rgb = Buffer.alloc(props.width * props.height * 3);
    for (let i = 0; i < props.width * props.height; i++) {
      if (props.depth === 16) {
        const color = frame.readUInt16LE(i * 2);
        rgb[i * 3] = ((color >> 11) & 31) << 3;
        rgb[i * 3 + 1] = ((color >> 5) & 63) << 2;
        rgb[i * 3 + 2] = (color & 31) << 3;
      } else {
        rgb[i * 3] = frame[i * 4 + 2]; rgb[i * 3 + 1] = frame[i * 4 + 1]; rgb[i * 3 + 2] = frame[i * 4];
      }
    }
    const image = `${driver}-${stage}.png`;
    await sharp(rgb, { raw: { width: props.width, height: props.height, channels: 3 } }).png().toFile(fileURLToPath(new URL(image, output)));
    result.stages.push({ stage, draws, audioCallbacks, frameSha256: hash(frame), nonzeroBytes: rgb.reduce((n, v) => n + (v !== 0), 0), image });
  };
  try {
    result.startReturn = module.cwrap('startMain', 'number', ['string'])(driver);
    result.props = props ?? null;
    // Even a failed load is stepped: readiness alone is not gameplay evidence.
    step(900); await snapshot('boot');
    step(2, 1 << 5); step(60); await snapshot('coin');
    step(2, 1 << 4); step(180); await snapshot('start');
    step(2, 1 << 6); step(240); await snapshot('select');
    step(600); await snapshot('stage1');
    step(180, (1 << 1) | (1 << 6)); await snapshot('play');
  } catch (error) { result.error = String(error); }
  result.sourceUnchanged = hash(readFileSync(new URL(`roms/${archive}.zip`, root))) === result.sha256;
  result.log = log;
  results.push(result);
}
writeFileSync(new URL('results.json', output), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
assert(results.every(result => result.sourceUnchanged && !result.error), 'Source changed or runtime probe threw');
const [batman] = results;
assert.equal(batman.props?.width, 320);
assert.equal(batman.props?.height, 240);
assert.equal(batman.stages.at(-1).draws, 2166);
assert(batman.stages.every(stage => stage.nonzeroBytes > 0), 'Expected nonblack frames at every checkpoint');
assert.equal(new Set(batman.stages.map(stage => stage.frameSha256)).size, batman.stages.length);
