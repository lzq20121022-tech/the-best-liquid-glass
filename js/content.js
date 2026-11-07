/* =====================================================================
 *  背景内容：图文页面 / 测试网格 / 程序化照片 / 图标
 *  全部用 Canvas2D 在设备像素下绘制，保证折射时文字边缘足够锐利。
 * ===================================================================== */
(function () {
  const LG = (window.LG = window.LG || {});
  const FONT =
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif';
  LG.FONT = FONT;

  function rng(seed) {
    let s = seed | 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rrPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ----------------------------- 图标 ----------------------------- */
  const ICONS = {
    home: [{ d: 'M3.5 10.6 12 3.6l8.5 7V20a1 1 0 0 1-1 1H15v-6h-6v6H4.5a1 1 0 0 1-1-1z', fill: true }],
    music: [{ d: 'M9 18V5.6l11-2.1V16' }, { c: [6, 18, 3], fill: true }, { c: [17, 16, 3], fill: true }],
    heart: [{ d: 'M12 20.3s-7.6-4.5-9.3-9.2C1.6 8 3.6 4.6 7.1 4.6c2.1 0 3.6 1.1 4.9 2.9 1.3-1.8 2.8-2.9 4.9-2.9 3.5 0 5.5 3.4 4.4 6.5-1.7 4.7-9.3 9.2-9.3 9.2z', fill: true }],
    user: [{ c: [12, 8, 4], fill: true }, { d: 'M4 21c.6-3.9 3.9-6.3 8-6.3s7.4 2.4 8 6.3z', fill: true }],
    search: [{ c: [11, 11, 7] }, { d: 'M20.5 20.5 16.2 16.2' }],
    back: [{ d: 'M15 4.5 7.5 12l7.5 7.5' }],
    plus: [{ d: 'M12 5v14M5 12h14' }],
    more: [{ dot: [5, 12, 1.9] }, { dot: [12, 12, 1.9] }, { dot: [19, 12, 1.9] }],
    copy: [{ d: 'M9 9h10.5a.5.5 0 0 1 .5.5V20a1 1 0 0 1-1 1H9.5a.5.5 0 0 1-.5-.5z' }, { d: 'M15 9V4.5a.5.5 0 0 0-.5-.5H4.5a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5H9' }],
    share: [{ d: 'M12 15V3.5M7.5 8 12 3.5 16.5 8' }, { d: 'M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2' }],
    trash: [{ d: 'M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5l.9 13.6a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9l.9-13.6' }],
    sun: [{ c: [12, 12, 4], fill: true }, { d: 'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4' }],
    drop: [{ d: 'M12 3.2s6.2 6.6 6.2 11.1a6.2 6.2 0 0 1-12.4 0C5.8 9.8 12 3.2 12 3.2z', fill: true }],
    camera: [{ d: 'M4 8h3l1.5-2h7L17 8h3v11H4z', fill: true }, { c: [12, 13, 3.4] }],
    image: [{ d: 'M4 5h16v14H4z' }, { d: 'M4 16l5-5 4 4 2-2 5 5' }, { c: [15.5, 9, 1.5], fill: true }],
    cloud: [{ d: 'M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 18z', fill: true }],
    map: [{ d: 'M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z' }, { d: 'M9 4v14M15 6v14' }],
    mail: [{ d: 'M3.5 6h17v12h-17z' }, { d: 'M3.5 6.5 12 13l8.5-6.5' }],
    gear: [{ c: [12, 12, 3] }, { d: 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1' }],
    note: [{ d: 'M6 3.5h12v17H6z' }, { d: 'M9 8h6M9 12h6M9 16h4' }],
    wifi: [{ d: 'M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.7 15.8a5 5 0 0 1 6.6 0' }, { dot: [12, 19, 1.6] }],
    bell: [{ d: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z', fill: true }, { d: 'M10 20.5a2.2 2.2 0 0 0 4 0' }],
    lock: [{ d: 'M6 11h12v9H6z', fill: true }, { d: 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3' }],
    chev: [{ d: 'M9 5l7 7-7 7' }],
  };

  function icon(ctx, name, cx, cy, size, color, opts) {
    opts = opts || {};
    const parts = ICONS[name];
    if (!parts) return;
    ctx.save();
    ctx.translate(cx - size / 2, cy - size / 2);
    ctx.scale(size / 24, size / 24);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = opts.lw || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const pt of parts) {
      if (pt.d) {
        const p = new Path2D(pt.d);
        if (pt.fill && opts.filled) ctx.fill(p);
        ctx.stroke(p);
      } else if (pt.c) {
        ctx.beginPath();
        ctx.arc(pt.c[0], pt.c[1], pt.c[2], 0, Math.PI * 2);
        if (pt.fill && opts.filled) ctx.fill();
        ctx.stroke();
      } else if (pt.dot) {
        ctx.beginPath();
        ctx.arc(pt.dot[0], pt.dot[1], pt.dot[2], 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ----------------------------- 程序化照片 ----------------------------- */
  function photo(ctx, x, y, w, h, kind, r) {
    const R = rng(kind.length * 977 + Math.round(w) * 13 + Math.round(h));
    ctx.save();
    rrPath(ctx, x, y, w, h, r);
    ctx.clip();
    let g;
    if (kind === 'sunset') {
      g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#24185a');
      g.addColorStop(0.32, '#7a3a9c');
      g.addColorStop(0.55, '#ff6a5e');
      g.addColorStop(0.7, '#ffae57');
      g.addColorStop(1, '#ffe08c');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      const sx = x + w * 0.64, sy = y + h * 0.6, sr = h * 0.15;
      const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 4);
      rg.addColorStop(0, 'rgba(255,240,190,0.9)');
      rg.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#fff4cf';
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
      const layers = ['#6a2d73', '#46205a', '#261338'];
      layers.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        const base = y + h * (0.62 + i * 0.1);
        ctx.moveTo(x, y + h);
        ctx.lineTo(x, base);
        let px = x;
        while (px < x + w) {
          px += w * (0.04 + R() * 0.08);
          ctx.lineTo(px, base - h * (0.05 + R() * 0.16) * (1 - i * 0.25));
        }
        ctx.lineTo(x + w, y + h);
        ctx.closePath();
        ctx.fill();
      });
      ctx.strokeStyle = 'rgba(255,220,160,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        const yy = y + h * (0.9 + i * 0.012);
        ctx.beginPath();
        ctx.moveTo(sx - w * (0.05 + R() * 0.12), yy);
        ctx.lineTo(sx + w * (0.05 + R() * 0.12), yy);
        ctx.stroke();
      }
    } else if (kind === 'ocean') {
      g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#8fd3ff');
      g.addColorStop(0.42, '#d8f1ff');
      g.addColorStop(0.43, '#1f8fd6');
      g.addColorStop(1, '#063a7a');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 26; i++) {
        const yy = y + h * 0.45 + (i * i) * h * 0.0009 + i * 2;
        ctx.lineWidth = 1 + i * 0.12;
        ctx.beginPath();
        for (let px = 0; px <= w; px += 6) {
          const v = Math.sin(px * 0.035 + i * 1.7) * (2 + i * 0.4);
          px === 0 ? ctx.moveTo(x + px, yy + v) : ctx.lineTo(x + px, yy + v);
        }
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3, y + h * 0.44);
      ctx.lineTo(x + w * 0.36, y + h * 0.18);
      ctx.lineTo(x + w * 0.36, y + h * 0.44);
      ctx.fill();
      ctx.fillStyle = '#ff5a4f';
      ctx.fillRect(x + w * 0.27, y + h * 0.44, w * 0.12, h * 0.025);
    } else if (kind === 'forest') {
      g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#d9f5d0');
      g.addColorStop(0.5, '#86c98a');
      g.addColorStop(1, '#1c4d2c');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      const greens = ['#5fa86b', '#3d8a52', '#246b3d', '#124a28'];
      greens.forEach((c, i) => {
        ctx.fillStyle = c;
        const n = 9 + i * 3;
        for (let k = 0; k < n; k++) {
          const tx = x + R() * w, th = h * (0.25 + R() * 0.25 + i * 0.08), tw = th * 0.42;
          const ty = y + h * (0.55 + i * 0.12);
          ctx.beginPath();
          ctx.moveTo(tx, ty - th);
          ctx.lineTo(tx + tw / 2, ty);
          ctx.lineTo(tx - tw / 2, ty);
          ctx.closePath();
          ctx.fill();
        }
      });
    } else if (kind === 'neon') {
      g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#0a0a2a');
      g.addColorStop(1, '#2a0b3d');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      let bx = x;
      while (bx < x + w) {
        const bw = 24 + R() * 50, bh = h * (0.3 + R() * 0.55);
        const hue = R() < 0.5 ? 'rgba(20,24,60,1)' : 'rgba(34,18,64,1)';
        ctx.fillStyle = hue;
        ctx.fillRect(bx, y + h - bh, bw - 3, bh);
        for (let wy = y + h - bh + 6; wy < y + h - 6; wy += 9)
          for (let wx = bx + 4; wx < bx + bw - 8; wx += 8)
            if (R() < 0.45) {
              ctx.fillStyle = R() < 0.6 ? '#ffd56b' : R() < 0.5 ? '#5ef2ff' : '#ff5ec8';
              ctx.fillRect(wx, wy, 4, 4);
            }
        bx += bw;
      }
      ['#ff3ec8', '#3ee8ff', '#ffe23e'].forEach((c, i) => {
        ctx.shadowColor = c;
        ctx.shadowBlur = 18;
        ctx.strokeStyle = c;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + w * (0.25 + i * 0.25), y + h * (0.25 + 0.08 * i), h * 0.08, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.shadowBlur = 0;
    } else if (kind === 'aurora') {
      g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#020617');
      g.addColorStop(1, '#0b1a3a');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      for (let i = 0; i < 120; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + R() * 0.7})`;
        ctx.fillRect(x + R() * w, y + R() * h * 0.7, 1.5, 1.5);
      }
      ctx.globalCompositeOperation = 'lighter';
      [['#22ffa8', 0.35], ['#7c4dff', 0.5], ['#00e0ff', 0.62]].forEach(([c, yy], i) => {
        ctx.strokeStyle = c;
        ctx.globalAlpha = 0.5;
        for (let k = 0; k < 18; k++) {
          ctx.lineWidth = 6 + k;
          ctx.globalAlpha = 0.05;
          ctx.beginPath();
          for (let px = 0; px <= w; px += 8) {
            const v = Math.sin(px * 0.012 + i * 2 + k * 0.05) * h * 0.08 + Math.sin(px * 0.031 + i) * h * 0.03;
            px === 0 ? ctx.moveTo(x + px, y + h * yy + v) : ctx.lineTo(x + px, y + h * yy + v);
          }
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#050a14';
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      for (let px = 0; px <= w; px += 10) ctx.lineTo(x + px, y + h * 0.86 - Math.abs(Math.sin(px * 0.02)) * h * 0.08);
      ctx.lineTo(x + w, y + h);
      ctx.fill();
    } else {
      // bloom：叠加的彩色圆
      ctx.fillStyle = '#fff6ec';
      ctx.fillRect(x, y, w, h);
      ctx.globalCompositeOperation = 'multiply';
      const cs = ['#ff7aa2', '#7ad7ff', '#ffd36b', '#9b8cff', '#6bffb8'];
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = cs[i % cs.length];
        ctx.beginPath();
        ctx.arc(x + R() * w, y + R() * h, h * (0.12 + R() * 0.22), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  /* ----------------------------- 文本换行（中英混排） ----------------------------- */
  const TOK = /[⺀-鿿　-〿＀-￯“”‘’—]|[^\s⺀-鿿　-〿＀-￯“”‘’—]+|\s+/g;
  const NO_START = '，。、；：？！）》」』”’,.;:?!)%';
  function wrap(ctx, text, maxW) {
    const toks = text.match(TOK) || [];
    const lines = [];
    let line = '';
    for (const t of toks) {
      const test = line + t;
      if (ctx.measureText(test).width > maxW && line.trim() !== '') {
        if (NO_START.includes(t)) {
          line += t;
          continue;
        }
        lines.push(line.trimEnd());
        line = /^\s+$/.test(t) ? '' : t;
      } else line = test;
    }
    if (line.trim() !== '') lines.push(line.trimEnd());
    return lines;
  }

  /* ----------------------------- 图文页面 ----------------------------- */
  const ZH = {
    p1: '液态玻璃（Liquid Glass）不是一层简单的毛玻璃。它更像一块有厚度的凸透镜：光线在边缘处被强烈弯折、汇聚，中心区域却几乎保持清澈，于是背后的内容会沿着轮廓被拉伸、包裹。',
    p2: '这个页面里的每一块玻璃都在 GPU 上逐像素求解：用有符号距离场（SDF）描述形状，用 squircle 曲线构造玻璃表面的高度，再按斯涅尔定律计算每一条光线的折射方向。',
    p3: '色散也不是把红绿蓝错开几个像素。这里把可见光拆成多个波长分别折射、分别采样，再按人眼的光谱响应重新合成，所以在高对比的边缘上，你会看到连续的彩虹色过渡。',
    p4: '把透镜拖到文字上方，观察字形在边缘一圈被放大、弯曲；让两颗水滴互相靠近，它们会像液体一样融合；按住底部标签栏左右滑动，选中指示器会抬起成一颗放大镜般的水滴。',
    p5: '高光来自一个可以旋转的光源：迎光的一侧出现锐利的边缘高光，背光的一侧因为光在玻璃内部反射，也会亮起一道更弱的光。高光的颜色取自它下方的内容，而不是一层死白。',
    dark: '当玻璃滑过深色内容时，它会自动切换为深色外观，图标反转为白色，在任何背景上都清晰可辨。',
    p6: '常规（Regular）材质会轻微模糊并提亮背后的内容；清透（Clear）材质几乎不模糊，只保留透镜折射，适合放在照片和视频上。右侧面板可以实时调整折射率、厚度、边缘宽度、色散与光源角度。',
    p7: '按住空格键，可以切换到常见的「AI 版液态玻璃」——一层模糊加一条白边——对比一下两者的差距。',
    p8: 'The quick brown fox jumps over the lazy dog. 0123456789 — Refraction concentrates light at the rim, while the flat center stays crystal clear.',
    eyebrow: 'IOS 26 · LIQUID GLASS · 实验室', title: '液态玻璃', sub: '一块会弯曲光线的玻璃——在浏览器里逐像素求解。',
    cap: '图 1 · 日落（程序化生成）', h1: '盯着边缘看', h2: '材质', darkT: '深色区域', lightT: '浅色区域',
    apps: ['相机', '照片', '音乐', '天气', '地图', '邮件', '设置', '备忘录'],
    rows: ['无线局域网', '通知', '显示与亮度', '液态玻璃', '通用', '隐私与安全性'], on: '开启',
    q1: '“它不是在模仿玻璃，', q2: '它是在计算光。”', end: '— 完 —',
  };
  const EN = {
    p1: 'Liquid Glass is not just frosted blur. It behaves like a thick convex lens: light is bent and concentrated at the rim while the flat center stays clear, so whatever is behind it gets stretched and wrapped along the outline.',
    p2: 'Every piece of glass on this page is solved per pixel on the GPU: a signed distance field describes the shape, a squircle curve builds the surface height, and Snell\'s law refracts every single ray.',
    p3: 'Dispersion is not a cheap RGB offset. Visible light is split into several wavelengths, each refracted with its own index and sampled separately, then recombined with a spectral response, so high-contrast edges get a continuous rainbow.',
    p4: 'Drag the lens over this text and watch glyphs magnify and bend around the rim. Push the two droplets together and they merge like liquid. Press and slide on the tab bar: the selection lifts into a magnifying droplet.',
    p5: 'Highlights come from a light you can rotate: a crisp rim on the side facing the light and a softer one on the far side, where light bounces inside the glass. Their color is taken from the content underneath, never flat white.',
    dark: 'When glass slides over dark content it switches to a dark appearance and its symbols flip to white, staying legible on any background.',
    p6: 'Regular glass slightly blurs and brightens what is behind it; Clear glass keeps only the lensing and is meant for photos and video. Use the panel to tune IOR, thickness, bezel width, dispersion and light angle in real time.',
    p7: 'Hold the space bar to switch to the typical "AI liquid glass" (a blur plus a white border) and compare.',
    p8: 'The quick brown fox jumps over the lazy dog. 0123456789 — Refraction concentrates light at the rim, while the flat center stays crystal clear.',
    eyebrow: 'IOS 26 · LIQUID GLASS · LAB', title: 'Liquid Glass', sub: 'Glass that bends light, solved per pixel in your browser.',
    cap: 'Fig. 1 · Sunset (procedurally generated)', h1: 'Watch the edges', h2: 'Materials', darkT: 'Dark region', lightT: 'Light region',
    apps: ['Camera', 'Photos', 'Music', 'Weather', 'Maps', 'Mail', 'Settings', 'Notes'],
    rows: ['Wi-Fi', 'Notifications', 'Display & Brightness', 'Liquid Glass', 'General', 'Privacy & Security'], on: 'On',
    q1: '"It doesn\'t imitate glass,', q2: 'it computes light."', end: '— The End —',
  };
  const TX = () => (LG.lang === 'zh' ? ZH : EN);

  function article(W, dark) {
    const TXT = TX();
    const C = dark
      ? { page: '#000000', text: '#f2f2f7', sub: '#98989f', faint: '#1c1c1e', line: '#2c2c2e', card: '#1c1c1e', accent: '#0a84ff' }
      : { page: '#ffffff', text: '#111114', sub: '#6e6e73', faint: '#f2f2f7', line: '#e5e5ea', card: '#f2f2f7', accent: '#0071e3' };

    W = Math.max(W, 280);
    function run(ctx, draw) {
      const colW = Math.min(W - 40, 700);
      const x0 = Math.round((W - colW) / 2);
      let y = 104;
      if (draw) {
        ctx.fillStyle = C.page;
        ctx.fillRect(0, 0, W, 99999);
      }
      const T = (str, font, color, x, yy, align) => {
        if (!draw) return;
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textAlign = align || 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(str, x, yy);
      };
      const para = (str, size, lh, color, x, w) => {
        ctx.font = `400 ${size}px ${FONT}`;
        const lines = wrap(ctx, str, w);
        lines.forEach((ln, i) => T(ln, `400 ${size}px ${FONT}`, color, x, y + size + i * lh));
        y += lines.length * lh + size * 0.9;
      };
      const heading = (str) => {
        T(str, `700 28px ${FONT}`, C.text, x0, y + 28);
        y += 50;
      };

      T(TXT.eyebrow, `700 12px ${FONT}`, C.accent, x0, y + 12);
      y += 26;
      T(TXT.title, `800 44px ${FONT}`, C.text, x0, y + 44);
      y += 60;
      para(TXT.sub, 18, 26, C.sub, x0, colW);
      y += 6;

      // 主图
      const hh = Math.round(colW * 0.58);
      if (draw) photo(ctx, x0, y, colW, hh, 'sunset', 22);
      y += hh + 12;
      T(TXT.cap, `400 13px ${FONT}`, C.sub, x0, y + 13);
      y += 36;

      para(TXT.p1, 17, 29, C.text, x0, colW);
      para(TXT.p2, 17, 29, C.text, x0, colW);

      // 全宽照片条
      {
        const kinds = ['ocean', 'neon', 'forest', 'aurora', 'bloom', 'sunset'];
        const n = Math.max(3, Math.round(W / 300));
        const gap = 12, pad = 16;
        const pw = (W - pad * 2 - gap * (n - 1)) / n;
        const ph = 210;
        for (let i = 0; i < n; i++) if (draw) photo(ctx, pad + i * (pw + gap), y, pw, ph, kinds[i % kinds.length], 18);
        y += ph + 34;
      }

      para(TXT.p3, 17, 29, C.text, x0, colW);

      // 应用图标网格
      {
        const apps = [
          ['camera', TXT.apps[0], ['#8e8e93', '#3a3a3c']], ['image', TXT.apps[1], ['#ff9f0a', '#ff375f']],
          ['music', TXT.apps[2], ['#ff6482', '#ff2d55']], ['cloud', TXT.apps[3], ['#64d2ff', '#0a84ff']],
          ['map', TXT.apps[4], ['#30d158', '#0a8f3c']], ['mail', TXT.apps[5], ['#5ac8fa', '#007aff']],
          ['gear', TXT.apps[6], ['#aeaeb2', '#636366']], ['note', TXT.apps[7], ['#ffd60a', '#ff9f0a']],
        ];
        const cols = 4, s = Math.min(68, (colW - 30 * 3) / 4), gx = (colW - s * cols) / (cols - 1);
        apps.forEach((a, i) => {
          const cx = x0 + (i % cols) * (s + gx), cy = y + Math.floor(i / cols) * (s + 40);
          if (draw) {
            const g = ctx.createLinearGradient(0, cy, 0, cy + s);
            g.addColorStop(0, a[2][0]);
            g.addColorStop(1, a[2][1]);
            ctx.fillStyle = g;
            rrPath(ctx, cx, cy, s, s, s * 0.24);
            ctx.fill();
            icon(ctx, a[0], cx + s / 2, cy + s / 2, s * 0.52, '#ffffff', { filled: true, lw: 2 });
          }
          T(a[1], `500 12px ${FONT}`, C.text, cx + s / 2, cy + s + 18, 'center');
        });
        y += 2 * (s + 40) + 20;
      }

      heading(TXT.h1);
      para(TXT.p4, 17, 29, C.text, x0, colW);

      // 全宽彩虹细条纹（看色散最清楚）
      {
        const bh = 84;
        if (draw) {
          for (let x = 0; x < W; x += 6) {
            ctx.fillStyle = `hsl(${(x / W) * 360 * 3},95%,55%)`;
            ctx.fillRect(x, y, 3, bh * 0.5);
          }
          for (let x = 0; x < W; x += 4) {
            ctx.fillStyle = x % 8 === 0 ? C.text : C.page;
            ctx.fillRect(x, y + bh * 0.5, 4, bh * 0.5);
          }
        }
        y += bh + 34;
      }

      para(TXT.p5, 17, 29, C.text, x0, colW);

      // 深色卡片
      {
        const ch = 190;
        if (draw) {
          ctx.fillStyle = dark ? '#f5f5f7' : '#0b0b0f';
          rrPath(ctx, x0, y, colW, ch, 24);
          ctx.fill();
        }
        const tc = dark ? '#111' : '#fff';
        const sc = dark ? '#555' : '#a1a1a6';
        T(dark ? TXT.lightT : TXT.darkT, `700 24px ${FONT}`, tc, x0 + 28, y + 50);
        ctx.font = `400 16px ${FONT}`;
        const lines = wrap(ctx, TXT.dark, colW - 56);
        lines.forEach((ln, i) => T(ln, `400 16px ${FONT}`, sc, x0 + 28, y + 88 + i * 26));
        y += ch + 40;
      }

      // 超大标题
      {
        const size = Math.min(96, W / 7.5);
        if (draw) {
          ctx.font = `900 ${size}px ${FONT}`;
          const g = ctx.createLinearGradient(0, 0, W, 0);
          g.addColorStop(0, '#ff375f');
          g.addColorStop(0.35, '#ff9f0a');
          g.addColorStop(0.65, '#30d158');
          g.addColorStop(1, '#0a84ff');
          ctx.fillStyle = g;
          ctx.textAlign = 'center';
          ctx.fillText('Liquid Glass', W / 2, y + size);
        }
        y += size + 40;
      }

      heading(TXT.h2);
      para(TXT.p6, 17, 29, C.text, x0, colW);

      // 设置列表
      {
        const rows = [
          ['wifi', TXT.rows[0], 'Liquid-5G', '#0a84ff'], ['bell', TXT.rows[1], '', '#ff3b30'],
          ['sun', TXT.rows[2], '', '#5e5ce6'], ['drop', TXT.rows[3], TXT.on, '#32ade6'],
          ['gear', TXT.rows[4], '', '#8e8e93'], ['lock', TXT.rows[5], '', '#0a84ff'],
        ];
        const rh = 52;
        if (draw) {
          ctx.fillStyle = C.card;
          rrPath(ctx, x0, y, colW, rh * rows.length, 20);
          ctx.fill();
        }
        rows.forEach((r, i) => {
          const ry = y + i * rh;
          if (draw) {
            ctx.fillStyle = r[3];
            rrPath(ctx, x0 + 16, ry + 11, 30, 30, 8);
            ctx.fill();
            icon(ctx, r[0], x0 + 31, ry + 26, 18, '#fff', { filled: true, lw: 2.2 });
            if (i < rows.length - 1) {
              ctx.fillStyle = C.line;
              ctx.fillRect(x0 + 60, ry + rh - 1, colW - 60, 1);
            }
            icon(ctx, 'chev', x0 + colW - 22, ry + 26, 14, C.sub, { lw: 2.6 });
          }
          T(r[1], `400 17px ${FONT}`, C.text, x0 + 60, ry + 32);
          T(r[2], `400 17px ${FONT}`, C.sub, x0 + colW - 38, ry + 32, 'right');
        });
        y += rh * rows.length + 40;
      }

      // 全宽棋盘格
      {
        const bh = 96, s = 16;
        if (draw)
          for (let yy = 0; yy < bh; yy += s)
            for (let x = 0; x < W; x += s) {
              ctx.fillStyle = ((x / s + yy / s) & 1) ? C.text : C.page;
              ctx.fillRect(x, y + yy, s, s);
            }
        y += bh + 36;
      }

      para(TXT.p7, 17, 29, C.text, x0, colW);
      para(TXT.p8, 17, 29, C.sub, x0, colW);

      // 引用块
      {
        if (draw) {
          ctx.fillStyle = C.accent;
          ctx.fillRect(x0, y, 4, 70);
        }
        T(TXT.q1, `600 24px ${FONT}`, C.text, x0 + 22, y + 28);
        T(TXT.q2, `600 24px ${FONT}`, C.text, x0 + 22, y + 62);
        y += 110;
      }

      // 再一组大图
      {
        const n = Math.max(2, Math.round(W / 480));
        const gap = 12, pad = 16;
        const pw = (W - pad * 2 - gap * (n - 1)) / n;
        const ph = Math.min(320, pw * 0.7);
        const kinds = ['aurora', 'bloom', 'ocean', 'neon'];
        for (let i = 0; i < n; i++) if (draw) photo(ctx, pad + i * (pw + gap), y, pw, ph, kinds[i % kinds.length], 22);
        y += ph + 40;
      }

      para(TXT.p1, 17, 29, C.text, x0, colW);
      T(TXT.end, `500 14px ${FONT}`, C.sub, W / 2, y + 30, 'center');
      y += 180;
      return y;
    }
    const scratch = document.createElement('canvas').getContext('2d');
    const height = Math.ceil(run(scratch, false));
    return { height, page: C.page, draw: (ctx) => run(ctx, true) };
  }

  /* ----------------------------- 测试网格 ----------------------------- */
  function grid(W, H, dark) {
    const height = Math.max(2400, Math.ceil(H * 2.6));
    const C = dark ? { bg: '#000', fg: '#fff', minor: '#1a1a1a', mid: '#333', major: '#777' } : { bg: '#fff', fg: '#000', minor: '#ececec', mid: '#cfcfcf', major: '#7a7a7a' };
    function draw(ctx) {
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, height);
      for (let x = 0; x <= W; x += 10) {
        ctx.fillStyle = x % 100 === 0 ? C.major : x % 50 === 0 ? C.mid : C.minor;
        ctx.fillRect(x, 0, x % 100 === 0 ? 2 : 1, height);
      }
      for (let y = 0; y <= height; y += 10) {
        ctx.fillStyle = y % 100 === 0 ? C.major : y % 50 === 0 ? C.mid : C.minor;
        ctx.fillRect(0, y, W, y % 100 === 0 ? 2 : 1);
      }
      ctx.font = `600 10px ${FONT}`;
      ctx.fillStyle = C.major;
      for (let y = 100; y < height; y += 100) ctx.fillText(String(y), 4, y - 3);
      for (let x = 100; x < W; x += 100) ctx.fillText(String(x), x + 3, 12);

      let y = 160;
      const band = (fn, h) => {
        fn(y, h);
        y += h + 120;
      };
      band((y0, h) => { // 彩色细竖线
        for (let x = 0; x < W; x += 5) {
          ctx.fillStyle = `hsl(${(x * 2.2) % 360},100%,50%)`;
          ctx.fillRect(x, y0, 2, h);
        }
      }, 90);
      band((y0, h) => { // 棋盘格
        for (let yy = 0; yy < h; yy += 20) for (let x = 0; x < W; x += 20) {
          ctx.fillStyle = ((x / 20 + yy / 20) & 1) ? C.fg : C.bg;
          ctx.fillRect(x, y0 + yy, 20, 20);
        }
      }, 120);
      band((y0, h) => { // 文字
        const sizes = [11, 14, 18, 24, 34];
        let yy = y0;
        sizes.forEach((s) => {
          ctx.font = `600 ${s}px ${FONT}`;
          ctx.fillStyle = C.fg;
          let x = 10;
          const str = '液态玻璃折射测试 LIQUID GLASS 0123456789 ';
          while (x < W) { ctx.fillText(str, x, yy + s); x += ctx.measureText(str).width; }
          yy += s * 1.5;
        });
      }, 150);
      band((y0, h) => { // 同心圆
        for (let i = 0; i < 5; i++) {
          const cx = W * (0.1 + i * 0.2), cy = y0 + h / 2;
          for (let r = 8; r < h / 2; r += 8) {
            ctx.strokeStyle = i % 2 ? '#ff2d55' : '#0a84ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }, 200);
      band((y0, h) => { // 色块
        const cs = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#0a84ff', '#5856d6', '#af52de', '#ff2d55'];
        const w = W / cs.length;
        cs.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * w, y0, w, h); });
      }, 110);
      band((y0, h) => { // 斜线
        ctx.save();
        ctx.beginPath(); ctx.rect(0, y0, W, h); ctx.clip();
        ctx.strokeStyle = C.fg; ctx.lineWidth = 3;
        for (let x = -h; x < W + h; x += 14) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + h, y0 + h); ctx.stroke(); }
        ctx.restore();
      }, 100);
      band((y0, h) => { // 反色网格
        ctx.fillStyle = C.fg; ctx.fillRect(0, y0, W, h);
        ctx.fillStyle = C.bg;
        for (let x = 0; x < W; x += 24) ctx.fillRect(x, y0, 2, h);
        for (let yy = 0; yy < h; yy += 24) ctx.fillRect(0, y0 + yy, W, 2);
      }, 160);
      while (y < height - 200) {
        band((y0, h) => {
          for (let x = 0; x < W; x += 5) { ctx.fillStyle = `hsl(${(x * 2.2 + y0) % 360},100%,50%)`; ctx.fillRect(x, y0, 2, h); }
        }, 80);
        band((y0, h) => {
          for (let yy = 0; yy < h; yy += 20) for (let x = 0; x < W; x += 20) {
            ctx.fillStyle = ((x / 20 + yy / 20) & 1) ? C.fg : C.bg; ctx.fillRect(x, y0 + yy, 20, 20);
          }
        }, 100);
      }
    }
    return { height, page: C.bg, draw };
  }

  LG.Content = { article, grid, photo, icon, wrap, rrPath, FONT };
})();
