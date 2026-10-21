// Бесконечный лес-сапёр. Мина в клетке определяется зерном мира и координатами,
// поэтому все мины существуют с самого начала, а цифры честные на любом участке карты.
(function (root) {
  'use strict';

  const D = root.DATA || (typeof require !== 'undefined' ? require('./data.js') : null);
  const W = D.WORLD;

  // Детерминированный «случай» от зерна, координат и номера признака: число от 0 до 1.
  function rnd(seed, x, y, salt) {
    let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(salt + 1, 2246822519)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    return h / 4294967296;
  }

  const key = (x, y) => x + ',' + y;
  const dist = (x, y) => Math.max(Math.abs(x), Math.abs(y));

  function ringIndex(d) {
    let r = 0;
    D.ZONES.forEach((z, i) => { if (d >= z.from) r = i; });
    return r;
  }

  const density = (d) => Math.min(W.maxDensity, W.densityBase + W.densityPerCell * d);
  const minePct = (d) => Math.min(W.maxMinePct, W.minePct + W.minePctPerCell * d);
  const levelAt = (d) => 1 + Math.floor(d * W.levelPerCell);

  function newWorld(seed) {
    return {
      seed: (seed >>> 0) || 1,
      open: new Set(), flags: new Set(), blown: new Set(), defused: new Set(), looted: new Set(),
      waypoints: [],
      _clearings: new Map(), _nums: new Map(),
    };
  }

  // ---------- Поляны ----------

  // Поляна области (rx, ry) или null. Результат кэшируется.
  function clearingOfRegion(w, rx, ry) {
    const k = key(rx, ry);
    if (w._clearings.has(k)) return w._clearings.get(k);
    let c = null;
    if (rnd(w.seed, rx, ry, 11) < W.clearingChance) {
      const size = W.clearingMin + Math.floor(rnd(w.seed, rx, ry, 12) * (W.clearingMax - W.clearingMin + 1));
      const room = W.region - size - 1;
      const x0 = rx * W.region + 1 + Math.floor(rnd(w.seed, rx, ry, 13) * room);
      const y0 = ry * W.region + 1 + Math.floor(rnd(w.seed, rx, ry, 14) * room);
      const cx = x0 + Math.floor(size / 2), cy = y0 + Math.floor(size / 2);
      // поляна не должна задевать безопасную зону у города
      const near = Math.max(Math.min(Math.abs(x0), Math.abs(x0 + size - 1), x0 <= 0 && x0 + size - 1 >= 0 ? 0 : Infinity),
        Math.min(Math.abs(y0), Math.abs(y0 + size - 1), y0 <= 0 && y0 + size - 1 >= 0 ? 0 : Infinity));
      if (near > W.safeRadius + 1) {
        const d = dist(cx, cy);
        const r = rnd(w.seed, rx, ry, 15);
        let type = 'camp';
        if (d >= W.bossFrom && r < W.bossChance) type = 'boss';
        else if (r > 1 - W.springChance) type = 'spring';
        c = { id: k, rx, ry, x0, y0, size, cx, cy, d, ring: ringIndex(d), type };
      }
    }
    w._clearings.set(k, c);
    return c;
  }

  function clearingAt(w, x, y) {
    const c = clearingOfRegion(w, Math.floor(x / W.region), Math.floor(y / W.region));
    return c && x >= c.x0 && y >= c.y0 && x < c.x0 + c.size && y < c.y0 + c.size ? c : null;
  }

  function clearingById(w, id) {
    const m = /^(-?\d+),(-?\d+)$/.exec(String(id));
    return m ? clearingOfRegion(w, Number(m[1]), Number(m[2])) : null;
  }

  // ---------- Клетки ----------

  const isTown = (x, y) => dist(x, y) <= W.townRadius;

  function isMine(w, x, y) {
    const d = dist(x, y);
    if (d <= W.safeRadius || clearingAt(w, x, y)) return false;
    return rnd(w.seed, x, y, 0) < density(d);
  }

  function hasTreasure(w, x, y) {
    const d = dist(x, y);
    return d > W.safeRadius + 1 && !isMine(w, x, y) && !clearingAt(w, x, y) && rnd(w.seed, x, y, 7) < W.treasureChance;
  }

  function neighbors(x, y) {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) out.push([x + dx, y + dy]);
    return out;
  }

  // Цифра = число мин в 8 соседних клетках.
  function num(w, x, y) {
    const k = key(x, y);
    let n = w._nums.get(k);
    if (n === undefined) {
      n = neighbors(x, y).reduce((s, [a, b]) => s + (isMine(w, a, b) ? 1 : 0), 0);
      if (w._nums.size > 200000) w._nums.clear();
      w._nums.set(k, n);
    }
    return n;
  }

  const isOpen = (w, x, y) => isTown(x, y) || w.open.has(key(x, y));
  // «Известная» мина — с флажком, взорванная или обезвреженная.
  const knownMine = (w, x, y) => w.flags.has(key(x, y)) || w.blown.has(key(x, y)) || w.defused.has(key(x, y));

  // Открывать можно только клетку рядом с уже открытой.
  function canOpen(w, x, y) {
    if (isOpen(w, x, y) || w.flags.has(key(x, y))) return false;
    return neighbors(x, y).some(([a, b]) => isOpen(w, a, b));
  }

  // Открыть безопасную клетку: нули раскрывают соседей, поляна открывается целиком.
  // Возвращает список новых клеток и поляны, которых коснулись. Мину не трогает — это решает игра.
  function reveal(w, x, y) {
    const opened = [];
    const clearings = new Map();
    if (isOpen(w, x, y) || isMine(w, x, y) || w.flags.has(key(x, y))) return { opened, clearings: [] };
    const stack = [[x, y]];
    while (stack.length && opened.length < W.floodLimit) {
      const [cx, cy] = stack.pop();
      const k = key(cx, cy);
      if (isOpen(w, cx, cy) || w.flags.has(k) || isMine(w, cx, cy)) continue;
      w.open.add(k);
      opened.push([cx, cy]);
      const cl = clearingAt(w, cx, cy);
      if (cl && !clearings.has(cl.id)) {
        clearings.set(cl.id, cl);
        for (let yy = cl.y0; yy < cl.y0 + cl.size; yy++) for (let xx = cl.x0; xx < cl.x0 + cl.size; xx++) stack.push([xx, yy]);
      }
      if (num(w, cx, cy) === 0) neighbors(cx, cy).forEach((n) => { if (!isOpen(w, n[0], n[1])) stack.push(n); });
    }
    return { opened, clearings: [...clearings.values()] };
  }

  function toggleFlag(w, x, y) {
    if (isOpen(w, x, y)) return false;
    const k = key(x, y);
    if (w.flags.has(k)) w.flags.delete(k);
    else w.flags.add(k);
    return true;
  }

  // Открытие по цифре: если флажков вокруг ровно столько, сколько мин, — вернуть остальных закрытых соседей.
  function chordTargets(w, x, y) {
    if (!isOpen(w, x, y) || isMine(w, x, y)) return [];
    const n = num(w, x, y);
    if (!n) return [];
    const ns = neighbors(x, y);
    if (ns.filter(([a, b]) => knownMine(w, a, b)).length !== n) return [];
    return ns.filter(([a, b]) => !isOpen(w, a, b) && !w.flags.has(key(a, b)));
  }

  // ---------- Сохранение блоками ----------

  // Открытые клетки хранятся блоками 16×16: 256 бит → строка base64.
  function packOpen(set) {
    const C = W.chunk;
    const chunks = {};
    set.forEach((k) => {
      const [x, y] = k.split(',').map(Number);
      const cx = Math.floor(x / C), cy = Math.floor(y / C);
      const ck = cx + ',' + cy;
      if (!chunks[ck]) chunks[ck] = new Uint8Array(C * C / 8);
      const i = (y - cy * C) * C + (x - cx * C);
      chunks[ck][i >> 3] |= 1 << (i & 7);
    });
    const out = {};
    Object.keys(chunks).forEach((ck) => {
      let s = '';
      chunks[ck].forEach((b) => { s += String.fromCharCode(b); });
      out[ck] = btoa(s);
    });
    return out;
  }

  function unpackOpen(obj, limit) {
    const C = W.chunk;
    const set = new Set();
    if (!obj || typeof obj !== 'object') return set;
    for (const ck of Object.keys(obj)) {
      const m = /^(-?\d+),(-?\d+)$/.exec(ck);
      if (!m || typeof obj[ck] !== 'string') continue;
      let bin;
      try { bin = atob(obj[ck]); } catch (e) { continue; }
      if (bin.length !== C * C / 8) continue;
      const cx = Number(m[1]), cy = Number(m[2]);
      for (let i = 0; i < C * C; i++) {
        if (bin.charCodeAt(i >> 3) & (1 << (i & 7))) {
          set.add(key(cx * C + (i % C), cy * C + Math.floor(i / C)));
          if (set.size > limit) return set;
        }
      }
    }
    return set;
  }

  function serialize(w) {
    return {
      seed: w.seed, open: packOpen(w.open), flags: [...w.flags], blown: [...w.blown],
      defused: [...w.defused], looted: [...w.looted], waypoints: w.waypoints.slice(),
    };
  }

  const LIMIT = 300000;
  const validKey = (k) => typeof k === 'string' && /^-?\d{1,6},-?\d{1,6}$/.test(k);

  // Загрузка с проверкой по карте мин: подделанные клетки отбрасываются.
  function sanitize(src) {
    if (!src || typeof src !== 'object' || !Number.isFinite(Number(src.seed))) return null;
    const w = newWorld(Number(src.seed));
    const mineK = (k) => { const [x, y] = k.split(',').map(Number); return isMine(w, x, y); };
    const list = (a) => (Array.isArray(a) ? a : []).filter(validKey).slice(0, LIMIT);
    unpackOpen(src.open, LIMIT).forEach((k) => w.open.add(k));
    list(src.blown).forEach((k) => { if (mineK(k)) w.blown.add(k); });
    list(src.defused).forEach((k) => { if (mineK(k) && !w.blown.has(k)) w.defused.add(k); });
    // открытая мина допустима, только если она взорвана или обезврежена
    w.open.forEach((k) => { if (mineK(k) && !w.blown.has(k) && !w.defused.has(k)) w.open.delete(k); });
    w.blown.forEach((k) => w.open.add(k));
    w.defused.forEach((k) => w.open.add(k));
    list(src.flags).forEach((k) => { if (!w.open.has(k)) w.flags.add(k); });
    list(src.looted).forEach((k) => {
      const [x, y] = k.split(',').map(Number);
      if (w.open.has(k) && hasTreasure(w, x, y)) w.looted.add(k);
    });
    w.waypoints = [...new Set(Array.isArray(src.waypoints) ? src.waypoints : [])].filter((id) => {
      const c = clearingById(w, id);
      return c && c.type !== 'spring' && w.open.has(key(c.cx, c.cy));
    }).slice(0, 500);
    return w;
  }

  function maxOpenDist(w) {
    let m = W.townRadius;
    w.open.forEach((k) => { const [x, y] = k.split(',').map(Number); m = Math.max(m, dist(x, y)); });
    return m;
  }

  const World = {
    rnd, key, dist, ringIndex, density, minePct, levelAt, newWorld, clearingAt, clearingById, clearingOfRegion,
    isTown, isMine, hasTreasure, neighbors, num, isOpen, knownMine, canOpen, reveal, toggleFlag, chordTargets,
    serialize, sanitize, maxOpenDist,
  };
  root.World = World;
  if (typeof module !== 'undefined' && module.exports) module.exports = World;
})(typeof window !== 'undefined' ? window : globalThis);
