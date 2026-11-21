#!/usr/bin/env node
// 받을 돈 독촉 문서: 미수금 계산, 내용증명 초안 명세, 지급명령 자료표 명세, 판단 문장 후보 찾기. 의존성 0(Node 내장만).
// 법률 판단을 하지 않는다: 금액·날짜·증거 파일 같은 사실만 정리하고, 문안 속 판단처럼 읽히는 말을 후보로 알린다.
// 쓰는 법:
//   node reminder.mjs summary     --facts 미수.json [--evidence 증거폴더] [--today 2026-10-26]
//   node reminder.mjs letter      --facts 미수.json --body 본문.md --out 명세.json    → 내용증명 초안(docx 명세)
//   node reminder.mjs claim-sheet --facts 미수.json --evidence 증거폴더 --out 명세.json → 지급명령 자료표(docx 명세)
//   node reminder.mjs lint        --input 문안.md|.txt                                 → 판단·위협처럼 읽히는 말 후보
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readText(path) {
  const bytes = readFileSync(resolve(path));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le');
  return bytes.toString('utf8').replace(/^\uFEFF/u, '');
}
export const won = (n) => Number(n).toLocaleString('ko-KR');
const blank = (v) => v == null || String(v).trim() === '';
const MISSING = '(미정)';
const parseDate = (text) => { const m = String(text ?? '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/u); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
const kdate = (v) => { const t = parseDate(v); if (t == null) return blank(v) ? MISSING : String(v); const d = new Date(t); return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}.`; };
const DAY = 86400000;

/** 숫자 금액 → 한글(자리마다 「일」까지, 띄우지 않음). 한국 업무 서식과 같은 관행. */
export function hangulNumber(n) {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`0 이상 정수만: ${n}`);
  if (!n) return '영';
  const D = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']; const S = ['', '십', '백', '천']; const B = ['', '만', '억', '조'];
  let out = ''; const groups = [];
  for (let r = n; r > 0; r = Math.floor(r / 10000)) groups.push(r % 10000);
  for (let g = groups.length - 1; g >= 0; g -= 1) {
    if (!groups[g]) continue;
    for (let p = 3; p >= 0; p -= 1) { const d = Math.floor(groups[g] / 10 ** p) % 10; if (d) out += D[d] + S[p]; }
    out += B[g];
  }
  return out;
}

/** 거래(청구)와 받은 돈으로 남은 금액. 이자·지연손해금은 계산하지 않는다(법리 판단). */
export function computeOutstanding(facts, today = Date.now()) {
  const items = (facts.items ?? []).map((i) => ({ ...i, amount: Number(i.amount) }));
  const payments = (facts.payments ?? []).map((p) => ({ ...p, amount: Number(p.amount) }));
  const bad = [...items, ...payments].filter((x) => !Number.isSafeInteger(x.amount) || x.amount < 0);
  if (bad.length) throw new RangeError('금액은 0 이상 정수(원)만');
  const billed = items.reduce((s, i) => s + i.amount, 0); const paid = payments.reduce((s, p) => s + p.amount, 0);
  const outstanding = billed - paid;
  const due = parseDate(facts.dueDate);
  return { billed, paid, outstanding, outstandingHangul: outstanding >= 0 ? `일금 ${hangulNumber(outstanding)}원정` : null,
    dueDate: due == null ? null : kdate(facts.dueDate), daysOverdue: due == null ? null : Math.max(0, Math.floor((today - due) / DAY)),
    warnings: [...(outstanding <= 0 ? ['받을 돈이 남아 있지 않음(청구 ≤ 받은 돈) — 사실표를 다시 확인'] : []), ...(due == null ? ['원래 지급 기한(dueDate)이 없음 — 계약·견적·청구서에서 찾기'] : [])] };
}

export function listEvidence(folder) {
  if (!folder) return [];
  const root = resolve(folder); const out = [];
  const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue; const p = join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (e.isFile()) out.push({ rel: relative(root, p).split('\\').join('/').normalize('NFC'), bytes: statSync(p).size });
  } };
  walk(root); return out.sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

/** 사실표의 증거 이름(items[].docs)이 폴더에 실제로 있는지. */
export function matchEvidence(facts, files) {
  const names = new Map(files.map((f) => [f.rel.normalize('NFC'), f]));
  const base = new Map(files.map((f) => [f.rel.split('/').pop().normalize('NFC'), f]));
  const declared = [...new Set((facts.items ?? []).flatMap((i) => i.docs ?? []).concat(facts.evidence ?? []))].map((d) => String(d).normalize('NFC'));
  const rows = declared.map((d) => { const f = names.get(d) ?? base.get(d); return { name: d, found: Boolean(f), file: f?.rel ?? null }; });
  const used = new Set(rows.filter((r) => r.found).map((r) => r.file));
  return { rows, missing: rows.filter((r) => !r.found).map((r) => r.name), notListed: files.map((f) => f.rel).filter((r) => !used.has(r)) };
}

const party = (p) => [p?.name, p?.representative ? `대표 ${p.representative}` : null].filter(Boolean).join(' ') || MISSING;
const partyRows = (facts) => [
  { k: '보내는 사람(채권자)', n: party(facts.creditor), a: facts.creditor?.address ?? MISSING, c: facts.creditor?.phone ?? '' },
  { k: '받는 사람(채무자)', n: party(facts.debtor), a: facts.debtor?.address ?? MISSING, c: facts.debtor?.phone ?? '' },
];
function requiredMissing(facts, extra = []) {
  const m = [];
  for (const [path, label] of [['creditor.name', '보내는 사람 이름'], ['creditor.address', '보내는 사람 주소'], ['debtor.name', '받는 사람 이름'], ['debtor.address', '받는 사람 주소'], ...extra]) {
    const v = path.split('.').reduce((o, k) => o?.[k], facts); if (blank(v)) m.push(label);
  }
  if (!(facts.items ?? []).length) m.push('거래(청구) 내역');
  return m;
}
const itemRows = (facts) => (facts.items ?? []).map((i) => ({ d: kdate(i.date), w: i.description ?? MISSING, a: won(i.amount) }));

/** 내용증명 초안: 본문(사람·모델이 쓴 문안)은 그대로 넣고, 당사자·거래·금액·기한 칸은 사실표에서 채운다. */
export function buildLetter(facts, body, today = Date.now()) {
  const o = computeOutstanding(facts, today);
  const missing = requiredMissing(facts, [['newDeadline', '지급을 요청하는 기한'], ['creditor.account', '받을 계좌']]);
  const paragraphs = String(body ?? '').replace(/\r\n/gu, '\n').split(/\n{2,}/u).map((t) => t.trim()).filter(Boolean);
  if (!paragraphs.length) missing.push('본문');
  const spec = { title: '내용증명', header: false, pageNumbers: false, blocks: [
    { type: 'table', columns: [{ key: 'k', header: '구분' }, { key: 'n', header: '이름' }, { key: 'a', header: '주소' }, { key: 'c', header: '연락처' }], rows: partyRows(facts) },
    { type: 'paragraph', text: `제목: ${facts.subject ?? '미지급 대금 지급 요청'}`, style: 'heading2' },
    ...paragraphs.map((text) => ({ type: 'paragraph', text })),
    { type: 'table', columns: [{ key: 'd', header: '날짜' }, { key: 'w', header: '거래 내용' }, { key: 'a', header: '금액(원)' }], rows: [
      ...itemRows(facts), ...(o.paid ? [{ d: '', w: '받은 돈', a: `-${won(o.paid)}` }] : []), { d: '', w: '남은 금액', a: won(o.outstanding) }] },
    { type: 'paragraph', text: `남은 금액 ${o.outstandingHangul ?? MISSING} (₩${won(o.outstanding)})을 ${kdate(facts.newDeadline)}까지 아래 계좌로 보내 주시기 바랍니다.` },
    { type: 'paragraph', text: `받을 계좌: ${facts.creditor?.account ?? MISSING}` },
    { type: 'paragraph', text: `${kdate(facts.letterDate ?? new Date(today).toISOString().slice(0, 10))}` },
    { type: 'paragraph', text: `보내는 사람 ${party(facts.creditor)} (서명 또는 인)` },
  ] };
  return { spec, outstanding: o, missing, lint: lintText(paragraphs.join('\n')) };
}

/** 지급명령 신청 때 옮겨 적을 자료표. 신청서 칸 초안이 아니라 사실 묶음이다. */
export function buildClaimSheet(facts, files, today = Date.now()) {
  const o = computeOutstanding(facts, today); const ev = matchEvidence(facts, files);
  const missing = requiredMissing(facts);
  const timeline = [...(facts.items ?? []).map((i) => ({ t: parseDate(i.date), d: kdate(i.date), w: `청구: ${i.description ?? ''} ${won(i.amount)}원` })),
    ...(facts.payments ?? []).map((p) => ({ t: parseDate(p.date), d: kdate(p.date), w: `받음: ${won(p.amount)}원` })),
    ...(facts.events ?? []).map((e) => ({ t: parseDate(e.date), d: kdate(e.date), w: e.text }))].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  const spec = { title: '지급명령 신청 자료표', header: false, pageNumbers: false, blocks: [
    { type: 'paragraph', text: '이 표는 전자소송 지급명령 신청서에 옮겨 적을 사실을 모은 자료입니다. 신청서 작성·제출과 비용 납부는 본인이 합니다.' },
    { type: 'paragraph', text: '당사자', style: 'heading2' },
    { type: 'table', columns: [{ key: 'k', header: '구분' }, { key: 'n', header: '이름' }, { key: 'a', header: '주소' }, { key: 'c', header: '연락처' }], rows: partyRows(facts) },
    { type: 'paragraph', text: '청구 금액', style: 'heading2' },
    { type: 'table', columns: [{ key: 'k', header: '구분' }, { key: 'v', header: '금액(원)' }], rows: [
      { k: '청구한 돈 합계', v: won(o.billed) }, { k: '받은 돈 합계', v: won(o.paid) }, { k: '남은 금액', v: won(o.outstanding) }] },
    { type: 'paragraph', text: '이자·지연손해금은 이 표에서 계산하지 않았습니다.' },
    { type: 'paragraph', text: '있었던 일(날짜순)', style: 'heading2' },
    { type: 'table', columns: [{ key: 'd', header: '날짜' }, { key: 'w', header: '내용' }], rows: timeline.map(({ d, w }) => ({ d, w })) },
    { type: 'paragraph', text: '증거 파일', style: 'heading2' },
    { type: 'table', columns: [{ key: 'n', header: '증거' }, { key: 's', header: '폴더에 있음' }, { key: 'f', header: '파일' }],
      rows: ev.rows.map((r) => ({ n: r.name, s: r.found ? '있음' : '없음', f: r.file ?? '' })) },
  ] };
  return { spec, outstanding: o, evidence: ev, missing };
}

// 판단·약속·위협처럼 읽히는 말. 후보만 낸다 — 고칠지는 모델과 사람이 문맥을 보고 정한다.
const LINT = [
  [/승소|패소|이기실|이길\s?수|질\s?수\s?없/u, '결과 예측'],
  [/법적\s?(?:효력|책임|조치)|효력이\s?(?:있|생기)/u, '법적 판단'],
  [/반드시\s?받|확실히\s?받|100\s?%|틀림없이/u, '결과 장담'],
  [/형사|고소|고발|사기죄|횡령|처벌|구속|전과/u, '형사 언급'],
  [/압류|강제\s?집행|신용\s?불량|가압류/u, '집행 언급'],
  [/가만두지|각오|후회하|망신|회사에\s?알리|가족에게/u, '위협'],
  [/이자|지연\s?손해금|연\s?\d+(?:\.\d+)?\s?%/u, '이자 언급(계약서 문구 인용인지 확인)'],
];
export function lintText(text) {
  return String(text ?? '').split(/\r?\n/u).flatMap((line, i) => LINT.filter(([re]) => re.test(line)).map(([re, kind]) => ({ line: i + 1, kind, word: line.match(re)[0], text: line.trim().slice(0, 80) })));
}

function main(argv) {
  const [action, ...rest] = argv;
  const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const today = opt('--today') ? parseDate(opt('--today')) : Date.now();
  if (action === 'lint') { if (!opt('--input')) throw new TypeError('lint 는 --input 문안 파일'); const hits = lintText(readText(opt('--input'))); return { hits, count: hits.length }; }
  const factsPath = opt('--facts');
  if (!factsPath) throw new TypeError('쓰는 법: reminder.mjs summary|letter|claim-sheet --facts 미수.json … | lint --input 문안');
  const facts = JSON.parse(readText(factsPath));
  if (action === 'summary') {
    const o = computeOutstanding(facts, today);
    return { ...o, evidence: opt('--evidence') ? matchEvidence(facts, listEvidence(opt('--evidence'))) : undefined };
  }
  const out = opt('--out'); if (!out) throw new TypeError(`${action} 은 --out 명세.json 이 있어야 해요`);
  let result;
  if (action === 'letter') { if (!opt('--body')) throw new TypeError('letter 는 --body 본문 파일이 있어야 해요'); result = buildLetter(facts, readText(opt('--body')), today); }
  else if (action === 'claim-sheet') result = buildClaimSheet(facts, listEvidence(opt('--evidence')), today);
  else throw new TypeError('동작: summary · letter · claim-sheet · lint');
  writeFileSync(resolve(out), `${JSON.stringify(result.spec, null, 2)}\n`);
  const { spec, ...facts2 } = result;
  return { ...facts2, specPath: resolve(out), next: `"$T5_DOCUMENT_CLI" create-docx --spec "${resolve(out)}" --output <결과 파일>.docx` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exit(1); }
}
