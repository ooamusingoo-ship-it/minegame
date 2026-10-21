const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/data.js');
const World = require('../js/world.js');
const Game = require('../js/game.js');

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const always = (v) => () => v;

function strongHero(race, cls) {
  const h = Game.newHero('Тест', race || 'human', cls || 'fighter');
  h.level = 40;
  Game.fullHeal(h);
  return h;
}

// Открывать безопасные клетки по краю открытой области, пока не найдётся поляна нужного типа.
function exploreUntil(hero, pred, limit) {
  const w = hero.world;
  for (let i = 0; i < (limit || 4000); i++) {
    const found = [...w.open].map((k) => k.split(',').map(Number))
      .map(([x, y]) => World.clearingAt(w, x, y)).find((c) => c && pred(c));
    if (found) return found;
    let target = null;
    for (const k of w.open) {
      const [x, y] = k.split(',').map(Number);
      target = World.neighbors(x, y).find(([a, b]) => World.canOpen(w, a, b) && !World.isMine(w, a, b));
      if (target) break;
    }
    if (!target) for (let r = 4; !target && r < 50; r++) for (let x = -r; x <= r && !target; x++) {
      if (World.canOpen(w, x, -r) && !World.isMine(w, x, -r)) target = [x, -r];
    }
    Game.act(hero, { type: 'open', x: target[0], y: target[1] }, seeded(i));
    Game.fullHeal(hero);
  }
  return null;
}

function fightAll(hero, c) {
  const ev = [];
  for (let k = 0; k < 20; k++) {
    const m = Game.aliveCampMobs(hero, c)[0];
    if (!m) break;
    ev.push(...Game.act(hero, { type: 'move', x: m.x, y: m.y }, seeded(k)));
    while (hero.run && hero.run.phase === 'fight') ev.push(...Game.act(hero, { type: 'attack' }, seeded(k + 100)));
  }
  return ev;
}

test('у каждой расы и класса есть стартовый скил и корректные характеристики', () => {
  Object.keys(D.CLASSES).forEach((race) => {
    Object.keys(D.CLASSES[race]).forEach((cls) => {
      const h = Game.newHero('Тест', race, cls);
      const s = Game.stats(h);
      assert.strictEqual(Object.keys(h.skills).length, 1);
      assert.ok(s.hp > 0 && s.mp > 0 && s.atk > 0 && s.def > 0);
      assert.strictEqual(h.hp, s.hp);
    });
  });
});

test('бонусы рас работают', () => {
  const human = Game.stats(Game.newHero('a', 'human', 'fighter'));
  const orc = Game.stats(Game.newHero('a', 'orc', 'fighter'));
  const elf = Game.stats(Game.newHero('a', 'elf', 'fighter'));
  assert.ok(orc.hp > human.hp);
  assert.ok(elf.evade > 0);
  assert.ok(human.xpMult > 1);
});

test('опыт поднимает уровень и лечит', () => {
  const h = Game.newHero('a', 'human', 'fighter');
  h.hp = 1;
  assert.strictEqual(Game.addXp(h, Game.xpToNext(1) + Game.xpToNext(2)), 2);
  assert.strictEqual(h.level, 3);
  assert.strictEqual(h.hp, Game.stats(h).hp);
});

test('мина снимает часть здоровья, поход продолжается; дальние клетки открыть нельзя', () => {
  const h = Game.newHero('a', 'orc', 'fighter');
  Game.startOuting(h);
  const far = Game.act(h, { type: 'open', x: 30, y: 0 });
  assert.ok(far.some((e) => e.type === 'msg'));
  Game.act(h, { type: 'open', x: 4, y: 0 }, seeded(1));
  const w = h.world;
  let mine = null;
  for (const k of w.open) {
    const [x, y] = k.split(',').map(Number);
    mine = World.neighbors(x, y).find(([a, b]) => World.isMine(w, a, b) && World.canOpen(w, a, b));
    if (mine) break;
  }
  const max = Game.stats(h).hp;
  h.hp = max;
  const ev = Game.act(h, { type: 'open', x: mine[0], y: mine[1] }, seeded(2));
  const ex = ev.find((e) => e.type === 'explode');
  assert.strictEqual(ex.dmg, Math.round(max * World.minePct(World.dist(mine[0], mine[1]))));
  assert.ok(h.run && h.run.phase === 'explore');
  assert.ok(w.blown.has(World.key(mine[0], mine[1])));
  assert.strictEqual(h.run.streak, 0);
});

test('открытые клетки дают опыт; флажок и открытие по цифре', () => {
  const h = Game.newHero('a', 'human', 'fighter');
  Game.startOuting(h);
  const xp = h.xp + h.level * 1e6;
  const ev = Game.act(h, { type: 'open', x: 4, y: 0 }, seeded(1));
  assert.ok(ev.find((e) => e.type === 'reveal').xp > 0);
  assert.ok(h.xp + h.level * 1e6 > xp);
  const w = h.world;
  let num = null;
  for (const k of w.open) {
    const [x, y] = k.split(',').map(Number);
    if (World.num(w, x, y) > 0 && World.neighbors(x, y).some(([a, b]) => !World.isOpen(w, a, b) && !World.isMine(w, a, b))) { num = [x, y]; break; }
  }
  const mines = World.neighbors(num[0], num[1]).filter(([a, b]) => World.isMine(w, a, b) && !World.isOpen(w, a, b));
  mines.forEach(([a, b]) => Game.act(h, { type: 'flag', x: a, y: b }));
  const before = w.open.size;
  const ev2 = Game.act(h, { type: 'chord', x: num[0], y: num[1] }, seeded(3));
  assert.ok(!ev2.some((e) => e.type === 'explode'));
  assert.ok(w.open.size > before);
});

test('лагерь: пошаговый бой, добыча в мешок, лагерь становится камнем телепорта, мобы возрождаются после города', () => {
  const h = strongHero();
  Game.startOuting(h);
  const c = exploreUntil(h, (x) => x.type === 'camp');
  assert.ok(c, 'нашли лагерь');
  const mobs = Game.aliveCampMobs(h, c);
  assert.ok(mobs.length >= 2);
  Game.act(h, { type: 'move', x: mobs[0].x, y: mobs[0].y }, seeded(1));
  assert.strictEqual(h.run.phase, 'fight');
  const ev = fightAll(h, c);
  assert.ok(ev.some((e) => e.type === 'kill'));
  assert.ok(ev.some((e) => e.type === 'campclear' && e.waypoint));
  assert.ok(h.run.bag.adena > 0);
  assert.strictEqual(Game.aliveCampMobs(h, c).length, 0);
  assert.ok(Game.startPoints(h).some((p) => p.id === c.id));
  const adena = h.adena, bag = h.run.bag.adena;
  Game.teleport(h);
  assert.strictEqual(h.adena, adena + bag);
  // новый поход с камня телепорта: мобы снова на месте, открытое осталось открытым
  Game.startOuting(h, c.id);
  assert.deepStrictEqual(h.run.pos, { x: c.cx, y: c.cy });
  assert.strictEqual(Game.aliveCampMobs(h, c).length, mobs.length);
  assert.ok(World.isOpen(h.world, c.cx, c.cy));
});

test('отступление: удачное выводит из боя и моб остаётся раненым, неудачное — моб бьёт', () => {
  const h = strongHero();
  Game.startOuting(h);
  const c = exploreUntil(h, (x) => x.type === 'camp');
  const m = Game.aliveCampMobs(h, c)[0];
  Game.act(h, { type: 'move', x: m.x, y: m.y }, seeded(1));
  h.run.fight.mob.hp = 5;
  const evFail = Game.act(h, { type: 'flee' }, always(0.9));
  assert.ok(evFail.some((e) => e.type === 'flee' && !e.ok));
  assert.strictEqual(h.run.phase, 'fight');
  const evOk = Game.act(h, { type: 'flee' }, always(0.1));
  assert.ok(evOk.some((e) => e.type === 'flee' && e.ok));
  assert.strictEqual(Game.aliveCampMobs(h, c).find((x) => x.idx === m.idx).mob.hp, 5);
});

test('разведка обезвреживает мину без урона; родник лечит один раз за поход', () => {
  const h = strongHero('human', 'fighter');
  h.sp = 1e6;
  assert.ok(Game.learnSkill(h, 'danger_sense').ok);
  Game.fullHeal(h);
  Game.startOuting(h);
  Game.act(h, { type: 'open', x: 4, y: 0 }, seeded(1));
  const w = h.world;
  let mine = null;
  for (const k of w.open) {
    const [x, y] = k.split(',').map(Number);
    mine = World.neighbors(x, y).find(([a, b]) => World.isMine(w, a, b) && World.canOpen(w, a, b));
    if (mine) break;
  }
  const hp = h.hp;
  const ev = Game.act(h, { type: 'skill', id: 'danger_sense', x: mine[0], y: mine[1] }, seeded(2));
  assert.ok(ev.some((e) => e.type === 'defuse'));
  assert.strictEqual(h.hp, hp);
  assert.ok(w.defused.has(World.key(mine[0], mine[1])));

  const sp = exploreUntil(h, (x) => x.type === 'spring');
  assert.ok(sp, 'нашли родник');
  h.hp = 10;
  Game.act(h, { type: 'move', x: sp.cx, y: sp.cy }, seeded(1));
  assert.ok(h.hp > 10);
  h.hp = 10;
  const again = Game.act(h, { type: 'move', x: sp.cx, y: sp.cy }, seeded(1));
  assert.ok(again.some((e) => e.type === 'msg'));
  assert.strictEqual(h.hp, 10);
});

test('чем дальше от города, тем сильнее мобы и гуще мины; боссы далеко', () => {
  assert.ok(Game.mobLevel(100, 1, always(0)) > Game.mobLevel(10, 1, always(0)));
  assert.ok(World.density(100) > World.density(0));
  const w = World.newWorld(31);
  for (let rx = -10; rx <= 10; rx++) for (let ry = -10; ry <= 10; ry++) {
    const c = World.clearingOfRegion(w, rx, ry);
    if (!c || c.type !== 'boss') continue;
    const mobs = Game.campMobs(w, c);
    assert.ok(mobs[0].type === D.ZONES[c.ring].boss.type);
  }
});

test('смерть: опыт остаётся, половина мешка теряется, остальное — в инвентарь', () => {
  const h = Game.newHero('a', 'human', 'mystic');
  h.xp = 30;
  Game.startOuting(h);
  Game.act(h, { type: 'open', x: 4, y: 0 }, seeded(1));
  h.run.bag = { adena: 101, trophies: { wolf_pelt: 3 }, gear: ['sword_D', 'armor_D', 'jewel_D', 'staff_D'] };
  const w = h.world;
  let mine = null;
  for (const k of w.open) {
    const [x, y] = k.split(',').map(Number);
    mine = World.neighbors(x, y).find(([a, b]) => World.isMine(w, a, b) && World.canOpen(w, a, b));
    if (mine) break;
  }
  const adena = h.adena, xp = h.xp, lvl = h.level;
  h.hp = 1;
  const ev = Game.act(h, { type: 'open', x: mine[0], y: mine[1] }, seeded(2));
  const d = ev.find((e) => e.type === 'death');
  assert.ok(d);
  assert.strictEqual(h.run, null);
  assert.strictEqual(h.xp + h.level * 1e6, xp + lvl * 1e6);
  assert.strictEqual(d.lost.adena, 50);
  assert.strictEqual(h.adena, adena + 51);
  assert.strictEqual(h.inv.trophies.wolf_pelt, 2);
  assert.strictEqual(h.inv.gear.length, 2);
});

test('квесты «Вглубь» и «Сапёр» считают дальность и клетки подряд', () => {
  const h = strongHero();
  h.level = 5;
  assert.ok(Game.acceptQuest(h, 'island_far1').ok);
  assert.ok(Game.acceptQuest(h, 'island_clean').ok);
  Game.startOuting(h);
  exploreUntil(h, () => false, 60);
  const far = h.quests.active.find((a) => a.id === 'island_far1');
  const clean = h.quests.active.find((a) => a.id === 'island_clean');
  assert.strictEqual(far.progress, h.run.maxDist);
  assert.ok(clean.progress >= 40);
});

test('магазин и снаряжение', () => {
  const h = Game.newHero('a', 'dwarf', 'artisan');
  h.adena = 1000;
  const r = Game.buy(h, 'hp_potion', 5);
  assert.ok(r.ok);
  assert.ok(r.cost < 200); // скидка ремесленника
  assert.ok(!Game.buy(h, 'sword_S').ok);
  h.inv.gear.push('sword_D');
  assert.ok(!Game.equip(h, 0).ok);
  h.level = 10;
  const atk = Game.stats(h).atk;
  assert.ok(Game.equip(h, 0).ok);
  assert.ok(Game.stats(h).atk > atk);
});

test('испорченное или подменённое сохранение приводится к допустимым значениям', () => {
  assert.strictEqual(Game.sanitize('{не json'), null);
  assert.strictEqual(Game.sanitize({ race: 'dragon', cls: 'god' }), null);
  const h = Game.sanitize({
    name: '<script>alert(1)</script>Очень длинное имя героя', race: 'orc', cls: 'fighter',
    level: 9999, xp: -5, adena: 'много', tier: 2, hp: 1e9,
    skills: { berserk: 1, fireball: 1, hack: 1 },
    equip: { weapon: 'sword_S', armor: 'nope' },
    inv: { gear: ['armor_A', 'fake'], potions: { hp_potion: 1e9 } },
    quests: { active: [{ id: 'island_kill', progress: 999 }, { id: 'bad' }], done: ['island_boss', 'island_boss'] },
    records: { maxDist: 999 },
  });
  assert.ok(h);
  assert.ok(!h.name.includes('<') && h.name.length <= 16);
  assert.strictEqual(h.level, D.MAX_LEVEL);
  assert.strictEqual(h.xp, 0);
  assert.strictEqual(h.adena, 0);
  assert.ok(h.skills.berserk && !h.skills.fireball && !h.skills.hack);
  assert.strictEqual(h.equip.armor, null);
  assert.deepStrictEqual(h.inv.gear, ['armor_A']);
  assert.strictEqual(h.inv.potions.hp_potion, 999);
  assert.strictEqual(h.quests.active[0].progress, 8);
  assert.deepStrictEqual(h.quests.done, ['island_boss']);
  assert.deepStrictEqual(h.records, { maxDist: World.maxOpenDist(h.world) });
  assert.strictEqual(h.run, null);
});

test('поход сохраняется и восстанавливается; подмена мира и мобов исправляется', () => {
  const h = strongHero();
  Game.startOuting(h);
  const c = exploreUntil(h, (x) => x.type === 'camp');
  h.run.bag.adena = 40;
  const back = Game.sanitize(Game.serialize(h));
  assert.ok(back.run && back.run.phase === 'explore');
  assert.strictEqual(back.world.open.size, h.world.open.size);
  assert.strictEqual(back.world.seed, h.world.seed);

  // «открыли» мину без взрыва — клетка закрывается
  const raw = JSON.parse(Game.serialize(h));
  let mine = null;
  for (let x = 20; !mine; x++) if (World.isMine(h.world, x, 40)) mine = World.key(x, 40);
  const fake = World.newWorld(h.world.seed);
  fake.open = new Set([...h.world.open, mine]);
  raw.world.open = World.serialize(fake).open;
  assert.ok(!Game.sanitize(raw).world.open.has(mine));

  // бой с мобом, у которого подделано здоровье, — здоровье обрезается
  const m = Game.aliveCampMobs(h, c)[0];
  Game.act(h, { type: 'move', x: m.x, y: m.y }, seeded(1));
  const r2 = JSON.parse(Game.serialize(h));
  r2.run.fight.mob.hp = 1e9;
  r2.run.fight.mob.level = 999;
  const g = Game.sanitize(r2);
  assert.strictEqual(g.run.phase, 'fight');
  assert.ok(g.run.fight.mob.hp <= g.run.fight.mob.maxHp);
  assert.strictEqual(g.run.fight.mob.level, m.mob.level);

  // поход старого типа (минное поле) отменяется, мешок уходит в инвентарь
  const old = JSON.parse(Game.serialize(h));
  old.run = { phase: 'mines', depth: 3, bag: { adena: 70 } };
  const o = Game.sanitize(old);
  assert.strictEqual(o.run, null);
  assert.strictEqual(o.adena, h.adena + 70);
});
