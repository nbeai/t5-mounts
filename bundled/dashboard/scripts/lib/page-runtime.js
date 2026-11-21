(() => {
  'use strict';
  const config = JSON.parse(document.getElementById('t5-dashboard').textContent);
  const rows = config.rows;
  const state = { filters: Object.fromEntries(config.filters.map((f) => [f.col, null])), q: '' };
  const PALETTE = config.palette; // 차트 계열 색: 만들 때 브랜드 색 또는 기본 색 체계에서 넣는다(build-dashboard.mjs)
  const BLANK = '__blank__';
  const $ = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value; else if (key === 'text') el.textContent = value; else el.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) if (child != null) el.append(child);
    return el;
  };
  const num = (n) => Number(n).toLocaleString('ko-KR');
  const won = (n) => {
    const sign = n < 0 ? '-' : ''; const abs = Math.abs(n);
    if (abs >= 1e8) { const eok = Math.floor(abs / 1e8); const man = Math.round((abs % 1e8) / 1e4); return `${sign}${eok}억${man ? ` ${num(man)}만` : ''}원`; }
    if (abs >= 1e4 && abs % 1e4 === 0) return `${sign}${num(abs / 1e4)}만원`;
    return `${sign}${num(abs)}원`;
  };
  // D-41: axis ticks in short Korean units (6,000만 · 1.2억) so long numbers do not crowd the chart.
  const axisShort = (n) => {
    const sign = n < 0 ? '-' : ''; const abs = Math.abs(n);
    if (abs >= 1e8) return `${sign}${Number((abs / 1e8).toFixed(abs % 1e8 ? 1 : 0))}억`;
    if (abs >= 1e4) return `${sign}${num(Math.round(abs / 1e4))}만`;
    return `${sign}${num(abs)}`;
  };
  const valueAxis = (extra = {}) => ({ type: 'value', axisLabel: { formatter: axisShort }, ...extra });
  const display = (col, value) => {
    const column = config.columns[col];
    if (value == null) return column.blankLabel ?? (column.type === 'number' ? '—' : '');
    if (column.type === 'number') return column.format === 'won' ? `${num(value)}원` : num(value);
    return String(value);
  };
  const where = (row, flags) => flags.every((index) => row.f[index] === 1);
  const visibleRows = () => rows.filter((row) => {
    for (const filter of config.filters) {
      const selected = state.filters[filter.col];
      if (selected == null) continue;
      const value = row.v[filter.col];
      if (selected === BLANK ? value != null : String(value) !== selected) return false;
    }
    if (state.q) {
      const q = state.q.toLowerCase();
      if (!config.search.cols.some((col) => row.v[col] != null && String(row.v[col]).toLowerCase().includes(q))) return false;
    }
    return true;
  });
  const sortRows = (list, sort) => {
    if (!sort || !sort.length) return list;
    return [...list].sort((a, b) => {
      for (const [col, dir] of sort) {
        const x = a.v[col]; const y = b.v[col];
        if (x == null && y == null) continue; if (x == null) return 1; if (y == null) return -1;
        const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ko');
        if (d) return dir === 'desc' ? -d : d;
      }
      return a.i - b.i;
    });
  };
  rows.forEach((row, index) => { row.i = index; });
  // Panel editing: inside T5 the page may ask the shell to store a corrected cell. The page itself stores nothing
  // and evaluates no rules; the shell answers with the edited rows (flags recomputed) and the edit list.
  const originals = new Map(rows.map((row) => [row.r, { v: row.v.slice(), f: row.f.slice() }]));
  const byRow = new Map(rows.map((row) => [row.r, row]));
  const edit = { enabled: false, cells: new Map(), list: [], busy: false, message: '' };
  const inShell = window.parent && window.parent !== window;
  const ask = (message) => { if (inShell) window.parent.postMessage({ type: 't5-dashboard', v: 1, ...message }, '*'); };

  // ---------- static frame ----------
  const root = document.getElementById('app');
  root.append($('header', { class: 'top' }, $('h1', { text: config.title }),
    $('p', { text: [config.subtitle, config.asOfLabel, config.provenance].filter(Boolean).join(' · ') })));
  const bar = $('div', { class: 'bar', role: 'search' });
  for (const filter of config.filters) {
    const label = $('span', { text: filter.label });
    if (filter.mode === 'select') {
      const select = $('select', { 'aria-label': filter.label, 'data-filter-field': filter.col },
        $('option', { value: '', text: '전체' }), filter.options.map((option) => $('option', { value: option.value, text: `${option.label} (${option.count})` })));
      select.addEventListener('change', () => { state.filters[filter.col] = select.value || null; render(); });
      bar.append($('div', { class: 'filter' }, label, select));
    } else {
      const group = $('div', { class: 'chips', role: 'group', 'aria-label': filter.label });
      const make = (value, text, count) => {
        const button = $('button', { type: 'button', 'data-filter-field': filter.col, 'data-filter-value': value ?? '', 'aria-pressed': String(value == null) }, text, count == null ? null : $('small', { text: String(count) }));
        button.addEventListener('click', () => {
          state.filters[filter.col] = value;
          for (const other of group.children) other.setAttribute('aria-pressed', String(other === button));
          render();
        });
        return button;
      };
      group.append(make(null, '전체'), ...filter.options.map((option) => make(option.value, option.label, option.count)));
      bar.append($('div', { class: 'filter' }, label, group));
    }
  }
  if (config.search.cols.length) {
    const input = $('input', { type: 'search', placeholder: config.search.placeholder, 'aria-label': config.search.placeholder, 'data-search': true });
    input.addEventListener('input', () => { state.q = input.value.trim(); render(); });
    bar.append($('div', { class: 'filter' }, input));
  }
  if (bar.children.length) root.append(bar);
  const editBar = $('div', { class: 'edits', role: 'status', hidden: true }); root.append(editBar);
  const kpiBox = $('div', { class: 'kpis' }); root.append(kpiBox);
  const listGrid = $('div', { class: `grid${config.lists.length > 1 ? ' two' : ''}` }); root.append(listGrid);
  const chartGrid = $('div', { class: `grid${config.charts.length > 1 ? ' two' : ''}`, style: 'margin-top:12px' }); root.append(chartGrid);
  const tableBox = $('div', { style: 'margin-top:12px' }); root.append(tableBox);
  root.append($('footer', { text: config.footer }));

  const charts = config.charts.map((chart, index) => {
    const holder = $('div', { class: 'chart', role: 'img', 'aria-label': chart.title, 'data-chart': index });
    const summary = $('p', { class: 'chart-summary' });
    chartGrid.append($('section', { class: 'card' }, $('h2', { text: chart.title }), holder, summary));
    const instance = window.echarts ? window.echarts.init(holder, null, { renderer: 'canvas' }) : null;
    return { chart, holder, summary, instance };
  });
  addEventListener('resize', () => charts.forEach((item) => item.instance && item.instance.resize()));

  const aggregate = (list, spec) => {
    if (spec.agg === 'sum') {
      let sum = 0; let blanks = 0;
      for (const row of list) { const value = row.v[spec.col]; if (typeof value === 'number') sum += value; else blanks++; }
      return { value: sum, blanks };
    }
    return { value: list.length, blanks: 0 };
  };
  const formatValue = (spec, value) => (spec.format === 'won' ? won(value) : `${num(value)}${spec.unit ?? ''}`);

  function renderKpis(scope) {
    kpiBox.replaceChildren(...config.kpis.map((kpi, index) => {
      const list = scope.filter((row) => where(row, kpi.where));
      const { value, blanks } = aggregate(list, kpi);
      const subs = [];
      if (kpi.agg === 'sum' && kpi.format === 'won' && won(value) !== `${num(value)}원`) subs.push(`${num(value)}원`);
      if (kpi.agg === 'sum' && blanks) subs.push(`${kpi.blankLabel} ${num(blanks)}건`);
      if (kpi.note) subs.push(kpi.note);
      return $('div', { class: `kpi ${kpi.tone ?? ''}`, 'data-kpi': index, 'data-value': value, 'data-blanks': blanks },
        $('span', { class: 'label', text: kpi.label }), $('span', { class: formatValue(kpi, value).length > 7 ? 'value long' : 'value', text: formatValue(kpi, value) }),
        subs.length ? $('span', { class: 'sub', text: subs.join(' · ') }) : null);
    }));
  }

  function itemView(row, badge, tone) {
    const item = config.item;
    const meta = item.meta.map((col) => {
      const column = config.columns[col]; const value = row.v[col];
      if (value == null && column.blankLabel == null) return null;
      const text = display(col, value);
      return column.type === 'date' || column.type === 'datetime' || column.type === 'number' ? `${column.label} ${text}` : text;
    }).filter(Boolean).join(' · ');
    return $('li', { 'data-row': row.i },
      $('div', { class: 'item-head' }, $('strong', { text: display(item.title, row.v[item.title]) || '(이름 없음)' }), badge ? $('span', { class: `badge ${tone}`, text: badge }) : null),
      meta ? $('div', { class: 'meta', text: meta }) : null,
      item.note != null && row.v[item.note] != null ? $('div', { class: 'note', text: String(row.v[item.note]) }) : null);
  }

  function renderLists(scope) {
    listGrid.replaceChildren(...config.lists.map((list, index) => {
      const matched = sortRows(scope.filter((row) => where(row, list.where)), list.sort);
      const shown = matched.slice(0, list.limit);
      const ul = $('ul', { class: 'items' }, shown.map((row) => itemView(row, list.badge, list.tone)));
      if (!matched.length) ul.append($('li', { class: 'empty', text: list.empty }));
      return $('section', { class: 'card', 'data-list': index, 'data-count': matched.length },
        $('h2', {}, list.title, $('small', { text: `${num(matched.length)}건` })), ul,
        matched.length > shown.length ? $('div', { class: 'more', text: `외 ${num(matched.length - shown.length)}건은 아래 목록에서 볼 수 있어요.` }) : null);
    }));
  }

  // 값 자체의 순서: 숫자 열은 크기(1, 2, … 10), 그 밖은 숫자를 아는 한국어 정렬(2월 < 10월). 빈칸 이름은 맨 뒤.
  const naturalCompare = (col) => (a, b) => {
    if (config.columns[col].type === 'number') {
      const x = Number(a); const y = Number(b);
      if (Number.isFinite(x) && Number.isFinite(y)) return x - y;
      if (Number.isFinite(x) !== Number.isFinite(y)) return Number.isFinite(x) ? -1 : 1;
    }
    return a.localeCompare(b, 'ko', { numeric: true });
  };
  // order: 목록이면 그 순서. "asc"/"desc"는 숫자·날짜 묶음이면 묶음 값 자체의 순서(1월→12월), 글 묶음이면 차트 값의 순서
  // ("desc"=큰 값부터). 없으면 숫자·날짜 묶음은 값 자체의 순서, 글 묶음은 많은 순.
  // (1.2 점검: "asc" 글자를 목록처럼 읽어 월 차트가 1, 10, 11, 12, 2… 글자 순서로 그려졌다.)
  const ORDINAL = ['number', 'date', 'datetime'];
  function groups(list, col, order, measure = (items) => items.length) {
    const map = new Map();
    for (const row of list) { const key = row.v[col] == null ? (config.columns[col].blankLabel ?? '(빈칸)') : String(row.v[col]); if (!map.has(key)) map.set(key, []); map.get(key).push(row); }
    const keys = [...map.keys()]; const natural = naturalCompare(col); const ordinal = ORDINAL.includes(config.columns[col].type);
    if (Array.isArray(order) && order.length) {
      const wanted = order.map(String);
      keys.sort((a, b) => ((wanted.indexOf(a) + 1 || 999) - (wanted.indexOf(b) + 1 || 999)) || natural(a, b));
    } else if (ordinal && (order === 'asc' || order === 'desc' || order == null)) {
      keys.sort((a, b) => (order === 'desc' ? natural(b, a) : natural(a, b)));
    } else if (order === 'asc' || order === 'desc') {
      const value = new Map(keys.map((key) => [key, measure(map.get(key))]));
      keys.sort((a, b) => (order === 'desc' ? value.get(b) - value.get(a) : value.get(a) - value.get(b)) || natural(a, b));
    } else keys.sort((a, b) => map.get(b).length - map.get(a).length || natural(a, b));
    return keys.map((key) => [key, map.get(key)]);
  }
  const bucketOf = (value, bucket) => {
    if (value == null) return null; const text = String(value);
    if (bucket === 'month') return text.slice(0, 7);
    if (bucket === 'week') { const d = new Date(`${text.slice(0, 10)}T00:00:00Z`); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return `${d.toISOString().slice(0, 10)} 주`; }
    return text.slice(0, 10);
  };

  function renderCharts(scope) {
    for (const { chart, summary, instance } of charts) {
      const list = scope.filter((row) => where(row, chart.where));
      const valueOf = (items) => aggregate(items, chart).value;
      const fmt = (value) => formatValue(chart, value);
      let option; let text; const drawn = { keys: [], values: [] };
      const baseText = { fontFamily: 'Pretendard, system-ui, sans-serif', color: '#16181d' };
      if (chart.type === 'line') {
        const map = new Map();
        for (const row of list) { const key = bucketOf(row.v[chart.group], chart.bucket); if (key == null) continue; if (!map.has(key)) map.set(key, []); map.get(key).push(row); }
        const keys = [...map.keys()].sort(); const values = keys.map((key) => valueOf(map.get(key)));
        option = { textStyle: baseText, animation: false, grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true }, tooltip: { trigger: 'axis' },
          xAxis: { type: 'category', data: keys }, yAxis: valueAxis({ minInterval: chart.agg === 'count' ? 1 : 0 }),
          series: [{ type: 'line', data: values, symbolSize: 6, itemStyle: { color: PALETTE[0] }, lineStyle: { width: 2 } }] };
        text = keys.map((key, i) => `${key} ${fmt(values[i])}`).join(' · '); Object.assign(drawn, { keys, values });
      } else if (chart.type === 'stackedBar' && chart.stack != null) {
        const outer = groups(list, chart.group, chart.order, valueOf); const inner = groups(list, chart.stack, chart.stackOrder).map(([key]) => key);
        option = { textStyle: baseText, animation: false, legend: { top: 0, type: 'scroll' }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true }, xAxis: valueAxis({ minInterval: chart.agg === 'count' ? 1 : 0 }),
          yAxis: { type: 'category', inverse: true, data: outer.map(([key]) => key) },
          series: inner.map((name, i) => ({ type: 'bar', stack: 'total', name, itemStyle: { color: PALETTE[i % PALETTE.length] },
            data: outer.map(([, items]) => valueOf(items.filter((row) => (row.v[chart.stack] == null ? (config.columns[chart.stack].blankLabel ?? '(빈칸)') : String(row.v[chart.stack])) === name))) })) };
        text = outer.map(([key, items]) => `${key} ${fmt(valueOf(items))}`).join(' · ');
        Object.assign(drawn, { keys: outer.map(([key]) => key), values: outer.map(([, items]) => valueOf(items)) });
      } else {
        const grouped = groups(list, chart.group, chart.order, valueOf); const values = grouped.map(([, items]) => valueOf(items));
        if (chart.type === 'donut' && grouped.length <= 6) {
          option = { textStyle: baseText, animation: false, tooltip: { trigger: 'item' }, legend: { bottom: 0, type: 'scroll' },
            series: [{ type: 'pie', radius: ['50%', '75%'], center: ['50%', '45%'], avoidLabelOverlap: true, label: { formatter: '{b}\n{c}' },
              data: grouped.map(([key], i) => ({ name: key, value: values[i], itemStyle: { color: PALETTE[i % PALETTE.length] } })) }] };
        } else {
          option = { textStyle: baseText, animation: false, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true }, xAxis: valueAxis({ minInterval: chart.agg === 'count' ? 1 : 0 }),
            yAxis: { type: 'category', inverse: true, data: grouped.map(([key]) => key) },
            series: [{ type: 'bar', data: values, barMaxWidth: 28, itemStyle: { color: PALETTE[0], borderRadius: [0, 4, 4, 0] },
              label: { show: true, position: 'right', color: '#16181d', formatter: (p) => (chart.format === 'won' ? won(p.value) : num(p.value)) } }] };
        }
        text = grouped.map(([key], i) => `${key} ${fmt(values[i])}`).join(' · '); Object.assign(drawn, { keys: grouped.map(([key]) => key), values });
      }
      summary.textContent = list.length ? text : '해당하는 자료가 없어요.';
      summary.setAttribute('data-keys', JSON.stringify(drawn.keys)); summary.setAttribute('data-values', JSON.stringify(drawn.values));
      if (instance) instance.setOption(option, true);
    }
  }

  function renderTable(scope) {
    if (!config.table) return;
    const table = config.table;
    const matched = sortRows(scope.filter((row) => where(row, table.where)), table.sort);
    const head = $('tr', {}, table.cols.map((col) => $('th', { scope: 'col', text: config.columns[col].label })));
    const body = matched.map((row) => $('tr', { 'data-row': row.i }, table.cols.map((col) => {
      const edited = edit.cells.get(`${row.r}:${col}`);
      const td = $('td', { 'data-label': config.columns[col].label, 'data-source-row': row.r, 'data-col': col,
        class: [config.columns[col].type === 'number' ? 'num' : null, edit.enabled ? 'editable' : null, edited ? 'edited' : null].filter(Boolean).join(' ') || null,
        title: edited ? `원래 값: ${display(col, edited.original) || '(빈칸)'}` : edit.enabled ? '눌러서 고치기' : null,
        tabindex: edit.enabled ? '0' : null, text: display(col, row.v[col]) });
      if (edit.enabled) {
        td.addEventListener('click', () => startEdit(td, row, col));
        td.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); startEdit(td, row, col); } });
      }
      return td;
    })));
    tableBox.replaceChildren($('section', { class: 'card', 'data-table': true, 'data-count': matched.length },
      $('h2', {}, table.title, $('small', { text: `${num(matched.length)}건` })),
      matched.length ? $('table', { class: 't5' }, $('thead', {}, head), $('tbody', {}, body)) : $('div', { class: 'empty', text: '조건에 맞는 자료가 없어요.' })));
  }

  function startEdit(td, row, col) {
    if (!edit.enabled || edit.busy || td.querySelector('input')) return;
    const column = config.columns[col];
    const input = $('input', { type: 'text', 'aria-label': `${column.label} 고치기`, inputmode: column.type === 'number' ? 'decimal' : null });
    input.value = row.v[col] == null ? '' : String(row.v[col]);
    let done = false;
    const finish = (save) => {
      if (done) return; done = true;
      const value = input.value.trim();
      if (!save || value === (row.v[col] == null ? '' : String(row.v[col]))) { render(); return; }
      edit.busy = true; edit.message = '저장하는 중이에요…'; renderEditBar();
      ask({ kind: 'edit', sourceRow: row.r, col, value });
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); finish(true); }
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    td.replaceChildren(input); input.focus(); input.select();
  }

  function renderEditBar() {
    editBar.hidden = !edit.enabled || (!edit.list.length && !edit.message);
    if (editBar.hidden) return;
    const last = [...edit.list].filter((item) => item.undoable).sort((a, b) => b.revision - a.revision)[0];
    const undo = last ? $('button', { type: 'button', 'data-undo': last.revision, disabled: edit.busy || null }, '마지막 수정 되돌리기') : null;
    if (undo) undo.addEventListener('click', () => { edit.busy = true; edit.message = '되돌리는 중이에요…'; renderEditBar(); ask({ kind: 'undo', revision: last.revision }); });
    const items = edit.list.slice(-5).map((item) => $('li', { text: `${item.row ?? ''} · ${item.columnLabel}: ${display(item.col, item.original) || '(빈칸)'} → ${display(item.col, item.value) || '(빈칸)'}` }));
    editBar.replaceChildren(
      $('p', {}, edit.list.length ? `화면에서 고친 값 ${num(edit.list.length)}건 · 원본 파일은 그대로예요.` : '', edit.message ? $('span', { class: 'msg', text: ` ${edit.message}` }) : null),
      items.length ? $('ul', {}, items) : null, undo);
  }

  // Filter counts follow the edited rows (an option the edits emptied shows 0).
  function renderFilterCounts() {
    for (const filter of config.filters) {
      const counts = new Map();
      for (const row of rows) { const key = row.v[filter.col] == null ? BLANK : String(row.v[filter.col]); counts.set(key, (counts.get(key) ?? 0) + 1); }
      for (const node of document.querySelectorAll(`[data-filter-field="${filter.col}"][data-filter-value]`)) {
        const small = node.querySelector('small'); if (small && node.dataset.filterValue) small.textContent = String(counts.get(node.dataset.filterValue) ?? 0);
      }
      const select = document.querySelector(`select[data-filter-field="${filter.col}"]`);
      if (select) for (const option of select.options) if (option.value) {
        const known = filter.options.find((item) => item.value === option.value);
        if (known) option.textContent = `${known.label} (${counts.get(option.value) ?? 0})`;
      }
    }
  }

  function render() {
    const scope = visibleRows();
    renderKpis(scope); renderLists(scope); renderCharts(scope); renderTable(scope);
    if (edit.enabled) renderFilterCounts();
    document.body.setAttribute('data-visible-rows', String(scope.length));
  }
  render();

  if (inShell) {
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (event.source !== window.parent || !data || data.type !== 't5-dashboard' || data.kind !== 'state') return;
      edit.busy = false; edit.message = typeof data.error === 'string' ? data.error.slice(0, 200) : '';
      if (data.editable === true && Array.isArray(data.rows) && Array.isArray(data.edits)) {
        for (const row of rows) { const base = originals.get(row.r); row.v = base.v.slice(); row.f = base.f.slice(); }
        for (const next of data.rows) {
          const row = byRow.get(next?.r);
          if (row && Array.isArray(next.v) && next.v.length === row.v.length && Array.isArray(next.f)) { row.v = next.v.slice(); row.f = next.f.slice(); }
        }
        edit.enabled = true; edit.list = data.edits.filter((item) => item && Number.isInteger(item.col) && config.columns[item.col]);
        edit.cells = new Map(edit.list.map((item) => [`${item.sourceRow}:${item.col}`, item]));
        document.body.setAttribute('data-edit-revision', String(data.revision ?? 0));
        render();
      }
      renderEditBar();
    });
    ask({ kind: 'hello' });
  }
})();
