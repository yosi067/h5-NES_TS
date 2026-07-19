import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TOP_TWENTY = [
  'sf2',
  'pacman',
  'mslug',
  'dkong',
  'tetris',
  'outrun',
  'ffight',
  'tmnt',
  'bublbobl',
  'frogger',
  'shinobi',
  'ddragon',
  'rtype',
  'raiden',
  'simpsons',
  'strider',
  'snowbros',
  'ssriders',
  'dino',
  'captcomm',
];

function parseDriverList(text) {
  const drivers = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const columns = line.split('|').slice(1, -1).map(column => column.trim());
    if (columns.length < 8 || !columns[0] || columns[0] === 'name') continue;
    drivers.set(columns[0].toLowerCase(), {
      status: columns[1],
      title: columns[2],
      parent: columns[3] || null,
      year: columns[4] || null,
      company: columns[5] || null,
      hardware: columns[6] || null,
      remarks: columns[7] || null,
    });
  }
  return drivers;
}

const [romDirectory, outputPath = 'artifacts/mame-rom-inventory.json'] = process.argv.slice(2);
if (!romDirectory) {
  console.error('Usage: node tools/inventory-mame-roms.mjs <mame-rom-directory> [output.json]');
  process.exitCode = 1;
} else {
  const driverText = await readFile(
    new URL('../node_modules/@mantou/fbneo/em-out/gamelist-arcade.txt', import.meta.url),
    'utf8',
  );
  const drivers = parseDriverList(driverText);
  const files = (await readdir(romDirectory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === '.zip')
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const games = files.map(file => {
    const id = path.basename(file, path.extname(file)).toLowerCase();
    const driver = drivers.get(id) ?? null;
    const rankIndex = TOP_TWENTY.indexOf(id);
    let kind = 'unrecognized';
    if (/bios/i.test(file) || id === 'neogeo' || id === 'qsound') kind = 'bios';
    else if (driver?.status.includes('NW')) kind = 'not-working';
    else if (driver?.parent) kind = 'clone';
    else if (driver) kind = 'parent-game';
    return {
      id,
      file,
      recognized: driver !== null,
      kind,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      ...driver,
    };
  });

  const report = {
    romDirectory,
    zipCount: games.length,
    recognizedCount: games.filter(game => game.recognized).length,
    kindCounts: Object.fromEntries(
      [...new Set(games.map(game => game.kind))].sort().map(kind => [
        kind,
        games.filter(game => game.kind === kind).length,
      ]),
    ),
    topTwenty: TOP_TWENTY.map((id, index) => {
      const game = games.find(candidate => candidate.id === id);
      if (game) return { rank: index + 1, availableInSource: true, ...game };
      const driver = drivers.get(id) ?? null;
      return {
        rank: index + 1,
        id,
        file: null,
        availableInSource: false,
        recognized: driver !== null,
        kind: driver?.parent ? 'clone' : 'parent-game',
        ...driver,
      };
    }),
    games,
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    zipCount: report.zipCount,
    recognizedCount: report.recognizedCount,
    kindCounts: report.kindCounts,
    rankedCount: report.topTwenty.filter(game => game.recognized).length,
  }));
}