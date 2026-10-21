// Экраны и управление: создание героя, город, поле, модальные окна, сохранение.
(function () {
  'use strict';

  const D = window.DATA, G = window.Game, R = window.Render;
  const SAVE_KEY = 'minegame.save.v1';
  const $ = (id) => document.getElementById(id);

  let hero = null;
  let renderer = null;
  let mode = 'open';
  let targeting = null; // id скила разведки, ждущего выбора клетки
  let townTab = 'zones';
  let portraitTimer = null;

  // Безопасное построение DOM: текст всегда через textContent.
  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    [].concat(children || []).forEach((c) => {
      if (c == null || c === false) return;
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return e;
  }

  const fmt = (n) => Math.floor(n).toLocaleString('ru-RU');

  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id));
    if (renderer) {
      if (id === 'screen-field') renderer.start();
      else renderer.stop();
    }
  }

  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  function modal(children) {
    const box = $('modal-box');
    box.replaceChildren(...[].concat(children).filter(Boolean));
    $('modal').classList.remove('hidden');
  }
  function closeModal() { $('modal').classList.add('hidden'); }

  // ---------- Сохранение ----------

  function save() {
    if (!hero) return;
    try { localStorage.setItem(SAVE_KEY, G.serialize(hero)); } catch (e) { /* хранилище недоступно */ }
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? G.sanitize(raw) : null;
    } catch (e) { return null; }
  }

  function exportSave() {
    const blob = new Blob([G.serialize(hero)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'saper-' + hero.name + '-ur' + hero.level + '.json' });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function importSave(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const h = G.sanitize(String(reader.result));
      if (!h) { toast('Файл не похож на сохранение игры.'); return; }
      hero = h;
      save();
      enterTown();
      toast('Сохранение загружено: ' + hero.name + ', ур. ' + hero.level);
    };
    reader.readAsText(file);
  }

  // ---------- Титул ----------

  function initTitle() {
    const art = $('title-art');
    let raf;
    const races = Object.keys(D.RACES);
    const loop = () => {
      if ($('screen-title').classList.contains('hidden')) { raf = null; return; }
      raf = requestAnimationFrame(loop);
      const ctx = art.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = art.clientWidth, h = art.clientHeight;
      if (art.width !== w * dpr) { art.width = w * dpr; art.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const t = performance.now() / 1000;
      R.drawMob(ctx, 'slime', w * 0.13, h * 0.92, 50, t);
      R.drawMob(ctx, 'goblin', w * 0.3, h * 0.95, 62, t + 1);
      R.drawHero(ctx, w * 0.5, h * 0.98, 92, t, races[Math.floor(t / 2.5) % races.length], ['fighter', 'mystic'][Math.floor(t / 5) % 2]);
      R.drawMob(ctx, 'wolf', w * 0.72, h * 0.95, 64, t + 2);
      R.drawMob(ctx, 'bat', w * 0.9, h * 0.8, 50, t + 3);
    };
    const start = () => { if (!raf) loop(); };
    start();
    initTitle.start = start;

    const existing = loadSave();
    $('btn-continue').classList.toggle('hidden', !existing);
    if (existing) $('btn-continue').textContent = 'Продолжить: ' + existing.name + ', ур. ' + existing.level;
    $('btn-continue').onclick = () => {
      hero = loadSave();
      if (!hero) return;
      if (hero.run) resumeRun();
      else enterTown();
    };
    $('btn-new').onclick = () => {
      if (loadSave()) {
        modal([
          el('div', { class: 'big-icon', text: '⚠️' }),
          el('h2', { text: 'Новый герой?' }),
          el('p', { text: 'Текущий герой будет заменён. Чтобы не потерять его, сначала сохраните его в файл (вкладка «Герой» в городе).' }),
          el('div', { class: 'modal-actions' }, [
            el('button', { class: 'btn', text: 'Отмена', onclick: closeModal }),
            el('button', { class: 'btn btn-red', text: 'Создать нового', onclick: () => { closeModal(); openCreate(); } }),
          ]),
        ]);
      } else openCreate();
    };
    $('btn-import').onclick = () => $('import-file').click();
    $('import-file').onchange = (e) => { if (e.target.files[0]) importSave(e.target.files[0]); e.target.value = ''; };
  }

  function showTitle() {
    show('screen-title');
    const existing = loadSave();
    $('btn-continue').classList.toggle('hidden', !existing);
    if (existing) $('btn-continue').textContent = 'Продолжить: ' + existing.name + ', ур. ' + existing.level;
    if (initTitle.start) initTitle.start();
  }

  // ---------- Создание героя ----------

  const createSel = { race: 'human', cls: 'fighter' };

  function openCreate() {
    show('screen-create');
    renderCreate();
    clearInterval(portraitTimer);
    portraitTimer = setInterval(() => {
      if ($('screen-create').classList.contains('hidden')) { clearInterval(portraitTimer); return; }
      R.drawPortrait($('create-portrait'), createSel.race, D.CLASSES[createSel.race][createSel.cls].arch);
    }, 33);
  }

  function renderCreate() {
    const rl = $('race-list');
    rl.replaceChildren(...Object.keys(D.RACES).map((r) => el('button', {
      class: 'choice' + (createSel.race === r ? ' active' : ''),
      onclick: () => {
        createSel.race = r;
        if (!D.CLASSES[r][createSel.cls]) createSel.cls = 'fighter';
        renderCreate();
      },
    }, [D.RACES[r].name])));
    const cl = $('class-list');
    cl.replaceChildren(...Object.keys(D.CLASSES[createSel.race]).map((c) => {
      const C = D.CLASSES[createSel.race][c];
      const sub = { fighter: 'Сильный удар, много здоровья', mystic: 'Магия, лечение, прозрение', artisan: 'Крепкий, скидка 20% в магазине' }[C.arch];
      return el('button', { class: 'choice' + (createSel.cls === c ? ' active' : ''), onclick: () => { createSel.cls = c; renderCreate(); } },
        [C.names[0], el('small', { text: sub })]);
    }));
    const C = D.CLASSES[createSel.race][createSel.cls];
    $('create-desc').replaceChildren(
      el('b', { text: D.RACES[createSel.race].name + ' — ' + C.names[0] }),
      el('div', { text: D.RACES[createSel.race].desc }),
      el('div', { class: 'meta', style: 'color:var(--muted);margin-top:6px;font-size:.85rem', text: 'Путь: ' + C.names.join(' → ') }),
    );
  }

  function initCreate() {
    $('btn-create-back').onclick = showTitle;
    $('btn-create').onclick = () => {
      const name = $('hero-name').value;
      if (!name.trim()) { toast('Введите имя героя.'); $('hero-name').focus(); return; }
      hero = G.newHero(name, createSel.race, createSel.cls);
      save();
      enterTown();
      modal([
        el('div', { class: 'big-icon', text: '🏝️' }),
        el('h2', { text: 'Добро пожаловать, ' + hero.name + '!' }),
        el('p', { text: 'Начните с Говорящего острова. Возьмите квест на доске, а затем отправляйтесь через телепорт.' }),
        el('p', { class: 'meta', style: 'color:var(--muted)', text: 'Подсказка: цифра на клетке — сумма силы монстров вокруг. Если уверены, что в клетке монстр, — устройте засаду (правый клик / долгое нажатие).' }),
        el('div', { class: 'modal-actions' }, [el('button', { class: 'btn btn-gold', text: 'Понятно', onclick: closeModal })]),
      ]);
    };
  }

  // ---------- HUD ----------

  function hudPortrait() {
    const c = el('canvas', { class: 'hud-portrait' });
    requestAnimationFrame(() => R.drawPortrait(c, hero.race, G.archOf(hero)));
    return c;
  }

  function bar(cls, cur, max, label) {
    const pct = Math.max(0, Math.min(100, cur / Math.max(1, max) * 100));
    return el('div', { class: 'bar ' + cls }, [el('i', { style: 'width:' + pct + '%' }), el('span', { text: label })]);
  }

  function heroBlock() {
    const s = G.stats(hero);
    const need = G.xpToNext(hero.level);
    return [
      hudPortrait(),
      el('div', { class: 'hud-name' }, [hero.name, el('small', { text: 'Ур. ' + hero.level + ' · ' + D.RACES[hero.race].name + ' · ' + G.className(hero) })]),
      el('div', { class: 'bars' }, [
        bar('hp', hero.hp, s.hp, 'HP ' + hero.hp + ' / ' + s.hp),
        bar('mp', hero.mp, s.mp, 'MP ' + hero.mp + ' / ' + s.mp),
        bar('xp', hero.xp, need, hero.level >= D.MAX_LEVEL ? 'Макс. уровень' : 'Опыт ' + Math.floor(hero.xp / need * 100) + '%'),
      ]),
      el('div', { class: 'hud-money' }, [el('span', { text: '🪙 ' + fmt(hero.adena) }), el('span', { text: 'SP ' + fmt(hero.sp) })]),
    ];
  }

  // ---------- Город ----------

  const TABS = [
    ['zones', '🌀 Телепорт'], ['quests', '📜 Квесты'], ['shop', '🛒 Магазин'],
    ['skills', '📖 Учитель'], ['gear', '🎒 Снаряжение'], ['hero', '🧝 Герой'],
  ];

  function enterTown() {
    targeting = null;
    closeFight();
    G.fullHeal(hero);
    save();
    show('screen-town');
    renderTown();
  }

  function renderTown() {
    $('town-hud').replaceChildren(...heroBlock(), el('div', { class: 'hud-right' }, [
      el('button', { class: 'btn btn-small btn-ghost', text: '⏏ Меню', onclick: () => { save(); showTitle(); } }),
    ]));
    const questReady = hero.quests.active.some((a) => G.questProgress(hero, a) >= G.questById(a.id).count);
    const canLearn = G.skillList(hero).some((id) => !G.canLearn(hero, id));
    $('town-tabs').replaceChildren(...TABS.map(([id, label]) => el('button', {
      class: 'tab' + (townTab === id ? ' active' : ''),
      onclick: () => { townTab = id; renderTown(); },
    }, [label, (id === 'quests' && questReady) || (id === 'skills' && canLearn) ? el('span', { class: 'dot' }) : null])));
    const content = $('town-content');
    content.replaceChildren(...({ zones: tabZones, quests: tabQuests, shop: tabShop, skills: tabSkills, gear: tabGear, hero: tabHero }[townTab])());
  }

  function act(fn) {
    return () => {
      const r = fn();
      if (r && r.msg) toast(r.msg);
      save();
      renderTown();
    };
  }

  function tabZones() {
    const W = window.World;
    const pts = G.startPoints(hero);
    return [
      el('h3', { class: 'section-title' }, ['Поход в лес', el('small', { text: 'Лес бесконечный: чем дальше от города, тем гуще мины, сильнее монстры и богаче добыча' })]),
      el('div', { class: 'cards' }, pts.map((p) => {
        const z = D.ZONES[p.ring];
        const art = el('canvas');
        requestAnimationFrame(() => drawZoneArt(art, p.ring));
        const lvl = W.levelAt(p.d);
        return el('div', { class: 'card zone-card' + (p.id === 'town' ? ' highlight' : '') }, [
          el('div', { class: 'zone-art' }, [art]),
          el('h3', { text: (p.id === 'town' ? '🏰 ' : '🗿 ') + p.name }),
          el('div', { class: 'meta', text: z.name + (p.d ? ' · ' + p.d + ' клеток от города' : '') }),
          el('div', { class: 'desc', text: 'Монстры рядом: ' + z.pool.map((m) => D.MOBS[m.type].name).join(', ') + ' (ур. ~' + lvl + ')' }),
          el('div', { class: 'row' }, [
            hero.level + 3 < lvl ? el('span', { class: 'tag bad', text: 'Опасно для вашего уровня' }) : el('span', { class: 'tag good', text: 'По силам' }),
            el('button', { class: 'btn btn-gold', text: 'В лес', onclick: () => beginOuting(p.id) }),
          ]),
        ]);
      })),
      el('h3', { class: 'section-title', text: 'Кольца леса' }),
      el('div', { class: 'cards' }, D.ZONES.map((z) => el('div', { class: 'card' }, [
        el('h3', { text: z.name }),
        el('div', { class: 'meta', text: 'от ' + z.from + ' клеток · рекомендуемый ур. ' + z.min + '–' + z.max }),
        el('div', { class: 'desc', text: 'Монстры: ' + z.pool.map((m) => D.MOBS[m.type].name).join(', ') + '. 👑 Босс: ' + D.MOBS[z.boss.type].name + '.' }),
      ]))),
      el('p', { class: 'meta', style: 'color:var(--muted)', text: '🏅 Дальше всего вы уходили на ' + hero.records.maxDist + ' клеток. Зачищенный лагерь становится камнем телепорта — с него можно начать следующий поход.' }),
    ];
  }

  function drawZoneArt(canvas, zi) {
    const z = D.ZONES[zi];
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 250, h = canvas.clientHeight || 70;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, z.theme.sky1); g.addColorStop(1, z.theme.top);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = z.theme.side;
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, h * 0.75); ctx.quadraticCurveTo(w * 0.3, h * 0.55, w * 0.6, h * 0.75); ctx.quadraticCurveTo(w * 0.8, h * 0.85, w, h * 0.7); ctx.lineTo(w, h); ctx.fill();
    const t = 0;
    z.pool.forEach((p, k) => R.drawMob(ctx, p.type, w * (0.15 + k * 0.2), h * 0.95, 36, t + k));
    R.drawMob(ctx, z.boss.type, w * 0.85, h * 0.97, 34, t);
  }

  function tabQuests() {
    const out = [el('h3', { class: 'section-title' }, ['Активные квесты', el('small', { text: hero.quests.active.length + ' / ' + D.MAX_ACTIVE_QUESTS })])];
    if (!hero.quests.active.length) out.push(el('p', { class: 'empty', text: 'Нет активных квестов — возьмите на доске ниже.' }));
    out.push(el('div', { class: 'cards' }, hero.quests.active.map((a) => {
      const q = G.questById(a.id);
      const p = G.questProgress(hero, a);
      const done = p >= q.count;
      return el('div', { class: 'card' + (done ? ' highlight' : '') }, [
        el('h3', { text: q.name }),
        el('div', { class: 'desc', text: q.desc }),
        el('div', { class: 'progress' }, [el('i', { style: 'width:' + (p / q.count * 100) + '%' })]),
        el('div', { class: 'meta', text: 'Прогресс: ' + p + ' / ' + q.count }),
        rewardLine(q),
        el('div', { class: 'row' }, [
          el('button', { class: 'btn btn-small btn-ghost', text: 'Отказаться', onclick: act(() => G.abandonQuest(hero, a.id)) }),
          el('button', { class: 'btn btn-gold', disabled: !done, text: 'Сдать', onclick: () => turnIn(a.id) }),
        ]),
      ]);
    })));
    const avail = G.availableQuests(hero);
    out.push(el('h3', { class: 'section-title', text: 'Доска заданий' }));
    if (!avail.length) out.push(el('p', { class: 'empty', text: 'Новых заданий пока нет — подрастите в уровне.' }));
    out.push(el('div', { class: 'cards' }, avail.map((q) => {
      const tooLow = hero.level < q.lvl;
      return el('div', { class: 'card' + (q.type === 'profession' ? ' highlight' : '') }, [
        el('h3', { text: (q.type === 'profession' ? '⭐ ' : '') + q.name }),
        el('div', { class: 'meta', text: D.ZONES.find((z) => z.id === q.zone).name + ' · рекомендуемый ур. ' + q.lvl }),
        el('div', { class: 'desc', text: q.desc }),
        rewardLine(q),
        el('div', { class: 'row' }, [
          tooLow ? el('span', { class: 'tag bad', text: 'Будет трудно' }) : el('span'),
          el('button', { class: 'btn btn-blue', text: 'Взять', onclick: act(() => G.acceptQuest(hero, q.id)) }),
        ]),
      ]);
    })));
    return out;
  }

  function rewardLine(q) {
    const r = q.reward;
    const parts = ['✨ ' + fmt(r.xp) + ' XP', '🪙 ' + fmt(r.adena)];
    Object.keys(r.items || {}).forEach((k) => parts.push(D.POTIONS[k].icon + '×' + r.items[k]));
    if (r.gear) parts.push('🎁 снаряжение ' + D.GRADES[Math.min(5, r.gear)].id + '-грейда');
    if (r.tier) parts.push('⭐ профессия: ' + D.CLASSES[hero.race][hero.cls].names[r.tier]);
    return el('div', { class: 'meta', text: 'Награда: ' + parts.join(' · ') });
  }

  function turnIn(id) {
    const r = G.turnInQuest(hero, id);
    save();
    if (!r.ok) { toast(r.msg); return; }
    const lines = [el('div', { text: '✨ +' + fmt(r.reward.xp) + ' опыта' }), el('div', { text: '🪙 +' + fmt(r.reward.adena) + ' адены' }), el('div', { text: '📘 +' + fmt(r.reward.sp) + ' SP' })];
    Object.keys(r.items).forEach((k) => lines.push(el('div', { text: D.POTIONS[k].icon + ' ' + D.POTIONS[k].name + ' ×' + r.items[k] })));
    if (r.reward.gear) lines.push(el('div', { text: '🎁 ' + D.GEAR[r.reward.gear].name }));
    if (r.levels) lines.push(el('div', { text: '★ Новый уровень: ' + hero.level }));
    modal([
      el('div', { class: 'big-icon', text: r.tier ? '⭐' : '📜' }),
      el('h2', { text: r.tier ? 'Новая профессия: ' + G.className(hero) + '!' : 'Квест выполнен!' }),
      r.tier ? el('p', { text: 'Характеристики выросли, у учителя открылись новые скилы.' }) : null,
      el('div', { class: 'reward-list' }, lines),
      el('div', { class: 'modal-actions' }, [el('button', { class: 'btn btn-gold', text: 'Отлично', onclick: () => { closeModal(); renderTown(); } })]),
    ]);
  }

  function gradeIdxFor(level) {
    let g = 0;
    D.GRADES.forEach((gr, i) => { if (level >= gr.lvl) g = i; });
    return g;
  }

  function tabShop() {
    const out = [el('h3', { class: 'section-title' }, ['Зелья', G.archOf(hero) === 'artisan' ? el('small', { text: 'Скидка ремесленника −20%' }) : null])];
    out.push(el('div', { class: 'cards' }, Object.keys(D.POTIONS).map((id) => {
      const p = D.POTIONS[id];
      const price = G.priceFor(hero, p.price);
      return el('div', { class: 'card' }, [
        el('h3', { text: p.icon + ' ' + p.name }),
        el('div', { class: 'desc', text: p.desc }),
        el('div', { class: 'meta', text: 'В сумке: ' + (hero.inv.potions[id] || 0) }),
        el('div', { class: 'row' }, [
          el('span', { class: 'price', text: '🪙 ' + fmt(price) }),
          el('span', {}, [
            el('button', { class: 'btn btn-small', disabled: hero.adena < price, text: '×1', onclick: act(() => G.buy(hero, id, 1)) }), ' ',
            el('button', { class: 'btn btn-small btn-gold', disabled: hero.adena < price * 5, text: '×5', onclick: act(() => G.buy(hero, id, 5)) }),
          ]),
        ]),
      ]);
    })));

    const trophyTotal = Object.keys(hero.inv.trophies).reduce((s, t) => s + hero.inv.trophies[t] * D.TROPHIES[t].price, 0);
    out.push(el('div', { class: 'list-row' }, [
      el('div', { class: 'grow' }, [el('b', { text: '🦴 Скупщик трофеев' }), el('div', { class: 'meta', style: 'color:var(--muted)', text: 'Трофеи, нужные для активных квестов, не продаются.' })]),
      el('button', { class: 'btn btn-gold', disabled: !trophyTotal, text: 'Продать трофеи', onclick: act(() => { const got = G.sellTrophies(hero); return { msg: got ? 'Получено ' + fmt(got) + ' адены' : 'Нечего продавать' }; }) }),
    ]));

    const maxG = Math.min(5, gradeIdxFor(hero.level) + 1);
    out.push(el('h3', { class: 'section-title', style: 'margin-top:16px' }, ['Снаряжение', el('small', { text: 'Грейды до ' + D.GRADES[maxG].id })]));
    const lines = ['sword', 'staff', 'armor', 'jewel'];
    const cards = [];
    for (let g = 0; g <= maxG; g++) {
      lines.forEach((line) => {
        const it = D.GEAR[line + '_' + D.GRADES[g].id];
        const price = G.priceFor(hero, it.price);
        const owned = Object.values(hero.equip).includes(it.id) || hero.inv.gear.includes(it.id);
        cards.push(el('div', { class: 'card' }, [
          el('h3', {}, [el('span', { class: 'tag grade', text: D.GRADES[g].id }), ' ', it.name]),
          el('div', { class: 'meta', text: slotName(it.slot) + ' · нужен ' + it.lvl + ' ур.' }),
          el('div', { class: 'desc', text: statText(it.stats) }),
          el('div', { class: 'row' }, [
            el('span', { class: 'price', text: '🪙 ' + fmt(price) }),
            el('button', { class: 'btn btn-small btn-gold', disabled: hero.adena < price, text: owned ? 'Купить ещё' : 'Купить', onclick: act(() => {
              const r = G.buy(hero, it.id, 1);
              if (r.ok && hero.level >= it.lvl) {
                G.equip(hero, hero.inv.gear.length - 1);
                return { msg: 'Куплено и надето: ' + it.name };
              }
              return r.ok ? { msg: 'Куплено: ' + it.name + ' (в сумке)' } : r;
            }) }),
          ]),
        ]));
      });
    }
    out.push(el('div', { class: 'cards' }, cards));
    return out;
  }

  const slotName = (s) => ({ weapon: 'Оружие', armor: 'Броня', jewel: 'Украшение' }[s]);
  function statText(st) {
    const names = { atk: 'Атака', matk: 'Маг. атака', def: 'Защита', hp: 'HP', mp: 'MP', crit: 'Крит' };
    return Object.keys(st).filter((k) => st[k]).map((k) => names[k] + ' +' + (k === 'crit' ? Math.round(st[k] * 100) + '%' : st[k])).join(', ');
  }

  function tabSkills() {
    const out = [el('h3', { class: 'section-title' }, ['Учитель скилов', el('small', { text: 'SP: ' + fmt(hero.sp) + ' · SP даётся за монстров и квесты' })])];
    G.skillList(hero).forEach((id) => {
      const sk = D.SKILLS[id];
      const learned = !!hero.skills[id];
      const why = G.canLearn(hero, id);
      out.push(el('div', { class: 'list-row' }, [
        el('div', { class: 'skill-icon', text: sk.icon }),
        el('div', { class: 'grow' }, [
          el('b', { text: sk.name }), ' ',
          sk.kind === 'passive' ? el('span', { class: 'tag', text: 'пассивный' }) : el('span', { class: 'tag', text: sk.mp + ' MP' }),
          sk.tier ? el('span', { class: 'tag grade', style: 'margin-left:4px', text: 'Профессия ' + sk.tier }) : null,
          el('div', { class: 'desc', text: sk.desc }),
          el('div', { class: 'meta', style: 'color:var(--muted);font-size:.82rem', text: 'Уровень ' + sk.lvl + (sk.sp ? ' · ' + fmt(sk.sp) + ' SP' : '') }),
        ]),
        learned ? el('span', { class: 'tag good', text: 'Изучен' })
          : el('button', { class: 'btn btn-blue btn-small', disabled: !!why, title: why, text: why || 'Изучить', onclick: act(() => G.learnSkill(hero, id)) }),
      ]));
    });
    return out;
  }

  function tabGear() {
    const s = G.stats(hero);
    const out = [el('div', { class: 'two-col' }, [
      el('div', {}, [
        el('h3', { class: 'section-title', text: 'Надето' }),
        ...['weapon', 'armor', 'jewel'].map((slot) => {
          const it = D.GEAR[hero.equip[slot]];
          return el('div', { class: 'list-row' }, [
            el('div', { class: 'skill-icon', text: { weapon: '⚔️', armor: '🛡️', jewel: '📿' }[slot] }),
            el('div', { class: 'grow' }, [el('b', { text: it ? it.name : '— пусто —' }), el('div', { class: 'meta', style: 'color:var(--muted)', text: slotName(slot) + (it ? ' · ' + statText(it.stats) : '') })]),
            it ? el('button', { class: 'btn btn-small btn-ghost', text: 'Снять', onclick: act(() => G.unequip(hero, slot)) }) : null,
          ]);
        }),
        el('h3', { class: 'section-title', style: 'margin-top:14px', text: 'Расходники и трофеи' }),
        ...Object.keys(D.POTIONS).map((p) => el('div', { class: 'list-row' }, [D.POTIONS[p].icon + ' ' + D.POTIONS[p].name, el('b', { style: 'margin-left:auto', text: '×' + (hero.inv.potions[p] || 0) })])),
        ...Object.keys(hero.inv.trophies).filter((t) => hero.inv.trophies[t] > 0).map((t) => el('div', { class: 'list-row' }, ['🦴 ' + D.TROPHIES[t].name, el('b', { style: 'margin-left:auto', text: '×' + hero.inv.trophies[t] })])),
      ]),
      el('div', {}, [
        el('h3', { class: 'section-title', text: 'Сумка' }),
        hero.inv.gear.length ? null : el('p', { class: 'empty', text: 'Пусто. Снаряжение падает с боссов и из сундуков, продаётся в магазине.' }),
        ...hero.inv.gear.map((id, i) => {
          const it = D.GEAR[id];
          const low = hero.level < it.lvl;
          return el('div', { class: 'list-row' }, [
            el('span', { class: 'tag grade', text: D.GRADES[it.grade].id }),
            el('div', { class: 'grow' }, [el('b', { text: it.name }), el('div', { class: 'meta', style: 'color:var(--muted);font-size:.82rem', text: slotName(it.slot) + ' · ' + statText(it.stats) + (low ? ' · нужен ' + it.lvl + ' ур.' : '') })]),
            el('button', { class: 'btn btn-small btn-blue', disabled: low, text: 'Надеть', onclick: act(() => G.equip(hero, i)) }),
            el('button', { class: 'btn btn-small', text: 'Продать ' + fmt(G.sellPrice(it.price)), onclick: act(() => G.sellGear(hero, i)) }),
          ]);
        }),
        el('h3', { class: 'section-title', style: 'margin-top:14px', text: 'Характеристики' }),
        statTable(s),
      ]),
    ])];
    return out;
  }

  function statTable(s) {
    const rows = [
      ['Здоровье', s.hp], ['Мана', s.mp], ['Атака', s.atk], ['Маг. атака', s.matk], ['Защита', s.def],
      ['Шанс крита', Math.round(s.crit * 100) + '%'], ['Сила крита', '×' + s.critMult.toFixed(1)],
    ];
    if (s.evade) rows.push(['Уворот', Math.round(s.evade * 100) + '%']);
    if (s.xpMult > 1) rows.push(['Бонус опыта', '+' + Math.round((s.xpMult - 1) * 100) + '%']);
    if (s.adenaMult > 1) rows.push(['Бонус адены', '+' + Math.round((s.adenaMult - 1) * 100) + '%']);
    if (s.dropMult > 1) rows.push(['Бонус добычи', '+' + Math.round((s.dropMult - 1) * 100) + '%']);
    return el('table', { class: 'stat-table' }, rows.map(([a, b]) => el('tr', {}, [el('td', { text: a }), el('td', { text: String(b) })])));
  }

  function tabHero() {
    const C = D.CLASSES[hero.race][hero.cls];
    const nextTier = hero.tier < 2 ? D.PROFESSION_LEVELS[hero.tier + 1] : null;
    return [el('div', { class: 'two-col' }, [
      el('div', {}, [
        el('h3', { class: 'section-title', text: hero.name }),
        el('p', {}, [el('b', { text: D.RACES[hero.race].name }), ' — ' + D.RACES[hero.race].desc]),
        el('p', {}, ['Путь профессий: ', ...C.names.map((n, i) => el('span', { class: 'tag' + (i === hero.tier ? ' grade' : ''), style: 'margin:2px', text: n }))]),
        nextTier ? el('p', { class: 'meta', style: 'color:var(--muted)', text: 'Следующая профессия — на ' + nextTier + ' уровне через квест-испытание.' }) : el('p', { text: 'Вы достигли вершины мастерства.' }),
        el('h3', { class: 'section-title', style: 'margin-top:14px', text: 'Достижения' }),
        el('table', { class: 'stat-table' }, [
          ['Походов', hero.stats.outings], ['Клеток открыто', hero.stats.cells], ['Лагерей зачищено', hero.stats.camps],
          ['Монстров побеждено', hero.stats.kills], ['Боссов побеждено', hero.stats.bosses],
          ['Смертей', hero.stats.deaths], ['Квестов выполнено', hero.quests.done.length],
          ['Дальше всего от города', hero.records.maxDist + ' кл.'], ['Камней телепорта', hero.world.waypoints.length],
        ].map(([a, b]) => el('tr', {}, [el('td', { text: a }), el('td', { text: fmt(b) })]))),
      ]),
      el('div', {}, [
        el('h3', { class: 'section-title', text: 'Сохранение' }),
        el('p', { class: 'meta', style: 'color:var(--muted)', text: 'Игра сохраняется автоматически в этом браузере. Чтобы перенести героя на другое устройство или не потерять при очистке браузера — сохраните в файл.' }),
        el('div', { class: 'modal-actions', style: 'justify-content:flex-start' }, [
          el('button', { class: 'btn btn-gold', text: '💾 Сохранить в файл', onclick: exportSave }),
          el('button', { class: 'btn', text: '📂 Загрузить из файла', onclick: () => $('import-file').click() }),
        ]),
      ]),
    ])];
  }

  // ---------- Поход в лес ----------

  function beginOuting(from) {
    if (hero.run) { resumeRun(); return; }
    G.fullHeal(hero);
    if (!G.startOuting(hero, from)) { toast('Отсюда пока нельзя начать поход.'); return; }
    save();
    resumeRun();
    log('Открывайте клетки рядом с открытыми. Правый клик / долгое нажатие — флажок, двойной клик по цифре — открыть соседей.');
  }

  function resumeRun() {
    targeting = null;
    setMode('open');
    show('screen-field');
    if (!renderer) {
      renderer = R.ForestRenderer($('field-canvas'), $('canvas-wrap'));
      bindCanvas();
    }
    try { renderer.zoom = Math.max(0.6, Math.min(2.2, Number(localStorage.getItem('minegame.zoom2')) || 1)); } catch (e) { /* по умолчанию 1 */ }
    renderer.setHero(hero);
    renderer.start();
    renderRunUi();
    if (hero.run.phase === 'fight') openFight();
  }

  function zoomBy(k) {
    renderer.setZoom(renderer.zoom * k);
    try { localStorage.setItem('minegame.zoom2', String(renderer.zoom)); } catch (e) { /* не важно */ }
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('#mode-switch .mode').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  }

  function log(text) {
    const l = $('field-log');
    l.textContent = text;
    l.classList.add('show');
    clearTimeout(log.timer);
    log.timer = setTimeout(() => l.classList.remove('show'), 3200);
  }

  function bagText(bag) {
    const tro = Object.values(bag.trophies).reduce((s, n) => s + n, 0);
    return '🪙 ' + fmt(bag.adena) + (tro ? ' · 🦴 ' + tro : '') + (bag.gear.length ? ' · ⭐ ' + bag.gear.length : '');
  }

  function renderRunUi() {
    const run = hero.run;
    if (!run) return;
    const W = window.World;
    const d = W.dist(run.pos.x, run.pos.y);
    const z = D.ZONES[W.ringIndex(d)];
    $('field-hud').replaceChildren(...heroBlock(),
      el('div', { class: 'run-info' }, [
        el('b', { text: z.name }),
        el('small', { text: '🧭 ' + d + ' кл. от города · мобы ~' + W.levelAt(d) + ' ур. · 💥 −' + Math.round(W.minePct(d) * 100) + '% HP' }),
        el('small', { title: 'Мешок добычи: при смерти теряется половина, в городе — всё ваше', text: '🎒 ' + bagText(run.bag) }),
      ]),
      el('div', { class: 'hud-right' }, [
        el('span', { class: 'zoom' }, [
          el('button', { class: 'btn btn-small', title: 'Уменьшить', text: '−', onclick: () => zoomBy(1 / 1.2) }),
          el('button', { class: 'btn btn-small', title: 'Увеличить', text: '+', onclick: () => zoomBy(1.2) }),
          el('button', { class: 'btn btn-small', title: 'Показать героя', text: '🎯', onclick: () => renderer.centerOn(run.pos.x, run.pos.y) }),
        ]),
        el('button', { class: 'btn btn-small', title: 'Свиток возврата: в город со всей добычей', text: '📜 В город', onclick: confirmTeleport }),
      ]));

    const sb = $('skill-bar');
    const usable = Object.keys(hero.skills).filter((id) => ['mines', 'any'].includes(D.SKILLS[id].use));
    sb.replaceChildren(...usable.map((id) => {
      const sk = D.SKILLS[id];
      return el('button', {
        class: 'slot' + (targeting === id ? ' selected' : ''),
        title: sk.name + ' (' + sk.mp + ' MP): ' + sk.desc,
        disabled: hero.mp < sk.mp,
        onclick: () => useSkillButton(id),
      }, [sk.icon, el('small', { text: sk.mp })]);
    }));
    $('potion-bar').replaceChildren(...Object.keys(D.POTIONS).map((id) => el('button', {
      class: 'slot potion',
      title: D.POTIONS[id].name + ': ' + D.POTIONS[id].desc,
      disabled: !(hero.inv.potions[id] > 0),
      onclick: () => doAction({ type: 'potion', id }),
    }, [D.POTIONS[id].icon, el('small', { text: '×' + (hero.inv.potions[id] || 0) })])));
    $('field-hint').textContent = '';
  }

  function useSkillButton(id) {
    const sk = D.SKILLS[id];
    if (sk.kind === 'scout') {
      targeting = targeting === id ? null : id;
      renderer.targeting = !!targeting;
      if (targeting) log(sk.icon + ' ' + sk.name + ': выберите закрытую клетку рядом с открытыми');
      renderRunUi();
    } else {
      doAction({ type: 'skill', id });
    }
  }

  function confirmTeleport() {
    const run = hero.run;
    modal([
      el('div', { class: 'big-icon', text: '📜' }),
      el('h2', { text: 'Вернуться в город?' }),
      el('p', { text: 'Вся добыча из мешка будет сохранена. Монстры в лагерях возродятся к следующему походу.' }),
      el('div', { class: 'reward-list' }, [el('div', { text: '🎒 ' + bagText(run.bag) })]),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn', text: 'Остаться', onclick: closeModal }),
        el('button', { class: 'btn btn-gold', text: 'В город', onclick: () => {
          closeModal();
          closeFight();
          const r = G.teleport(hero);
          save();
          enterTown();
          showRunSummary('🏰', 'Вы вернулись в город', 'Вся добыча сохранена.', r.kept, null);
        } }),
      ]),
    ]);
  }

  function summaryList(kept, lost) {
    const lines = [
      el('div', { text: '🧭 Дальше всего: ' + kept.maxDist + ' клеток от города' }),
      el('div', { text: '✨ Опыт: +' + fmt(kept.xp) + ' · 📘 SP: +' + fmt(kept.sp) }),
      el('div', { text: '⚔️ Монстров: ' + kept.kills + ' · 🌲 Открыто клеток: ' + fmt(kept.cells) }),
      el('div', { text: '🪙 Адена: +' + fmt(kept.adena) }),
    ];
    const tro = Object.keys(kept.trophies).filter((t) => kept.trophies[t]).map((t) => D.TROPHIES[t].name + ' ×' + kept.trophies[t]);
    if (tro.length) lines.push(el('div', { text: '🦴 ' + tro.join(', ') }));
    if (kept.gear.length) lines.push(el('div', { text: '⭐ ' + kept.gear.map((g) => D.GEAR[g].name).join(', ') }));
    if (lost) {
      const lt = Object.values(lost.trophies).reduce((s, n) => s + n, 0);
      lines.push(el('div', { style: 'color:var(--danger)', text: '💀 Потеряно: ' + fmt(lost.adena) + ' адены' + (lt ? ', трофеев ' + lt : '') + (lost.gear.length ? ', ' + lost.gear.map((g) => D.GEAR[g].name).join(', ') : '') }));
    }
    return el('div', { class: 'reward-list' }, lines);
  }

  function showRunSummary(icon, title, text, kept, lost) {
    modal([
      el('div', { class: 'big-icon', text: icon }),
      el('h2', { text: title }),
      el('p', { text }),
      summaryList(kept, lost),
      el('div', { class: 'modal-actions' }, [el('button', { class: 'btn btn-gold', text: 'Хорошо', onclick: closeModal })]),
    ]);
  }

  const MSG = {
    explode: (e) => '💥 Мина! −' + e.dmg + ' HP',
    defuse: () => 'Мина обезврежена',
    msg: (e) => e.text,
    flee: (e) => e.ok ? 'Вы отступили' : 'Отступить не удалось!',
    treasure: (e) => '🎁 Сундучок: +' + e.adena + ' адены в мешок',
    clearing: (e) => ({ camp: '⚔️ Вы нашли лагерь монстров! Нажмите на монстра, чтобы сразиться.', boss: '👑 Лагерь босса! Будьте осторожны.', spring: '💧 Родник: нажмите на него, чтобы восстановить силы.' }[e.kind]),
    spring: () => '💧 Родник восстановил силы',
    campclear: (e) => e.waypoint ? '🗿 Лагерь зачищен — здесь теперь камень телепорта!' : 'Лагерь зачищен!',
  };

  // Действие в лесу.
  function doAction(action) {
    if (!hero.run) return;
    const events = G.act(hero, action);
    if (!events.length) return;
    renderer.play(events);
    events.forEach((e) => { if (MSG[e.type]) log(MSG[e.type](e)); });
    save();
    const death = events.find((e) => e.type === 'death');
    if (death) { onDeath(death); return; }
    renderRunUi();
    if (events.some((e) => e.type === 'engage')) openFight();
  }

  function onDeath(death) {
    closeFight();
    setTimeout(() => {
      enterTown();
      showRunSummary('💀', 'Вы погибли', 'Опыт сохранён, но половина добычи из мешка потеряна.', death.kept, death.lost);
    }, 1200);
  }

  // ---------- Пошаговый бой ----------

  let fightAnim = null;
  let fightBusy = false;

  function fightMob() {
    const run = hero.run;
    return run && run.fight ? run.fight.mob : null;
  }

  function openFight() {
    const mob = fightMob();
    if (!mob) return;
    $('fight').classList.remove('hidden');
    $('fight-log').replaceChildren(el('div', { text: 'Бой начался! ' + D.MOBS[mob.type].name + ' готовится к атаке.' }));
    renderFight();
    cancelAnimationFrame(fightAnim);
    const loop = () => {
      if ($('fight').classList.contains('hidden')) return;
      fightAnim = requestAnimationFrame(loop);
      const m = fightMob();
      R.drawPortrait($('fight-hero'), hero.race, G.archOf(hero));
      if (m) R.drawPortrait($('fight-mob'), null, null, m.type);
    };
    loop();
  }

  function closeFight() {
    $('fight').classList.add('hidden');
    cancelAnimationFrame(fightAnim);
    fightBusy = false;
  }

  function renderFight() {
    const mob = fightMob();
    if (!mob) return;
    const s = G.stats(hero);
    const f = hero.run.fight;
    $('fight-title').textContent = 'Ход ' + f.turn + ' · ' + D.MOBS[mob.type].name + ', ур. ' + mob.level + (mob.boss ? ' 👑' : '');
    $('fight-hero-bars').replaceChildren(
      el('b', { text: hero.name }),
      bar('hp', hero.hp, s.hp, 'HP ' + hero.hp + ' / ' + s.hp),
      bar('mp', hero.mp, s.mp, 'MP ' + hero.mp + ' / ' + s.mp),
      el('div', { class: 'buffs' }, f.buffs.map((b) => el('span', { class: 'buff', title: D.SKILLS[b.id].name, text: D.SKILLS[b.id].icon + ' ' + b.turns }))),
    );
    $('fight-mob-bars').replaceChildren(
      el('b', { text: D.MOBS[mob.type].name }),
      bar('hp', mob.hp, mob.maxHp, 'HP ' + mob.hp + ' / ' + mob.maxHp),
    );
    const combat = Object.keys(hero.skills).filter((id) => D.SKILLS[id].use === 'combat' || D.SKILLS[id].use === 'any');
    $('fight-actions').replaceChildren(
      el('button', { class: 'btn btn-gold fight-main', disabled: fightBusy, onclick: () => fightAction({ type: 'attack' }) }, ['⚔️ Атака']),
      ...combat.map((id) => {
        const sk = D.SKILLS[id];
        return el('button', { class: 'slot', title: sk.name + ' (' + sk.mp + ' MP): ' + sk.desc, disabled: fightBusy || hero.mp < sk.mp, onclick: () => fightAction({ type: 'skill', id }) },
          [sk.icon, el('small', { text: sk.mp })]);
      }),
      ...Object.keys(D.POTIONS).map((id) => el('button', { class: 'slot potion', title: D.POTIONS[id].name, disabled: fightBusy || !(hero.inv.potions[id] > 0), onclick: () => fightAction({ type: 'potion', id }) },
        [D.POTIONS[id].icon, el('small', { text: '×' + (hero.inv.potions[id] || 0) })])),
      el('button', { class: 'btn btn-small', disabled: fightBusy, title: 'Шанс 60%. При неудаче монстр бьёт.', onclick: () => fightAction({ type: 'flee' }) }, ['🏃 Отступить']),
    );
  }

  function popNumber(side, text, cls) {
    const host = $(side === 'hero' ? 'fight-hero-wrap' : 'fight-mob-wrap');
    const n = el('div', { class: 'pop ' + (cls || ''), text });
    host.appendChild(n);
    setTimeout(() => n.remove(), 1100);
    host.classList.remove('hit');
    void host.offsetWidth;
    host.classList.add('hit');
  }

  function fightLine(text, cls) {
    const logEl = $('fight-log');
    logEl.appendChild(el('div', { class: cls || '', text }));
    while (logEl.children.length > 4) logEl.firstChild.remove();
  }

  function fightAction(action) {
    if (fightBusy || !hero.run || hero.run.phase !== 'fight') return;
    const mob = fightMob();
    const mobName = mob ? D.MOBS[mob.type].name : '';
    const events = G.act(hero, action);
    if (!events.length) return;
    save();
    fightBusy = true;
    let delay = 0;
    const later = (fn) => { setTimeout(fn, delay); };
    events.forEach((e) => {
      if (e.type === 'msg') { toast(e.text); }
      else if (e.type === 'skill') { const sk = D.SKILLS[e.id]; later(() => fightLine(sk.icon + ' ' + sk.name + '!', 'skill')); }
      else if (e.type === 'hit' && e.who === 'hero') {
        later(() => { popNumber('mob', '−' + e.dmg + (e.crit ? '!' : ''), e.crit ? 'crit' : (e.magic ? 'magic' : '')); fightLine('Вы бьёте: ' + e.dmg + (e.crit ? ' (крит!)' : '')); });
        delay += 380;
      } else if (e.type === 'hit' && e.who === 'mob') {
        later(() => { popNumber('hero', '−' + e.dmg, 'hurt'); fightLine(mobName + ' бьёт: ' + e.dmg, 'bad'); });
        delay += 380;
      } else if (e.type === 'evade') {
        later(() => { popNumber('hero', 'Уворот!', 'good'); fightLine('Вы увернулись!', 'good'); });
        delay += 380;
      } else if (e.type === 'heal') {
        later(() => { popNumber('hero', '+' + e.amount + (e.what === 'hp' ? ' HP' : ' MP'), 'good'); });
        delay += 250;
      } else if (e.type === 'buff') {
        later(() => fightLine('Усиление: ' + D.SKILLS[e.id].name));
      } else if (e.type === 'flee') {
        later(() => fightLine(e.ok ? 'Вы отступили.' : 'Отступить не удалось!', e.ok ? 'good' : 'bad'));
        delay += 300;
      } else if (e.type === 'kill') {
        later(() => fightLine('Победа! +' + e.reward.xp + ' XP, +' + e.reward.adena + ' 🪙 в мешок', 'good'));
        delay += 650;
      } else if (e.type === 'levelup') {
        later(() => fightLine('★ Новый уровень: ' + e.level + '!', 'good'));
      }
    });
    later(() => { renderFight(); });
    setTimeout(() => {
      fightBusy = false;
      const death = events.find((e) => e.type === 'death');
      if (death) { onDeath(death); return; }
      if (!hero.run || hero.run.phase !== 'fight') {
        closeFight();
        renderer.play(events.filter((e) => e.type !== 'heal'));
        events.forEach((e) => { if (e.type === 'campclear') log(MSG.campclear(e)); });
        renderRunUi();
        return;
      }
      renderFight();
      renderRunUi();
    }, delay + 60);
    renderFight();
  }

  // Мышь и палец: клик — открыть, правый клик / долгое нажатие — флажок,
  // двойной клик по цифре — открыть соседей, перетаскивание — двигать карту, колесо — масштаб.
  function bindCanvas() {
    const canvas = $('field-canvas');
    let down = null;
    let longTimer = null;
    let lastClick = null;

    const local = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
    canvas.addEventListener('pointermove', (e) => {
      const p = local(e);
      renderer.hover = renderer.cellAt(p.x, p.y);
      if (!down) return;
      const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
      if (!down.moved && Math.hypot(e.clientX - down.cx, e.clientY - down.cy) > 8) {
        down.moved = true;
        clearTimeout(longTimer);
      }
      if (down.moved) {
        renderer.pan(dx, dy);
        down.lx = e.clientX; down.ly = e.clientY;
      }
    });
    canvas.addEventListener('pointerleave', () => { renderer.hover = null; });
    canvas.addEventListener('pointerdown', (e) => {
      const p = local(e);
      canvas.setPointerCapture(e.pointerId);
      down = { cell: renderer.cellAt(p.x, p.y), cx: e.clientX, cy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, long: false, button: e.button };
      if (e.pointerType !== 'mouse' && hero.run && hero.run.phase === 'explore') {
        clearTimeout(longTimer);
        longTimer = setTimeout(() => {
          if (!down || down.moved) return;
          down.long = true;
          if (navigator.vibrate) navigator.vibrate(25);
          doAction({ type: 'flag', x: down.cell.x, y: down.cell.y });
        }, 420);
      }
    });
    canvas.addEventListener('pointerup', () => {
      clearTimeout(longTimer);
      const d = down;
      down = null;
      if (!d || d.moved || d.long || !hero.run || hero.run.phase !== 'explore') return;
      if (!$('modal').classList.contains('hidden')) return;
      const { x, y } = d.cell;
      const W = window.World;
      if (d.button === 2) { doAction({ type: 'flag', x, y }); return; }
      if (d.button !== 0) return;
      if (targeting) {
        const id = targeting;
        targeting = null;
        renderer.targeting = false;
        doAction({ type: 'skill', id, x, y });
        renderRunUi();
        return;
      }
      // двойной клик по открытой цифре — открыть соседей
      const t = performance.now();
      const dbl = lastClick && lastClick.x === x && lastClick.y === y && t - lastClick.t < 400;
      lastClick = { x, y, t };
      if (W.isOpen(hero.world, x, y)) {
        if (G.mobAt(hero, x, y) || G.springAt(hero, x, y)) doAction({ type: 'move', x, y });
        else if (dbl) doAction({ type: 'chord', x, y });
        return;
      }
      doAction({ type: mode === 'flag' ? 'flag' : 'open', x, y });
    });
    canvas.addEventListener('pointercancel', () => { clearTimeout(longTimer); down = null; });

    document.querySelectorAll('#mode-switch .mode').forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
    document.addEventListener('keydown', (e) => {
      if ($('screen-field').classList.contains('hidden')) return;
      if (e.key === 'Escape' && targeting) { targeting = null; renderer.targeting = false; renderRunUi(); }
      if (e.key === '1') setMode('open');
      if (e.key === '2') setMode('flag');
      if (hero.run && hero.run.phase === 'fight' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); fightAction({ type: 'attack' }); }
    });
    window.addEventListener('resize', () => renderer.resize());
  }

  // ---------- Старт ----------

  function boot() {
    initTitle();
    initCreate();
    // клик мимо окна закрывает только окна без обязательного выбора
    $('modal').addEventListener('click', (e) => { if (e.target === $('modal') && !$('modal-box').querySelector('.modal-actions .btn-gold:only-child')) closeModal(); });
    showTitle();
  }

  boot();
  // Для автотестов в браузере: текущее состояние только для чтения.
  window.MineGame = { state: () => ({ hero, run: hero && hero.run, renderer }) };
})();
