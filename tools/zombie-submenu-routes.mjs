// Input-only routes from reset. No inventory/RAM injection.
export const submenuRoutes = ['items', 'weapons', 'equipment', 'status'].map((id, menu) => ({
  id, events: [[120,3], [240,3], [420,3],
    ...Array.from({ length: menu }, (_,i) => [470+i*30,5]), [600,0]], frame: 650,
}));
export const actionRoutes = [
  { id: 'items-select', events: [...submenuRoutes[0].events, [670,0]], frame: 710 },
  { id: 'items-helmet', events: [...submenuRoutes[0].events, [670,0], [750,0]], frame: 780 },
  { id: 'items-shield', events: [...submenuRoutes[0].events, [670,0], [700,7], [750,0]], frame: 780 },
  { id: 'status-next', events: [...submenuRoutes[3].events, [670,0]], frame: 710 },
];
for (const id of ['items-helmet', 'items-shield']) {
  const route = actionRoutes.find(r => r.id === id);
  for (const [suffix, frame] of [['scroll',800], ['end',810]]) actionRoutes.push({ ...route, id: `${id}-${suffix}`, frame });
}
// Physical nametable cells, including the dakuten row. Numeric fields, colons,
// inventory icons and cursor cells are intentionally outside these rectangles.
export const submenuDefinitions = [
  ['items.use', 'つかう', '使用', 'items', 19,16, [[36,36,36],[81,69,66]]],
  ['items.discard', 'すてる', '丟棄', 'items', 21,16, [[36,36,36],[76,82,104]]],
  ['weapons.prompt', 'てに もつ ぶきを', '手持武器', 'weapons', 19,14, [[36,36,36,36,36,36,115,36,36],[82,85,36,98,81,36,91,70,108]]],
  ['weapons.choose', 'えらびなさい。', '請選擇', 'weapons', 21,16, [[36,36,115,36,36,36,36],[67,102,90,84,74,65,179]]],
  ['equipment.heading', 'そうび', '裝備', 'equipment', 19,14, [[36,36,115],[78,66,90]]],
  ['equipment.defense', 'ぼうぎょ', '防禦', 'equipment', 25,14, [[115,36,115,36],[93,66,70,112]]],
  ['equipment.spirit', 'きりょく', '氣力', 'equipment', 25,22, [[36,36,36,36],[70,103,112,71]]],
  ['status.level', 'レベル', '等級', 'status', 19,14, [[36,115,36],[169,156,168]]],
  ['status.strength', 'つよさ', '力量', 'status', 21,14, [[36,36,36],[81,101,74]]],
  ['status.magic', 'まほう', '魔法', 'status', 23,14, [[36,36,36],[94,93,66]]],
  ['status.defense', 'ぼうぎょ', '防禦', 'status', 21,22, [[115,36,115,36],[93,66,70,112]]],
  ['status.spirit', 'きりょく', '氣力', 'status', 23,22, [[36,36,36,36],[70,103,112,71]]],
  ['status.max-power', 'MAXPOW', '最大體力', 'status', 26,14, [[22,10,33,25,24,32]]],
  ['items.select', 'もちものを えらびなさい。', '請選擇道具', 'items-select', 21,14, [[36,36,36,36,36,36,36,36,115,36,36,36,36],[98,80,98,88,108,36,67,102,90,84,74,65,179]]],
  ['items.helmet', 'ヘルメット', '頭盔', 'items-helmet', 23,14, [[36,36,36,36,36],[156,168,161,177,147]]],
  ['items.helmet-level', 'レベル', '等級', 'items-helmet', 23,20, [[36,115,36],[169,156,168]]],
  ['items.equipped', 'みにつけた。', '已裝備', 'items-helmet', 25,20, [[36,36,36,36,36,36],[95,85,81,72,79,179]]],
  ['items.shield', 'たて', '盾', 'items-shield', 23,14, [[36,36],[79,82]]],
  ['items.shield-level', 'レベル', '等級', 'items-shield', 23,17, [[36,115,36],[169,156,168]]],
  ['status.next-strength', 'つよさ', '力量', 'status-next', 19,14, [[36,36,36],[81,101,74]]],
  ['status.next-magic', 'まほう', '魔法', 'status-next', 21,14, [[36,36,36],[94,93,66]]],
  ['status.next-defense', 'ぼうぎょ', '防禦', 'status-next', 19,22, [[115,36,115,36],[93,66,70,112]]],
  ['status.next-spirit', 'きりょく', '氣力', 'status-next', 21,22, [[36,36,36,36],[70,103,112,71]]],
  ['status.next-max-power', 'MAXPOW', '最大體力', 'status-next', 24,14, [[22,10,33,25,24,32]]],
  ['status.next-level', 'つぎのレベルは', '下級所需', 'status-next', 25,14, [[36,115,36,36,115,36,36],[81,70,88,169,156,168,89]]],
];
// Explicit original-frame evidence for each physical row during result scroll.
for (const definition of [...submenuDefinitions]) {
  if (!['items-helmet', 'items-shield', 'items-select'].includes(definition[3])) continue;
  for (const [suffix, delta] of [['scroll',1], ['end',2]]) {
    const copy = structuredClone(definition);
    copy[0] += `-${suffix}`;
    copy[3] = `${definition[3] === 'items-select' ? 'items-helmet' : definition[3]}-${suffix}`;
    copy[4] -= delta;
    submenuDefinitions.push(copy);
  }
}