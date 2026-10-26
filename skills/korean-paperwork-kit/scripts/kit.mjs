#!/usr/bin/env node
// 구비서류 꾸러미: 공고·안내문에서 뽑은 요구 서류 표와 사장님 폴더를 대조하고, 있는 서류를 제출 순서대로 복사해 묶는다. 의존성 0.
// 서류를 고치거나 지우지 않는다(원본 폴더는 읽기만). 묶음 폴더에는 복사본만 쓴다.
// 쓰는 법:
//   node kit.mjs check  --required 요구.json --folder 내폴더 [--assign 맞춤.json] [--today 2026-10-26]
//   node kit.mjs bundle --required 요구.json --folder 내폴더 --out 제출폴더 [--assign 맞춤.json] [--today …]
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Windows PowerShell 5 의 `>` 는 UTF-16 으로 저장한다 — 머리 표시(BOM)를 보고 같이 읽는다.
export function readText(path) {
  const bytes = readFileSync(resolve(path));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le');
  return bytes.toString('utf8').replace(/^\uFEFF/u, '');
}
const readJson = (path) => JSON.parse(readText(path));

/** 이름 비교용: 맥(NFD)·윈도(NFC) 한글을 같게, 띄어쓰기·기호·대소문자를 지운다. */
export const normalize = (text) => String(text ?? '').normalize('NFC').toLowerCase().replace(/[\s_\-.()[\]{}·,]+/gu, '');

/** 파일 이름 속 날짜(20261026, 2026-10-26, 2026.10.26, 2026년10월26일). 없으면 null. */
export function dateInName(name) {
  const m = String(name).normalize('NFC').match(/(20\d{2})[-._년\s]?(\d{2})[-._월\s]?(\d{2})(?!\d)/u);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
const parseDate = (text) => {
  const m = String(text ?? '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/u);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** 폴더 안 파일(숨은 파일 제외, 하위 폴더까지). */
export function listFiles(folder) {
  const root = resolve(folder); const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) out.push({ path, rel: relative(root, path).split('\\').join('/').normalize('NFC'), name: entry.name.normalize('NFC'), bytes: statSync(path).size });
    }
  };
  walk(root);
  return out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

/**
 * 요구 서류마다 폴더 파일을 맞춘다. 파일 하나는 가장 길게 맞는 이름의 서류 하나에만 간다.
 * assign(사람·모델이 내용을 열어 보고 정한 맞춤)이 이름 맞춤보다 먼저다.
 */
export function checkKit(required, files, { assign = {}, today = Date.now() } = {}) {
  const items = (required.items ?? []).map((item, index) => ({ ...item, index, keys: [item.name, ...(item.aliases ?? [])].map(normalize).filter(Boolean) }));
  const byName = new Map(items.map((i) => [normalize(i.name), i]));
  const warnings = [];
  const matches = new Map(items.map((i) => [i.index, []]));
  const assigned = new Map(Object.entries(assign).map(([file, v]) => [file.normalize('NFC'), typeof v === 'string' ? { item: v } : v]));
  const unmatched = [];
  for (const file of files) {
    const a = assigned.get(file.rel) ?? assigned.get(file.name);
    if (a) {
      const item = byName.get(normalize(a.item));
      if (!item) { warnings.push(`맞춤 「${file.rel}」 → 「${a.item}」: 요구 서류 표에 없는 이름`); unmatched.push(file); continue; }
      matches.get(item.index).push({ ...file, issued: a.issued ?? dateInName(file.name), by: '맞춤' });
      continue;
    }
    const n = normalize(file.name.slice(0, file.name.length - extname(file.name).length));
    let best = null;
    for (const item of items) for (const key of item.keys) if (n.includes(key) && (!best || key.length > best.len)) best = { item, len: key.length };
    if (best) matches.get(best.item.index).push({ ...file, issued: dateInName(file.name), by: '이름' });
    else unmatched.push(file);
  }
  for (const item of items) {
    if (item.exemptByDataSharing && !String(item.exemptLine ?? '').trim()) warnings.push(`「${item.name}」 공동이용 생략 표시에 원문 줄(exemptLine)이 없음 — 원문에 없으면 표시하지 않음`);
    if (!String(item.sourceLine ?? '').trim()) warnings.push(`「${item.name}」 원문 줄(sourceLine)이 없음 — 요구 서류는 공고 원문 줄과 함께 적음`);
  }
  const rows = items.map((item) => {
    const found = matches.get(item.index);
    const base = { order: item.index + 1, name: item.name, form: item.form ?? '', optional: Boolean(item.optional), sourceLine: item.sourceLine ?? '',
      issuer: item.issuer ?? '', files: found.map((f) => f.rel) };
    if (!found.length) {
      if (item.exemptByDataSharing && item.exemptLine) return { ...base, status: '생략 가능(원문)', note: item.exemptLine };
      return { ...base, status: item.optional ? '없음(선택)' : '없음', note: item.issuer ? `발급처: ${item.issuer}` : '' };
    }
    const pick = [...found].sort((a, b) => (parseDate(b.issued) ?? 0) - (parseDate(a.issued) ?? 0))[0];
    const extra = found.length > 1 ? `후보 ${found.length}개 — 가장 최근 날짜 파일을 고름` : '';
    if (item.validDays) {
      const issued = parseDate(pick.issued);
      if (issued == null) return { ...base, status: '확인 필요', chosen: pick.rel, note: [`발급일을 파일 이름에서 못 읽음(유효 ${item.validDays}일)`, extra].filter(Boolean).join(' · ') };
      const until = issued + item.validDays * DAY;
      const state = until < today ? '기한 지남' : '있음';
      return { ...base, status: state, chosen: pick.rel, issued: iso(issued), validUntil: iso(until), note: extra };
    }
    return { ...base, status: '있음', chosen: pick.rel, note: extra };
  });
  const count = (s) => rows.filter((r) => r.status === s).length;
  return { title: required.title ?? '', source: required.source ?? '', today: iso(today), rows,
    summary: { 요구: rows.length, 있음: count('있음'), 없음: count('없음'), '없음(선택)': count('없음(선택)'), '기한 지남': count('기한 지남'), '확인 필요': count('확인 필요'), '생략 가능(원문)': count('생략 가능(원문)') },
    unmatchedFiles: unmatched.map((f) => f.rel), warnings };
}

/** 이름에 쓸 수 없는 글자를 뺀다(맥·윈도 공통). */
const safeName = (text) => String(text).normalize('NFC').replace(/[\\/:*?"<>|]+/gu, ' ').replace(/\s+/gu, ' ').trim();

/** 있는 서류(「있음」·「확인 필요」)를 요구 순서대로 「01_서류이름.확장자」로 복사한다. 기한 지난 것·없는 것은 넣지 않는다. */
export function bundleKit(result, folder, out) {
  const target = resolve(out);
  if (existsSync(target) && readdirSync(target).length) throw new Error(`묶음 폴더가 비어 있지 않아요: ${target} — 새 폴더 이름을 주세요(덮어쓰지 않음)`);
  mkdirSync(target, { recursive: true });
  const copied = []; const skipped = [];
  for (const row of result.rows) {
    if (!row.chosen || !['있음', '확인 필요'].includes(row.status)) { skipped.push({ name: row.name, status: row.status }); continue; }
    const name = `${String(row.order).padStart(2, '0')}_${safeName(row.name)}${extname(row.chosen).toLowerCase()}`;
    copyFileSync(join(resolve(folder), row.chosen), join(target, name));
    copied.push({ name, from: row.chosen, status: row.status });
  }
  const pdfs = copied.filter((c) => c.name.endsWith('.pdf')).map((c) => join(target, c.name));
  return { out: target, copied, skipped, pdfs, next: pdfs.length > 1 ? '하나로 묶으려면 document-data 의 merge-pdf 에 pdfs 를 이 순서대로 넘긴다' : null };
}

function main(argv) {
  const [action, ...rest] = argv;
  const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const requiredPath = opt('--required'); const folder = opt('--folder');
  if (!['check', 'bundle'].includes(action) || !requiredPath || !folder) throw new TypeError('쓰는 법: kit.mjs check|bundle --required 요구.json --folder 내폴더 [--assign 맞춤.json] [--today YYYY-MM-DD] [--out 제출폴더]');
  const today = opt('--today') ? parseDate(opt('--today')) : Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const result = checkKit(readJson(requiredPath), listFiles(folder), { assign: opt('--assign') ? readJson(opt('--assign')) : {}, today });
  if (action === 'check') return result;
  if (!opt('--out')) throw new TypeError('bundle 은 --out 제출폴더 가 있어야 해요');
  return { check: result.summary, ...bundleKit(result, folder, opt('--out')) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exit(1); }
}
