const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/data.js');
const World = require('../js/world.js');

test('цифра равна числу мин вокруг на любом участке карты, включая отрицательные координаты', () => {
  const w = World.newWorld(12345);
  for (let i = 0; i < 3000; i++) {
    const x = Math.floor(Math.random() * 400) - 200, y = Math.floor(Math.random() * 400) - 200;
    const n = World.neighbors(x, y).filter(([a, b]) => World.isMine(w, a, b)).length;
    assert.strictEqual(World.num(w, x, y), n);
  }
});

test('мины заданы картой заранее: одинаковые при повторной проверке и после сохранения', () => {
  const w = World.newWorld(777);
  const before = [];
  for (let x = -30; x <= 30; x++) for (let y = -30; y <= 30; y++) before.push(World.isMine(w, x, y));
  const w2 = World.sanitize(JSON.parse(JSON.stringify(World.serialize(w))));
  const after = [];
  for (let x = -30; x <= 30; x++) for (let y = -30; y <= 30; y++) after.push(World.isMine(w2, x, y));
  assert.deepStrictEqual(after, before);
  assert.ok(before.some(Boolean));
});

test('флажок до первого открытия стоит на реальной клетке карты', () => {
  const w = World.newWorld(5);
  let mx, my;
  for (let x = 8; !mx; x++) if (World.isMine(w, x, 0)) { mx = x; my = 0; }
  World.toggleFlag(w, mx, my);
  assert.ok(World.knownMine(w, mx, my));
  assert.ok(World.isMine(w, mx, my));
});

test('у города и на полянах мин нет; плотность растёт с расстоянием', () => {
  const w = World.newWorld(42);
  for (let x = -D.WORLD.safeRadius; x <= D.WORLD.safeRadius; x++)
    for (let y = -D.WORLD.safeRadius; y <= D.WORLD.safeRadius; y++) assert.ok(!World.isMine(w, x, y));
  let clearings = 0;
  for (let rx = -8; rx <= 8; rx++) for (let ry = -8; ry <= 8; ry++) {
    const c = World.clearingOfRegion(w, rx, ry);
    if (!c) continue;
    clearings++;
    for (let x = c.x0; x < c.x0 + c.size; x++) for (let y = c.y0; y < c.y0 + c.size; y++) {
      assert.ok(!World.isMine(w, x, y));
      assert.strictEqual(World.clearingAt(w, x, y), c);
    }
    if (c.type === 'boss') assert.ok(c.d >= D.WORLD.bossFrom);
  }
  assert.ok(clearings > 100);
  assert.ok(World.density(100) > World.density(10));
  assert.ok(World.minePct(100) > World.minePct(0));
});

test('открывать можно только рядом с открытым; нули раскрывают область; поляна открывается целиком', () => {
  const w = World.newWorld(99);
  assert.ok(World.canOpen(w, 4, 0));
  assert.ok(!World.canOpen(w, 10, 0));
  const r = World.reveal(w, 4, 0);
  assert.ok(r.opened.length > 10); // безопасная зона вокруг города
  r.opened.forEach(([x, y]) => {
    assert.ok(!World.isMine(w, x, y));
    if (World.num(w, x, y) === 0) World.neighbors(x, y).forEach(([a, b]) => assert.ok(World.isOpen(w, a, b)));
  });
  // поляна: открытие одной клетки открывает её всю
  let c = null;
  for (let rx = 1; !c; rx++) c = World.clearingOfRegion(w, rx, 0);
  const res = World.reveal(w, c.x0, c.y0);
  assert.ok(res.clearings.some((x) => x.id === c.id));
  for (let x = c.x0; x < c.x0 + c.size; x++) for (let y = c.y0; y < c.y0 + c.size; y++) assert.ok(World.isOpen(w, x, y));
});

test('открытие по цифре — только когда флажков ровно столько, сколько мин', () => {
  const w = World.newWorld(3);
  World.reveal(w, 4, 0);
  // найдём открытую цифру с закрытыми соседями
  let target = null;
  w.open.forEach((k) => {
    const [x, y] = k.split(',').map(Number);
    if (!target && World.num(w, x, y) > 0 && World.neighbors(x, y).some(([a, b]) => !World.isOpen(w, a, b))) target = [x, y];
  });
  assert.ok(target);
  const [x, y] = target;
  assert.deepStrictEqual(World.chordTargets(w, x, y), []);
  World.neighbors(x, y).filter(([a, b]) => World.isMine(w, a, b)).forEach(([a, b]) => World.toggleFlag(w, a, b));
  const t = World.chordTargets(w, x, y);
  t.forEach(([a, b]) => assert.ok(!World.isMine(w, a, b)));
});

test('подменённое сохранение мира исправляется', () => {
  const w = World.newWorld(2024);
  World.reveal(w, 4, 0);
  const raw = World.serialize(w);
  let mine = null;
  for (let x = 8; !mine; x++) if (World.isMine(w, x, 1)) mine = x + ',1';
  let safe = null;
  for (let x = 8; !safe; x++) if (!World.isMine(w, x, 2)) safe = x + ',2';
  const hacked = World.sanitize(Object.assign({}, raw, {
    open: World.serialize(Object.assign(World.newWorld(2024), { open: new Set([...w.open, mine]) })).open,
    blown: [safe, 'bad'], waypoints: ['0,0', 'x'], looted: ['1,1'],
  }));
  assert.ok(!hacked.open.has(mine), 'открытая мина без взрыва закрыта');
  assert.ok(!hacked.blown.has(safe), 'взрыв на пустой клетке отброшен');
  assert.deepStrictEqual(hacked.waypoints, []);
  assert.strictEqual(hacked.looted.size, 0);
  assert.strictEqual(hacked.open.size, w.open.size);
  assert.strictEqual(World.sanitize({ seed: 'abc' }), null);
});
