#!/usr/bin/env node
// 직원 서류(근로계약서·임금명세서·4대보험 신고 기한)의 계산과 명세 조립. 의존성 0(Node 내장만).
// 그리지 않는다: 티파이브 문서 도구("$T5_DOCUMENT_CLI" create-docx / create-xlsx)가 읽는 명세 JSON 만 만든다.
// 해마다 바뀌는 값(최저임금·보험료율·세액)은 이 파일에 없다 — 사람이 그해 고시·고지서에서 확인해 사실표에 넣는다.
// 쓰는 법:
//   node payroll.mjs wage      --facts 근무.json --out-dir 명세폴더   → 임금대장(xlsx)·직원별 임금명세서(docx) 명세 + 계산 사실
//   node payroll.mjs contract  --facts 계약.json --out 명세.json       → 근로계약서(docx) 명세 + 빠진 법정 항목
//   node payroll.mjs deadlines --facts 입퇴사.json                     → 4대보험 취득·상실 신고 기한
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readText(path) {
  const bytes = readFileSync(resolve(path));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le');
  return bytes.toString('utf8').replace(/^﻿/u, '');
}
export const won = (n) => Number(n).toLocaleString('ko-KR');
const blank = (v) => v == null || String(v).trim() === '';
const MISSING = '(미정)';
const num = (v) => (blank(v) ? 0 : Number(v));

export function koreanDate(text) {
  const m = String(text ?? '').trim().match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*[.일]?$/u);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? `${y}. ${mo}. ${d}.` : null;
}
const dateText = (v) => (blank(v) ? MISSING : (koreanDate(v) ?? String(v)));

// 원 미만 끝수: 기본 버림(우리 기본값 — 법정 끝수 규칙 확인 안 됨). 사람·전 명세서가 정한 것을 따른다.
const ROUND = { floor: Math.floor, round: Math.round, ceil: Math.ceil };

/**
 * 직원 한 명의 한 달 임금. 시간은 그달 합계로 받는다.
 * - regularHours: 소정근로로 일한 시간, overtimeHours: 연장근로 시간
 * - nightHours: 위 시간 가운데 오후 10시~오전 6시에 든 시간(가산분만 더함)
 * - holidayHours / holidayOver8Hours: 휴일근로 8시간 이내 / 초과
 * - paidWeeklyHolidayWeeks: 주휴를 받는 주 수(그 주 소정근로일 개근)
 */
export function computeWage(emp, rules) {
  const R = ROUND[rules.rounding ?? 'floor']; if (!R) throw new RangeError('rounding 은 floor·round·ceil');
  const wage = Number(emp.hourlyWage); const lines = []; const warnings = []; const missing = [];
  // 월급제는 시급 없이 allowances 에 기본급을 정액으로 받는다.
  if ((!Number.isFinite(wage) || wage <= 0) && !(blank(emp.hourlyWage) && (emp.allowances ?? []).length)) missing.push(`${emp.name ?? '?'} 시급`);
  if (rules.overtimePremium == null) missing.push('가산임금 적용 여부(상시 5명 이상 사업장인지)');
  const add = (label, amount, method) => lines.push({ label, amount: R(amount), method });
  const weekly = Number(emp.weeklyContractHours);
  if (Number.isFinite(wage) && wage > 0) {
    add('기본급', wage * num(emp.regularHours), `시급 ${won(wage)}원 × 소정근로 ${num(emp.regularHours)}시간`);
    const weeks = num(emp.paidWeeklyHolidayWeeks);
    if (weeks) {
      if (!Number.isFinite(weekly)) missing.push(`${emp.name} 1주 소정근로시간(주휴 계산)`);
      else if (weekly < 15) warnings.push(`${emp.name}: 1주 소정근로 ${weekly}시간(15시간 미만)이라 주휴수당을 넣지 않음(근로기준법 18조 3항)`);
      else {
        const h = (Math.min(weekly, 40) / 40) * 8;
        add('주휴수당', wage * h * weeks, `시급 ${won(wage)}원 × ${Math.round(h * 100) / 100}시간(1주 소정 ${weekly}시간 ÷ 40 × 8) × ${weeks}주`);
      }
    }
    const p = rules.overtimePremium === true;
    if (num(emp.overtimeHours)) add('연장근로수당', wage * num(emp.overtimeHours) * (p ? 1.5 : 1), `시급 × ${num(emp.overtimeHours)}시간 × ${p ? '1.5(가산 50%)' : '1(가산 미적용)'}`);
    if (num(emp.nightHours) && p) add('야간근로가산', wage * num(emp.nightHours) * 0.5, `시급 × ${num(emp.nightHours)}시간 × 0.5`);
    if (num(emp.holidayHours)) add('휴일근로수당', wage * num(emp.holidayHours) * (p ? 1.5 : 1), `시급 × ${num(emp.holidayHours)}시간 × ${p ? '1.5' : '1'}`);
    if (num(emp.holidayOver8Hours)) add('휴일근로수당(8시간 초과)', wage * num(emp.holidayOver8Hours) * (p ? 2 : 1), `시급 × ${num(emp.holidayOver8Hours)}시간 × ${p ? '2' : '1'}`);
  }
  for (const a of emp.allowances ?? []) add(a.name, num(a.amount), a.method ?? '정액');
  const gross = lines.reduce((s, l) => s + l.amount, 0);
  const deductions = (emp.deductions ?? []).map((d) => ({ label: d.name, amount: blank(d.amount) ? null : Number(d.amount), basis: d.basis ?? '' }));
  if (!deductions.length) warnings.push(`${emp.name}: 공제 항목이 없음 — 4대보험·소득세가 있으면 고지서·간이세액표 값을 넣어 주세요(요율을 지어내지 않음)`);
  for (const d of deductions) if (d.amount == null) missing.push(`${emp.name} 공제 「${d.label}」 금액`);
  const deductionTotal = deductions.reduce((s, d) => s + (d.amount ?? 0), 0);
  // 최저임금 대조: 값이 없으면 계산을 멈추게 하는 것은 호출한 쪽(wage)이 한다.
  if (rules.minimumWage != null && Number.isFinite(wage) && wage < rules.minimumWage) {
    warnings.push(`${emp.name}: 시급 ${won(wage)}원이 사실표의 최저임금 ${won(rules.minimumWage)}원보다 낮음(출처: ${rules.minimumWageSource ?? '적히지 않음'})`);
  }
  return { name: emp.name, id: emp.id ?? '', lines, gross, deductions, deductionTotal, net: gross - deductionTotal, warnings, missing };
}

export function buildWage(facts) {
  const rules = facts.rules ?? {};
  // 그해 최저임금 값과 출처가 없으면 명세를 만들지 않는다(해마다 바뀌는 값을 지어내지 않음).
  if (rules.minimumWage == null || blank(rules.minimumWageSource)) {
    return { blocked: true, reason: '최저임금 값과 출처(그해 고시)가 사실표 rules.minimumWage·minimumWageSource 에 없음 — 확인 필요', specs: [] };
  }
  const people = (facts.employees ?? []).map((e) => computeWage(e, rules));
  const period = facts.period ?? MISSING; const payDate = dateText(facts.payDate);
  const employer = facts.employer?.name ?? MISSING;
  const specs = [];
  const labels = [...new Set(people.flatMap((p) => p.lines.map((l) => l.label)))];
  const dlabels = [...new Set(people.flatMap((p) => p.deductions.map((d) => d.label)))];
  const key = (i) => `c${i}`;
  specs.push({ file: '임금대장.xlsx.json', format: 'xlsx', spec: { sheets: [{
    name: '임금대장', title: `임금대장 · ${employer} · ${period} · 지급일 ${payDate}`,
    columns: [{ key: 'name', header: '성명' }, ...labels.map((l, i) => ({ key: key(i), header: l, numberFormat: '#,##0' })),
      { key: 'gross', header: '지급 총액', numberFormat: '#,##0' }, ...dlabels.map((l, i) => ({ key: `d${i}`, header: l, numberFormat: '#,##0' })),
      { key: 'ded', header: '공제 총액', numberFormat: '#,##0' }, { key: 'net', header: '실지급액', numberFormat: '#,##0' }],
    rows: people.map((p) => ({ name: p.name, ...Object.fromEntries(labels.map((l, i) => [key(i), p.lines.find((x) => x.label === l)?.amount ?? 0])),
      gross: p.gross, ...Object.fromEntries(dlabels.map((l, i) => [`d${i}`, p.deductions.find((x) => x.label === l)?.amount ?? 0])), ded: p.deductionTotal, net: p.net })),
    total: { label: '합계', columns: [...labels.map((_, i) => key(i)), 'gross', ...dlabels.map((_, i) => `d${i}`), 'ded', 'net'] },
  }] } });
  for (const p of people) specs.push({ file: `임금명세서_${p.name}.docx.json`, format: 'docx', spec: {
    title: '임금명세서', header: false, pageNumbers: false,
    blocks: [
      { type: 'paragraph', text: `${employer} · ${period}분 · 지급일 ${payDate}` },
      { type: 'table', columns: [{ key: 'k', header: '구분' }, { key: 'v', header: '내용' }], rows: [
        { k: '성명', v: p.name ?? MISSING }, ...(p.id ? [{ k: '사원번호', v: p.id }] : []) ] },
      { type: 'paragraph', text: '지급 내역', style: 'heading2', keepWithNext: true },
      { type: 'table', columns: [{ key: 'k', header: '항목' }, { key: 'v', header: '금액(원)' }, { key: 'm', header: '계산 방법' }],
        rows: [...p.lines.map((l) => ({ k: l.label, v: won(l.amount), m: l.method })), { k: '지급 총액', v: won(p.gross), m: '' }] },
      { type: 'paragraph', text: '공제 내역', style: 'heading2', keepWithNext: true },
      { type: 'table', columns: [{ key: 'k', header: '항목' }, { key: 'v', header: '금액(원)' }, { key: 'm', header: '근거' }],
        rows: [...p.deductions.map((d) => ({ k: d.label, v: d.amount == null ? MISSING : won(d.amount), m: d.basis })), { k: '공제 총액', v: won(p.deductionTotal), m: '' }] },
      { type: 'paragraph', text: `실지급액 ${won(p.net)}원`, style: 'heading2' },
    ] } });
  return { blocked: false, period, people: people.map(({ name, gross, deductionTotal, net }) => ({ name, gross, deductionTotal, net })),
    warnings: people.flatMap((p) => p.warnings), missing: [...new Set(people.flatMap((p) => p.missing))], specs };
}

// 근로계약서 법정 서면 항목: 근로기준법 17조 2항(임금 구성·계산·지급 방법, 소정근로시간, 휴일, 연차 유급휴가),
// 기간제·단시간은 기간제법 17조(계약 기간, 근로시간·휴게, 임금, 휴일·휴가, 장소·업무, 단시간은 근로일·근로일별 시간).
const CONTRACT_FIELDS = [
  ['contractPeriod', '근로계약 기간', ['기간제', '단시간']],
  ['workplace', '근무 장소', ['정규', '기간제', '단시간']],
  ['duties', '업무 내용', ['정규', '기간제', '단시간']],
  ['workHours', '근로시간(시작·끝)', ['정규', '기간제', '단시간']],
  ['breakTime', '휴게시간', ['정규', '기간제', '단시간']],
  ['weeklyContractHours', '1주 소정근로시간', ['정규', '기간제', '단시간']],
  ['workDays', '근로일과 근로일별 근로시간', ['단시간']],
  ['wageAmount', '임금(시급·월급 금액)', ['정규', '기간제', '단시간']],
  ['wageComponents', '임금 구성항목', ['정규', '기간제', '단시간']],
  ['wageMethod', '임금 계산방법', ['정규', '기간제', '단시간']],
  ['payDay', '임금 지급일', ['정규', '기간제', '단시간']],
  ['payMethod', '임금 지급방법', ['정규', '기간제', '단시간']],
  ['holidays', '휴일', ['정규', '기간제', '단시간']],
  ['annualLeave', '연차 유급휴가', ['정규', '기간제', '단시간']],
];
export function buildContract(facts) {
  const type = facts.type;
  if (!['정규', '기간제', '단시간'].includes(type)) throw new RangeError('type 은 정규·기간제·단시간 가운데 하나');
  const missing = []; const warnings = [];
  const rows = [];
  for (const [k, label, types] of CONTRACT_FIELDS) {
    if (!types.includes(type)) continue;
    let v = facts[k];
    if (k === 'contractPeriod') v = blank(facts.startDate) ? null : `${dateText(facts.startDate)} ~ ${blank(facts.endDate) ? MISSING : dateText(facts.endDate)}`;
    if (k === 'wageAmount' && !blank(v)) v = `${facts.wageType ?? '시급'} ${won(v)}원`;
    if (k === 'weeklyContractHours' && !blank(v)) v = `${v}시간`;
    if (Array.isArray(v)) v = v.map((x) => (typeof x === 'string' ? x : `${x.day} ${x.hours}시간`)).join(', ');
    if (blank(v)) { missing.push(label); v = MISSING; }
    else if (k === 'contractPeriod' && type === '기간제' && blank(facts.endDate)) missing.push('근로계약 기간의 끝 날짜');
    rows.push({ k: label, v: String(v) });
  }
  if (type !== '기간제' && type !== '단시간' && !blank(facts.startDate)) rows.unshift({ k: '근로 시작일', v: dateText(facts.startDate) });
  const weekly = Number(facts.weeklyContractHours);
  if (Number.isFinite(weekly) && weekly < 15) warnings.push(`1주 소정근로 ${weekly}시간(15시간 미만): 주휴일·연차 유급휴가 조항이 적용되지 않음(근로기준법 18조 3항) — 휴일·연차 칸에 그 사실을 적어 주세요`);
  const rules = facts.rules ?? {};
  if ((facts.wageType ?? '시급') === '시급' && rules.minimumWage != null && Number(facts.wageAmount) < rules.minimumWage) {
    warnings.push(`시급 ${won(facts.wageAmount)}원이 사실표의 최저임금 ${won(rules.minimumWage)}원보다 낮음(출처: ${rules.minimumWageSource ?? '적히지 않음'})`);
  }
  if (rules.minimumWage == null) warnings.push('최저임금 값이 사실표에 없어 대조하지 않음 — 확인 필요');
  for (const extra of facts.extra ?? []) rows.push({ k: extra.label, v: extra.text });
  const spec = { title: `근로계약서(${type})`, header: false, pageNumbers: false, blocks: [
    { type: 'paragraph', text: `사업주(${facts.employer?.name ?? MISSING})와 근로자(${facts.employee?.name ?? MISSING})는 다음과 같이 근로계약을 맺는다.` },
    { type: 'table', columns: [{ key: 'k', header: '항목' }, { key: 'v', header: '내용' }], rows },
    { type: 'paragraph', text: '사업주는 이 계약서를 작성한 뒤 근로자에게 1부를 내준다.' },
    { type: 'paragraph', text: `작성일 ${dateText(facts.signDate)}` },
    { type: 'table', columns: [{ key: 'k', header: '구분' }, { key: 'n', header: '이름' }, { key: 'a', header: '주소·연락처' }, { key: 's', header: '서명' }], rows: [
      { k: '사업주', n: [facts.employer?.name, facts.employer?.representative].filter(Boolean).join(' 대표 ') || MISSING, a: [facts.employer?.address, facts.employer?.phone].filter(Boolean).join(' / '), s: '' },
      { k: '근로자', n: facts.employee?.name ?? MISSING, a: [facts.employee?.address, facts.employee?.phone].filter(Boolean).join(' / '), s: '' }] },
  ] };
  return { type, spec, missing, warnings };
}

/** 4대보험 취득·상실 신고 기한: 사유가 생긴 날이 속한 달의 다음 달 15일(국민연금공단 사업장 실무 안내). 주말·공휴일 미루기는 확인 안 됨이라 하지 않는다. */
export function deadlines(events) {
  return events.map((e) => {
    const m = String(e.date ?? '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/u);
    if (!m) return { ...e, due: null, note: '날짜를 읽지 못함' };
    const y = Number(m[1]); const mo = Number(m[2]);
    const ny = mo === 12 ? y + 1 : y; const nm = mo === 12 ? 1 : mo + 1;
    return { ...e, due: `${ny}. ${nm}. 15.`, note: '사유 발생 다음 달 15일(주말·공휴일이면 미뤄지는지 확인 안 됨)' };
  });
}

function main(argv) {
  const [action, ...rest] = argv;
  const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const factsPath = opt('--facts');
  if (!factsPath) throw new TypeError('쓰는 법: payroll.mjs wage --facts 근무.json --out-dir 폴더 | contract --facts 계약.json --out 명세.json | deadlines --facts 입퇴사.json');
  const facts = JSON.parse(readText(factsPath));
  if (action === 'wage') {
    const r = buildWage(facts);
    if (r.blocked) return r;
    const dir = resolve(opt('--out-dir') ?? '.'); mkdirSync(dir, { recursive: true });
    const written = r.specs.map((s) => { const p = join(dir, s.file); writeFileSync(p, `${JSON.stringify(s.spec, null, 2)}\n`); return { path: p, format: s.format }; });
    const { specs, ...rest2 } = r;
    return { ...rest2, specs: written, next: '명세마다 "$T5_DOCUMENT_CLI" create-<format> --spec <명세> --output <결과 파일>' };
  }
  if (action === 'contract') {
    const out = opt('--out'); if (!out) throw new TypeError('contract 는 --out 명세.json 이 있어야 해요');
    const r = buildContract(facts); writeFileSync(resolve(out), `${JSON.stringify(r.spec, null, 2)}\n`);
    const { spec, ...rest2 } = r;
    return { ...rest2, specPath: resolve(out), next: `"$T5_DOCUMENT_CLI" create-docx --spec "${resolve(out)}" --output <결과 파일>.docx` };
  }
  if (action === 'deadlines') return { deadlines: deadlines(facts.events ?? []) };
  throw new TypeError('동작: wage · contract · deadlines');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exit(1); }
}
