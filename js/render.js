// Изометрическая отрисовка поля, мобов, героя и эффектов на <canvas>. Все рисунки — кодом.
(function (root) {
  'use strict';

  const D = root.DATA;

  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) >>> 0;
    h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
    return (h ^ (h >>> 16)) / 4294967296;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
    r = f(r); g = f(g); b = f(b);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  // ---------- Спрайты ----------

  function ellipse(ctx, x, y, rx, ry, fill, stroke) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function eyes(ctx, x, y, gap, r, color) {
    ellipse(ctx, x - gap, y, r, r * 1.15, '#fff');
    ellipse(ctx, x + gap, y, r, r * 1.15, '#fff');
    ellipse(ctx, x - gap + r * 0.25, y + r * 0.15, r * 0.55, r * 0.65, color || '#222');
    ellipse(ctx, x + gap + r * 0.25, y + r * 0.15, r * 0.55, r * 0.65, color || '#222');
  }

  function shadow(ctx, x, y, s) {
    ellipse(ctx, x, y, s * 0.55, s * 0.18, 'rgba(0,0,0,0.22)');
  }

  function line(ctx, pts, color, w) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function poly(ctx, pts, fill, stroke, w) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = w || 1; ctx.stroke(); }
  }

  // Каждый спрайт рисуется «ногами» в точке (x, y), s — базовый размер.
  const SPRITES = {
    slime(ctx, x, y, s, t, c) {
      const sq = Math.sin(t * 4) * 0.06;
      const w = s * (0.48 + sq), h = s * (0.42 - sq);
      ctx.beginPath();
      ctx.moveTo(x - w, y);
      ctx.bezierCurveTo(x - w, y - h * 1.4, x + w, y - h * 1.4, x + w, y);
      ctx.closePath();
      ctx.fillStyle = c; ctx.fill();
      ctx.strokeStyle = shade(c, -0.35); ctx.lineWidth = s * 0.03; ctx.stroke();
      ellipse(ctx, x - w * 0.4, y - h * 0.8, w * 0.18, h * 0.14, 'rgba(255,255,255,0.6)');
      eyes(ctx, x, y - h * 0.55, s * 0.12, s * 0.07);
    },
    wolf(ctx, x, y, s, t, c) {
      const b = Math.sin(t * 6) * s * 0.02;
      const dk = shade(c, -0.3);
      line(ctx, [x - s * 0.35, y - s * 0.32, x - s * 0.55, y - s * 0.5], dk, s * 0.09);
      [-0.25, -0.1, 0.12, 0.27].forEach((o) => line(ctx, [x + s * o, y - s * 0.2, x + s * o, y], dk, s * 0.07));
      ellipse(ctx, x, y - s * 0.3 + b, s * 0.38, s * 0.17, c);
      ellipse(ctx, x + s * 0.33, y - s * 0.45 + b, s * 0.17, s * 0.15, c);
      poly(ctx, [x + s * 0.24, y - s * 0.55 + b, x + s * 0.28, y - s * 0.72 + b, x + s * 0.35, y - s * 0.57 + b], dk);
      poly(ctx, [x + s * 0.36, y - s * 0.57 + b, x + s * 0.43, y - s * 0.72 + b, x + s * 0.46, y - s * 0.52 + b], dk);
      ellipse(ctx, x + s * 0.48, y - s * 0.4 + b, s * 0.09, s * 0.06, shade(c, 0.2));
      ellipse(ctx, x + s * 0.56, y - s * 0.41 + b, s * 0.03, s * 0.03, '#222');
      ellipse(ctx, x + s * 0.36, y - s * 0.48 + b, s * 0.035, s * 0.04, '#ffd23a');
    },
    goblin(ctx, x, y, s, t, c) { humanoid(ctx, x, y, s * 0.85, t, c, { ears: true, club: true, cloth: '#7a5a3a' }); },
    orc(ctx, x, y, s, t, c) { humanoid(ctx, x, y, s * 1.05, t, c, { tusks: true, axe: true, cloth: '#5a4636' }); },
    lizard(ctx, x, y, s, t, c) {
      line(ctx, [x - s * 0.1, y - s * 0.2, x - s * 0.45, y - s * 0.05, x - s * 0.55, y - s * 0.15], shade(c, -0.15), s * 0.1);
      humanoid(ctx, x, y, s, t, c, { snout: true, spear: true, cloth: '#8a6a3a' });
    },
    skeleton(ctx, x, y, s, t, c) { humanoid(ctx, x, y, s, t, c, { skull: true, sword: true, cloth: null }); },
    demon(ctx, x, y, s, t, c) {
      const f = Math.sin(t * 5) * 0.15;
      poly(ctx, [x - s * 0.15, y - s * 0.6, x - s * 0.6, y - s * (0.95 + f), x - s * 0.5, y - s * 0.45], shade(c, -0.3));
      poly(ctx, [x + s * 0.15, y - s * 0.6, x + s * 0.6, y - s * (0.95 + f), x + s * 0.5, y - s * 0.45], shade(c, -0.3));
      humanoid(ctx, x, y, s, t, c, { horns: true, cloth: '#2a1a2a', glow: '#ffdd44' });
    },
    spider(ctx, x, y, s, t, c) {
      const dk = shade(c, -0.35);
      for (let i = 0; i < 4; i++) {
        const k = Math.sin(t * 8 + i) * s * 0.03;
        const yy = y - s * 0.18 + i * s * 0.05;
        line(ctx, [x - s * 0.1, y - s * 0.22, x - s * 0.35, yy - s * 0.18 + k, x - s * 0.5, yy + s * 0.12], dk, s * 0.045);
        line(ctx, [x + s * 0.1, y - s * 0.22, x + s * 0.35, yy - s * 0.18 - k, x + s * 0.5, yy + s * 0.12], dk, s * 0.045);
      }
      ellipse(ctx, x, y - s * 0.3, s * 0.27, s * 0.22, c);
      ellipse(ctx, x, y - s * 0.12, s * 0.15, s * 0.12, shade(c, 0.1));
      [-0.07, -0.025, 0.025, 0.07].forEach((o) => ellipse(ctx, x + s * o, y - s * 0.13, s * 0.025, s * 0.025, '#ff4040'));
    },
    bat(ctx, x, y, s, t, c) {
      const f = Math.sin(t * 12) * 0.25;
      const yy = y - s * 0.55 + Math.sin(t * 3) * s * 0.05;
      poly(ctx, [x, yy, x - s * 0.55, yy - s * (0.2 + f), x - s * 0.4, yy + s * 0.05, x - s * 0.25, yy - s * 0.02], shade(c, -0.15));
      poly(ctx, [x, yy, x + s * 0.55, yy - s * (0.2 + f), x + s * 0.4, yy + s * 0.05, x + s * 0.25, yy - s * 0.02], shade(c, -0.15));
      ellipse(ctx, x, yy, s * 0.16, s * 0.18, c);
      poly(ctx, [x - s * 0.12, yy - s * 0.12, x - s * 0.08, yy - s * 0.28, x - s * 0.02, yy - s * 0.14], c);
      poly(ctx, [x + s * 0.12, yy - s * 0.12, x + s * 0.08, yy - s * 0.28, x + s * 0.02, yy - s * 0.14], c);
      eyes(ctx, x, yy - s * 0.03, s * 0.06, s * 0.04, '#d02020');
    },
    ghost(ctx, x, y, s, t, c) {
      const yy = y - s * 0.15 + Math.sin(t * 2.5) * s * 0.06;
      ctx.globalAlpha *= 0.85;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.3, yy);
      ctx.bezierCurveTo(x - s * 0.35, yy - s * 0.9, x + s * 0.35, yy - s * 0.9, x + s * 0.3, yy);
      for (let i = 0; i < 4; i++) {
        const xx = x + s * 0.3 - (i + 0.5) * s * 0.15;
        ctx.quadraticCurveTo(xx, yy - s * (0.08 + 0.06 * Math.sin(t * 6 + i)), xx - s * 0.075, yy);
      }
      ctx.closePath();
      ctx.fillStyle = c; ctx.fill();
      ctx.globalAlpha /= 0.85;
      ellipse(ctx, x - s * 0.1, yy - s * 0.5, s * 0.06, s * 0.09, '#2a3a5a');
      ellipse(ctx, x + s * 0.1, yy - s * 0.5, s * 0.06, s * 0.09, '#2a3a5a');
      ellipse(ctx, x, yy - s * 0.32, s * 0.05, s * 0.07, '#2a3a5a');
    },
    golem(ctx, x, y, s, t, c) {
      const b = Math.sin(t * 2) * s * 0.02;
      const dk = shade(c, -0.3);
      poly(ctx, [x - s * 0.3, y, x - s * 0.15, y, x - s * 0.15, y - s * 0.3, x - s * 0.3, y - s * 0.3], dk);
      poly(ctx, [x + s * 0.15, y, x + s * 0.3, y, x + s * 0.3, y - s * 0.3, x + s * 0.15, y - s * 0.3], dk);
      poly(ctx, [x - s * 0.38, y - s * 0.25 + b, x + s * 0.38, y - s * 0.25 + b, x + s * 0.32, y - s * 0.75 + b, x - s * 0.32, y - s * 0.75 + b], c, dk, s * 0.03);
      poly(ctx, [x - s * 0.58, y - s * 0.3 + b, x - s * 0.4, y - s * 0.3 + b, x - s * 0.38, y - s * 0.7 + b, x - s * 0.55, y - s * 0.65 + b], c, dk, s * 0.03);
      poly(ctx, [x + s * 0.58, y - s * 0.3 + b, x + s * 0.4, y - s * 0.3 + b, x + s * 0.38, y - s * 0.7 + b, x + s * 0.55, y - s * 0.65 + b], c, dk, s * 0.03);
      poly(ctx, [x - s * 0.18, y - s * 0.75 + b, x + s * 0.18, y - s * 0.75 + b, x + s * 0.15, y - s * 0.98 + b, x - s * 0.15, y - s * 0.98 + b], shade(c, 0.1), dk, s * 0.03);
      ellipse(ctx, x - s * 0.07, y - s * 0.87 + b, s * 0.035, s * 0.025, '#7af0ff');
      ellipse(ctx, x + s * 0.07, y - s * 0.87 + b, s * 0.035, s * 0.025, '#7af0ff');
      line(ctx, [x - s * 0.1, y - s * 0.6 + b, x + s * 0.05, y - s * 0.45 + b, x - s * 0.02, y - s * 0.35 + b], dk, s * 0.02);
    },
    dragon(ctx, x, y, s, t, c) {
      const f = Math.sin(t * 3) * 0.12;
      const dk = shade(c, -0.3);
      line(ctx, [x - s * 0.25, y - s * 0.2, x - s * 0.6, y - s * 0.1, x - s * 0.7, y - s * 0.3], c, s * 0.12);
      poly(ctx, [x - s * 0.05, y - s * 0.55, x - s * 0.55, y - s * (1.05 + f), x - s * 0.3, y - s * 0.75, x - s * 0.5, y - s * 0.6], dk);
      ellipse(ctx, x - s * 0.02, y - s * 0.3, s * 0.36, s * 0.25, c);
      ellipse(ctx, x + s * 0.02, y - s * 0.24, s * 0.22, s * 0.15, shade(c, 0.35));
      line(ctx, [x + s * 0.18, y - s * 0.4, x + s * 0.3, y - s * 0.7], c, s * 0.15);
      ellipse(ctx, x + s * 0.36, y - s * 0.75, s * 0.17, s * 0.12, c);
      poly(ctx, [x + s * 0.3, y - s * 0.85, x + s * 0.24, y - s * 1.0, x + s * 0.36, y - s * 0.86], '#f2e6c8');
      ellipse(ctx, x + s * 0.4, y - s * 0.79, s * 0.03, s * 0.035, '#ffd23a');
      poly(ctx, [x + s * 0.12, y - s * 0.55, x + s * 0.7, y - s * (1.05 + f), x + s * 0.5, y - s * 0.7, x + s * 0.55, y - s * 0.5], shade(c, -0.15));
      [-0.18, 0.15].forEach((o) => line(ctx, [x + s * o, y - s * 0.12, x + s * o, y], dk, s * 0.09));
    },
  };

  function humanoid(ctx, x, y, s, t, c, o) {
    const b = Math.sin(t * 4) * s * 0.02;
    const dk = shade(c, -0.3);
    const cloth = o.cloth === null ? c : (o.cloth || shade(c, -0.4));
    line(ctx, [x - s * 0.1, y - s * 0.3, x - s * 0.11, y], o.skull ? c : dk, s * 0.09);
    line(ctx, [x + s * 0.1, y - s * 0.3, x + s * 0.11, y], o.skull ? c : dk, s * 0.09);
    if (o.skull) {
      line(ctx, [x, y - s * 0.32, x, y - s * 0.62 + b], c, s * 0.06);
      [0.4, 0.47, 0.54].forEach((k) => line(ctx, [x - s * 0.13, y - s * k + b, x + s * 0.13, y - s * k + b], c, s * 0.04));
    } else {
      poly(ctx, [x - s * 0.2, y - s * 0.28 + b, x + s * 0.2, y - s * 0.28 + b, x + s * 0.16, y - s * 0.62 + b, x - s * 0.16, y - s * 0.62 + b], cloth);
    }
    line(ctx, [x - s * 0.16, y - s * 0.58 + b, x - s * 0.3, y - s * 0.38 + b], o.skull ? c : c, s * 0.08);
    line(ctx, [x + s * 0.16, y - s * 0.58 + b, x + s * 0.32, y - s * 0.42 + b], c, s * 0.08);
    // оружие
    if (o.club) line(ctx, [x + s * 0.32, y - s * 0.42 + b, x + s * 0.45, y - s * 0.75 + b], '#7a4a24', s * 0.09);
    if (o.axe) {
      line(ctx, [x + s * 0.32, y - s * 0.42 + b, x + s * 0.36, y - s * 0.95 + b], '#6a4a2a', s * 0.05);
      poly(ctx, [x + s * 0.36, y - s * 0.92 + b, x + s * 0.55, y - s * 0.98 + b, x + s * 0.55, y - s * 0.72 + b, x + s * 0.36, y - s * 0.78 + b], '#c8ccd4', '#777', s * 0.02);
    }
    if (o.spear) {
      line(ctx, [x + s * 0.32, y - s * 0.1, x + s * 0.32, y - s * 1.05 + b], '#7a5a3a', s * 0.04);
      poly(ctx, [x + s * 0.32, y - s * 1.2 + b, x + s * 0.27, y - s * 1.03 + b, x + s * 0.37, y - s * 1.03 + b], '#d8dce4');
    }
    if (o.sword) {
      line(ctx, [x + s * 0.32, y - s * 0.42 + b, x + s * 0.5, y - s * 0.85 + b], '#d8dce4', s * 0.05);
      line(ctx, [x + s * 0.27, y - s * 0.47 + b, x + s * 0.37, y - s * 0.37 + b], '#8a6a2a', s * 0.05);
    }
    // голова
    const hy = y - s * 0.78 + b;
    if (o.ears) {
      poly(ctx, [x - s * 0.15, hy, x - s * 0.38, hy - s * 0.12, x - s * 0.15, hy + s * 0.07], c);
      poly(ctx, [x + s * 0.15, hy, x + s * 0.38, hy - s * 0.12, x + s * 0.15, hy + s * 0.07], c);
    }
    if (o.horns) {
      poly(ctx, [x - s * 0.12, hy - s * 0.12, x - s * 0.22, hy - s * 0.38, x - s * 0.03, hy - s * 0.17], '#f0e6d0');
      poly(ctx, [x + s * 0.12, hy - s * 0.12, x + s * 0.22, hy - s * 0.38, x + s * 0.03, hy - s * 0.17], '#f0e6d0');
    }
    ellipse(ctx, x, hy, s * 0.19, s * 0.18, c, dk);
    if (o.snout) ellipse(ctx, x + s * 0.12, hy + s * 0.05, s * 0.13, s * 0.08, c);
    if (o.skull) {
      ellipse(ctx, x - s * 0.07, hy, s * 0.05, s * 0.06, '#2a2a2a');
      ellipse(ctx, x + s * 0.07, hy, s * 0.05, s * 0.06, '#2a2a2a');
      line(ctx, [x - s * 0.06, hy + s * 0.1, x + s * 0.06, hy + s * 0.1], '#2a2a2a', s * 0.025);
    } else if (o.glow) {
      ellipse(ctx, x - s * 0.07, hy, s * 0.045, s * 0.03, o.glow);
      ellipse(ctx, x + s * 0.07, hy, s * 0.045, s * 0.03, o.glow);
    } else {
      eyes(ctx, x + (o.snout ? s * 0.03 : 0), hy - s * 0.02, s * 0.07, s * 0.05, o.ears ? '#c02020' : '#222');
    }
    if (o.tusks) {
      poly(ctx, [x - s * 0.08, hy + s * 0.1, x - s * 0.1, hy + s * 0.01, x - s * 0.04, hy + s * 0.09], '#fff8e0');
      poly(ctx, [x + s * 0.08, hy + s * 0.1, x + s * 0.1, hy + s * 0.01, x + s * 0.04, hy + s * 0.09], '#fff8e0');
    }
  }

  function crown(ctx, x, y, s) {
    poly(ctx, [x - s * 0.16, y, x - s * 0.18, y - s * 0.16, x - s * 0.08, y - s * 0.07, x, y - s * 0.2,
      x + s * 0.08, y - s * 0.07, x + s * 0.18, y - s * 0.16, x + s * 0.16, y], '#ffd23a', '#b8860b', s * 0.02);
  }

  function drawMob(ctx, type, x, y, s, t, opts) {
    opts = opts || {};
    const m = D.MOBS[type];
    const scale = (m.boss ? 1.35 : 1) * (opts.scale || 1);
    const sz = s * scale;
    ctx.save();
    ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
    shadow(ctx, x, y, sz);
    // вспышка при ударе — осветление спрайта
    if (opts.flash && 'filter' in ctx) ctx.filter = 'brightness(' + (1 + opts.flash * 1.6).toFixed(2) + ')';
    (SPRITES[m.sprite] || SPRITES.slime)(ctx, x, y, sz, t + (opts.phase || 0), m.color);
    if ('filter' in ctx) ctx.filter = 'none';
    if (m.boss) {
      const top = { dragon: 1.0, golem: 1.0, bat: 0.85, ghost: 0.75, wolf: 0.7, spider: 0.5, slime: 0.55 }[m.sprite] || 1.0;
      crown(ctx, x, y - sz * top, sz);
    }
    ctx.restore();
  }

  // Герой: голова/уши/волосы по расе, одежда и оружие по архетипу.
  function drawHero(ctx, x, y, s, t, race, arch) {
    const R = D.RACES[race];
    const b = Math.abs(Math.sin(t * 3)) * s * 0.04;
    const dwarf = race === 'dwarf';
    const k = dwarf ? 0.82 : 1;
    const body = { fighter: '#4f7fc4', mystic: '#8a55c8', artisan: '#a8743a' }[arch];
    const trim = { fighter: '#c9d4e6', mystic: '#f2d36b', artisan: '#e0c08a' }[arch];
    shadow(ctx, x, y, s);
    line(ctx, [x - s * 0.09, y - s * 0.28 * k, x - s * 0.1, y], '#3a3a4a', s * 0.09);
    line(ctx, [x + s * 0.09, y - s * 0.28 * k, x + s * 0.1, y], '#3a3a4a', s * 0.09);
    const by = y - b;
    if (arch === 'mystic') {
      poly(ctx, [x - s * 0.24, by - s * 0.05, x + s * 0.24, by - s * 0.05, x + s * 0.15, by - s * 0.62 * k, x - s * 0.15, by - s * 0.62 * k], body, shade(body, -0.3), s * 0.02);
    } else {
      poly(ctx, [x - s * 0.2, by - s * 0.26 * k, x + s * 0.2, by - s * 0.26 * k, x + s * 0.17, by - s * 0.62 * k, x - s * 0.17, by - s * 0.62 * k], body, shade(body, -0.3), s * 0.02);
      line(ctx, [x - s * 0.19, by - s * 0.3 * k, x + s * 0.19, by - s * 0.3 * k], trim, s * 0.04);
    }
    line(ctx, [x - s * 0.17, by - s * 0.58 * k, x - s * 0.3, by - s * 0.36 * k], body, s * 0.08);
    line(ctx, [x + s * 0.17, by - s * 0.58 * k, x + s * 0.3, by - s * 0.4 * k], body, s * 0.08);
    // оружие
    if (arch === 'fighter') {
      line(ctx, [x + s * 0.3, by - s * 0.4 * k, x + s * 0.48, by - s * 0.95 * k], '#e6eaf2', s * 0.06);
      line(ctx, [x + s * 0.24, by - s * 0.44 * k, x + s * 0.37, by - s * 0.36 * k], '#c8a03a', s * 0.05);
    } else if (arch === 'mystic') {
      line(ctx, [x + s * 0.32, by + s * 0.02, x + s * 0.36, by - s * 1.0], '#8a5a2a', s * 0.05);
      ellipse(ctx, x + s * 0.36, by - s * 1.04, s * 0.08, s * 0.08, '#7af0ff');
      ellipse(ctx, x + s * 0.34, by - s * 1.06, s * 0.03, s * 0.03, '#fff');
    } else {
      line(ctx, [x + s * 0.3, by - s * 0.4 * k, x + s * 0.4, by - s * 0.8 * k], '#7a4a24', s * 0.05);
      poly(ctx, [x + s * 0.3, by - s * 0.78 * k, x + s * 0.52, by - s * 0.86 * k, x + s * 0.5, by - s * 0.72 * k, x + s * 0.32, by - s * 0.66 * k], '#9aa0aa', '#666', s * 0.02);
    }
    // голова
    const hy = by - s * 0.8 * k;
    if (race === 'elf' || race === 'darkelf') {
      poly(ctx, [x - s * 0.17, hy, x - s * 0.36, hy - s * 0.14, x - s * 0.16, hy + s * 0.06], R.skin);
      poly(ctx, [x + s * 0.17, hy, x + s * 0.36, hy - s * 0.14, x + s * 0.16, hy + s * 0.06], R.skin);
    }
    ellipse(ctx, x, hy, s * 0.21, s * 0.2, R.skin, shade(R.skin, -0.3));
    // волосы
    ctx.beginPath();
    ctx.ellipse(x, hy - s * 0.04, s * 0.22, s * 0.18, 0, Math.PI, Math.PI * 2);
    ctx.fillStyle = R.hair; ctx.fill();
    if (race === 'elf' || race === 'darkelf') {
      poly(ctx, [x - s * 0.21, hy - s * 0.06, x - s * 0.24, hy + s * 0.22, x - s * 0.12, hy + s * 0.02], R.hair);
      poly(ctx, [x + s * 0.21, hy - s * 0.06, x + s * 0.24, hy + s * 0.22, x + s * 0.12, hy + s * 0.02], R.hair);
    }
    eyes(ctx, x, hy + s * 0.02, s * 0.075, s * 0.05, race === 'darkelf' ? '#c03050' : '#2a2a5a');
    if (race === 'orc') {
      poly(ctx, [x - s * 0.08, hy + s * 0.15, x - s * 0.1, hy + s * 0.06, x - s * 0.04, hy + s * 0.13], '#fff8e0');
      poly(ctx, [x + s * 0.08, hy + s * 0.15, x + s * 0.1, hy + s * 0.06, x + s * 0.04, hy + s * 0.13], '#fff8e0');
    }
    if (dwarf) {
      ctx.beginPath();
      ctx.moveTo(x - s * 0.18, hy + s * 0.05);
      ctx.quadraticCurveTo(x, hy + s * 0.42, x + s * 0.18, hy + s * 0.05);
      ctx.fillStyle = R.hair; ctx.fill();
    }
    if (arch === 'mystic') {
      poly(ctx, [x - s * 0.25, hy - s * 0.1, x + s * 0.25, hy - s * 0.1, x + s * 0.05, hy - s * 0.48], body, shade(body, -0.3), s * 0.02);
    } else if (arch === 'fighter') {
      ctx.beginPath();
      ctx.ellipse(x, hy - s * 0.06, s * 0.23, s * 0.17, 0, Math.PI, Math.PI * 2);
      ctx.fillStyle = '#c9d4e6'; ctx.fill();
      ctx.strokeStyle = '#7a8aa4'; ctx.lineWidth = s * 0.02; ctx.stroke();
    }
  }

  // ---------- Лес: вид сверху ----------

  function drawMine(ctx, x, y, s, dim) {
    ctx.save();
    if (dim) ctx.globalAlpha = 0.5;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      line(ctx, [x, y, x + Math.cos(a) * s * 0.4, y + Math.sin(a) * s * 0.4], '#2a2a2a', s * 0.07);
    }
    ellipse(ctx, x, y, s * 0.27, s * 0.27, '#2a2a33');
    ellipse(ctx, x - s * 0.08, y - s * 0.08, s * 0.07, s * 0.07, 'rgba(255,255,255,0.6)');
    ctx.restore();
  }

  function drawFlag(ctx, x, y, s, t) {
    const wave = Math.sin(t * 5 + x) * s * 0.03;
    ellipse(ctx, x, y + s * 0.3, s * 0.12, s * 0.05, 'rgba(0,0,0,0.3)');
    line(ctx, [x - s * 0.1, y + s * 0.3, x - s * 0.1, y - s * 0.32], '#5a4030', s * 0.07);
    poly(ctx, [x - s * 0.1, y - s * 0.32, x + s * 0.28, y - s * 0.2 + wave, x - s * 0.1, y - s * 0.06], '#e0403a', '#9a2020', s * 0.025);
  }

  function lerpColor(a, b, k) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (p, sh) => (p >> sh) & 255;
    const m = (sh) => Math.round(ch(pa, sh) + (ch(pb, sh) - ch(pa, sh)) * k);
    return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
  }

  // Цвета кольца по расстоянию от города; на границах колец цвета плавно перетекают.
  const themeCache = new Map();
  function themeAt(d) {
    if (themeCache.has(d)) return themeCache.get(d);
    const W = root.World;
    const i = W.ringIndex(d);
    let th = D.ZONES[i].theme;
    const next = D.ZONES[i + 1], prev = D.ZONES[i];
    const blend = (a, b, k) => {
      const o = {};
      Object.keys(a).forEach((key) => { o[key] = lerpColor(a[key], b[key], k); });
      return o;
    };
    if (next && d >= next.from - 4) th = blend(th, next.theme, 0.5 * (d - (next.from - 4)) / 4);
    else if (i > 0 && d < prev.from + 4) th = blend(D.ZONES[i - 1].theme, th, 0.5 + 0.5 * (d - prev.from) / 4);
    themeCache.set(d, th);
    return th;
  }

  const MINE_NUM = ['', '#2f6fde', '#2e9b45', '#d8402f', '#27318f', '#8a2a1a', '#1d8f8f', '#222', '#777'];

  function ForestRenderer(canvas, wrap) {
    const ctx = canvas.getContext('2d');
    const W = root.World;
    const self = {
      hero: null, hover: null, targeting: false,
      cam: { x: 0, y: 0 }, camTarget: null, size: 44, zoom: 1, cssW: 0, cssH: 0,
      floats: [], parts: [], openAnim: new Map(), shakeT: 0, shakeAmp: 0,
      heroDraw: null, running: false,
    };
    const now = () => performance.now() / 1000;

    self.setHero = function (hero) {
      self.hero = hero;
      self.floats = []; self.parts = []; self.openAnim.clear();
      const p = hero.run ? hero.run.pos : { x: 0, y: 0 };
      self.heroDraw = { x: p.x, y: p.y };
      self.cam = { x: p.x + 0.5, y: p.y + 0.5 };
      self.camTarget = null;
      self.resize();
    };

    self.resize = function () {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      self.cssW = wrap.clientWidth;
      self.cssH = wrap.clientHeight;
      canvas.width = Math.round(self.cssW * dpr);
      canvas.height = Math.round(self.cssH * dpr);
      canvas.style.width = self.cssW + 'px';
      canvas.style.height = self.cssH + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      self.size = Math.round((self.cssW < 600 ? 34 : 44) * self.zoom);
    };

    // экран ↔ клетка
    const sx = (x) => (x - self.cam.x) * self.size + self.cssW / 2;
    const sy = (y) => (y - self.cam.y) * self.size + self.cssH / 2;
    self.cellAt = function (px, py) {
      return { x: Math.floor((px - self.cssW / 2) / self.size + self.cam.x), y: Math.floor((py - self.cssH / 2) / self.size + self.cam.y) };
    };
    self.screenPos = function (x, y) { return { x: sx(x + 0.5), y: sy(y + 0.5) }; };
    self.pan = function (dx, dy) {
      self.camTarget = null;
      self.cam.x -= dx / self.size;
      self.cam.y -= dy / self.size;
    };
    self.centerOn = function (x, y) { self.camTarget = { x: x + 0.5, y: y + 0.5 }; };
    self.setZoom = function (z) {
      self.zoom = Math.max(0.6, Math.min(2.2, z));
      self.resize();
    };

    // ---------- События → анимации ----------

    function float(x, y, text, color, delay, big) {
      self.floats.push({ cx: x, cy: y, text, color, t0: now() + (delay || 0), dur: 1.4, big: !!big });
    }
    function heroFloat(text, color, delay, big) {
      self.floats.push({ hero: true, text, color, t0: now() + (delay || 0), dur: 1.5, big: !!big });
    }
    function burst(x, y, color, n, delay, up) {
      const t0 = now() + (delay || 0);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 110;
        self.parts.push({ cx: x, cy: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (up || 80), t0, life: 0.6 + Math.random() * 0.6, color, size: 2 + Math.random() * 3.5 });
      }
    }
    const heroCell = () => ({ x: Math.round(self.heroDraw.x), y: Math.round(self.heroDraw.y) });

    self.play = function (events) {
      const t = now();
      events.forEach((e) => {
        if (e.type === 'reveal') {
          const o = e.cells[0];
          e.cells.forEach(([x, y]) => self.openAnim.set(x + ',' + y, t + Math.min(0.6, Math.hypot(x - o[0], y - o[1]) * 0.025)));
          if (self.openAnim.size > 5000) self.openAnim.clear();
        } else if (e.type === 'explode') {
          burst(e.x, e.y, '#ff8a3a', 26, 0, 140);
          burst(e.x, e.y, '#3a3a3a', 14, 0.05, 100);
          burst(e.x, e.y, '#ffe14a', 10, 0, 160);
          float(e.x, e.y, '💥 БУМ!', '#ff6a3a', 0, true);
          heroFloat('−' + e.dmg + ' HP', '#ff5a4a', 0.15);
          self.shakeT = t; self.shakeAmp = 10;
        } else if (e.type === 'flag') {
          burst(e.x, e.y, '#e0403a', 5, 0, 60);
        } else if (e.type === 'defuse') {
          burst(e.x, e.y, '#7aff8a', 16, 0);
          float(e.x, e.y, 'Обезврежено', '#a6ffb0', 0);
        } else if (e.type === 'treasure') {
          burst(e.x, e.y, '#ffd84a', 20, 0.1, 150);
          float(e.x, e.y, '🎁 +' + e.adena + ' 🪙', '#ffd84a', 0.1, true);
          if (e.potion) float(e.x, e.y, D.POTIONS[e.potion].icon + ' ' + D.POTIONS[e.potion].name, '#ffffff', 0.5);
        } else if (e.type === 'clearing') {
          const txt = { camp: '⚔️ Лагерь монстров!', boss: '👑 Лагерь босса!', spring: '💧 Родник' }[e.kind];
          float(e.x, e.y, txt, e.kind === 'boss' ? '#ff9a7a' : '#ffffff', 0.3, true);
        } else if (e.type === 'heal') {
          heroFloat('+' + e.amount + (e.what === 'hp' ? ' HP' : ' MP'), e.what === 'hp' ? '#7aff8a' : '#7ac8ff', 0);
          const h = heroCell();
          burst(h.x, h.y, e.what === 'hp' ? '#7aff8a' : '#7ac8ff', 14, 0);
        } else if (e.type === 'spring') {
          burst(e.x, e.y, '#7ac8ff', 24, 0, 160);
        } else if (e.type === 'skill' && e.x != null) {
          const sk = D.SKILLS[e.id];
          float(e.x, e.y, sk.icon + ' ' + sk.name, '#ffffff', 0);
          burst(e.x, e.y, '#c8a0ff', 12, 0);
        } else if (e.type === 'kill') {
          const m = D.MOBS[e.mob];
          burst(e.x, e.y, m.color, e.boss ? 40 : 18, 0.05);
          burst(e.x, e.y, '#ffe680', e.boss ? 24 : 8, 0.05);
          float(e.x, e.y, '+' + e.reward.xp + ' XP', '#b8f07a', 0.1);
          float(e.x, e.y, '+' + e.reward.adena + ' 🪙', '#ffd84a', 0.35);
          if (e.reward.trophy) float(e.x, e.y, D.TROPHIES[e.reward.trophy].name, '#ffffff', 0.6);
          if (e.reward.gear) float(e.x, e.y, '★ ' + D.GEAR[e.reward.gear].name, '#ff9ef0', 0.85, true);
        } else if (e.type === 'campclear') {
          burst(e.x, e.y, '#c89aff', 30, 0.4, 160);
          if (e.waypoint) float(e.x, e.y, '🗿 Камень телепорта!', '#e6d0ff', 0.5, true);
        } else if (e.type === 'levelup') {
          heroFloat('★ Уровень ' + e.level + '!', '#ffe14a', 0.3, true);
          const h = heroCell();
          burst(h.x, h.y, '#ffe14a', 30, 0.3, 180);
        }
      });
    };

    // ---------- Отрисовка ----------

    function rect(x, y, s, fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, s + 0.5, s + 0.5);
    }

    function drawTree(px, py, s, x, y, th, frontier) {
      const r = hash(x, y), r2 = hash(y + 7, x - 3);
      const c1 = shade(th.top, frontier ? -0.12 : -0.3), c2 = shade(th.top2, frontier ? -0.02 : -0.2);
      ellipse(ctx, px + s * 0.55, py + s * 0.62, s * 0.42, s * 0.34, 'rgba(0,0,0,0.18)');
      ellipse(ctx, px + s * (0.32 + r * 0.1), py + s * (0.42 + r2 * 0.08), s * 0.3, s * 0.3, c1);
      ellipse(ctx, px + s * (0.66 - r2 * 0.1), py + s * (0.4 + r * 0.1), s * 0.28, s * 0.28, c1);
      ellipse(ctx, px + s * 0.5, py + s * (0.3 + r * 0.06), s * 0.3, s * 0.27, c2);
      ellipse(ctx, px + s * 0.42, py + s * 0.24, s * 0.1, s * 0.08, 'rgba(255,255,255,0.18)');
    }

    function drawCell(x, y, t, hv, nbHi) {
      const w = self.hero.world;
      const s = self.size;
      const px = sx(x), py = sy(y);
      const d = W.dist(x, y);
      const th = themeAt(d);
      const k = x + ',' + y;
      const town = W.isTown(x, y);
      const anim = self.openAnim.get(k);
      const opening = anim != null && now() < anim;
      const open = W.isOpen(w, x, y) && !opening;
      if (town) {
        rect(px, py, s, (x + y) & 1 ? '#d9cbb0' : '#cfc0a3');
        ctx.strokeStyle = 'rgba(120,100,70,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
      } else if (!open) {
        const frontier = W.canOpen(w, x, y) || (w.flags.has(k) && W.neighbors(x, y).some(([a, b]) => W.isOpen(w, a, b)));
        rect(px, py, s, shade(th.side, frontier ? -0.15 : -0.4));
        drawTree(px, py, s, x, y, th, frontier);
        if (w.flags.has(k)) drawFlag(ctx, px + s * 0.5, py + s * 0.45, s * 0.9, t);
      } else {
        const cl = W.clearingAt(w, x, y);
        let base = cl ? ((x + y) & 1 ? shade(th.top, 0.25) : shade(th.top2, 0.25)) : ((x + y) & 1 ? th.open : th.open2);
        if (w.blown.has(k)) base = shade(th.open, -0.35);
        rect(px, py, s, base);
        if (anim != null && now() - anim < 0.25) rect(px, py, s, 'rgba(255,255,255,' + (0.5 * (1 - (now() - anim) / 0.25)).toFixed(2) + ')');
        if (cl) {
          const r = hash(x + 3, y + 11);
          if (r < 0.25) ['#ff8ab0', '#fff176', '#ffffff'].forEach((fc, i) => ellipse(ctx, px + s * (0.25 + i * 0.2), py + s * (0.7 + (i % 2) * 0.1), s * 0.05, s * 0.05, fc));
          else if (r < 0.5) {
            line(ctx, [px + s * 0.3, py + s * 0.75, px + s * 0.27, py + s * 0.6], shade(th.top, -0.25), 1.5);
            line(ctx, [px + s * 0.36, py + s * 0.75, px + s * 0.37, py + s * 0.58], shade(th.top, -0.25), 1.5);
          }
        }
        if (w.blown.has(k)) {
          ellipse(ctx, px + s / 2, py + s / 2, s * 0.38, s * 0.3, 'rgba(40,20,10,0.4)');
          drawMine(ctx, px + s / 2, py + s / 2, s * 0.6);
        } else if (w.defused.has(k)) {
          drawMine(ctx, px + s / 2, py + s / 2, s * 0.55, true);
        } else if (w.looted.has(k)) {
          // открытый сундучок
          poly(ctx, [px + s * 0.28, py + s * 0.5, px + s * 0.72, py + s * 0.5, px + s * 0.7, py + s * 0.75, px + s * 0.3, py + s * 0.75], '#a0682a', '#6a4018', 1);
          poly(ctx, [px + s * 0.28, py + s * 0.5, px + s * 0.72, py + s * 0.5, px + s * 0.68, py + s * 0.3, px + s * 0.32, py + s * 0.3], '#c88a3a', '#6a4018', 1);
        }
      }
      if (nbHi) {
        ctx.fillStyle = 'rgba(255,225,74,0.22)';
        ctx.fillRect(px, py, s, s);
      }
      if (hv) {
        ctx.strokeStyle = self.targeting ? '#b07aff' : 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(px + 1.5, py + 1.5, s - 3, s - 3);
      }
    }

    function drawNumber(x, y) {
      const w = self.hero.world;
      if (W.isTown(x, y) || !W.isOpen(w, x, y) || W.isMine(w, x, y)) return;
      const anim = self.openAnim.get(x + ',' + y);
      if (anim != null && now() < anim) return;
      const n = W.num(w, x, y);
      if (!n) return;
      const s = self.size;
      ctx.font = '900 ' + Math.round(s * 0.62) + 'px Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.strokeText(String(n), sx(x + 0.5), sy(y + 0.53));
      ctx.fillStyle = MINE_NUM[n];
      ctx.fillText(String(n), sx(x + 0.5), sy(y + 0.53));
    }

    function drawTown(t) {
      const s = self.size;
      // фонтан
      const fx = sx(0.5), fy = sy(0.5);
      ellipse(ctx, fx, fy, s * 0.9, s * 0.7, '#a8a296', '#7a756c');
      ellipse(ctx, fx, fy, s * 0.7, s * 0.52, '#7ac8f0');
      ellipse(ctx, fx, fy - s * 0.1 - Math.abs(Math.sin(t * 3)) * s * 0.08, s * 0.12, s * 0.18, '#d8f2ff');
      // домики
      [[-2.5, -2.5, '#d0603a'], [2.5, -2.5, '#3a7ad0'], [-2.5, 1.6, '#6aa04a'], [2.5, 1.6, '#c09a3a']].forEach(([x, y, roof]) => {
        const hx = sx(x + 0.5), hy = sy(y + 0.5);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(hx - s * 0.6, hy - s * 0.2, s * 1.3, s * 0.95);
        ctx.fillStyle = '#f4e6c8';
        ctx.fillRect(hx - s * 0.65, hy - s * 0.3, s * 1.3, s * 0.85);
        poly(ctx, [hx - s * 0.8, hy - s * 0.3, hx, hy - s * 0.95, hx + s * 0.8, hy - s * 0.3], roof, shade(roof, -0.3), 1.5);
        ctx.fillStyle = '#7a4a24';
        ctx.fillRect(hx - s * 0.15, hy + s * 0.1, s * 0.3, s * 0.45);
      });
      // ворота
      const gx = sx(0.5), gy = sy(3.5);
      ctx.font = '900 ' + Math.round(s * 0.32) + 'px Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(80,60,40,0.8)';
      ctx.fillText('🏰 Город', sx(0.5), sy(-2.9));
      ctx.globalAlpha = 0.6;
      ctx.fillText('▼', gx, gy + s * 0.05);
      ctx.globalAlpha = 1;
    }

    function badge(x, y, mob, inFight) {
      const s = self.size;
      const w = s * 0.95;
      ctx.font = 'bold ' + Math.round(s * 0.26) + 'px Nunito, system-ui, sans-serif';
      ctx.fillStyle = mob.boss ? 'rgba(160,30,30,0.92)' : 'rgba(40,40,60,0.82)';
      roundRect(x - w / 2, y - s * 0.17, w, s * 0.34, s * 0.12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Ур.' + mob.level, x, y - s * 0.03);
      const k = mob.hp / mob.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x - w / 2 + 3, y + s * 0.09, w - 6, 3);
      ctx.fillStyle = k > 0.5 ? '#7ad35a' : k > 0.25 ? '#f0b83a' : '#e0503a';
      ctx.fillRect(x - w / 2 + 3, y + s * 0.09, (w - 6) * k, 3);
      if (inFight) {
        ctx.strokeStyle = '#ffe14a';
        ctx.lineWidth = 2;
        roundRect(x - w / 2 - 2, y - s * 0.17 - 2, w + 4, s * 0.34 + 4, s * 0.13);
        ctx.stroke();
      }
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawStone(px, py, s, t) {
      ellipse(ctx, px, py + s * 0.3, s * 0.3, s * 0.1, 'rgba(0,0,0,0.25)');
      poly(ctx, [px - s * 0.22, py + s * 0.3, px + s * 0.22, py + s * 0.3, px + s * 0.15, py - s * 0.35, px - s * 0.15, py - s * 0.35], '#9a94a8', '#5a5468', 1.5);
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3);
      ellipse(ctx, px, py - s * 0.05, s * 0.07, s * 0.12, '#b07aff');
      ctx.globalAlpha = 1;
    }

    function drawEntities(t, x0, y0, x1, y1) {
      const w = self.hero.world;
      const s = self.size;
      const run = self.hero.run;
      const seen = new Set();
      const ents = [];
      const R = D.WORLD.region;
      for (let ry = Math.floor(y0 / R); ry <= Math.floor(y1 / R); ry++) {
        for (let rx = Math.floor(x0 / R); rx <= Math.floor(x1 / R); rx++) {
          const c = W.clearingOfRegion(w, rx, ry);
          if (!c || seen.has(c.id) || !W.isOpen(w, c.cx, c.cy)) continue;
          seen.add(c.id);
          if (c.type === 'spring') {
            ents.push({ y: c.cy, draw: () => {
              const px = sx(c.cx + 0.5), py = sy(c.cy + 0.5);
              const used = run && run.springs.includes(c.id);
              ellipse(ctx, px, py, s * 0.62, s * 0.48, '#a39d92', '#7a756c');
              ellipse(ctx, px, py, s * 0.48, s * 0.36, used ? '#9ab8c8' : '#5ab8f0');
              if (!used) ellipse(ctx, px - s * 0.12, py - s * 0.08 + Math.sin(t * 3) * 2, s * 0.08, s * 0.05, 'rgba(255,255,255,0.8)');
            } });
            continue;
          }
          if (w.waypoints.includes(c.id)) ents.push({ y: c.cy - 0.01, draw: () => drawStone(sx(c.cx + 0.5), sy(c.cy + 0.5), s, t) });
          const fightIdx = run && run.fight && run.fight.cid === c.id ? run.fight.idx : -1;
          (run ? root.Game.aliveCampMobs(self.hero, c) : root.Game.campMobs(w, c).map((m) => ({ idx: m.idx, x: m.x, y: m.y, mob: root.Game.makeMob(m.type, m.level, c.ring) })))
            .forEach((m) => {
              if (w.waypoints.includes(c.id) && m.x === c.cx && m.y === c.cy) return;
              ents.push({ y: m.y, draw: () => {
                const px = sx(m.x + 0.5), py = sy(m.y + 0.5);
                const fight = m.idx === fightIdx;
                const hov = self.hover && self.hover.x === m.x && self.hover.y === m.y;
                if (hov) { ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 2.5; ctx.strokeRect(px - s / 2 + 1.5, py - s / 2 + 1.5, s - 3, s - 3); }
                drawMob(ctx, m.mob.type, px, py + s * 0.38, s * (m.mob.boss ? 0.95 : 0.9), t, { phase: m.x * 0.7 + m.y, flash: fight ? Math.max(0, Math.sin(t * 6)) * 0.25 : 0 });
                // таблички рисуются поверх цифр, отдельным слоем
                badges.push(() => badge(px, py - s * (m.mob.boss ? 0.95 : 0.7), m.mob, fight));
              } });
            });
        }
      }
      if (run && self.heroDraw && self.hero.hp > 0) {
        self.heroDraw.x += (run.pos.x - self.heroDraw.x) * 0.2;
        self.heroDraw.y += (run.pos.y - self.heroDraw.y) * 0.2;
        const hx = self.heroDraw.x, hy = self.heroDraw.y;
        ents.push({ y: hy + 0.1, draw: () => {
          drawHero(ctx, sx(hx + 0.5), sy(hy + 0.5) + s * 0.4, s * 0.9, t, self.hero.race, root.Game.archOf(self.hero));
        } });
      }
      ents.sort((a, b) => a.y - b.y).forEach((e) => e.draw());
    }

    const badges = [];

    function drawEffects() {
      const t = now();
      const s = self.size;
      self.parts = self.parts.filter((p) => t < p.t0 + p.life);
      self.parts.forEach((p) => {
        if (t < p.t0) return;
        const k = t - p.t0;
        const x = sx(p.cx + 0.5) + p.vx * k, y = sy(p.cy + 0.5) + p.vy * k + 180 * k * k;
        ctx.globalAlpha = Math.max(0, 1 - k / p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
      });
      ctx.globalAlpha = 1;
      self.floats = self.floats.filter((f) => t < f.t0 + f.dur);
      let heroStack = 0;
      self.floats.forEach((f) => {
        if (t < f.t0) return;
        const k = (t - f.t0) / f.dur;
        let x, y;
        if (f.hero) {
          x = sx(self.heroDraw.x + 0.5); y = sy(self.heroDraw.y) - s * 0.6 - heroStack * s * 0.4;
          heroStack++;
        } else {
          x = sx(f.cx + 0.5); y = sy(f.cy) - s * 0.2;
        }
        y -= k * s * 0.9;
        ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        ctx.font = '900 ' + Math.round(Math.max(13, s * (f.big ? 0.42 : 0.34))) + 'px Nunito, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(30,20,40,0.75)';
        ctx.strokeText(f.text, x, y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, x, y);
      });
      ctx.globalAlpha = 1;
    }

    function frame() {
      if (!self.running) return;
      requestAnimationFrame(frame);
      if (!self.hero || !self.hero.world) return;
      const t = now();
      if (self.camTarget) {
        self.cam.x += (self.camTarget.x - self.cam.x) * 0.15;
        self.cam.y += (self.camTarget.y - self.cam.y) * 0.15;
        if (Math.hypot(self.camTarget.x - self.cam.x, self.camTarget.y - self.cam.y) < 0.01) self.camTarget = null;
      }
      ctx.save();
      ctx.fillStyle = '#2f4a2a';
      ctx.fillRect(0, 0, self.cssW, self.cssH);
      if (t - self.shakeT < 0.3) {
        const a = self.shakeAmp * (1 - (t - self.shakeT) / 0.3);
        ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      }
      const x0 = Math.floor(self.cam.x - self.cssW / 2 / self.size) - 1, x1 = Math.ceil(self.cam.x + self.cssW / 2 / self.size) + 1;
      const y0 = Math.floor(self.cam.y - self.cssH / 2 / self.size) - 1, y1 = Math.ceil(self.cam.y + self.cssH / 2 / self.size) + 1;
      // подсветка 8 соседей цифры под курсором
      const w = self.hero.world;
      const hv = self.hover;
      let nb = null;
      if (hv && W.isOpen(w, hv.x, hv.y) && !W.isTown(hv.x, hv.y) && W.num(w, hv.x, hv.y) > 0) nb = new Set(W.neighbors(hv.x, hv.y).map(([a, b]) => a + ',' + b));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) drawCell(x, y, t, hv && hv.x === x && hv.y === y, nb && nb.has(x + ',' + y));
      }
      if (x0 <= 4 && x1 >= -4 && y0 <= 4 && y1 >= -4) drawTown(t);
      badges.length = 0;
      drawEntities(t, x0, y0, x1, y1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) drawNumber(x, y);
      badges.forEach((b) => b());
      drawEffects();
      ctx.restore();
    }

    self.start = function () {
      if (self.running) return;
      self.running = true;
      requestAnimationFrame(frame);
    };
    self.stop = function () { self.running = false; };
    self.busyUntil = function () {
      return Math.max(0, ...self.floats.map((f) => f.t0 + 0.6)) - now();
    };

    return self;
  }

  // Портрет для экрана создания героя и панели.
  function drawPortrait(canvas, race, arch, mob) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const t = performance.now() / 1000;
    if (mob) drawMob(ctx, mob, w / 2, h * 0.88, Math.min(w, h) * (D.MOBS[mob].boss ? 0.5 : 0.7), t);
    else drawHero(ctx, w / 2, h * 0.9, Math.min(w, h) * 0.78, t, race, arch);
  }

  root.Render = { ForestRenderer, drawPortrait, drawMob, drawHero };
})(typeof window !== 'undefined' ? window : globalThis);
