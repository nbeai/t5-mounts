// 서식 분야 둘째 묶음(구비서류 꾸러미·직원 서류·받을 돈 독촉·한국 업무 서식 계약서 절)의 스크립트 시험. 결정적, 실모델·문서 도구 0.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { bundleKit, checkKit, dateInName, listFiles, normalize } from '../skills/korean-paperwork-kit/scripts/kit.mjs';
import { buildContract as buildLaborContract, buildWage, computeWage, deadlines } from '../skills/korean-employment-paperwork/scripts/payroll.mjs';
import { buildClaimSheet, buildLetter, computeOutstanding, lintText, listEvidence, matchEvidence } from '../skills/korean-payment-reminder/scripts/reminder.mjs';
import { buildContract, checkBizNo, computeTotals } from '../skills/korean-business-forms/scripts/forms.mjs';

const scratch = mkdtempSync(join(tmpdir(), 't5-korean-skills-2-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
const touch = (dir, name) => { const p = join(dir, name); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, 'x'); };
const today = Date.UTC(2026, 9, 26);

// ── 구비서류 꾸러미
const REQ = { title: '가상 영업신고 안내', items: [
  { name: '영업신고서', sourceLine: '1. 영업신고서' },
  { name: '위생교육 수료증', aliases: ['위생교육'], sourceLine: '2. 위생교육 수료증' },
  { name: '건강진단결과서', aliases: ['보건증'], validDays: 365, sourceLine: '3. 건강진단결과서(1년 이내)' },
  { name: '임대차계약서', sourceLine: '4. 임대차계약서 사본' },
  { name: '소방시설 완비증명서', optional: true, sourceLine: '5. 해당 시' },
  { name: '사업자등록증', validDays: 90, sourceLine: '6. 사업자등록증(3개월 이내)' },
  { name: '신분증', sourceLine: '7. 신분증' },
] };
const kitFolder = () => {
  const dir = mkdtempSync(join(scratch, 'kit-'));
  touch(dir, '위생교육 수료증.pdf'); touch(dir, '하위/보건증_2025-08-01.pdf'); touch(dir, '임대차계약서.pdf');
  touch(dir, 'scan_0012.pdf'); touch(dir, '사업자등록증.pdf'); touch(dir, '.DS_Store');
  writeFileSync(join(dir, '신분증 사본.jpg'.normalize('NFD')), 'x');  // 맥에서 온 이름
  return dir;
};

test('꾸러미: 요구 7 중 없음 2(필수 1·선택 1), 기한 지남 1, 날짜 모름 1 을 가르고 맥 이름도 맞춘다', () => {
  const dir = kitFolder(); const r = checkKit(REQ, listFiles(dir), { today });
  const st = Object.fromEntries(r.rows.map((x) => [x.name, x.status]));
  assert.deepEqual(st, { 영업신고서: '없음', '위생교육 수료증': '있음', 건강진단결과서: '기한 지남', 임대차계약서: '있음', '소방시설 완비증명서': '없음(선택)', 사업자등록증: '확인 필요', 신분증: '있음' });
  assert.deepEqual(r.unmatchedFiles, ['scan_0012.pdf']);  // 숨은 파일은 보지 않음
});

test('꾸러미: 내용을 보고 정한 맞춤(assign)이 이름 맞춤보다 먼저고, 발급일을 주면 기한을 잰다', () => {
  const dir = kitFolder();
  const r = checkKit(REQ, listFiles(dir), { today, assign: { 'scan_0012.pdf': '영업신고서', '사업자등록증.pdf': { item: '사업자등록증', issued: '2026-09-01' } } });
  const row = (n) => r.rows.find((x) => x.name === n);
  assert.equal(row('영업신고서').status, '있음'); assert.equal(row('사업자등록증').status, '있음'); assert.equal(row('사업자등록증').validUntil, '2026-11-30');
  assert.deepEqual(r.unmatchedFiles, []);
});

test('꾸러미: 원문 줄 없는 공동이용 생략 표시는 경고, 원문 줄이 있으면 「생략 가능(원문)」', () => {
  const req = { items: [{ name: '토지이용계획확인원', sourceLine: '8.', exemptByDataSharing: true }, { name: '건축물대장', sourceLine: '9.', exemptByDataSharing: true, exemptLine: '행정정보 공동이용 동의 시 제출 생략' }] };
  const r = checkKit(req, [], { today });
  assert.equal(r.rows[0].status, '없음'); assert.ok(r.warnings.some((w) => w.includes('토지이용계획확인원')));
  assert.equal(r.rows[1].status, '생략 가능(원문)');
});

test('꾸러미 묶기: 있음·확인 필요만 순서 번호로 복사, 기한 지남은 빼고, 비어 있지 않은 폴더에는 쓰지 않는다', () => {
  const dir = kitFolder(); const out = join(scratch, '제출');
  const r = checkKit(REQ, listFiles(dir), { today, assign: { 'scan_0012.pdf': '영업신고서' } });
  const b = bundleKit(r, dir, out);
  assert.deepEqual(readdirSync(out).sort(), ['01_영업신고서.pdf', '02_위생교육 수료증.pdf', '04_임대차계약서.pdf', '06_사업자등록증.pdf', '07_신분증.jpg']);
  assert.equal(b.pdfs.length, 4);
  assert.throws(() => bundleKit(r, dir, out), /비어 있지 않아요/u);
});

test('꾸러미 시험 사례: 보험 설계사의 고객별 청구 서류 목록(가상 안내)도 같은 스크립트로', () => {
  const dir = mkdtempSync(join(scratch, 'ins-'));
  touch(dir, '고객A/진료비영수증_20261020.pdf'); touch(dir, '고객A/세부내역서.pdf');
  const req = { title: '가상 보험사 실손 청구 안내', items: [
    { name: '진료비 영수증', aliases: ['진료비영수증'], sourceLine: '진료비 영수증' },
    { name: '진료비 세부내역서', aliases: ['세부내역서'], sourceLine: '진료비 세부내역서' },
    { name: '처방전', optional: true, sourceLine: '약제비 청구 시 처방전' }] };
  const r = checkKit(req, listFiles(join(dir, '고객A')), { today });
  assert.deepEqual(r.rows.map((x) => x.status), ['있음', '있음', '없음(선택)']);
});

test('이름 비교: NFD·띄어쓰기·괄호를 같게 보고, 파일 이름 날짜를 읽는다', () => {
  assert.equal(normalize('건강진단 결과서(보건증)'.normalize('NFD')), normalize('건강진단결과서보건증'));
  assert.equal(dateInName('보건증_2025-08-01.pdf'), '2025-08-01'); assert.equal(dateInName('사업자20260230.pdf'), null);
});

// ── 직원 서류
const RULES = { minimumWage: 10000, minimumWageSource: '시험용 가상 값', overtimePremium: true };
test('임금: 정규·단시간·일용 셋이 손계산과 원 단위까지 같다', () => {
  const a = computeWage({ name: '가', hourlyWage: 12000, weeklyContractHours: 40, regularHours: 176, paidWeeklyHolidayWeeks: 4, overtimeHours: 6, nightHours: 4, deductions: [{ name: '소득세', amount: 30000 }] }, RULES);
  assert.equal(a.gross, 2112000 + 384000 + 108000 + 24000); assert.equal(a.net, a.gross - 30000);
  const b = computeWage({ name: '나', hourlyWage: 10500, weeklyContractHours: 15, regularHours: 60, paidWeeklyHolidayWeeks: 4, deductions: [] }, RULES);
  assert.equal(b.gross, 630000 + 10500 * 3 * 4);  // 주 15시간 → 주휴 3시간
  const c = computeWage({ name: '다', hourlyWage: 10000, weeklyContractHours: 14, regularHours: 56, paidWeeklyHolidayWeeks: 4, deductions: [] }, RULES);
  assert.equal(c.gross, 560000); assert.ok(c.warnings.some((w) => w.includes('15시간 미만')));
});

test('임금: 가산 미적용(4명 이하라고 사람이 정함)이면 연장 1배·야간 가산 0', () => {
  const r = computeWage({ name: '라', hourlyWage: 10000, regularHours: 10, overtimeHours: 2, nightHours: 2, deductions: [] }, { ...RULES, overtimePremium: false });
  assert.equal(r.gross, 100000 + 20000);
  assert.ok(computeWage({ name: '마', hourlyWage: 10000, regularHours: 1, deductions: [] }, { minimumWage: 1 }).missing.some((m) => m.includes('5명')));
});

test('임금: 최저임금보다 낮은 시급은 경고, 최저임금 값·출처가 없으면 명세를 만들지 않는다(변이)', () => {
  const facts = { employer: { name: '예시' }, period: '2026년 10월', payDate: '2026-11-10', rules: RULES,
    employees: [{ name: '바', hourlyWage: 9500, regularHours: 10, deductions: [{ name: '소득세', amount: 0 }] }] };
  const ok = buildWage(facts);
  assert.equal(ok.blocked, false); assert.ok(ok.warnings.some((w) => w.includes('최저임금')));
  assert.equal(ok.specs.length, 2); assert.equal(ok.specs[0].spec.sheets[0].name, '임금대장');
  assert.equal(buildWage({ ...facts, rules: { ...RULES, minimumWage: null } }).blocked, true);
  assert.equal(buildWage({ ...facts, rules: { ...RULES, minimumWageSource: '' } }).blocked, true);
});

test('임금명세서: 48조 2항 항목(구성항목·계산방법·공제 내역)이 명세에 들어간다', () => {
  const r = buildWage({ employer: { name: '예시' }, period: '10월', payDate: '2026-11-10', rules: RULES,
    employees: [{ name: '사', hourlyWage: 10000, weeklyContractHours: 40, regularHours: 8, paidWeeklyHolidayWeeks: 1, deductions: [{ name: '국민연금', amount: 1000, basis: '고지서' }] }] });
  const text = JSON.stringify(r.specs[1].spec);
  for (const w of ['계산 방법', '기본급', '주휴수당', '공제 내역', '국민연금', '실지급액']) assert.ok(text.includes(w), w);
});

test('근로계약서: 유형별 법정 항목이 비면 missing, 단시간은 근로일별 시간까지', () => {
  const base = { employer: { name: '예시' }, employee: { name: '아' }, startDate: '2026-11-01', workplace: '본점', duties: '계산', workHours: '10:00~17:30', breakTime: '30분',
    weeklyContractHours: 20, wageAmount: 10500, wageComponents: '기본급', wageMethod: '시급×시간', payDay: '10일', payMethod: '계좌', holidays: '일요일', annualLeave: '법대로' };
  assert.deepEqual(buildLaborContract({ ...base, type: '정규' }).missing, []);
  assert.deepEqual(buildLaborContract({ ...base, type: '기간제' }).missing, ['근로계약 기간의 끝 날짜']);
  assert.deepEqual(buildLaborContract({ ...base, type: '기간제', endDate: '2027-04-30' }).missing, []);
  assert.deepEqual(buildLaborContract({ ...base, type: '단시간' }).missing, ['근로일과 근로일별 근로시간']);
  assert.deepEqual(buildLaborContract({ ...base, type: '정규', holidays: '' }).missing, ['휴일']);
  assert.throws(() => buildLaborContract({ ...base, type: '알바' }));
});

test('4대보험 신고 기한: 사유 발생 다음 달 15일, 12월은 다음 해 1월', () => {
  assert.deepEqual(deadlines([{ date: '2026-11-01' }, { date: '2026-12-20' }]).map((d) => d.due), ['2026. 12. 15.', '2027. 1. 15.']);
});

// ── 받을 돈 독촉
const DEBT = { creditor: { name: '예시디자인', address: '서울', account: '예시은행 000' }, debtor: { name: '가나다', address: '경기' },
  items: [{ date: '2026-07-15', description: '영상', amount: 3300000, docs: ['용역계약서.pdf'] }], payments: [{ date: '2026-07-20', amount: 1100000 }],
  evidence: ['대화/카톡.png', '세금계산서.pdf'], dueDate: '2026-07-31', newDeadline: '2026-11-10' };

test('미수금: 남은 금액·한글 금액·지난 날수, 이자는 계산하지 않는다', () => {
  const o = computeOutstanding(DEBT, today);
  assert.equal(o.outstanding, 2200000); assert.equal(o.outstandingHangul, '일금 이백이십만원정'); assert.equal(o.daysOverdue, 87);
  assert.ok(!('interest' in o));
  assert.throws(() => computeOutstanding({ items: [{ amount: 1.5 }] }));
});

test('증거: 사실표의 증거 이름이 폴더에 있는지, 사실표에 없는 파일은 따로', () => {
  const dir = mkdtempSync(join(scratch, 'ev-')); touch(dir, '용역계약서.pdf'); touch(dir, '대화/카톡.png'); touch(dir, '기타.jpg');
  const m = matchEvidence(DEBT, listEvidence(dir));
  assert.deepEqual(m.missing, ['세금계산서.pdf']); assert.deepEqual(m.notListed, ['기타.jpg']);
  const sheet = buildClaimSheet(DEBT, listEvidence(dir), today);
  assert.deepEqual(sheet.missing, []);
  const text = JSON.stringify(sheet.spec);
  assert.ok(text.includes('2,200,000') && text.includes('신청서 작성·제출과 비용 납부는 본인'));
});

test('내용증명: 빈 칸은 missing, 판단처럼 읽히는 말은 lint 로 잡는다', () => {
  const r = buildLetter({ ...DEBT, creditor: { name: '예시디자인', address: '서울' } }, '잔금을 아직 못 받았습니다.\n\n기한까지 안 주시면 법적 조치를 하고 고소하겠습니다.', today);
  assert.deepEqual(r.missing, ['받을 계좌']);
  assert.deepEqual(r.lint.map((h) => h.kind).sort(), ['법적 판단', '형사 언급']);
  assert.ok(JSON.stringify(r.spec).includes('일금 이백이십만원정'));
});

test('lint: 결과 장담·집행·위협 말을 찾고, 사실 문장은 지나간다', () => {
  assert.deepEqual(lintText('이 건은 100% 승소합니다').map((h) => h.kind).sort(), ['결과 예측', '결과 장담']);
  assert.equal(lintText('압류하겠습니다')[0].kind, '집행 언급');
  assert.deepEqual(lintText('2026. 11. 10.까지 남은 금액 2,200,000원을 보내 주시기 바랍니다.'), []);
});

// ── 한국 업무 서식 계약서 절
const QUOTE = { date: '2026-10-26', supplier: { name: '예시상회', representative: '김예시', bizNo: '1234567891' }, buyer: { name: '가나다' },
  items: [{ name: '로고', qty: 1, unitPrice: 800000 }, { name: '명함', qty: 3, unitPrice: 12345 }] };

test('계약서: 금액이 견적과 같은 계산이고, 지급 일정 합계가 다르면 missing', () => {
  const total = computeTotals(QUOTE).total;
  const ok = buildContract({ ...QUOTE, contractType: '용역', paymentSchedule: [{ label: '계약금', amount: 400000 }, { label: '잔금', amount: total - 400000 }],
    clauses: { scope: '범위', term: '기간', rights: '권리', dispute: '협의 후 관할 법원' } });
  assert.equal(ok.totals.total, total); assert.deepEqual(ok.missing, []);
  assert.ok(JSON.stringify(ok.spec).includes(ok.totals.totalHangul));
  const bad = buildContract({ ...QUOTE, contractType: '용역', paymentSchedule: [{ label: '전액', amount: total - 1 }], clauses: { scope: 'a', term: 'b', rights: 'c', dispute: 'd' } });
  assert.ok(bad.missing.some((m) => m.includes('지급 일정 합계')));
  assert.ok(checkBizNo(QUOTE.supplier.bizNo).ok);
});

test('계약서: 문화예술용역은 예술인 복지법 6항목, 빠지면 법 이름과 함께 missing', () => {
  const r = buildContract({ ...QUOTE, contractType: '문화예술용역', paymentSchedule: [{ label: '전액', amount: computeTotals(QUOTE).total }], clauses: { scope: 'a', term: 'b', rights: 'c', dispute: 'd' } });
  assert.deepEqual(r.missing, ['수익 배분 조항(예술인 복지법 4조의4 2항)']);
  assert.equal(r.law, '예술인 복지법 4조의4 2항');
  assert.throws(() => buildContract({ ...QUOTE, contractType: '알 수 없음' }));
});
