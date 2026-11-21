#!/usr/bin/env node
// Check a dashboard the way a person will see it in the T5 workbench, in one call: real preview CSP,
// phone and desktop widths, errors, blocked requests, overflow, contrast, charts, fonts, and — for a
// builder dashboard — every filter option against numbers re-derived from the embedded rows.
import { mkdir, readFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

import { dashboardFrame, findChrome, measureInFrame, servedDashboard } from './lib/preview-render.mjs';
import { loadSourceTable, parseNumber } from './lib/source.mjs';

const VIEWPORTS = [
  { id: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
  { id: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false },
];
const CONTRAST = { normalText: 4.5, largeText: 3.0 };
const num = (n) => Number(n).toLocaleString('ko-KR');

// Independent re-derivation from the embedded rows (not the page's own code).
function expectedFor(config, selection) {
  const scope = config.rows.filter((row) => {
    for (const [col, value] of Object.entries(selection.filters)) {
      if (value == null) continue;
      const cell = row.v[Number(col)];
      if (value === '__blank__' ? cell != null : String(cell) !== value) return false;
    }
    if (selection.q) {
      const q = selection.q.toLowerCase();
      if (!config.search.cols.some((col) => row.v[col] != null && String(row.v[col]).toLowerCase().includes(q))) return false;
    }
    return true;
  });
  const flagged = (where) => scope.filter((row) => where.every((index) => row.f[index] === 1));
  return {
    visibleRows: scope.length,
    kpis: config.kpis.map((kpi) => {
      const rows = flagged(kpi.where);
      if (kpi.agg === 'count') return { value: rows.length };
      const values = rows.map((row) => row.v[kpi.col]);
      return { value: values.filter((value) => typeof value === 'number').reduce((a, b) => a + b, 0), blanks: values.filter((value) => typeof value !== 'number').length };
    }),
    lists: config.lists.map((list) => ({ count: flagged(list.where).length, shown: Math.min(flagged(list.where).length, list.limit) })),
    table: config.table ? flagged(config.table.where).length : null,
    charts: config.charts.map((chart) => chartExpected(config, chart, flagged(chart.where))),
  };
}

// 차트 묶음을 페이지 코드와 따로 다시 계산한다: 묶음마다의 값, 전체 합계, 그리고 지켜야 할 순서.
const ORDINAL = new Set(['number', 'date', 'datetime']);
function chartExpected(config, chart, rows) {
  const valueOf = (items) => (chart.agg === 'sum' ? items.reduce((sum, row) => sum + (typeof row.v[chart.col] === 'number' ? row.v[chart.col] : 0), 0) : items.length);
  const total = valueOf(rows);
  if (chart.type === 'line') return { total, byKey: null, order: 'ascending', type: 'date' };
  const byKey = new Map();
  for (const row of rows) {
    const key = row.v[chart.group] == null ? (config.columns[chart.group].blankLabel ?? '(빈칸)') : String(row.v[chart.group]);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  const type = config.columns[chart.group].type;
  const order = Array.isArray(chart.order) && chart.order.length ? chart.order.map(String)
    : ORDINAL.has(type) ? (chart.order === 'desc' ? 'descending' : 'ascending')
      : chart.order === 'desc' ? 'value_descending' : chart.order === 'asc' ? 'value_ascending' : 'by_count';
  return { total, type, order, byKey: new Map([...byKey].map(([key, items]) => [key, { value: valueOf(items), count: items.length }])) };
}
function valueOrder(type) {
  return (a, b) => {
    if (type === 'number' && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) return Number(a) - Number(b);
    if (type === 'number' && Number.isFinite(Number(a)) !== Number.isFinite(Number(b))) return Number.isFinite(Number(a)) ? -1 : 1;
    return a.localeCompare(b, 'ko', { numeric: true });
  };
}
function chartProblems(label, chart, want, got) {
  if (!got) return [`${label}: chart "${chart.title}" did not report its drawn values`];
  const problems = [];
  const drawnTotal = got.values.reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
  if (Math.abs(drawnTotal - want.total) > 1e-6) problems.push(`${label}: chart "${chart.title}" adds up to ${drawnTotal}, data says ${want.total}`);
  if (want.byKey) {
    const wrong = got.keys.filter((key, i) => want.byKey.get(key)?.value !== got.values[i]);
    if (wrong.length || got.keys.length !== want.byKey.size) problems.push(`${label}: chart "${chart.title}" values differ from the data for ${wrong.slice(0, 3).join(', ') || `${want.byKey.size - got.keys.length} missing group(s)`}`);
  }
  const pairs = got.keys.slice(1).map((key, i) => [got.keys[i], key]);
  const compare = valueOrder(want.type);
  const broken = Array.isArray(want.order)
    ? pairs.find(([a, b]) => (want.order.indexOf(a) + 1 || 999) > (want.order.indexOf(b) + 1 || 999))
    : want.order === 'ascending' ? pairs.find(([a, b]) => compare(a, b) > 0)
      : want.order === 'descending' ? pairs.find(([a, b]) => compare(a, b) < 0)
        : want.order === 'value_descending' ? pairs.find(([a, b]) => (want.byKey.get(a)?.value ?? 0) < (want.byKey.get(b)?.value ?? 0))
          : want.order === 'value_ascending' ? pairs.find(([a, b]) => (want.byKey.get(a)?.value ?? 0) > (want.byKey.get(b)?.value ?? 0))
            : pairs.find(([a, b]) => (want.byKey.get(a)?.count ?? 0) < (want.byKey.get(b)?.count ?? 0));
  if (broken) problems.push(`${label}: chart "${chart.title}" order ${got.keys.join(', ')} is not ${Array.isArray(want.order) ? 'the requested order' : want.order} (${broken[0]} before ${broken[1]})`);
  return problems;
}

const readShown = (frame) => frame.evaluate(() => ({
  visibleRows: Number(document.body.getAttribute('data-visible-rows')),
  kpis: [...document.querySelectorAll('[data-kpi]')].map((el) => ({ value: Number(el.getAttribute('data-value')), blanks: Number(el.getAttribute('data-blanks')), text: el.innerText.replace(/\s+/g, '') })),
  lists: [...document.querySelectorAll('[data-list]')].map((el) => ({ count: Number(el.getAttribute('data-count')), shown: el.querySelectorAll('li[data-row]').length })),
  table: (() => { const el = document.querySelector('[data-table]'); return el ? { count: Number(el.getAttribute('data-count')), shown: el.querySelectorAll('tr[data-row]').length } : null; })(),
  charts: [...document.querySelectorAll('.chart-summary')].map((el) => el.textContent.trim().length > 0),
  drawn: [...document.querySelectorAll('.chart-summary')].map((el) => (el.hasAttribute('data-keys')
    ? { keys: JSON.parse(el.getAttribute('data-keys')), values: JSON.parse(el.getAttribute('data-values')) } : null)),
}));

function compare(label, config, expected, shown) {
  const problems = [];
  if (shown.visibleRows !== expected.visibleRows) problems.push(`${label}: page filtered ${shown.visibleRows} rows, data says ${expected.visibleRows}`);
  config.kpis.forEach((kpi, i) => {
    const want = expected.kpis[i]; const got = shown.kpis[i];
    if (!got || got.value !== want.value) { problems.push(`${label}: KPI "${kpi.label}" shows ${got?.value}, data says ${want.value}`); return; }
    const forms = kpi.format === 'won' ? [`${num(want.value)}원`, ...(want.value % 1e4 === 0 ? [`${num(want.value / 1e4)}만원`] : [])] : [`${num(want.value)}`];
    if (!forms.some((form) => got.text.includes(form.replace(/\s+/g, '')))) problems.push(`${label}: KPI "${kpi.label}" text "${got.text}" does not show ${forms[0]}`);
    if (kpi.agg === 'sum' && want.blanks !== got.blanks) problems.push(`${label}: KPI "${kpi.label}" blank count ${got.blanks}, data says ${want.blanks}`);
  });
  config.lists.forEach((list, i) => {
    const want = expected.lists[i]; const got = shown.lists[i];
    if (!got || got.count !== want.count || got.shown !== want.shown) problems.push(`${label}: list "${list.title}" shows ${got?.shown}/${got?.count}, data says ${want.shown}/${want.count}`);
  });
  config.charts.forEach((chart, i) => { if (expected.visibleRows) problems.push(...chartProblems(label, chart, expected.charts[i], shown.drawn[i])); });
  if (config.table && (shown.table?.count !== expected.table || (expected.table > 0 && shown.table?.shown !== expected.table))) problems.push(`${label}: table shows ${shown.table?.shown}/${shown.table?.count}, data says ${expected.table}`);
  return problems;
}

async function applyFilter(frame, filter, value) {
  if (filter.mode === 'select') {
    await frame.locator(`select[data-filter-field="${filter.col}"]`).selectOption(value ?? '');
  } else {
    await frame.locator(`button[data-filter-field="${filter.col}"][data-filter-value="${value ?? ''}"]`).click();
  }
}

async function consistency(frame) {
  const config = await frame.evaluate(() => { const el = document.getElementById('t5-dashboard'); return el ? JSON.parse(el.textContent) : null; });
  if (!config) return { state: 'not_builder_dashboard', note: 'no embedded dashboard data; only rendering was checked' };
  const problems = []; let cases = 0;
  const selection = { filters: Object.fromEntries(config.filters.map((filter) => [filter.col, null])), q: '' };
  problems.push(...compare('전체', config, expectedFor(config, selection), await readShown(frame))); cases++;
  for (const filter of config.filters) {
    for (const option of filter.options) {
      await applyFilter(frame, filter, option.value);
      selection.filters[filter.col] = option.value;
      problems.push(...compare(`${filter.label}=${option.label}`, config, expectedFor(config, selection), await readShown(frame))); cases++;
    }
    await applyFilter(frame, filter, null); selection.filters[filter.col] = null;
  }
  // Two filters together, when present: first option of each.
  if (config.filters.length >= 2) {
    const [a, b] = config.filters;
    await applyFilter(frame, a, a.options[0].value); await applyFilter(frame, b, b.options[0].value);
    selection.filters[a.col] = a.options[0].value; selection.filters[b.col] = b.options[0].value;
    problems.push(...compare(`${a.label}=${a.options[0].label}+${b.label}=${b.options[0].label}`, config, expectedFor(config, selection), await readShown(frame))); cases++;
    await applyFilter(frame, a, null); await applyFilter(frame, b, null); selection.filters[a.col] = null; selection.filters[b.col] = null;
  }
  if (config.search.cols.length && config.rows.length) {
    const sample = config.rows.find((row) => row.v[config.search.cols[0]] != null);
    if (sample) {
      const q = String(sample.v[config.search.cols[0]]);
      await frame.locator('input[data-search]').fill(q); selection.q = q;
      problems.push(...compare(`검색="${q}"`, config, expectedFor(config, selection), await readShown(frame))); cases++;
      await frame.locator('input[data-search]').fill(''); selection.q = '';
    }
  }
  const shown = await readShown(frame);
  if (shown.charts.some((ok) => !ok)) problems.push('a chart has no text summary');
  return { state: problems.length ? 'mismatch' : 'consistent', cases, problems: problems.slice(0, 12), moreProblems: Math.max(0, problems.length - 12) };
}

// 원자료 대조: spec 의 원본 파일을 다시 읽어, 화면에 심은 행 수와 숫자 열 합계가 원본(빌드가 뺀 중복 행 제외)과 같은지 본다.
async function sourceAgreement(config, specPath) {
  if (!specPath) return { state: 'not_checked', note: 'pass --spec SPEC.json to compare with the source file' };
  if (!config) return { state: 'not_builder_dashboard' };
  const spec = JSON.parse(await readFile(specPath, 'utf8'));
  const table = await loadSourceTable({ path: resolve(dirname(resolve(specPath)), spec.source.path), sheet: spec.source.sheet ?? null, headerRow: spec.source.headerRow ?? null, rows: spec.source.rows ?? null });
  const removed = new Set(config.source.removedRows ?? []);
  const rows = table.rows.filter((row) => !removed.has(row.sourceRow));
  const problems = [];
  if (rows.length !== config.rows.length) problems.push(`source has ${rows.length} rows after removing duplicates, the page embeds ${config.rows.length}`);
  const sums = [];
  config.columns.forEach((column, index) => {
    const name = config.rules.columns[index]; const at = table.columns.indexOf(name);
    if (column.type !== 'number' || at < 0) return;
    const fromSource = rows.reduce((sum, row) => sum + (parseNumber(row.values[at]) ?? 0), 0);
    const embedded = config.rows.reduce((sum, row) => sum + (typeof row.v[index] === 'number' ? row.v[index] : 0), 0);
    sums.push({ column: name, source: fromSource, page: embedded });
    if (Math.abs(fromSource - embedded) > 1e-6) problems.push(`column "${name}" sums to ${fromSource} in the source, ${embedded} in the page`);
  });
  return { state: problems.length ? 'mismatch' : 'consistent', rows: rows.length, sums, problems };
}

// 모델이 쓴 HTML 을 렌더하는 크롬은 자기 샌드박스를 켠 채 띄운다(예전에는 늘 --no-sandbox 라 심층 방어 한 겹이 빠졌다).
// 티파이브 터미널 격리(맥 Seatbelt 관측·로컬 변경) 안에서도 크롬 샌드박스가 뜨는 것을 확인했다. 크롬이 샌드박스로는 시작을
// 거부하는 자리 — 리눅스에서 root 로 돌 때 — 만 끈다.
export function checkerChromeArgs({ platform = process.platform, uid = process.getuid?.() ?? null } = {}) {
  return platform === 'linux' && uid === 0 ? ['--no-sandbox'] : [];
}

export async function checkDashboard({ htmlPath, outDir = null, chromePath = findChrome(), asOf = null, specPath = null } = {}) {
  const path = resolve(htmlPath);
  if (!chromePath) return { ok: null, state: 'browser_unavailable', note: 'No Chrome/Chromium/Edge found; inspect with the browser tool instead.' };
  // 확인 화면은 만들 때만 쓰는 자료다 — 따로 정하지 않으면 이 실행의 작업 폴더($TMPDIR, 실행 끝에 지움)에 두고 사용자 폴더(대시보드 옆)에
  // 남기지 않는다(2.2 X1: 결과 옆 「-check」 폴더가 원본 폴더 흔적으로 쌓였다). TMPDIR 이 없을 때만 옛 자리.
  const out = outDir ?? join(process.env.TMPDIR || dirname(path), `${basename(path, extname(path))}-check`);
  await mkdir(out, { recursive: true });
  const served = await servedDashboard(path);
  const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: checkerChromeArgs() });
  const report = { ok: false, file: path, bytes: served.bytes, viewports: {}, consistency: null, screenshots: [], problems: [] };
  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch, deviceScaleFactor: 1 });
      if (asOf) await context.clock.setFixedTime(new Date(asOf));
      const page = await context.newPage();
      const errors = []; const external = [];
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 200)); });
      page.on('pageerror', (error) => errors.push(String(error?.message ?? error).slice(0, 200)));
      page.on('request', (request) => { if (!request.url().startsWith(served.origin) && !/^(data|blob|about):/u.test(request.url())) external.push(request.url().slice(0, 160)); });
      await page.goto(`${served.origin}/`, { waitUntil: 'load' });
      const frame = await dashboardFrame(page);
      await page.waitForTimeout(700);
      const facts = await frame.evaluate(measureInFrame, CONTRAST);
      const bridged = await page.evaluate(() => window.__t5Logs.filter((entry) => entry.level === 'error').map((entry) => entry.text));
      const fontsLoaded = facts.fonts.faces.filter((face) => face.status === 'loaded').map((face) => face.family);
      report.viewports[viewport.id] = {
        errors: [...new Set([...errors, ...bridged])].slice(0, 5), blockedRequests: external.slice(0, 5),
        horizontalOverflowPx: facts.horizontalOverflowPx, contrastIssues: facts.contrast.violations.slice(0, 5), contrastIssueCount: facts.contrast.violationCount,
        charts: { canvasDrawn: facts.charts.canvasDrawn, canvases: facts.charts.canvases.length, svg: facts.charts.svgCharts },
        fonts: [...new Set(fontsLoaded)], bodyFont: facts.fonts.bodyFont.split(',')[0].replace(/["']/g, ''),
      };
      if (viewport.id === 'desktop') {
        report.consistency = await consistency(frame);
        report.source = await sourceAgreement(await frame.evaluate(() => { const el = document.getElementById('t5-dashboard'); return el ? JSON.parse(el.textContent) : null; }), specPath);
      }
      const height = await frame.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: viewport.width, height: Math.min(Math.max(height, viewport.height), 7000) });
      await page.waitForTimeout(200);
      const shot = join(out, `${viewport.id}.png`); await page.screenshot({ path: shot }); report.screenshots.push(shot);
      await context.close();
    }
  } finally {
    await browser.close(); await new Promise((done) => served.server.close(done));
  }
  for (const [id, row] of Object.entries(report.viewports)) {
    if (row.errors.length) report.problems.push(`${id}: console or page errors`);
    if (row.blockedRequests.length) report.problems.push(`${id}: tried to load from the network (blocked in T5 preview)`);
    if (row.horizontalOverflowPx > 1) report.problems.push(`${id}: page is ${row.horizontalOverflowPx}px wider than the screen`);
    if (row.contrastIssueCount) report.problems.push(`${id}: ${row.contrastIssueCount} text element(s) below WCAG contrast`);
    if (row.charts.canvases > row.charts.canvasDrawn) report.problems.push(`${id}: ${row.charts.canvases - row.charts.canvasDrawn} chart canvas(es) empty`);
  }
  if (report.consistency?.state === 'mismatch') report.problems.push('filter/KPI/list/chart values or chart order differ from the embedded data');
  if (report.source?.state === 'mismatch') report.problems.push('embedded rows or sums differ from the source file');
  report.ok = report.problems.length === 0;
  return report;
}

function argument(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const htmlPath = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : argument('--html');
  if (!htmlPath) { process.stderr.write('Usage: check-dashboard.mjs DASHBOARD.html|BUNDLE.zip [--spec SPEC.json] [--out DIR] [--as-of ISO]\n'); process.exit(2); }
  try {
    const report = await checkDashboard({ htmlPath, outDir: argument('--out'), asOf: argument('--as-of'), specPath: argument('--spec') });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    process.exit(report.ok === false ? 1 : 0);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exit(1); }
}
