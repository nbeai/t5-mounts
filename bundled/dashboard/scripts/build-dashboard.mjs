#!/usr/bin/env node
// Build one self-contained dashboard HTML from a model-written spec. The model decides what matters
// (flags, KPIs, lists, charts); this tool reads the source, removes duplicates as instructed, computes
// the flags at the stated reference time, embeds exact rows and renders with a fixed, tested page.
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inlineDashboardAssets } from './inline-assets.mjs';
import { inferType, loadSourceTable, normalizeDate, parseNumber, rowKey } from './lib/source.mjs';
import { compileCondition, wallClock } from './lib/rules.mjs';
import { DASHBOARD_DEFAULT_COLORS, SERIES_COLORS, STATUS_COLORS } from '../../../src/axes/artifact/default-palette.js';

const here = dirname(fileURLToPath(import.meta.url));
export const PREVIEW_LIMIT = 5 * 1024 * 1024;
const MONEY = /원\)|\(원|금액|매출|비용|가격|₩/u;
const CHART_TYPES = new Set(['bar', 'stackedBar', 'line', 'donut']);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function specError(message) { return Object.assign(new Error(message), { code: 'DASHBOARD_SPEC' }); }

// 화면 색: 사람이 준 브랜드 색(spec.colors)이 먼저, 없으면 티파이브 기본 색 체계(skills/color-system/data). 값은 이 파일에 없다.
const COLOR_ROLES = ['bg', 'surface', 'text', 'muted', 'line', 'accent', 'onAccent'];
const HEX_COLOR = /^#[0-9a-f]{6}$/iu;
export function dashboardColors(given = null) {
  if (given != null && (typeof given !== 'object' || Array.isArray(given))) throw specError('colors must be an object of role colors (#RRGGBB)');
  const brand = given ?? {};
  for (const key of Object.keys(brand)) if (![...COLOR_ROLES, 'series'].includes(key)) throw specError(`colors.${key} is not a color role (${COLOR_ROLES.join(', ')}, series)`);
  for (const role of COLOR_ROLES) if (brand[role] != null && !HEX_COLOR.test(brand[role])) throw specError(`colors.${role} must be #RRGGBB`);
  if (brand.series != null && (!Array.isArray(brand.series) || !brand.series.length || brand.series.some((value) => !HEX_COLOR.test(value)))) throw specError('colors.series must be a list of #RRGGBB');
  const roles = Object.fromEntries(COLOR_ROLES.map((role) => [role, brand[role] ?? DASHBOARD_DEFAULT_COLORS[role]]));
  // 브랜드 강조색만 주면 차트 첫 계열도 그 색이 된다(나머지는 기본 계열).
  const series = brand.series ?? (brand.accent ? [brand.accent, ...SERIES_COLORS.light.slice(1)] : [...SERIES_COLORS.light]);
  return { ...roles, series, status: STATUS_COLORS };
}
function themeCss(colors) {
  const s = colors.status;
  return `:root{--bg:${colors.bg};--surface:${colors.surface};--ink:${colors.text};--muted:${colors.muted};--line:${colors.line};--accent:${colors.accent};--accent-ink:${colors.onAccent};`
    + `--alert:${s.danger.light.text};--alert-bg:${s.danger.light.tint};--warn:${s.warn.light.text};--warn-bg:${s.warn.light.tint};--info:${s.info.light.text};--info-bg:${s.info.light.tint}}`;
}

// order 는 값 목록(그 순서) 또는 "asc"/"desc"(값 자체의 순서)다. 다른 글자는 조용히 무시하지 않고 고치게 한다.
function orderOf(value, path) {
  if (value == null) return null;
  if (value === 'asc' || value === 'desc') return value;
  if (Array.isArray(value)) return value.map(String);
  throw specError(`${path} must be a list of values in display order, or "asc"/"desc" (number and date groups by their own value, text groups by the chart value; "desc" = largest first)`);
}
const naturalCompare = (type) => (a, b) => {
  if (type === 'number') {
    const x = Number(a); const y = Number(b);
    if (Number.isFinite(x) && Number.isFinite(y)) return x - y;
  }
  return a.localeCompare(b, 'ko', { numeric: true });
};

export async function buildDashboard(spec, { specDirectory = process.cwd() } = {}) {
  if (!spec || typeof spec !== 'object') throw specError('spec must be a JSON object');
  if (!spec.source?.path) throw specError('source.path is required');
  const sourcePath = resolve(specDirectory, spec.source.path);
  const table = await loadSourceTable({ path: sourcePath, sheet: spec.source.sheet ?? null, headerRow: spec.source.headerRow ?? null, rows: spec.source.rows ?? null });
  const warnings = [];

  // Extra columns the model computed itself (for rules this spec cannot express), joined by source row.
  let columns = [...table.columns]; let rows = table.rows.map((row) => ({ sourceRow: row.sourceRow, values: [...row.values] }));
  if (spec.extraColumns) {
    const extra = JSON.parse(await readFile(resolve(specDirectory, spec.extraColumns), 'utf8'));
    if (!Array.isArray(extra)) throw specError('extraColumns must point to a JSON array of {"sourceRow": n, "<column>": value}');
    const names = [...new Set(extra.flatMap((item) => Object.keys(item).filter((key) => key !== 'sourceRow')))];
    for (const name of names) if (columns.includes(name)) throw specError(`extra column "${name}" already exists in the source`);
    const bySourceRow = new Map(extra.map((item) => [item.sourceRow, item]));
    columns = [...columns, ...names];
    rows = rows.map((row) => ({ ...row, values: [...row.values, ...names.map((name) => bySourceRow.get(row.sourceRow)?.[name] ?? null)] }));
  }
  const column = (name, where) => {
    const index = columns.indexOf(name);
    if (index < 0) throw specError(`${where}: unknown column "${name}". Columns: ${columns.join(', ')}`);
    return index;
  };

  // Duplicates: exact (default) removes fully identical rows; key keeps first/last per key and reports conflicts.
  const dedupe = spec.dedupe ?? { mode: 'exact' };
  const removed = []; const conflicts = [];
  if (dedupe.mode === 'exact' || dedupe.mode === 'key') {
    const keyIndexes = dedupe.mode === 'key' ? (dedupe.key ?? []).map((name) => column(name, 'dedupe.key')) : null;
    if (dedupe.mode === 'key' && !keyIndexes.length) throw specError('dedupe.key needs at least one column');
    const kept = new Map(); const order = [];
    for (const row of rows) {
      const key = keyIndexes ? JSON.stringify(keyIndexes.map((i) => row.values[i])) : rowKey(row.values);
      if (!kept.has(key)) { kept.set(key, row); order.push(key); continue; }
      const previous = kept.get(key);
      if (rowKey(previous.values) !== rowKey(row.values)) conflicts.push({ key: JSON.parse(key), rows: [previous.sourceRow, row.sourceRow] });
      if (dedupe.keep === 'last') { removed.push(previous.sourceRow); kept.set(key, row); } else removed.push(row.sourceRow);
    }
    rows = order.map((key) => kept.get(key));
  } else if (dedupe.mode !== 'none') throw specError('dedupe.mode is exact, key or none');

  // Types: inferred, overridable; values normalized so numbers are numbers and dates compare as text.
  const types = columns.map((name, index) => spec.columns?.[name]?.type ?? inferType(rows.map((row) => row.values[index])));
  const invalid = new Map();
  for (const row of rows) row.values = row.values.map((value, index) => {
    if (value == null) return null;
    if (types[index] === 'number') { const n = parseNumber(value); if (n == null) { invalid.set(index, (invalid.get(index) ?? 0) + 1); return null; } return n; }
    if (types[index] === 'date' || types[index] === 'datetime') return normalizeDate(value) ?? String(value);
    return typeof value === 'string' ? value : String(value);
  });
  for (const [index, count] of invalid) warnings.push(`${columns[index]}: ${count} value(s) are not numbers and are treated as blank`);

  const timeZone = spec.timezone ?? 'Asia/Seoul';
  const asOf = spec.asOf ? new Date(spec.asOf) : new Date();
  if (Number.isNaN(asOf.getTime())) throw specError('asOf must be an ISO time such as 2026-09-25T09:00:00+09:00');

  // Flags are evaluated once here, at the reference time, then embedded as facts per row.
  // The columns a flag reads are embedded too, so a value the user edits in the panel can re-evaluate the flags
  // with the same rules and reference time (the store recomputes them; the page never evaluates rules).
  const flags = new Map(); const flagDefs = []; const flagColumns = new Set();
  const trackedColumns = Object.assign([...columns], { indexOf: (name) => { const index = columns.indexOf(name); if (index >= 0) flagColumns.add(index); return index; } });
  for (const [i, flag] of (spec.flags ?? []).entries()) {
    if (!flag?.name) throw specError(`flags[${i}].name is required`);
    if (flags.has(flag.name) || columns.includes(flag.name)) throw specError(`flag name "${flag.name}" is already used`);
    const test = compileCondition(flag.when, { columns: trackedColumns, types, flags, asOf, timeZone }, `flags[${i}].when`);
    flags.set(flag.name, flagDefs.length);
    for (const row of rows) { row.flags ??= []; row.flags[flagDefs.length] = test(row); }
    flagDefs.push({ name: flag.name, label: flag.label ?? flag.name });
  }
  for (const row of rows) row.flags ??= [];
  const whereOf = (value, path) => {
    if (value == null) return [];
    const names = Array.isArray(value) ? value : [value];
    return names.map((name) => { if (!flags.has(name)) throw specError(`${path}: unknown flag "${name}". Flags: ${[...flags.keys()].join(', ') || 'none'}`); return flags.get(name); });
  };

  const labelOf = (index) => spec.columns?.[columns[index]]?.label ?? columns[index];
  const used = new Set(flagColumns);
  const use = (name, where) => { const index = column(name, where); used.add(index); return index; };

  const item = spec.item ?? {};
  const itemTitle = use(item.title ?? columns[0], 'item.title');
  const itemMeta = (item.meta ?? []).map((name) => use(name, 'item.meta'));
  const itemNote = item.note ? use(item.note, 'item.note') : null;

  const filters = (spec.filters ?? []).map((filter, i) => {
    const index = use(filter.column, `filters[${i}].column`);
    const counts = new Map(); let blanks = 0;
    for (const row of rows) { const value = row.values[index]; if (value == null) blanks++; else counts.set(String(value), (counts.get(String(value)) ?? 0) + 1); }
    const asked = orderOf(filter.order, `filters[${i}].order`); const natural = naturalCompare(types[index]);
    const order = Array.isArray(asked) ? asked
      : asked || ['number', 'date', 'datetime'].includes(types[index]) ? [...counts.keys()].sort((a, b) => (asked === 'desc' ? natural(b, a) : natural(a, b)))
        : [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || natural(a, b));
    const options = order.filter((value) => counts.has(value)).map((value) => ({ value, label: value, count: counts.get(value) }));
    for (const value of counts.keys()) if (!order.includes(value)) options.push({ value, label: value, count: counts.get(value) });
    if (blanks) options.push({ value: '__blank__', label: filter.blankLabel ?? '(빈칸)', count: blanks });
    return { col: index, label: filter.label ?? columns[index], options, mode: options.length > 7 ? 'select' : 'chips', blankLabel: filter.blankLabel ?? null };
  });
  const search = { cols: (spec.search ?? []).map((name) => use(name, 'search')), placeholder: spec.searchPlaceholder ?? '이름·메모 검색' };

  const kpis = (spec.kpis ?? []).map((kpi, i) => {
    const agg = kpi.sum ? 'sum' : 'count';
    const col = kpi.sum ? use(kpi.sum, `kpis[${i}].sum`) : null;
    if (col != null && types[col] !== 'number') throw specError(`kpis[${i}].sum: column "${kpi.sum}" is ${types[col]}, not number`);
    const format = kpi.format ?? (col != null && (spec.columns?.[columns[col]]?.format === 'won' || MONEY.test(columns[col])) ? 'won' : 'number');
    return { label: kpi.label, agg, col, where: whereOf(kpi.where, `kpis[${i}].where`), format, unit: kpi.unit ?? (agg === 'count' ? '건' : ''),
      tone: kpi.tone ?? null, blankLabel: kpi.blankLabel ?? (format === 'won' ? '금액 미정' : '값 없음'), note: kpi.note ?? null };
  });
  const sortOf = (sort, path) => (sort ?? []).map(([name, dir = 'asc']) => [use(name, path), dir === 'desc' ? 'desc' : 'asc']);
  const lists = (spec.lists ?? []).map((list, i) => ({ title: list.title, where: whereOf(list.where, `lists[${i}].where`), sort: sortOf(list.sort, `lists[${i}].sort`),
    badge: list.badge ?? null, tone: list.tone ?? 'info', empty: list.empty ?? '지금은 해당하는 항목이 없어요.', limit: list.limit ?? 30 }));
  const charts = (spec.charts ?? []).map((chart, i) => {
    if (!CHART_TYPES.has(chart.type)) throw specError(`charts[${i}].type must be one of ${[...CHART_TYPES].join(', ')}`);
    const col = chart.sum ? use(chart.sum, `charts[${i}].sum`) : null;
    const group = use(chart.groupBy, `charts[${i}].groupBy`);
    if (chart.type === 'line' && !['date', 'datetime'].includes(types[group])) throw specError(`charts[${i}]: a line chart needs a date column in groupBy`);
    if (chart.type === 'donut' && new Set(rows.map((row) => row.values[group])).size > 6) warnings.push(`charts[${i}]: more than 6 groups, drawn as a bar chart`);
    return { type: chart.type, title: chart.title, group, stack: chart.stackBy ? use(chart.stackBy, `charts[${i}].stackBy`) : null,
      agg: col != null ? 'sum' : 'count', col, where: whereOf(chart.where, `charts[${i}].where`), order: orderOf(chart.order, `charts[${i}].order`), stackOrder: orderOf(chart.stackOrder, `charts[${i}].stackOrder`),
      bucket: chart.bucket ?? 'day', format: chart.format ?? (col != null && (spec.columns?.[columns[col]]?.format === 'won' || MONEY.test(columns[col])) ? 'won' : 'number'), unit: col != null ? '' : '건' };
  });
  const tableSpec = spec.table ? { title: spec.table.title ?? '전체 목록', cols: (spec.table.columns ?? []).map((name) => use(name, 'table.columns')),
    where: whereOf(spec.table.where, 'table.where'), sort: sortOf(spec.table.sort, 'table.sort') } : null;
  if (tableSpec && !tableSpec.cols.length) throw specError('table.columns needs at least one column');

  // Embed only used columns, re-indexed.
  const kept = [...used].sort((a, b) => a - b); const remap = new Map(kept.map((index, i) => [index, i]));
  const blankLabels = new Map(filters.map((filter) => [filter.col, filter.blankLabel]));
  const r = (index) => remap.get(index);
  const config = {
    title: spec.title ?? '대시보드', subtitle: spec.subtitle ?? null,
    asOfLabel: `${wallClock(asOf, timeZone)} 기준`,
    provenance: `전체 ${rows.length}건${removed.length ? ` (원본 ${table.rows.length}행 중 중복 ${removed.length}행 제외)` : ''}`,
    footer: `원본: ${basename(table.file)}${table.sheet ? ` · ${table.sheet}` : ''} · 원본 파일이 기준이며 이 화면은 ${wallClock(asOf, timeZone)}에 계산한 사본이에요.`,
    columns: kept.map((index) => ({ label: labelOf(index), type: types[index], blankLabel: blankLabels.get(index) ?? spec.columns?.[columns[index]]?.blankLabel ?? null,
      format: types[index] !== 'number' ? null : spec.columns?.[columns[index]]?.format ?? (MONEY.test(columns[index]) ? 'won' : null) })),
    rows: rows.map((row) => ({ v: kept.map((index) => row.values[index]), f: row.flags.map((flag) => (flag ? 1 : 0)), r: row.sourceRow })),
    flags: flagDefs,
    item: { title: r(itemTitle), meta: itemMeta.map(r), note: itemNote == null ? null : r(itemNote) },
    filters: filters.map((filter) => ({ ...filter, col: r(filter.col) })),
    search: { cols: search.cols.map(r), placeholder: search.placeholder },
    kpis: kpis.map((kpi) => ({ ...kpi, col: kpi.col == null ? null : r(kpi.col) })),
    lists: lists.map((list) => ({ ...list, sort: list.sort.map(([index, dir]) => [r(index), dir]) })),
    charts: charts.map((chart) => ({ ...chart, group: r(chart.group), stack: chart.stack == null ? null : r(chart.stack), col: chart.col == null ? null : r(chart.col) })),
    table: tableSpec ? { ...tableSpec, cols: tableSpec.cols.map(r), sort: tableSpec.sort.map(([index, dir]) => [r(index), dir]) } : null,
    source: { name: basename(table.file), sheet: table.sheet, sha256: table.sha256 ?? null, rows: table.rows.length, removedRows: removed },
    // What a panel edit needs to recompute flags exactly as this build did: column names, the flag rules, the reference time.
    rules: { columns: kept.map((index) => columns[index]), flags: (spec.flags ?? []).map((flag) => ({ name: flag.name, when: flag.when })),
      asOf: asOf.toISOString(), timeZone },
  };
  const colors = dashboardColors(spec.colors);
  config.palette = colors.series;
  const [css, runtime] = await Promise.all([readFile(join(here, 'lib', 'page.css'), 'utf8'), readFile(join(here, 'lib', 'page-runtime.js'), 'utf8')]);
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="T5 dashboard builder">
<title>${escapeHtml(config.title)}</title>
<style data-t5-asset="pretendard"></style>
<style>${themeCss(colors)}${css}</style>
<script data-t5-asset="echarts"></script>
</head>
<body>
<main id="app"></main>
<script type="application/json" id="t5-dashboard">${json}</script>
<script>${runtime}</script>
</body>
</html>
`;
  const inlined = await inlineDashboardAssets(html);

  // A compact account of what was computed, for the model's answer and for review.
  const total = (where) => rows.filter((row) => where.every((index) => row.flags[index])).length;
  const summary = {
    rows: { source: table.rows.length, used: rows.length, removedDuplicates: removed, keyConflicts: conflicts },
    asOf: wallClock(asOf, timeZone), timeZone,
    flags: Object.fromEntries(flagDefs.map((flag, index) => [flag.name, rows.filter((row) => row.flags[index]).length])),
    kpis: kpis.map((kpi) => {
      const scope = rows.filter((row) => kpi.where.every((index) => row.flags[index]));
      if (kpi.agg === 'count') return { label: kpi.label, value: scope.length };
      const values = scope.map((row) => row.values[kpi.col]);
      return { label: kpi.label, value: values.filter((value) => typeof value === 'number').reduce((a, b) => a + b, 0), blanks: values.filter((value) => value == null).length };
    }),
    lists: lists.map((list) => ({ title: list.title, count: total(list.where) })),
    filters: filters.map((filter) => ({ column: columns[filter.col], options: filter.options.map((option) => `${option.label} ${option.count}`) })),
    warnings,
  };
  return { html: inlined.html, bytes: inlined.bytes, summary };
}

function argument(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const specPath = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : argument('--spec');
  const output = argument('--output');
  if (!specPath || !output) { process.stderr.write('Usage: build-dashboard.mjs SPEC.json --output DASHBOARD.html [--as-of now|ISO] [--replace]\n'); process.exit(2); }
  if (existsSync(output) && !process.argv.includes('--replace')) { process.stderr.write(`Output exists: ${output} (choose a new version name or pass --replace)\n`); process.exit(2); }
  try {
    const spec = JSON.parse(await readFile(specPath, 'utf8'));
    // The same spec rebuilt at another time ("오늘 기준으로 다시"): the rules stay in the one spec file.
    const asOf = argument('--as-of');
    if (asOf) spec.asOf = asOf === 'now' ? new Date().toISOString() : asOf;
    const result = await buildDashboard(spec, { specDirectory: dirname(resolve(specPath)) });
    if (result.bytes > PREVIEW_LIMIT) throw new Error(`dashboard is ${result.bytes} bytes, above the 5 MB preview limit; narrow the rows or columns`);
    await writeFile(output, result.html);
    // The next step's material: the same spec rebuilds a later version at another time without being rewritten.
    const rebuild = `node "$T5_DASHBOARD_DIR/scripts/build-dashboard.mjs" ${JSON.stringify(resolve(specPath))} --as-of now --output <new name>.html`;
    process.stdout.write(`${JSON.stringify({ output: resolve(output), spec: resolve(specPath), bytes: result.bytes, ...result.summary, rebuild })}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exit(1); }
}
