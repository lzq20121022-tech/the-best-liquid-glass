/* =====================================================================
 *  参数面板：根据 schema 生成 DOM 控件
 * ===================================================================== */
(function () {
  const LG = (window.LG = window.LG || {});

  LG.buildPanel = function (root, P, schema, onChange, onAction) {
    const refreshers = [];
    root.innerHTML = '';

    for (const sec of schema) {
      const det = document.createElement('details');
      if (sec.open !== false) det.open = true;
      const sum = document.createElement('summary');
      sum.textContent = sec.title;
      det.appendChild(sum);
      if (sec.note) {
        const n = document.createElement('p');
        n.className = 'note';
        n.textContent = sec.note;
        det.appendChild(n);
      }

      for (const it of sec.items) {
        if (it.type === 'range') {
          const row = el('div', 'row');
          const lab = el('label');
          lab.textContent = it.label;
          if (it.tip) lab.title = it.tip;
          const inp = document.createElement('input');
          inp.type = 'range';
          inp.min = it.min;
          inp.max = it.max;
          inp.step = it.step;
          const out = el('output');
          const fmt = it.fmt || ((v) => (+v).toFixed(it.step < 0.01 ? 3 : it.step < 0.1 ? 2 : it.step < 1 ? 1 : 0));
          const sync = () => {
            inp.value = P[it.key];
            out.textContent = fmt(P[it.key]);
            const t = (P[it.key] - it.min) / (it.max - it.min);
            inp.style.setProperty('--t', (Math.max(0, Math.min(1, t)) * 100).toFixed(1) + '%');
          };
          inp.addEventListener('input', () => {
            P[it.key] = parseFloat(inp.value);
            sync();
            onChange(it.key);
          });
          inp.addEventListener('dblclick', () => {
            if (it.def !== undefined) {
              P[it.key] = it.def;
              sync();
              onChange(it.key);
            }
          });
          row.append(lab, inp, out);
          det.appendChild(row);
          refreshers.push(sync);
        } else if (it.type === 'select') {
          const row = el('div', 'row row2');
          const lab = el('label');
          lab.textContent = it.label;
          const sel = document.createElement('select');
          for (const [v, t] of it.options) {
            const o = document.createElement('option');
            o.value = v;
            o.textContent = t;
            sel.appendChild(o);
          }
          const sync = () => (sel.value = String(P[it.key]));
          sel.addEventListener('change', () => {
            const v = sel.value;
            P[it.key] = typeof it.options[0][0] === 'number' ? parseFloat(v) : v;
            onChange(it.key);
          });
          row.append(lab, sel);
          det.appendChild(row);
          refreshers.push(sync);
        } else if (it.type === 'check') {
          const row = el('label', 'check');
          const inp = document.createElement('input');
          inp.type = 'checkbox';
          const span = el('span');
          span.textContent = it.label;
          const sync = () => (inp.checked = !!P[it.key]);
          inp.addEventListener('change', () => {
            P[it.key] = inp.checked;
            onChange(it.key);
          });
          row.append(inp, span);
          det.appendChild(row);
          refreshers.push(sync);
        } else if (it.type === 'color') {
          const row = el('div', 'row row2');
          const lab = el('label');
          lab.textContent = it.label;
          const inp = document.createElement('input');
          inp.type = 'color';
          const sync = () => (inp.value = P[it.key]);
          inp.addEventListener('input', () => {
            P[it.key] = inp.value;
            onChange(it.key);
          });
          row.append(lab, inp);
          det.appendChild(row);
          refreshers.push(sync);
        } else if (it.type === 'buttons') {
          const row = el('div', 'btns' + (it.cols ? ' cols' + it.cols : ''));
          for (const b of it.buttons) {
            const btn = el('button', 'btn' + (b.primary ? ' primary' : ''));
            btn.textContent = b.label;
            if (b.tip) btn.title = b.tip;
            btn.addEventListener('click', () => onAction(b.action, btn));
            row.appendChild(btn);
          }
          det.appendChild(row);
        }
      }
      root.appendChild(det);
    }

    function el(tag, cls) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      return e;
    }
    const api = { refresh: () => refreshers.forEach((f) => f()) };
    api.refresh();
    return api;
  };
})();
