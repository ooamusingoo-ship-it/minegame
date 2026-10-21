// Все игровые данные: расы, классы, скилы, мобы, локации, предметы, квесты.
(function (root) {
  'use strict';

  const RACES = {
    human: {
      name: 'Человек', desc: 'Учится быстрее всех: +10% опыта.',
      mods: { xp: 0.10 }, skin: '#f2c9a0', hair: '#7a4a24',
    },
    elf: {
      name: 'Эльф', desc: 'Ловкий: 12% шанс увернуться от удара.',
      mods: { evade: 0.12 }, skin: '#f7dcc0', hair: '#f0d66a',
    },
    darkelf: {
      name: 'Тёмный эльф', desc: 'Смертоносный: +3% к криту, криты сильнее.',
      mods: { crit: 0.03, critMult: 0.6 }, skin: '#b9a7d6', hair: '#eef0ff',
    },
    orc: {
      name: 'Орк', desc: 'Живучий: +20% здоровья и +5% атаки.',
      mods: { hp: 0.20, atk: 0.05 }, skin: '#8fbf6a', hair: '#3a2a1a',
    },
    dwarf: {
      name: 'Гном', desc: 'Удачливый: +30% адены и +30% к шансу добычи.',
      mods: { adena: 0.30, drop: 0.30 }, skin: '#e8b88f', hair: '#c0582c',
    },
  };

  // Архетип определяет базовые характеристики и ветку скилов.
  const ARCHETYPES = {
    fighter: { hp: [70, 15], mp: [20, 4], atk: [10, 3], def: [3, 1.5], matk: [4, 1.2] },
    mystic:  { hp: [55, 11], mp: [40, 8], atk: [6, 1.8], def: [2, 1.1], matk: [11, 3.6] },
    artisan: { hp: [65, 14], mp: [26, 5], atk: [9, 2.7], def: [4, 1.7], matk: [5, 1.6] },
  };

  // Профессии: [стартовая, на 20 уровне, на 40 уровне].
  const CLASSES = {
    human: {
      fighter: { arch: 'fighter', names: ['Воин', 'Воитель', 'Полководец'] },
      mystic:  { arch: 'mystic',  names: ['Мистик', 'Волшебник', 'Чародей'] },
    },
    elf: {
      fighter: { arch: 'fighter', names: ['Воин', 'Разведчик', 'Серебряный рейнджер'] },
      mystic:  { arch: 'mystic',  names: ['Мистик', 'Оракул Евы', 'Мудрец Евы'] },
    },
    darkelf: {
      fighter: { arch: 'fighter', names: ['Воин', 'Ассасин', 'Странник Бездны'] },
      mystic:  { arch: 'mystic',  names: ['Мистик', 'Тёмный маг', 'Заклинатель ветра'] },
    },
    orc: {
      fighter: { arch: 'fighter', names: ['Воин', 'Налётчик', 'Разрушитель'] },
      mystic:  { arch: 'mystic',  names: ['Мистик', 'Шаман', 'Верховный шаман'] },
    },
    dwarf: {
      fighter: { arch: 'fighter', names: ['Воин', 'Собиратель', 'Охотник за головами'] },
      artisan: { arch: 'artisan', names: ['Ремесленник', 'Мастер', 'Кузнец'] },
    },
  };

  const PROFESSION_LEVELS = [0, 20, 40];
  const TIER_BONUS = [0, 0.10, 0.20];
  const MAX_LEVEL = 60;

  // use: 'combat' — в пошаговом бою, 'mines' — на минном поле, 'any' — где угодно.
  // kind:
  //  strike  — удар оружием ×mult
  //  magic   — магический удар ×mult (у мистика основная атака тоже магическая)
  //  scout   — безопасно проверить клетку минного поля: пустая откроется, мина обезвредится
  //  heal    — восстановить pct здоровья
  //  buff    — усиление на turns ходов боя
  //  passive — постоянный бонус
  const SKILLS = {
    // Воин
    power_strike: { arch: 'fighter', name: 'Мощный удар', icon: '⚔️', lvl: 1, tier: 0, sp: 0, mp: 5,
      use: 'combat', kind: 'strike', mult: 2.2, desc: 'Удар с силой ×2.2.' },
    iron_skin: { arch: 'fighter', name: 'Закалка', icon: '🛡️', lvl: 3, tier: 0, sp: 150,
      kind: 'passive', mods: { hp: 0.10 }, desc: 'Пассивно: +10% здоровья.' },
    danger_sense: { arch: 'fighter', name: 'Чутьё опасности', icon: '👃', lvl: 4, tier: 0, sp: 200, mp: 10,
      use: 'mines', kind: 'scout', desc: 'Минное поле: безопасно проверить клетку. Пустая откроется, мина будет обезврежена.' },
    battle_cry: { arch: 'fighter', name: 'Боевой клич', icon: '📯', lvl: 6, tier: 0, sp: 350, mp: 10,
      use: 'combat', kind: 'buff', buff: { atk: 1.5 }, turns: 3, desc: '3 хода: атака +50%.' },
    shield_stance: { arch: 'fighter', name: 'Стойка щита', icon: '🔰', lvl: 9, tier: 0, sp: 700, mp: 12,
      use: 'combat', kind: 'buff', buff: { taken: 0.5 }, turns: 3, desc: '3 хода: получаемый урон −50%.' },
    weapon_mastery: { arch: 'fighter', name: 'Мастерство оружия', icon: '🗡️', lvl: 13, tier: 0, sp: 1400,
      kind: 'passive', mods: { atk: 0.15 }, desc: 'Пассивно: +15% атаки.' },
    whirlwind: { arch: 'fighter', name: 'Вихрь клинков', icon: '🌪️', lvl: 20, tier: 1, sp: 3500, mp: 22,
      use: 'combat', kind: 'strike', mult: 3.2, desc: 'Серия ударов: урон ×3.2.' },
    titan_body: { arch: 'fighter', name: 'Тело титана', icon: '💪', lvl: 27, tier: 1, sp: 7000,
      kind: 'passive', mods: { hp: 0.20, def: 0.10 }, desc: 'Пассивно: +20% здоровья, +10% защиты.' },
    berserk: { arch: 'fighter', name: 'Ярость берсерка', icon: '🔥', lvl: 40, tier: 2, sp: 18000, mp: 35,
      use: 'combat', kind: 'buff', buff: { atk: 2, taken: 1.2 }, turns: 4, desc: '4 хода: атака ×2, но урон по вам +20%.' },
    // Мистик
    wind_strike: { arch: 'mystic', name: 'Удар ветра', icon: '🌬️', lvl: 1, tier: 0, sp: 0, mp: 6,
      use: 'combat', kind: 'magic', mult: 1.9, desc: 'Магический удар ×1.9.' },
    insight: { arch: 'mystic', name: 'Прозрение', icon: '👁️', lvl: 4, tier: 0, sp: 200, mp: 10,
      use: 'mines', kind: 'scout', desc: 'Минное поле: безопасно проверить клетку. Пустая откроется, мина будет обезврежена.' },
    heal: { arch: 'mystic', name: 'Лечение', icon: '💚', lvl: 6, tier: 0, sp: 400, mp: 14,
      use: 'any', kind: 'heal', pct: 0.35, desc: 'Восстановить 35% здоровья. Работает и в бою, и вне его.' },
    mana_flow: { arch: 'mystic', name: 'Поток маны', icon: '💧', lvl: 10, tier: 0, sp: 900,
      kind: 'passive', mods: { mp: 0.25 }, desc: 'Пассивно: +25% маны.' },
    empower: { arch: 'mystic', name: 'Усиление магии', icon: '✨', lvl: 14, tier: 0, sp: 1500,
      kind: 'passive', mods: { matk: 0.15 }, desc: 'Пассивно: +15% магической атаки.' },
    fireball: { arch: 'mystic', name: 'Огненный шар', icon: '☄️', lvl: 20, tier: 1, sp: 3500, mp: 20,
      use: 'combat', kind: 'magic', mult: 3.2, desc: 'Магический удар ×3.2.' },
    arcane_shield: { arch: 'mystic', name: 'Тайный щит', icon: '🔮', lvl: 27, tier: 1, sp: 7000, mp: 20,
      use: 'combat', kind: 'buff', buff: { taken: 0.4 }, turns: 3, desc: '3 хода: получаемый урон −60%.' },
    meteor: { arch: 'mystic', name: 'Метеор', icon: '🌠', lvl: 40, tier: 2, sp: 18000, mp: 40,
      use: 'combat', kind: 'magic', mult: 5, desc: 'Сокрушительный магический удар ×5.' },
    // Ремесленник (гном)
    hammer_blow: { arch: 'artisan', name: 'Удар молота', icon: '🔨', lvl: 1, tier: 0, sp: 0, mp: 5,
      use: 'combat', kind: 'strike', mult: 2, desc: 'Удар с силой ×2.' },
    treasure_sense: { arch: 'artisan', name: 'Чутьё кладоискателя', icon: '💎', lvl: 4, tier: 0, sp: 200, mp: 10,
      use: 'mines', kind: 'scout', desc: 'Минное поле: безопасно проверить клетку. Пустая откроется, мина будет обезврежена.' },
    repair: { arch: 'artisan', name: 'Починка брони', icon: '🔧', lvl: 8, tier: 0, sp: 600, mp: 12,
      use: 'combat', kind: 'buff', buff: { taken: 0.6 }, turns: 3, desc: '3 хода: получаемый урон −40%.' },
    thrift: { arch: 'artisan', name: 'Бережливость', icon: '💰', lvl: 10, tier: 0, sp: 900,
      kind: 'passive', mods: { adena: 0.25 }, desc: 'Пассивно: +25% адены.' },
    golem: { arch: 'artisan', name: 'Призыв голема', icon: '🗿', lvl: 20, tier: 1, sp: 3500, mp: 25,
      use: 'combat', kind: 'buff', buff: { atk: 1.3, taken: 0.5 }, turns: 4, desc: '4 хода: голем принимает половину урона, атака +30%.' },
    earthquake: { arch: 'artisan', name: 'Землетрясение', icon: '🌋', lvl: 40, tier: 2, sp: 18000, mp: 35,
      use: 'combat', kind: 'strike', mult: 4.5, desc: 'Удар по земле: урон ×4.5.' },
  };


  // Мобы. sprite — какой рисунок использовать, trophy — что выпадает для квестов.
  const MOBS = {
    slime:    { name: 'Слизень', sprite: 'slime', color: '#7bd36a', trophy: 'slime_gel' },
    wolf:     { name: 'Волк', sprite: 'wolf', color: '#9aa3ad', trophy: 'wolf_pelt' },
    goblin:   { name: 'Гоблин', sprite: 'goblin', color: '#8fbf4a', trophy: 'goblin_ear' },
    goblin_chief: { name: 'Вождь гоблинов', sprite: 'goblin', color: '#d9a43a', boss: true },
    orc:      { name: 'Орк-воин', sprite: 'orc', color: '#6f9a4a', trophy: 'orc_tusk' },
    spider:   { name: 'Паук', sprite: 'spider', color: '#5d4a7a', trophy: 'spider_silk' },
    werewolf: { name: 'Оборотень', sprite: 'wolf', color: '#6b4f3a', trophy: 'werewolf_claw' },
    orc_chief: { name: 'Атаман орков', sprite: 'orc', color: '#b04a3a', boss: true },
    bat:      { name: 'Летучая мышь', sprite: 'bat', color: '#5a4a5f', trophy: 'bat_wing' },
    lizard:   { name: 'Ящер', sprite: 'lizard', color: '#4fa38a', trophy: 'lizard_scale' },
    lizard_shaman: { name: 'Ящер-шаман', sprite: 'lizard', color: '#3b7fb5', trophy: 'shaman_totem' },
    lizard_king: { name: 'Король ящеров', sprite: 'lizard', color: '#d4b03a', boss: true },
    skeleton: { name: 'Скелет', sprite: 'skeleton', color: '#e8e2cf', trophy: 'old_bone' },
    ghost:    { name: 'Призрак', sprite: 'ghost', color: '#bfe3f2', trophy: 'ectoplasm' },
    golem:    { name: 'Каменный голем', sprite: 'golem', color: '#8c8478', trophy: 'golem_core' },
    death_knight: { name: 'Рыцарь смерти', sprite: 'skeleton', color: '#6a5a8a', boss: true },
    imp:      { name: 'Бес', sprite: 'demon', color: '#d0503a', trophy: 'imp_horn' },
    drake:    { name: 'Дрейк', sprite: 'dragon', color: '#c07a3a', trophy: 'drake_fang' },
    demon:    { name: 'Демон', sprite: 'demon', color: '#7a2a4a', trophy: 'demon_heart' },
    lava_golem: { name: 'Лавовый голем', sprite: 'golem', color: '#c4502a', trophy: 'magma_core' },
    antharas: { name: 'Антарас', sprite: 'dragon', color: '#8a6a3a', boss: true },
  };

  const TROPHIES = {
    slime_gel: { name: 'Слизь', price: 4 },
    wolf_pelt: { name: 'Волчья шкура', price: 8 },
    goblin_ear: { name: 'Ухо гоблина', price: 12 },
    orc_tusk: { name: 'Клык орка', price: 20 },
    spider_silk: { name: 'Паучий шёлк', price: 26 },
    werewolf_claw: { name: 'Коготь оборотня', price: 34 },
    bat_wing: { name: 'Крыло мыши', price: 40 },
    lizard_scale: { name: 'Чешуя ящера', price: 50 },
    shaman_totem: { name: 'Тотем шамана', price: 64 },
    old_bone: { name: 'Древняя кость', price: 75 },
    ectoplasm: { name: 'Эктоплазма', price: 90 },
    golem_core: { name: 'Ядро голема', price: 110 },
    imp_horn: { name: 'Рог беса', price: 120 },
    drake_fang: { name: 'Клык дрейка', price: 145 },
    demon_heart: { name: 'Сердце демона', price: 170 },
    magma_core: { name: 'Ядро магмы', price: 200 },
  };

  // Кольца леса вокруг города. from — расстояние от города, с которого начинается кольцо;
  // pool — мобы лагерей по «силе» (сила влияет на уровень), boss — в лагерях боссов этого кольца.
  // min/max — рекомендуемые уровни героя.
  const ZONES = [
    { id: 'island', name: 'Говорящий остров', from: 0, min: 1, max: 10,
      pool: [{ type: 'slime', power: 1 }, { type: 'wolf', power: 2 }, { type: 'goblin', power: 3 }],
      boss: { type: 'goblin_chief' },
      theme: { top: '#8ed46f', top2: '#7fc962', side: '#5b9a45', open: '#efe0b4', open2: '#e6d4a2', openSide: '#c7ae74', sky1: '#bfe8ff', sky2: '#e9f8ff' } },
    { id: 'gludio', name: 'Окрестности Глудио', from: 25, min: 11, max: 20,
      pool: [{ type: 'orc', power: 1 }, { type: 'spider', power: 2 }, { type: 'werewolf', power: 3 }],
      boss: { type: 'orc_chief' },
      theme: { top: '#b7c96a', top2: '#a8bd5c', side: '#7d8f3e', open: '#e9d7ad', open2: '#dfcb9c', openSide: '#b99e6c', sky1: '#ffe2b8', sky2: '#fff4e2' } },
    { id: 'cave', name: 'Пещера ящеров', from: 50, min: 21, max: 32,
      pool: [{ type: 'bat', power: 1 }, { type: 'lizard', power: 2 }, { type: 'lizard_shaman', power: 3 }],
      boss: { type: 'lizard_king' },
      theme: { top: '#7fa6a0', top2: '#729891', side: '#4f6f6a', open: '#d8d2c0', open2: '#cdc6b2', openSide: '#a19a86', sky1: '#9fc2c8', sky2: '#d6ecee' } },
    { id: 'ruins', name: 'Руины Отчаяния', from: 80, min: 33, max: 46,
      pool: [{ type: 'skeleton', power: 1 }, { type: 'ghost', power: 2 }, { type: 'golem', power: 4 }],
      boss: { type: 'death_knight' },
      theme: { top: '#a99cc0', top2: '#9c8fb4', side: '#6e6288', open: '#e0d9e8', open2: '#d4cbdf', openSide: '#a89cb8', sky1: '#c9bde6', sky2: '#efeaf8' } },
    { id: 'lair', name: 'Логово дракона', from: 115, min: 47, max: 80,
      pool: [{ type: 'imp', power: 1 }, { type: 'drake', power: 2 }, { type: 'demon', power: 3 }, { type: 'lava_golem', power: 4 }],
      boss: { type: 'antharas' },
      theme: { top: '#c9866a', top2: '#bd7a5e', side: '#8a4f3a', open: '#f0d6c4', open2: '#e6c8b3', openSide: '#b88d74', sky1: '#ffc4a8', sky2: '#fff0e6' } },
  ];

  // Бесконечный лес. d — расстояние от города (по большей из координат).
  const WORLD = {
    townRadius: 3,          // открытая площадь города
    safeRadius: 5,          // до этого расстояния мин нет — первые шаги безопасны
    region: 12,             // мир поделён на области; в области может быть поляна
    clearingChance: 0.7,
    clearingMin: 5,
    clearingMax: 7,
    bossFrom: 20,           // лагеря боссов не ближе этого расстояния
    bossChance: 0.12,
    springChance: 0.15,
    densityBase: 0.18,      // доля мин у города
    densityPerCell: 0.0006, // рост доли мин с расстоянием
    maxDensity: 0.24,
    levelPerCell: 0.4,      // уровень мобов ≈ 1 + 0.4·d
    minePct: 0.25,          // урон от мины — доля макс. HP
    minePctPerCell: 0.0015,
    maxMinePct: 0.40,
    springHeal: 0.40,
    treasureChance: 0.012,  // сундучок в лесу
    cellXpDiv: 20,          // опыт за клетку = опыт моба / 20
    floodLimit: 20000,
    chunk: 16,              // размер блока при сохранении
  };

  // Вероятность вида моба по его силе.
  const POWER_WEIGHTS = { 1: 45, 2: 30, 3: 18, 4: 7 };


  // Снаряжение: 6 грейдов, 4 линейки.
  const GRADES = [
    { id: 'NG', name: 'Без грейда', lvl: 1, price: 50 },
    { id: 'D', name: 'D', lvl: 10, price: 1500 },
    { id: 'C', name: 'C', lvl: 20, price: 7000 },
    { id: 'B', name: 'B', lvl: 30, price: 24000 },
    { id: 'A', name: 'A', lvl: 40, price: 70000 },
    { id: 'S', name: 'S', lvl: 50, price: 180000 },
  ];
  const GEAR_LINES = {
    sword: { slot: 'weapon', names: ['Короткий меч', 'Меч Революции', 'Самурайский меч', 'Дамасский меч', 'Клинок Тёмного Легиона', 'Забытый клинок'],
      stats: (g) => ({ atk: [3, 10, 20, 32, 46, 62][g] }) },
    staff: { slot: 'weapon', names: ['Посох ученика', 'Посох мага', 'Посох Гомункула', 'Посох Духов', 'Посох Тёмного Легиона', 'Посох Арканы'],
      stats: (g) => ({ atk: [1, 4, 8, 13, 18, 25][g], matk: [4, 13, 26, 42, 60, 80][g] }) },
    armor: { slot: 'armor', names: ['Кожаная куртка', 'Кольчуга', 'Доспех Кармы', 'Доспех Голубого Волка', 'Доспех Тёмного Кристалла', 'Драконий доспех'],
      stats: (g) => ({ def: [2, 7, 14, 23, 33, 45][g], hp: [10, 40, 90, 150, 230, 320][g] }) },
    jewel: { slot: 'jewel', names: ['Медное ожерелье', 'Ожерелье Знаний', 'Ожерелье Феникса', 'Ожерелье Чёрного Ордена', 'Ожерелье Величия', 'Ожерелье Тайн'],
      stats: (g) => ({ mp: [10, 30, 60, 100, 150, 210][g], crit: [0, 0.01, 0.02, 0.03, 0.04, 0.05][g] }) },
  };

  const GEAR = {};
  Object.keys(GEAR_LINES).forEach((line) => {
    GRADES.forEach((gr, g) => {
      const id = line + '_' + gr.id;
      GEAR[id] = {
        id, line, grade: g, slot: GEAR_LINES[line].slot, name: GEAR_LINES[line].names[g],
        lvl: gr.lvl, price: gr.price * (line === 'jewel' ? 0.7 : 1), stats: GEAR_LINES[line].stats(g),
      };
    });
  });

  const POTIONS = {
    hp_potion: { name: 'Зелье здоровья', icon: '🧪', price: 40, heal: 'hp', pct: 0.4, desc: 'Восстанавливает 40% здоровья.' },
    mp_potion: { name: 'Зелье маны', icon: '🔷', price: 50, heal: 'mp', pct: 0.5, desc: 'Восстанавливает 50% маны.' },
  };

  // Квесты. Типы: kill (убить N мобов вида), collect (принести трофеи), clean (N клеток подряд без подрыва),
  // distance (уйти от города на N клеток), boss (убить босса кольца), profession (смена профессии).
  const QUESTS = [];
  ZONES.forEach((z, i) => {
    const s = z.min;
    const k = 1 + s * s * 0.15;
    const p1 = z.pool[0], p2 = z.pool[1], p3 = z.pool[2];
    QUESTS.push({ id: z.id + '_kill', zone: z.id, lvl: s, type: 'kill', target: p1.type, count: 8,
      name: 'Охота: ' + MOBS[p1.type].name, desc: 'Убейте 8 мобов «' + MOBS[p1.type].name + '» в лагерях кольца «' + z.name + '».',
      reward: { xp: Math.round(120 * k), adena: 80 + s * 30, items: { hp_potion: 2 } } });
    QUESTS.push({ id: z.id + '_clean', zone: z.id, lvl: s, type: 'clean', count: 40,
      name: 'Сапёр', desc: 'В кольце «' + z.name + '» откройте 40 клеток подряд, ни разу не подорвавшись.',
      reward: { xp: Math.round(200 * k), adena: 150 + s * 50, items: { hp_potion: 3 } } });
    QUESTS.push({ id: z.id + '_collect', zone: z.id, lvl: s + 2, type: 'collect', target: MOBS[p2.type].trophy, count: 5,
      name: 'Сбор: ' + TROPHIES[MOBS[p2.type].trophy].name, desc: 'Принесите в город 5 шт. «' + TROPHIES[MOBS[p2.type].trophy].name + '» (выпадает с моба «' + MOBS[p2.type].name + '»).',
      reward: { xp: Math.round(220 * k), adena: 150 + s * 50, items: { mp_potion: 2 } } });
    QUESTS.push({ id: z.id + '_far1', zone: z.id, lvl: s + 1, type: 'distance', count: z.from + 15,
      name: 'Вглубь леса', desc: 'Уйдите от города на ' + (z.from + 15) + ' клеток.',
      reward: { xp: Math.round(300 * k), adena: 250 + s * 70 } });
    QUESTS.push({ id: z.id + '_elite', zone: z.id, lvl: s + 4, type: 'kill', target: p3.type, count: 4,
      name: 'Опасная добыча', desc: 'Убейте 4 мобов «' + MOBS[p3.type].name + '».',
      reward: { xp: Math.round(320 * k), adena: 250 + s * 70 } });
    QUESTS.push({ id: z.id + '_boss', zone: z.id, lvl: s + 5, type: 'boss', target: z.boss.type, count: 1,
      name: 'Голова босса: ' + MOBS[z.boss.type].name, desc: 'Найдите в кольце «' + z.name + '» лагерь босса (поляна с короной) и победите ' + MOBS[z.boss.type].name + '.',
      reward: { xp: Math.round(700 * k), adena: 600 + s * 150, gear: i + 1 } });
    QUESTS.push({ id: z.id + '_far2', zone: z.id, lvl: s + 6, type: 'distance', count: z.from + 30,
      name: 'Бездна зовёт', desc: 'Уйдите от города на ' + (z.from + 30) + ' клеток.',
      reward: { xp: Math.round(900 * k), adena: 800 + s * 200, items: { hp_potion: 5, mp_potion: 3 } } });
  });
  QUESTS.push({ id: 'prof_1', zone: 'gludio', lvl: 20, type: 'profession', tier: 1, target: 'orc_chief', count: 1,
    name: 'Испытание: первая профессия', desc: 'Найдите лагерь Атамана орков в Окрестностях Глудио (25–50 клеток от города) и победите его.',
    reward: { xp: 5000, adena: 3000, tier: 1 } });
  QUESTS.push({ id: 'prof_2', zone: 'ruins', lvl: 40, type: 'profession', tier: 2, target: 'death_knight', count: 1,
    name: 'Испытание: вторая профессия', desc: 'Найдите лагерь Рыцаря смерти в Руинах Отчаяния (80–115 клеток от города) и победите его.',
    reward: { xp: 60000, adena: 30000, tier: 2 } });

  const MAX_ACTIVE_QUESTS = 3;

  const DATA = {
    RACES, ARCHETYPES, CLASSES, PROFESSION_LEVELS, TIER_BONUS, MAX_LEVEL, SKILLS, MOBS, TROPHIES,
    ZONES, WORLD, POWER_WEIGHTS, GRADES, GEAR, POTIONS, QUESTS, MAX_ACTIVE_QUESTS,
  };
  root.DATA = DATA;
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
