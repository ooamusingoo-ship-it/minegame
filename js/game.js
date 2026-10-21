// Игровая логика: герой, характеристики, бой, опыт, квесты, магазин, поле боя, сохранение.
// Здесь нет ничего про отрисовку — только правила, поэтому всё проверяется тестами в node.
(function (root) {
  'use strict';

  const D = root.DATA || (typeof require !== 'undefined' ? require('./data.js') : null);
  const World = root.World || (typeof require !== 'undefined' ? require('./world.js') : null);

  const SAVE_VERSION = 1;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const toInt = (v, a, b) => clamp(Math.floor(Number(v) || 0), a, b);

  // ---------- Герой ----------

  function archOf(hero) {
    return D.CLASSES[hero.race][hero.cls].arch;
  }

  function className(hero) {
    return D.CLASSES[hero.race][hero.cls].names[hero.tier];
  }

  function startSkill(arch) {
    return Object.keys(D.SKILLS).find((id) => D.SKILLS[id].arch === arch && D.SKILLS[id].lvl === 1);
  }

  function newHero(name, race, cls) {
    if (!D.RACES[race] || !D.CLASSES[race][cls]) throw new Error('Неизвестная раса или класс');
    const arch = D.CLASSES[race][cls].arch;
    const hero = {
      v: SAVE_VERSION,
      name: cleanName(name),
      race, cls, tier: 0, level: 1, xp: 0, sp: 0, adena: 200, hp: 1, mp: 1,
      skills: { [startSkill(arch)]: 1 },
      equip: { weapon: arch === 'mystic' ? 'staff_NG' : 'sword_NG', armor: 'armor_NG', jewel: null },
      inv: { gear: [], potions: { hp_potion: 3, mp_potion: 2 }, trophies: {} },
      quests: { active: [], done: [] },
      stats: { kills: 0, cells: 0, camps: 0, deaths: 0, bosses: 0, outings: 0 },
      records: { maxDist: 0 },
      world: World.newWorld(Math.floor(Math.random() * 4294967295)),
      run: null,
    };
    fullHeal(hero);
    return hero;
  }

  function cleanName(name) {
    const s = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
    return s || 'Безымянный';
  }

  function fullHeal(hero) {
    const s = stats(hero);
    hero.hp = s.hp;
    hero.mp = s.mp;
  }

  function addMods(into, mods) {
    if (!mods) return;
    Object.keys(mods).forEach((k) => { into[k] = (into[k] || 0) + mods[k]; });
  }

  // Итоговые характеристики: база архетипа + уровень + профессия + снаряжение + бонусы расы и пассивок.
  function stats(hero) {
    const A = D.ARCHETYPES[archOf(hero)];
    const n = hero.level - 1;
    const base = {};
    ['hp', 'mp', 'atk', 'def', 'matk'].forEach((k) => { base[k] = A[k][0] + A[k][1] * n; });

    const gear = { hp: 0, mp: 0, atk: 0, def: 0, matk: 0, crit: 0 };
    Object.values(hero.equip).forEach((id) => { if (id && D.GEAR[id]) addMods(gear, D.GEAR[id].stats); });

    const mods = {};
    addMods(mods, D.RACES[hero.race].mods);
    Object.keys(hero.skills).forEach((id) => {
      const sk = D.SKILLS[id];
      if (sk && sk.kind === 'passive') addMods(mods, sk.mods);
    });

    const tb = 1 + D.TIER_BONUS[hero.tier];
    const fin = (k) => Math.round((base[k] + gear[k]) * (1 + (mods[k] || 0)) * tb);
    return {
      hp: fin('hp'), mp: fin('mp'), atk: fin('atk'), def: fin('def'), matk: fin('matk'),
      crit: 0.05 + (mods.crit || 0) + gear.crit,
      critMult: 2 + (mods.critMult || 0),
      evade: mods.evade || 0,
      xpMult: 1 + (mods.xp || 0),
      adenaMult: 1 + (mods.adena || 0),
      dropMult: 1 + (mods.drop || 0),
    };
  }

  function xpToNext(level) {
    return Math.round(12 * Math.pow(level, 2.6) + 20);
  }

  // Начислить опыт. При повышении уровня — полное восстановление.
  function addXp(hero, amount) {
    let gained = 0;
    hero.xp += Math.max(0, Math.round(amount));
    while (hero.level < D.MAX_LEVEL && hero.xp >= xpToNext(hero.level)) {
      hero.xp -= xpToNext(hero.level);
      hero.level++;
      gained++;
    }
    if (hero.level >= D.MAX_LEVEL) hero.xp = Math.min(hero.xp, xpToNext(hero.level) - 1);
    if (gained) fullHeal(hero);
    return gained;
  }

  // ---------- Мобы и награды ----------

  function mobStats(mob) {
    const L = mob.level;
    const b = mob.boss;
    return {
      hp: Math.round((16 + 8 * L) * (b ? 4 : 1)),
      atk: (5 + 2.6 * L) * (b ? 1.25 : 1),
      def: (2 + 1.5 * L) * (b ? 1.2 : 1),
    };
  }

  function mobXp(mob) {
    const L = mob.level;
    return Math.round((6 + 4 * L + 0.6 * L * L) * (mob.boss ? 6 : 1));
  }

  function pickWeighted(items, weightOf, rng) {
    const total = items.reduce((s, it) => s + weightOf(it), 0);
    let r = rng() * total;
    for (const it of items) {
      r -= weightOf(it);
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }

  function makeMob(type, level, zoneIdx) {
    const boss = !!D.MOBS[type].boss;
    const m = { type, level: clamp(Math.round(level), 1, 99), boss, zone: zoneIdx };
    m.maxHp = mobStats(m).hp;
    m.hp = m.maxHp;
    return m;
  }

  // Уровень моба: растёт с расстоянием от города + сила вида моба.
  function mobLevel(d, power, rng) {
    return World.levelAt(d) + Math.floor((power - 1) * 1.5 + rng() * 2);
  }

  function bossLevel(d) {
    return World.levelAt(d) + 4;
  }

  function hitDamage(atk, def, rng) {
    return Math.max(1, (atk * atk) / (atk + def) * (0.85 + 0.3 * rng()));
  }

  // Награда за моба: опыт и SP — сразу, адена/трофей/снаряжение — в мешок похода.
  function killReward(hero, mob, rng) {
    rng = rng || Math.random;
    const s = stats(hero);
    const xp = Math.round(mobXp(mob) * s.xpMult);
    const adena = Math.round((3 + mob.level * 2.5) * (mob.boss ? 10 : 1) * (0.7 + 0.6 * rng()) * s.adenaMult);
    const r = { xp, sp: Math.round(xp * 0.5), adena, trophy: null, gear: null };
    const trophy = D.MOBS[mob.type].trophy;
    if (trophy && rng() < 0.45 * s.dropMult) r.trophy = trophy;
    if (mob.boss && rng() < 0.6 * s.dropMult) r.gear = randomGear(Math.min(5, mob.zone + 1), rng);
    return r;
  }

  function randomGear(grade, rng) {
    const lines = ['sword', 'staff', 'armor', 'jewel'];
    return lines[Math.floor(rng() * lines.length)] + '_' + D.GRADES[grade].id;
  }

  // Применить награду прямо к герою (квесты, сундуки); возвращает число новых уровней.
  function applyReward(hero, r) {
    hero.adena += r.adena || 0;
    hero.sp += r.sp || 0;
    if (r.trophy) hero.inv.trophies[r.trophy] = (hero.inv.trophies[r.trophy] || 0) + 1;
    if (r.gear) hero.inv.gear.push(r.gear);
    return addXp(hero, r.xp || 0);
  }

  // ---------- Квесты ----------

  function questById(id) {
    return D.QUESTS.find((q) => q.id === id);
  }

  function availableQuests(hero) {
    const busy = new Set(hero.quests.active.map((a) => a.id).concat(hero.quests.done));
    return D.QUESTS.filter((q) => {
      if (busy.has(q.id)) return false;
      if (q.type === 'profession') return hero.tier === q.tier - 1 && hero.level >= q.lvl;
      return hero.level >= q.lvl - 3;
    });
  }

  function acceptQuest(hero, id) {
    const q = questById(id);
    if (!q || !availableQuests(hero).includes(q)) return { ok: false, msg: 'Квест недоступен.' };
    if (hero.quests.active.length >= D.MAX_ACTIVE_QUESTS) return { ok: false, msg: 'Не больше ' + D.MAX_ACTIVE_QUESTS + ' квестов одновременно.' };
    hero.quests.active.push({ id, progress: 0 });
    return { ok: true };
  }

  function abandonQuest(hero, id) {
    hero.quests.active = hero.quests.active.filter((a) => a.id !== id);
  }

  function questProgress(hero, a) {
    const q = questById(a.id);
    if (q.type === 'collect') return Math.min(q.count, hero.inv.trophies[q.target] || 0);
    return Math.min(q.count, a.progress);
  }

  function questOnKill(hero, mob) {
    hero.quests.active.forEach((a) => {
      const q = questById(a.id);
      if ((q.type === 'kill' || q.type === 'boss' || q.type === 'profession') && q.target === mob.type) a.progress++;
    });
  }

  function turnInQuest(hero, id, rng) {
    rng = rng || Math.random;
    const a = hero.quests.active.find((x) => x.id === id);
    if (!a) return { ok: false, msg: 'Квест не взят.' };
    const q = questById(id);
    if (questProgress(hero, a) < q.count) return { ok: false, msg: 'Квест ещё не выполнен.' };
    if (q.type === 'collect') hero.inv.trophies[q.target] -= q.count;
    hero.quests.active = hero.quests.active.filter((x) => x !== a);
    hero.quests.done.push(id);
    const rw = q.reward;
    const r = { xp: rw.xp, adena: rw.adena, sp: Math.round(rw.xp * 0.3) };
    if (rw.gear) r.gear = randomGear(Math.min(5, rw.gear), rng);
    Object.keys(rw.items || {}).forEach((k) => { hero.inv.potions[k] = (hero.inv.potions[k] || 0) + rw.items[k]; });
    if (rw.tier) {
      hero.tier = rw.tier;
    }
    const levels = applyReward(hero, r);
    if (rw.tier) fullHeal(hero);
    return { ok: true, reward: r, levels, items: rw.items || {}, tier: rw.tier || 0 };
  }

  // ---------- Скилы ----------

  function skillList(hero) {
    const arch = archOf(hero);
    return Object.keys(D.SKILLS).filter((id) => D.SKILLS[id].arch === arch);
  }

  function canLearn(hero, id) {
    const sk = D.SKILLS[id];
    if (!sk || sk.arch !== archOf(hero)) return 'Чужой скил.';
    if (hero.skills[id]) return 'Уже изучен.';
    if (hero.level < sk.lvl) return 'Нужен ' + sk.lvl + ' уровень.';
    if (hero.tier < sk.tier) return 'Нужна ' + (sk.tier === 1 ? 'первая' : 'вторая') + ' профессия.';
    if (hero.sp < sk.sp) return 'Не хватает SP.';
    return '';
  }

  function learnSkill(hero, id) {
    const why = canLearn(hero, id);
    if (why) return { ok: false, msg: why };
    hero.sp -= D.SKILLS[id].sp;
    hero.skills[id] = 1;
    return { ok: true };
  }

  // ---------- Магазин и снаряжение ----------

  function priceFor(hero, base) {
    return Math.max(1, Math.round(base * (archOf(hero) === 'artisan' ? 0.8 : 1)));
  }

  function sellPrice(base) {
    return Math.floor(base * 0.4);
  }

  function buy(hero, id, qty) {
    qty = toInt(qty || 1, 1, 99);
    const item = D.POTIONS[id] || D.GEAR[id];
    if (!item) return { ok: false, msg: 'Нет такого товара.' };
    const cost = priceFor(hero, item.price) * qty;
    if (hero.adena < cost) return { ok: false, msg: 'Не хватает адены.' };
    hero.adena -= cost;
    if (D.POTIONS[id]) hero.inv.potions[id] = (hero.inv.potions[id] || 0) + qty;
    else for (let i = 0; i < qty; i++) hero.inv.gear.push(id);
    return { ok: true, cost };
  }

  function sellGear(hero, index) {
    const id = hero.inv.gear[index];
    if (!id || !D.GEAR[id]) return { ok: false, msg: 'Нет такого предмета.' };
    hero.inv.gear.splice(index, 1);
    const got = sellPrice(D.GEAR[id].price);
    hero.adena += got;
    return { ok: true, got };
  }

  function sellTrophies(hero) {
    let got = 0;
    const reserved = {};
    hero.quests.active.forEach((a) => {
      const q = questById(a.id);
      if (q.type === 'collect') reserved[q.target] = (reserved[q.target] || 0) + q.count;
    });
    Object.keys(hero.inv.trophies).forEach((t) => {
      const keep = Math.min(hero.inv.trophies[t], reserved[t] || 0);
      const n = hero.inv.trophies[t] - keep;
      got += n * D.TROPHIES[t].price;
      hero.inv.trophies[t] = keep;
    });
    hero.adena += got;
    return got;
  }

  function equip(hero, index) {
    const id = hero.inv.gear[index];
    const g = id && D.GEAR[id];
    if (!g) return { ok: false, msg: 'Нет такого предмета.' };
    if (hero.level < g.lvl) return { ok: false, msg: 'Нужен ' + g.lvl + ' уровень.' };
    const before = stats(hero);
    hero.inv.gear.splice(index, 1);
    if (hero.equip[g.slot]) hero.inv.gear.push(hero.equip[g.slot]);
    hero.equip[g.slot] = id;
    keepRatio(hero, before);
    return { ok: true };
  }

  function unequip(hero, slot) {
    const id = hero.equip[slot];
    if (!id) return { ok: false };
    const before = stats(hero);
    hero.equip[slot] = null;
    hero.inv.gear.push(id);
    keepRatio(hero, before);
    return { ok: true };
  }

  // При смене снаряжения текущее здоровье/мана сохраняют ту же долю от максимума.
  function keepRatio(hero, before) {
    const s = stats(hero);
    hero.hp = Math.max(1, Math.round(hero.hp / before.hp * s.hp));
    hero.mp = Math.round(hero.mp / Math.max(1, before.mp) * s.mp);
  }

  // ---------- Поход в лес ----------

  function emptyBag() {
    return { adena: 0, trophies: {}, gear: [] };
  }

  // Мобы лагеря определяются зерном мира — одинаковые при каждом возрождении.
  function campMobs(world, c) {
    if (!c || c.type === 'spring') return [];
    if (!world._camps) world._camps = new Map();
    if (world._camps.has(c.id)) return world._camps.get(c.id);
    const r = (i, salt) => World.rnd(world.seed, c.rx * 31 + i, c.ry * 17 + salt, 50 + salt);
    const z = D.ZONES[c.ring];
    const inner = [];
    for (let y = c.y0 + 1; y < c.y0 + c.size - 1; y++) for (let x = c.x0 + 1; x < c.x0 + c.size - 1; x++) inner.push([x, y]);
    // центр поляны свободен: там встаёт камень телепорта и начинается поход с него,
    // поэтому монстр в центре прятался бы под камнем и не возрождался бы для игрока
    const order = inner.map((p, i) => ({ p, k: r(i, 9) })).sort((a, b) => a.k - b.k).map((o) => o.p)
      .filter(([x, y]) => x !== c.cx || y !== c.cy);
    const list = [];
    if (c.type === 'boss') {
      const [bx, by] = order.shift();
      list.push({ idx: 0, x: bx, y: by, type: z.boss.type, level: bossLevel(c.d) });
    }
    const count = Math.min(order.length, c.type === 'boss' ? 2 : 2 + Math.floor(r(0, 1) * 4));
    for (let i = 0; i < count; i++) {
      const p = pickWeighted(z.pool, (e) => D.POWER_WEIGHTS[e.power] || 5, () => r(i, 2));
      list.push({ idx: list.length, x: order[i][0], y: order[i][1], type: p.type, level: mobLevel(c.d, p.power, () => r(i, 3)) });
    }
    world._camps.set(c.id, list);
    return list;
  }

  // Живые мобы лагеря в текущем походе (с учётом убитых и раненых).
  function aliveCampMobs(hero, c) {
    const st = hero.run && hero.run.camps[c.id];
    return campMobs(hero.world, c).filter((m) => !(st && st.dead.includes(m.idx))).map((m) => {
      const mob = makeMob(m.type, m.level, c.ring);
      if (st && st.hp[m.idx]) mob.hp = Math.min(mob.maxHp, st.hp[m.idx]);
      return { idx: m.idx, x: m.x, y: m.y, mob };
    });
  }

  function mobAt(hero, x, y) {
    const c = World.clearingAt(hero.world, x, y);
    if (!c || !World.isOpen(hero.world, x, y)) return null;
    const m = aliveCampMobs(hero, c).find((e) => e.x === x && e.y === y);
    return m ? Object.assign({ cid: c.id }, m) : null;
  }

  // Откуда можно начать поход: ворота города и камни телепорта (зачищенные лагеря).
  function startPoints(hero) {
    const pts = [{ id: 'town', name: 'Ворота города', x: 0, y: D.WORLD.townRadius, d: 0, ring: 0 }];
    hero.world.waypoints.forEach((id) => {
      const c = World.clearingById(hero.world, id);
      if (c) pts.push({ id, name: 'Камень телепорта', x: c.cx, y: c.cy, d: c.d, ring: c.ring, boss: c.type === 'boss' });
    });
    return pts;
  }

  function startOuting(hero, from) {
    if (hero.run) return null;
    const p = startPoints(hero).find((s) => s.id === (from || 'town'));
    if (!p) return null;
    hero.run = {
      phase: 'explore', start: p.id, pos: { x: p.x, y: p.y }, bag: emptyBag(),
      earned: { xp: 0, sp: 0, kills: 0, cells: 0 }, streak: 0, maxDist: p.d, camps: {}, springs: [], fight: null,
    };
    hero.stats.outings++;
    return hero.run;
  }

  function bagAdd(run, r) {
    run.bag.adena += r.adena || 0;
    if (r.trophy) run.bag.trophies[r.trophy] = (run.bag.trophies[r.trophy] || 0) + 1;
    if (r.gear) run.bag.gear.push(r.gear);
  }

  function bagToInventory(hero, bag) {
    hero.adena += bag.adena;
    Object.keys(bag.trophies).forEach((t) => { hero.inv.trophies[t] = (hero.inv.trophies[t] || 0) + bag.trophies[t]; });
    bag.gear.forEach((g) => hero.inv.gear.push(g));
  }

  function bagSummary(run, bag) {
    return {
      maxDist: run.maxDist, adena: bag.adena,
      trophies: Object.assign({}, bag.trophies), gear: bag.gear.slice(),
      xp: run.earned.xp, sp: run.earned.sp, kills: run.earned.kills, cells: run.earned.cells,
    };
  }

  // Вернуться в город: всё из мешка — в инвентарь. Мобы возродятся к следующему походу.
  function teleport(hero) {
    const run = hero.run;
    if (!run) return null;
    const kept = bagSummary(run, run.bag);
    bagToInventory(hero, run.bag);
    hero.run = null;
    return { kept };
  }

  // Смерть: половина адены и трофеев мешка и случайная половина снаряжения теряются. Опыт остаётся.
  function die(hero, ev, rng) {
    const run = hero.run;
    const bag = run.bag;
    const lost = { adena: Math.floor(bag.adena / 2), trophies: {}, gear: [] };
    bag.adena -= lost.adena;
    Object.keys(bag.trophies).forEach((t) => {
      const n = Math.floor(bag.trophies[t] / 2);
      if (n) { lost.trophies[t] = n; bag.trophies[t] -= n; }
    });
    const g = bag.gear.slice();
    for (let i = g.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [g[i], g[j]] = [g[j], g[i]];
    }
    lost.gear = g.slice(0, Math.floor(g.length / 2));
    bag.gear = g.slice(lost.gear.length);
    const kept = bagSummary(run, bag);
    bagToInventory(hero, bag);
    hero.stats.deaths++;
    hero.hp = 0;
    hero.run = null;
    ev.push({ type: 'death', lost, kept });
  }

  // ----- Лес -----

  function explode(hero, x, y, ev, rng) {
    const w = hero.world;
    const k = World.key(x, y);
    w.flags.delete(k);
    w.blown.add(k);
    w.open.add(k);
    hero.run.streak = 0;
    const dmg = Math.max(1, Math.round(stats(hero).hp * World.minePct(World.dist(x, y))));
    hero.hp = Math.max(0, hero.hp - dmg);
    ev.push({ type: 'explode', x, y, dmg });
    if (hero.hp <= 0) die(hero, ev, rng);
  }

  // Награды за новые открытые клетки: немного опыта, сундучки, найденные поляны, прогресс квестов.
  function onRevealed(hero, res, ev, rng) {
    const run = hero.run, w = hero.world;
    if (!res.opened.length) return;
    const s = stats(hero);
    let xp = 0;
    res.opened.forEach(([x, y]) => {
      const d = World.dist(x, y);
      xp += mobXp({ level: World.levelAt(d) }) / D.WORLD.cellXpDiv;
      run.maxDist = Math.max(run.maxDist, d);
      const k = World.key(x, y);
      if (World.hasTreasure(w, x, y) && !w.looted.has(k)) {
        w.looted.add(k);
        const L = World.levelAt(d);
        const adena = Math.round((3 + L * 2.5) * 6 * (0.7 + 0.6 * rng()) * s.adenaMult);
        run.bag.adena += adena;
        const potion = rng() < 0.3 ? (rng() < 0.6 ? 'hp_potion' : 'mp_potion') : null;
        if (potion) hero.inv.potions[potion] = (hero.inv.potions[potion] || 0) + 1;
        ev.push({ type: 'treasure', x, y, adena, potion });
      }
    });
    xp = Math.round(xp * s.xpMult);
    run.earned.cells += res.opened.length;
    hero.stats.cells += res.opened.length;
    run.streak += res.opened.length;
    run.earned.xp += xp;
    run.earned.sp += Math.round(xp * 0.5);
    hero.sp += Math.round(xp * 0.5);
    hero.records.maxDist = Math.max(hero.records.maxDist, run.maxDist);
    ev.push({ type: 'reveal', cells: res.opened, xp });
    res.clearings.forEach((c) => ev.push({ type: 'clearing', id: c.id, kind: c.type, x: c.cx, y: c.cy, ring: c.ring }));
    // квесты: «Сапёр» (клетки подряд без подрыва в кольце) и «Вглубь» (дальность)
    const [lx, ly] = res.opened[res.opened.length - 1];
    const ring = D.ZONES[World.ringIndex(World.dist(lx, ly))].id;
    hero.quests.active.forEach((a) => {
      const q = questById(a.id);
      if (q.type === 'clean' && q.zone === ring) a.progress = Math.max(a.progress, run.streak);
      if (q.type === 'distance') a.progress = Math.max(a.progress, run.maxDist);
    });
    const levels = addXp(hero, xp);
    if (levels) ev.push({ type: 'levelup', level: hero.level });
  }

  function openCell(hero, x, y, ev, rng) {
    const w = hero.world;
    if (World.isOpen(w, x, y)) return;
    if (!World.canOpen(w, x, y)) {
      if (!w.flags.has(World.key(x, y))) ev.push({ type: 'msg', text: 'Слишком далеко: открывайте клетки рядом с уже открытыми.' });
      return;
    }
    hero.run.pos = { x, y };
    if (World.isMine(w, x, y)) explode(hero, x, y, ev, rng);
    else onRevealed(hero, World.reveal(w, x, y), ev, rng);
  }

  function chord(hero, x, y, ev, rng) {
    for (const [a, b] of World.chordTargets(hero.world, x, y)) {
      if (!hero.run) return;
      if (World.isOpen(hero.world, a, b)) continue;
      hero.run.pos = { x: a, y: b };
      if (World.isMine(hero.world, a, b)) explode(hero, a, b, ev, rng);
      else onRevealed(hero, World.reveal(hero.world, a, b), ev, rng);
    }
  }

  // ----- Лагеря и бой -----

  function campState(run, cid) {
    if (!run.camps[cid]) run.camps[cid] = { dead: [], hp: {} };
    return run.camps[cid];
  }

  function killMob(hero, run, ev, rng) {
    const f = run.fight;
    const mob = f.mob;
    mob.hp = 0;
    const st = campState(run, f.cid);
    st.dead.push(f.idx);
    delete st.hp[f.idx];
    run.fight = null;
    run.phase = 'explore';
    run.earned.kills++;
    hero.stats.kills++;
    if (mob.boss) hero.stats.bosses++;
    questOnKill(hero, mob);
    const r = killReward(hero, mob, rng);
    bagAdd(run, r);
    hero.sp += r.sp;
    run.earned.sp += r.sp;
    run.earned.xp += r.xp;
    const levels = addXp(hero, r.xp);
    ev.push({ type: 'kill', x: f.x, y: f.y, mob: mob.type, boss: mob.boss, reward: r });
    if (levels) ev.push({ type: 'levelup', level: hero.level });
    const c = World.clearingById(hero.world, f.cid);
    if (!aliveCampMobs(hero, c).length) {
      hero.stats.camps++;
      const isNew = !hero.world.waypoints.includes(c.id);
      if (isNew) hero.world.waypoints.push(c.id);
      ev.push({ type: 'campclear', id: c.id, x: c.cx, y: c.cy, waypoint: isNew });
    }
  }

  function buffMods(buffs) {
    return (buffs || []).reduce((m, b) => ({
      atk: m.atk * (b.buff.atk || 1), taken: m.taken * (b.buff.taken || 1),
    }), { atk: 1, taken: 1 });
  }

  function heroAttack(hero, mob, kind, mult, buffs, rng) {
    const s = stats(hero);
    const ms = mobStats(mob);
    const bm = buffMods(buffs);
    const magic = kind === 'magic' || (kind === 'attack' && archOf(hero) === 'mystic');
    let d = magic
      ? hitDamage(s.matk * (mult || 1) * bm.atk, ms.def * 0.5, rng)
      : hitDamage(s.atk * (mult || 1) * bm.atk, ms.def, rng);
    let crit = false;
    if (rng() < s.crit) { d *= s.critMult; crit = true; }
    return { dmg: Math.round(d), crit, magic };
  }

  function mobTurn(hero, run, ev, rng) {
    const s = stats(hero);
    if (rng() < s.evade) { ev.push({ type: 'evade' }); return; }
    const bm = buffMods(run.fight.buffs);
    const dmg = Math.round(hitDamage(mobStats(run.fight.mob).atk, s.def, rng) * bm.taken);
    hero.hp = Math.max(0, hero.hp - dmg);
    ev.push({ type: 'hit', who: 'mob', dmg });
    if (hero.hp <= 0) die(hero, ev, rng);
  }

  // Один ход боя. action: attack | skill(id) | potion(id) | flee.
  function fightTurn(hero, run, action, ev, rng) {
    const f = run.fight;
    const mob = f.mob;
    let used = false;
    if (action.type === 'attack') {
      const h = heroAttack(hero, mob, 'attack', 1, f.buffs, rng);
      mob.hp = Math.max(0, mob.hp - h.dmg);
      ev.push(Object.assign({ type: 'hit', who: 'hero' }, h));
      used = true;
    } else if (action.type === 'skill') {
      const sk = D.SKILLS[action.id];
      if (!sk || !hero.skills[action.id] || (sk.use !== 'combat' && sk.use !== 'any')) { ev.push({ type: 'msg', text: 'Этот скил не для боя.' }); return; }
      if (hero.mp < sk.mp) { ev.push({ type: 'msg', text: 'Не хватает маны.' }); return; }
      if (sk.kind === 'heal' && hero.hp >= stats(hero).hp) { ev.push({ type: 'msg', text: 'Здоровье и так полное.' }); return; }
      hero.mp -= sk.mp;
      ev.push({ type: 'skill', id: action.id });
      if (sk.kind === 'strike' || sk.kind === 'magic') {
        const h = heroAttack(hero, mob, sk.kind, sk.mult, f.buffs, rng);
        mob.hp = Math.max(0, mob.hp - h.dmg);
        ev.push(Object.assign({ type: 'hit', who: 'hero', skill: action.id }, h));
      } else if (sk.kind === 'heal') {
        healHero(hero, sk.pct, ev);
      } else if (sk.kind === 'buff') {
        f.buffs = f.buffs.filter((b) => b.id !== action.id);
        // +1, потому что в конце этого хода счётчик уменьшится
        f.buffs.push({ id: action.id, buff: sk.buff, turns: sk.turns + 1 });
        ev.push({ type: 'buff', id: action.id });
      }
      used = true;
    } else if (action.type === 'potion') {
      used = usePotion(hero, action.id, ev);
      if (!used) return;
    } else if (action.type === 'flee') {
      if (rng() < 0.6) {
        campState(run, f.cid).hp[f.idx] = mob.hp;
        run.fight = null;
        run.phase = 'explore';
        ev.push({ type: 'flee', ok: true });
        return;
      }
      ev.push({ type: 'flee', ok: false });
      used = true;
    }
    if (!used) return;
    if (mob.hp <= 0) { killMob(hero, run, ev, rng); return; }
    mobTurn(hero, run, ev, rng);
    if (hero.run && run.fight) {
      f.turn++;
      f.buffs.forEach((b) => { b.turns--; });
      f.buffs = f.buffs.filter((b) => b.turns > 0);
    }
  }

  function healHero(hero, pct, ev) {
    const max = stats(hero).hp;
    const amount = Math.min(max - hero.hp, Math.round(max * pct));
    hero.hp += amount;
    ev.push({ type: 'heal', what: 'hp', amount });
  }

  function usePotion(hero, id, ev) {
    const p = D.POTIONS[id];
    if (!p || !(hero.inv.potions[id] > 0)) { ev.push({ type: 'msg', text: 'Нет зелий.' }); return false; }
    const max = stats(hero)[p.heal];
    if (hero[p.heal] >= max) { ev.push({ type: 'msg', text: 'И так полно.' }); return false; }
    hero.inv.potions[id]--;
    const amount = Math.min(max - hero[p.heal], Math.round(max * p.pct));
    hero[p.heal] += amount;
    ev.push({ type: 'heal', what: p.heal, amount });
    return true;
  }

  // Скил вне боя: разведка клетки леса или лечение.
  function fieldSkill(hero, id, x, y, ev, rng) {
    const sk = D.SKILLS[id];
    const w = hero.world;
    if (!sk || !hero.skills[id]) { ev.push({ type: 'msg', text: 'Скил не изучен.' }); return; }
    if (sk.kind === 'heal') {
      if (hero.hp >= stats(hero).hp) { ev.push({ type: 'msg', text: 'Здоровье и так полное.' }); return; }
      if (hero.mp < sk.mp) { ev.push({ type: 'msg', text: 'Не хватает маны.' }); return; }
      hero.mp -= sk.mp;
      ev.push({ type: 'skill', id });
      healHero(hero, sk.pct, ev);
      return;
    }
    if (sk.kind !== 'scout') { ev.push({ type: 'msg', text: 'Этот скил работает в бою.' }); return; }
    w.flags.delete(World.key(x, y));
    if (!World.canOpen(w, x, y)) { ev.push({ type: 'msg', text: 'Выберите закрытую клетку рядом с открытыми.' }); return; }
    if (hero.mp < sk.mp) { ev.push({ type: 'msg', text: 'Не хватает маны.' }); return; }
    hero.mp -= sk.mp;
    ev.push({ type: 'skill', id, x, y });
    hero.run.pos = { x, y };
    if (World.isMine(w, x, y)) {
      w.defused.add(World.key(x, y));
      w.open.add(World.key(x, y));
      ev.push({ type: 'defuse', x, y });
    } else {
      onRevealed(hero, World.reveal(w, x, y), ev, rng);
    }
  }

  function springAt(hero, x, y) {
    const c = World.clearingAt(hero.world, x, y);
    return c && c.type === 'spring' && c.cx === x && c.cy === y && World.isOpen(hero.world, x, y) ? c : null;
  }

  // Главная точка входа: действие игрока в походе. Возвращает события для анимаций.
  function act(hero, action, rng) {
    rng = rng || Math.random;
    const ev = [];
    const run = hero.run;
    if (!run) return ev;
    const { x, y } = action;

    if (run.phase === 'fight') {
      fightTurn(hero, run, action, ev, rng);
      return ev;
    }
    if (action.type === 'potion') usePotion(hero, action.id, ev);
    else if (action.type === 'open') openCell(hero, x, y, ev, rng);
    else if (action.type === 'chord') chord(hero, x, y, ev, rng);
    else if (action.type === 'flag') {
      if (World.toggleFlag(hero.world, x, y)) ev.push({ type: 'flag', x, y, on: hero.world.flags.has(World.key(x, y)) });
    } else if (action.type === 'skill') fieldSkill(hero, action.id, x, y, ev, rng);
    else if (action.type === 'move') {
      const m = mobAt(hero, x, y);
      const sp = springAt(hero, x, y);
      if (m) {
        run.phase = 'fight';
        run.fight = { cid: m.cid, idx: m.idx, x: m.x, y: m.y, mob: m.mob, buffs: [], turn: 1 };
        run.pos = { x: m.x, y: m.y + 1 };
        ev.push({ type: 'engage', mob: m.mob.type, boss: m.mob.boss });
      } else if (sp) {
        run.pos = { x, y };
        if (run.springs.includes(sp.id)) ev.push({ type: 'msg', text: 'Родник уже помог вам в этом походе.' });
        else {
          run.springs.push(sp.id);
          ev.push({ type: 'spring', x, y });
          healHero(hero, D.WORLD.springHeal, ev);
          hero.mp = Math.min(stats(hero).mp, hero.mp + Math.round(stats(hero).mp * D.WORLD.springHeal));
        }
      } else if (World.isOpen(hero.world, x, y)) {
        run.pos = { x, y };
      }
    }
    return ev;
  }

  // ---------- Сохранение ----------

  function serialize(hero) {
    return JSON.stringify(Object.assign({}, hero, { world: World.serialize(hero.world) }));
  }

  // Загрузка с проверкой: любые испорченные или подменённые значения приводятся к допустимым.
  function sanitize(raw) {
    let src = raw;
    if (typeof raw === 'string') {
      try { src = JSON.parse(raw); } catch (e) { return null; }
    }
    if (!src || typeof src !== 'object') return null;
    if (!D.RACES[src.race] || !D.CLASSES[src.race] || !D.CLASSES[src.race][src.cls]) return null;
    const h = newHero(src.name, src.race, src.cls);
    h.level = toInt(src.level, 1, D.MAX_LEVEL);
    h.xp = toInt(src.xp, 0, xpToNext(h.level) - 1);
    h.sp = toInt(src.sp, 0, 1e9);
    h.adena = toInt(src.adena, 0, 1e10);
    let maxTier = 0;
    D.PROFESSION_LEVELS.forEach((lv, t) => { if (h.level >= lv) maxTier = t; });
    h.tier = toInt(src.tier, 0, maxTier);

    const arch = archOf(h);
    h.skills = {};
    Object.keys((src.skills && typeof src.skills === 'object') ? src.skills : {}).forEach((id) => {
      const sk = D.SKILLS[id];
      if (sk && sk.arch === arch && h.level >= sk.lvl && h.tier >= sk.tier) h.skills[id] = 1;
    });
    h.skills[startSkill(arch)] = 1;

    const eq = src.equip || {};
    ['weapon', 'armor', 'jewel'].forEach((slot) => {
      const g = D.GEAR[eq[slot]];
      h.equip[slot] = g && g.slot === slot && h.level >= g.lvl ? g.id : null;
    });
    const inv = src.inv || {};
    h.inv.gear = (Array.isArray(inv.gear) ? inv.gear : []).filter((id) => D.GEAR[id]).slice(0, 100);
    h.inv.potions = {};
    Object.keys(D.POTIONS).forEach((p) => { h.inv.potions[p] = toInt(inv.potions && inv.potions[p], 0, 999); });
    h.inv.trophies = {};
    Object.keys(D.TROPHIES).forEach((t) => {
      const n = toInt(inv.trophies && inv.trophies[t], 0, 9999);
      if (n) h.inv.trophies[t] = n;
    });

    const qs = src.quests || {};
    const seen = new Set();
    h.quests.done = (Array.isArray(qs.done) ? qs.done : []).filter((id) => questById(id) && !seen.has(id) && seen.add(id));
    h.quests.active = (Array.isArray(qs.active) ? qs.active : [])
      .filter((a) => a && questById(a.id) && !seen.has(a.id) && seen.add(a.id))
      .slice(0, D.MAX_ACTIVE_QUESTS)
      .map((a) => ({ id: a.id, progress: toInt(a.progress, 0, questById(a.id).count) }));
    const st = src.stats || {};
    Object.keys(h.stats).forEach((k) => { h.stats[k] = toInt(st[k], 0, 1e9); });

    // Мир проверяется по карте мин; старое сохранение без мира получает новый лес.
    h.world = World.sanitize(src.world) || h.world;
    h.records = { maxDist: toInt(src.records && src.records.maxDist, 0, World.maxOpenDist(h.world)) };

    const s = stats(h);
    h.hp = toInt(src.hp, 1, s.hp);
    h.mp = toInt(src.mp, 0, s.mp);

    // Забег: проверяем каждую часть. Если что-то не так — забег отменяется, а проверенный мешок уходит в инвентарь.
    if (src.run && typeof src.run === 'object') {
      const bag = sanitizeBag(src.run.bag);
      let run = null;
      try { run = sanitizeRun(src.run, h, bag); } catch (e) { run = null; }
      if (run) h.run = run;
      else bagToInventory(h, bag);
    }
    return h;
  }

  function sanitizeBag(src) {
    const bag = emptyBag();
    if (!src || typeof src !== 'object') return bag;
    bag.adena = toInt(src.adena, 0, 1e9);
    Object.keys(D.TROPHIES).forEach((t) => {
      const n = toInt(src.trophies && src.trophies[t], 0, 9999);
      if (n) bag.trophies[t] = n;
    });
    bag.gear = (Array.isArray(src.gear) ? src.gear : []).filter((id) => D.GEAR[id]).slice(0, 100);
    return bag;
  }

  function sanitizeRun(src, hero, bag) {
    if (!['explore', 'fight'].includes(src.phase)) return null; // поход старого типа — отменяется
    const w = hero.world;
    const maxD = World.maxOpenDist(w);
    const run = {
      phase: src.phase, start: typeof src.start === 'string' ? src.start.slice(0, 20) : 'town',
      pos: { x: 0, y: D.WORLD.townRadius }, bag,
      earned: { xp: 0, sp: 0, kills: 0, cells: 0 },
      streak: toInt(src.streak, 0, 1e6), maxDist: toInt(src.maxDist, 0, maxD), camps: {}, springs: [], fight: null,
    };
    Object.keys(run.earned).forEach((k) => { run.earned[k] = toInt(src.earned && src.earned[k], 0, 1e12); });
    const px = toInt(src.pos && src.pos.x, -1e6, 1e6), py = toInt(src.pos && src.pos.y, -1e6, 1e6);
    if (World.isOpen(w, px, py)) run.pos = { x: px, y: py };

    const camps = src.camps && typeof src.camps === 'object' ? src.camps : {};
    Object.keys(camps).slice(0, 2000).forEach((cid) => {
      const c = World.clearingById(w, cid);
      if (!c || c.type === 'spring') return;
      const n = campMobs(w, c).length;
      const o = camps[cid] || {};
      const dead = [...new Set((Array.isArray(o.dead) ? o.dead : []).map((i) => toInt(i, -1, n - 1)).filter((i) => i >= 0))];
      const hp = {};
      Object.keys(o.hp && typeof o.hp === 'object' ? o.hp : {}).forEach((i) => {
        const idx = toInt(i, -1, n - 1);
        if (idx >= 0 && !dead.includes(idx)) hp[idx] = Math.max(1, toInt(o.hp[i], 1, 1e9));
      });
      run.camps[c.id] = { dead, hp };
    });
    run.springs = [...new Set(Array.isArray(src.springs) ? src.springs : [])]
      .filter((id) => { const c = World.clearingById(w, id); return c && c.type === 'spring'; });

    if (run.phase === 'fight') {
      const f = src.fight || {};
      const c = World.clearingById(w, f.cid);
      if (!c || !World.isOpen(w, c.cx, c.cy)) return null;
      const m = aliveCampMobs(Object.assign({}, hero, { run }), c).find((e) => e.idx === f.idx);
      if (!m) return null;
      m.mob.hp = toInt(f.mob && f.mob.hp, 1, m.mob.hp);
      const buffs = (Array.isArray(f.buffs) ? f.buffs : []).filter((b) => b && hero.skills[b.id] && D.SKILLS[b.id].kind === 'buff')
        .map((b) => ({ id: b.id, buff: D.SKILLS[b.id].buff, turns: toInt(b.turns, 1, D.SKILLS[b.id].turns + 1) }));
      run.fight = { cid: c.id, idx: m.idx, x: m.x, y: m.y, mob: m.mob, buffs, turn: toInt(f.turn, 1, 9999) };
    }
    return run;
  }

  const Game = {
    SAVE_VERSION, newHero, stats, archOf, className, fullHeal, xpToNext, addXp,
    mobStats, mobXp, makeMob, mobLevel, bossLevel, killReward, applyReward,
    questById, availableQuests, acceptQuest, abandonQuest, questProgress, turnInQuest,
    skillList, canLearn, learnSkill, priceFor, sellPrice, buy, sellGear, sellTrophies, equip, unequip,
    campMobs, aliveCampMobs, mobAt, springAt, startPoints, startOuting, teleport, act, buffMods,
    serialize, sanitize,
  };
  root.Game = Game;
  if (typeof module !== 'undefined' && module.exports) module.exports = Game;
})(typeof window !== 'undefined' ? window : globalThis);
