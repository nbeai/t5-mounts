#!/usr/bin/env node
// 한국 업무 서식(견적서·거래명세서·청구서)의 계산과 틀 조립. 의존성 0(Node 내장만).
// 그리지 않는다: 티파이브 문서 도구("$T5_DOCUMENT_CLI" create-docx / create-xlsx)가 읽는 명세 JSON 만 만든다.
// 쓰는 법:
//   node forms.mjs build --facts 사실.json --format docx|xlsx --out 명세.json   → 명세 파일 + 계산 사실(JSON, 표준 출력)
//   node forms.mjs amount 113560                                             → 일금 일십일만삼천오백육십원정
//   node forms.mjs bizno 123-45-67890                                        → 사업자등록번호 모양·검증 숫자
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIGITS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const SMALL = ['', '십', '백', '천'];
const BIG = ['', '만', '억', '조', '경'];

/** 숫자 금액 → 한글 금액. 자리마다 「일」까지 적는다(일십·일백 — 고쳐 쓰기 어렵게 하는 관행). */
export function hangulNumber(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`한글 금액은 0 이상 정수만: ${value}`);
  if (n === 0) return '영';
  const groups = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 10000)) groups.push(rest % 10000);
  let out = '';
  for (let g = groups.length - 1; g >= 0; g -= 1) {
    const group = groups[g]; if (!group) continue;
    let part = '';
    for (let p = 3; p >= 0; p -= 1) {
      const d = Math.floor(group / 10 ** p) % 10;
      if (d) part += DIGITS[d] + SMALL[p];
    }
    out += part + BIG[g];
  }
  return out;
}

/** 「일금 ○○원정」 — 띄어 쓰지 않는다(관행, 법정 규정 아님). */
export const hangulAmount = (value) => `일금 ${hangulNumber(value)}원정`;
export const won = (value) => Number(value).toLocaleString('ko-KR');

/** 사업자등록번호: 10자리 모양과 널리 쓰이는 검증 숫자 식. 떨어져도 막지 않고 「확인 필요」로만 낸다. */
export function checkBizNo(text) {
  const digits = String(text ?? '').replace(/[^0-9]/gu, '');
  if (digits.length !== 10) return { ok: false, formatted: String(text ?? ''), reason: '10자리가 아님' };
  const d = [...digits].map(Number); const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0; for (let i = 0; i < 9; i += 1) sum += d[i] * w[i];
  sum += Math.floor((d[8] * 5) / 10);
  const check = (10 - (sum % 10)) % 10;
  const formatted = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  return check === d[9] ? { ok: true, formatted } : { ok: false, formatted, reason: '검증 숫자가 맞지 않음' };
}

/** 2026-10-26, 2026.10.26, 2026/10/26, 「2026. 10. 26.」 → 「2026. 10. 26.」(일 뒤 마침표까지). 못 읽으면 null. */
export function koreanDate(text) {
  const m = String(text ?? '').trim().match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*[.일]?$/u);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}. ${mo}. ${d}.`;
}

// 정수 나눗셈의 끝수 처리. 기본은 버림(원 미만 절사) — 우리가 고른 기본값이지 법정 규칙이 아니다.
const ROUNDING = {
  floor: (n, k) => Math.floor(n / k),
  round: (n, k) => { const q = Math.floor(n / k); return (n - q * k) * 2 >= k ? q + 1 : q; },
  ceil: (n, k) => Math.ceil(n / k),
};
const TAX_KINDS = new Set(['과세', '면세', '영세']);

/** 품목마다 공급가액·세액을 정수로 계산하고 합계를 낸다. */
export function computeTotals(facts) {
  const rounding = facts.vatRounding ?? 'floor'; const basis = facts.vatBasis ?? 'line';
  if (!ROUNDING[rounding]) throw new RangeError(`vatRounding 은 floor·round·ceil 가운데 하나: ${rounding}`);
  if (!['line', 'total'].includes(basis)) throw new RangeError(`vatBasis 는 line·total 가운데 하나: ${basis}`);
  const R = ROUNDING[rounding]; const warnings = [];
  const lines = (facts.items ?? []).map((item, i) => {
    const tax = item.tax ?? '과세';
    if (!TAX_KINDS.has(tax)) throw new RangeError(`${i + 1}번 품목 tax 는 과세·면세·영세 가운데 하나: ${tax}`);
    const qty = Number(item.qty); const price = Number(item.unitPrice);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) return { ...item, tax, supply: null, vat: null, sum: null };
    let gross = qty * price;
    if (!Number.isInteger(gross)) { warnings.push(`${i + 1}번 품목 수량×단가(${gross})가 원 단위가 아니어서 반올림함`); gross = Math.round(gross); }
    let supply = gross; let vat = 0;
    if (tax === '과세') {
      if (facts.priceIncludesVat) { vat = R(gross, 11); supply = gross - vat; } else vat = R(supply, 10);
    }
    return { ...item, tax, supply, vat, sum: supply + vat };
  });
  const known = lines.filter((l) => l.supply != null);
  const supply = known.reduce((s, l) => s + l.supply, 0);
  const lineVat = known.reduce((s, l) => s + l.vat, 0);
  const taxable = known.filter((l) => l.tax === '과세').reduce((s, l) => s + l.supply, 0);
  const totalVat = facts.priceIncludesVat
    ? R(known.filter((l) => l.tax === '과세').reduce((s, l) => s + l.sum, 0), 11)
    : R(taxable, 10);
  const vat = basis === 'line' ? lineVat : totalVat;
  const total = basis === 'line' ? supply + vat
    : (facts.priceIncludesVat ? known.reduce((s, l) => s + l.sum, 0) : supply + vat);
  const supplyTotal = total - vat;
  if (lineVat !== totalVat) warnings.push(`세액을 품목마다 끝수 처리한 합(${won(lineVat)})과 합계에서 한 번에 낸 값(${won(totalVat)})이 달라요 — 지금은 ${basis === 'line' ? '품목마다' : '합계 기준'}`);
  if (known.length !== lines.length) warnings.push('수량·단가가 없는 품목이 있어 합계에서 빠졌어요');
  return { lines, supply: supplyTotal, vat, total, totalHangul: hangulAmount(total), rounding, basis, warnings };
}

const FORMS = {
  견적서: { dateLabel: '견적일', intro: '아래와 같이 견적합니다.', required: [], recommended: ['terms.validUntil'] },
  거래명세서: { dateLabel: '거래일', intro: '아래와 같이 거래합니다.', required: [], recommended: ['buyer.bizNo'] },
  청구서: { dateLabel: '청구일', intro: '아래와 같이 청구합니다.', required: ['terms.account', 'terms.dueDate'], recommended: [] },
};
const COMMON_REQUIRED = ['date', 'supplier.name', 'supplier.bizNo', 'supplier.representative', 'buyer.name'];
const LABELS = {
  date: '작성일', 'supplier.name': '공급자 상호', 'supplier.bizNo': '공급자 사업자등록번호', 'supplier.representative': '공급자 대표자',
  'buyer.name': '공급받는자 상호(성명)', 'buyer.bizNo': '공급받는자 사업자등록번호', 'terms.validUntil': '유효기간',
  'terms.account': '입금 계좌', 'terms.dueDate': '입금 기한',
};
const get = (obj, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), obj);
const blank = (v) => v == null || String(v).trim() === '';
const MISSING = '(미정)';

/** 사실표(facts)를 읽어 문서 도구 명세와 계산 사실을 만든다. 모르는 칸은 0 이 아니라 「(미정)」으로 두고 목록에 적는다. */
export function buildForm(facts, format) {
  const form = FORMS[facts.form];
  if (!form) throw new RangeError(`form 은 ${Object.keys(FORMS).join('·')} 가운데 하나: ${facts.form}`);
  if (!['docx', 'xlsx'].includes(format)) throw new RangeError(`format 은 docx·xlsx: ${format}`);
  if (format === 'xlsx' && (facts.vatBasis ?? 'line') === 'total') throw new RangeError('엑셀 틀은 품목마다 세액(vatBasis line)만 — 합계 기준이면 docx 로');
  if (!Array.isArray(facts.items) || !facts.items.length) throw new RangeError('items(품목)가 하나 이상 있어야 해요');

  const missing = []; const warnings = [];
  for (const path of [...COMMON_REQUIRED, ...form.required]) if (blank(get(facts, path))) missing.push(LABELS[path] ?? path);
  facts.items.forEach((item, i) => { for (const k of ['name', 'qty', 'unitPrice']) if (blank(item[k])) missing.push(`${i + 1}번 품목 ${{ name: '품명', qty: '수량', unitPrice: '단가' }[k]}`); });
  for (const path of form.recommended) if (blank(get(facts, path))) warnings.push(`${LABELS[path]} 칸이 비었어요(관행상 적는 칸)`);
  for (const who of ['supplier', 'buyer']) {
    const no = get(facts, `${who}.bizNo`);
    if (!blank(no)) { const c = checkBizNo(no); if (!c.ok) warnings.push(`${who === 'supplier' ? '공급자' : '공급받는자'} 사업자등록번호 ${no}: ${c.reason} — 원본과 대조 필요`); }
  }
  const dateText = (v) => (blank(v) ? MISSING : (koreanDate(v) ?? String(v)));
  for (const [k, v] of [['date', facts.date], ['terms.validUntil', facts.terms?.validUntil], ['terms.dueDate', facts.terms?.dueDate]]) {
    if (!blank(v) && !koreanDate(v) && /\d/u.test(String(v))) warnings.push(`${LABELS[k]} 「${v}」를 날짜로 읽지 못해 그대로 둠`);
  }

  const totals = computeTotals(facts); warnings.push(...totals.warnings);
  const val = (v) => (blank(v) ? MISSING : String(v));
  const bizNo = (v) => (blank(v) ? MISSING : checkBizNo(v).formatted);
  const vatNote = totals.vat ? '부가가치세 포함' : '부가가치세 없음(면세·영세)';
  const totalLine = `합계 금액  ${totals.totalHangul} (₩${won(totals.total)}, ${vatNote})`;
  const termRows = [
    ['유효기간', dateText(facts.terms?.validUntil), !blank(facts.terms?.validUntil) || form.recommended.includes('terms.validUntil')],
    ['납기', val(facts.terms?.delivery), !blank(facts.terms?.delivery)],
    ['결제 조건', val(facts.terms?.payment), !blank(facts.terms?.payment)],
    ['입금 계좌', val(facts.terms?.account), !blank(facts.terms?.account) || form.required.includes('terms.account')],
    ['입금 기한', dateText(facts.terms?.dueDate), !blank(facts.terms?.dueDate) || form.required.includes('terms.dueDate')],
    ['비고', val(facts.note), !blank(facts.note)],
  ].filter(([, , show]) => show).map(([k, v]) => ({ k, v }));
  const partyRows = [
    ['상호(성명)', val(facts.buyer?.name), val(facts.supplier?.name)],
    ['대표자', blank(facts.buyer?.representative) ? '' : facts.buyer.representative, val(facts.supplier?.representative)],
    ['사업자등록번호', blank(facts.buyer?.bizNo) ? (form.recommended.includes('buyer.bizNo') ? MISSING : '') : bizNo(facts.buyer.bizNo), bizNo(facts.supplier?.bizNo)],
    ['주소', facts.buyer?.address ?? '', facts.supplier?.address ?? ''],
    ['업태·종목', '', [facts.supplier?.businessType, facts.supplier?.businessItem].filter((x) => !blank(x)).join(' · ')],
    ['연락처', facts.buyer?.phone ?? '', facts.supplier?.phone ?? ''],
    ['담당자', facts.buyer?.contact ?? '', facts.supplier?.contact ?? ''],
  ].filter(([, b, s]) => !blank(b) || !blank(s)).map(([k, buyer, supplier]) => ({ k, buyer, supplier }));
  // 거래명세서는 품목마다 거래 일자를 적는 꼴이다 — 품목에 일자가 없으면 거래일을 쓴다.
  if (facts.form === '거래명세서') totals.lines = totals.lines.map((l) => ({ ...l, date: blank(l.date) ? facts.date : l.date }));
  const withDate = facts.form === '거래명세서' || totals.lines.some((l) => !blank(l.date));
  const showVatColumn = totals.basis === 'line';
  const itemColumns = [
    ...(withDate ? [{ key: 'date', header: '일자' }] : []),
    { key: 'name', header: '품명' }, { key: 'spec', header: '규격' }, { key: 'qty', header: '수량' }, { key: 'unit', header: '단위' },
    { key: 'unitPrice', header: '단가' }, { key: 'supply', header: '공급가액' },
    ...(showVatColumn ? [{ key: 'vat', header: '세액' }] : []), { key: 'note', header: '비고' },
  ].filter((c) => !['spec', 'unit', 'note'].includes(c.key) || totals.lines.some((l) => !blank(l[c.key]))
    || (c.key === 'note' && format === 'xlsx' && totals.lines.some((l) => l.tax !== '과세')));

  let spec;
  if (format === 'docx') {
    const money = (n) => (n == null ? MISSING : won(n));
    const head = `${form.dateLabel} ${dateText(facts.date)}`;
    spec = {
      title: facts.form, header: false, pageNumbers: false,
      blocks: [
        { type: 'paragraph', text: head },
        { type: 'table', columns: [{ key: 'k', header: '구분' }, { key: 'buyer', header: '공급받는자' }, { key: 'supplier', header: '공급자' }], rows: partyRows },
        { type: 'paragraph', text: `${val(facts.buyer?.name)} 귀하 — ${form.intro}` },
        { type: 'paragraph', text: totalLine, style: 'heading2', keepWithNext: true },
        { type: 'table', columns: itemColumns, rows: totals.lines.map((l) => ({
          date: dateText(l.date) === MISSING ? '' : dateText(l.date), name: val(l.name), spec: l.spec ?? '', qty: blank(l.qty) ? MISSING : won(l.qty),
          unit: l.unit ?? '', unitPrice: blank(l.unitPrice) ? MISSING : won(l.unitPrice), supply: money(l.supply),
          vat: l.tax === '과세' ? money(l.vat) : l.tax, note: l.note ?? '' })) },
        { type: 'table', columns: [{ key: 'k', header: '합계' }, { key: 'v', header: '금액(원)' }], rows: [
          { k: '공급가액', v: won(totals.supply) }, { k: '세액', v: won(totals.vat) }, { k: '합계 금액', v: won(totals.total) }] },
        ...(termRows.length ? [{ type: 'table', columns: [{ key: 'k', header: '조건' }, { key: 'v', header: '내용' }], rows: termRows }] : []),
      ],
    };
  } else {
    const allTaxable = totals.lines.every((l) => l.tax === '과세');
    const fnName = { floor: 'ROUNDDOWN', round: 'ROUND', ceil: 'ROUNDUP' }[totals.rounding];
    const integralGross = totals.lines.every((l) => Number.isInteger(Number(l.qty) * Number(l.unitPrice)));
    const columns = [...itemColumns.map((c) => ({ ...c, ...(['qty', 'unitPrice', 'supply', 'vat'].includes(c.key) ? { numberFormat: '#,##0' } : {}) })),
      { key: 'sum', header: '합계', numberFormat: '#,##0' }];
    // 사람이 고칠 표라 공급가액·세액·합계는 수식으로 남긴다(값은 이 스크립트가 계산해 함께 넣는다 — 문서 도구가 결과 없는 수식을 받지 않음).
    const columnFormulas = [];
    if (!facts.priceIncludesVat && integralGross) {
      columnFormulas.push({ key: 'supply', formula: '={col:qty}{row}*{col:unitPrice}{row}', results: totals.lines.map((l) => l.supply), numberFormat: '#,##0' });
      if (allTaxable) columnFormulas.push({ key: 'vat', formula: `=${fnName}({col:supply}{row}*0.1,0)`, results: totals.lines.map((l) => l.vat), numberFormat: '#,##0' });
    }
    columnFormulas.push({ key: 'sum', formula: '={col:supply}{row}+{col:vat}{row}', results: totals.lines.map((l) => l.sum), numberFormat: '#,##0' });
    spec = { sheets: [
      { name: facts.form, title: `${facts.form} · ${val(facts.buyer?.name)} 귀하 · ${form.dateLabel} ${dateText(facts.date)}`, columns,
        rows: totals.lines.map((l) => ({ ...(withDate ? { date: dateText(l.date) === MISSING ? '' : dateText(l.date) } : {}),
          name: val(l.name), spec: l.spec ?? '', qty: l.qty ?? null, unit: l.unit ?? '', unitPrice: l.unitPrice ?? null,
          supply: l.supply, vat: l.tax === '과세' ? l.vat : 0, sum: l.sum, note: l.tax === '과세' ? (l.note ?? '') : [l.tax, l.note].filter(Boolean).join(' · ') })),
        columnFormulas, total: { label: '합계', columns: ['supply', 'vat', 'sum'] } },
      { name: '거래 정보', columns: [{ key: 'k', header: '구분' }, { key: 'supplier', header: '공급자' }, { key: 'buyer', header: '공급받는자' }], rows: partyRows },
      { name: '조건', columns: [{ key: 'k', header: '칸' }, { key: 'v', header: '내용' }], rows: [
        { k: form.dateLabel, v: dateText(facts.date) }, { k: '합계 금액(한글)', v: `${totals.totalHangul} (₩${won(totals.total)}, ${vatNote})` }, ...termRows] },
    ] };
  }
  return { form: facts.form, format, spec, totals: { supply: totals.supply, vat: totals.vat, total: totals.total, totalHangul: totals.totalHangul,
    vatRounding: totals.rounding, vatBasis: totals.basis }, missing, warnings };
}

// 사실표를 Windows PowerShell 5 의 `>` 로 저장하면 UTF-16 이다 — 머리 표시(BOM)를 보고 같이 읽는다.
export function readText(path) {
  const bytes = readFileSync(resolve(path));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le');
  return bytes.toString('utf8').replace(/^﻿/u, '');
}

function main(argv) {
  const [action, ...rest] = argv;
  const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  if (action === 'amount') return { amount: Number(rest[0]), hangul: hangulAmount(rest[0]), won: `₩${won(rest[0])}` };
  if (action === 'bizno') return checkBizNo(rest[0]);
  if (action === 'build') {
    const factsPath = opt('--facts'); const out = opt('--out'); const format = opt('--format') ?? 'docx';
    if (!factsPath || !out) throw new TypeError('쓰는 법: forms.mjs build --facts 사실.json --format docx|xlsx --out 명세.json');
    const result = buildForm(JSON.parse(readText(factsPath)), format);
    writeFileSync(resolve(out), `${JSON.stringify(result.spec, null, 2)}\n`);
    const { spec, ...facts } = result;
    return { ...facts, specPath: resolve(out), next: `"$T5_DOCUMENT_CLI" create-${format} --spec "${resolve(out)}" --output <결과 파일>.${format}` };
  }
  throw new TypeError('동작: build · amount · bizno');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exit(1); }
}
