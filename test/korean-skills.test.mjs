// 한국형 스킬 두 개(korean-business-forms·korean-gov-proposal)의 스크립트 시험. 계산·검사는 결정적이라 실모델 없이 본다.
// 문서 도구(본선 $T5_DOCUMENT_CLI)는 부르지 않는다 — 그 도구가 받는 명세의 꼴과 계산 값만 본다.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { buildForm, checkBizNo, computeTotals, hangulAmount, hangulNumber, koreanDate, readText } from '../skills/korean-business-forms/scripts/forms.mjs';
import { checkFilled, mapForm, readInput } from '../skills/korean-gov-proposal/scripts/proposal.mjs';

const scratch = mkdtempSync(join(tmpdir(), 't5-korean-skills-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

// 검증 숫자를 맞춘 가짜 사업자등록번호(앞 아홉 자리에서 계산).
const validBizNo = (nine) => { for (let d = 0; d < 10; d += 1) if (checkBizNo(nine + d).ok) return nine + d; throw new Error('없음'); };
const facts = (over = {}) => ({
  form: '견적서', date: '2026-10-26',
  supplier: { name: '예시상회', representative: '김예시', bizNo: validBizNo('123456789') },
  buyer: { name: '가나다 주식회사' },
  items: [{ name: '로고 디자인', qty: 1, unitPrice: 800000 }, { name: '명함', qty: 3, unitPrice: 12345 }],
  terms: { validUntil: '2026-11-25' }, ...over,
});

test('한글 금액: 자리마다 「일」까지 쓰고 만·억 단위로 붙여 쓴다', () => {
  assert.equal(hangulNumber(0), '영');
  assert.equal(hangulNumber(10), '일십');
  assert.equal(hangulNumber(113560), '일십일만삼천오백육십');
  assert.equal(hangulNumber(315678), '삼십일만오천육백칠십팔');
  assert.equal(hangulNumber(100000000), '일억');
  assert.equal(hangulNumber(1000000010), '일십억일십');
  assert.equal(hangulAmount(113560), '일금 일십일만삼천오백육십원정');
  assert.throws(() => hangulNumber(-1)); assert.throws(() => hangulNumber(1.5));
});

test('사업자등록번호: 검증 숫자가 맞으면 통과, 한 자리를 바꾸면 확인 필요', () => {
  const ok = validBizNo('220811234');
  assert.deepEqual(checkBizNo(ok), { ok: true, formatted: `${ok.slice(0, 3)}-${ok.slice(3, 5)}-${ok.slice(5)}` });
  const bad = ok.slice(0, 9) + ((Number(ok[9]) + 1) % 10);
  assert.equal(checkBizNo(bad).ok, false);
  assert.equal(checkBizNo('12345').reason, '10자리가 아님');
});

test('날짜는 「2026. 10. 26.」 꼴로, 없는 날짜는 읽지 않는다', () => {
  for (const t of ['2026-10-26', '2026.10.26', '2026/10/26', '2026. 10. 26.', '2026년 10월 26일']) assert.equal(koreanDate(t), '2026. 10. 26.');
  assert.equal(koreanDate('2026-02-30'), null);
  assert.equal(koreanDate('다음 주'), null);
});

test('세액: 품목마다 원 미만 버림, 합계 = 공급가액 + 세액', () => {
  const t = computeTotals(facts());
  assert.equal(t.supply, 837035); assert.equal(t.vat, 80000 + 3703); assert.equal(t.total, 837035 + 83703);
  assert.equal(t.totalHangul, hangulAmount(920738));
  assert.deepEqual(t.warnings, []);  // 품목마다 80000 + 3703 = 83703, 합계 837035 의 10% 버림도 83703 — 같으면 경고 없음
});

test('세액 기준이 같으면 경고가 없고, 다르면 둘 다 적는다', () => {
  const same = computeTotals(facts({ items: [{ name: 'a', qty: 1, unitPrice: 1000 }] }));
  assert.deepEqual(same.warnings, []);
  const diff = computeTotals(facts({ items: [{ name: 'a', qty: 1, unitPrice: 15 }, { name: 'b', qty: 1, unitPrice: 15 }] }));
  assert.equal(diff.vat, 2);  // 1 + 1
  assert.ok(diff.warnings.some((w) => w.includes('2') && w.includes('3')));
  assert.equal(computeTotals(facts({ vatBasis: 'total', items: diff.lines.map(({ name, qty, unitPrice }) => ({ name, qty, unitPrice })) })).vat, 3);
});

test('부가세 포함 단가는 ÷11 로 세액을 빼고, 면세 품목은 세액 0', () => {
  const t = computeTotals(facts({ priceIncludesVat: true, items: [{ name: '포함', qty: 1, unitPrice: 11000 }, { name: '책', qty: 2, unitPrice: 15000, tax: '면세' }] }));
  assert.equal(t.lines[0].supply, 10000); assert.equal(t.lines[0].vat, 1000);
  assert.equal(t.lines[1].vat, 0); assert.equal(t.total, 11000 + 30000);
  assert.throws(() => computeTotals(facts({ items: [{ name: 'x', qty: 1, unitPrice: 1, tax: '비과세' }] })));
});

test('필수 칸이 비면 「(미정)」으로 적고 missing 에 올린다 — 0 으로 메우지 않는다', () => {
  const r = buildForm(facts({ supplier: { name: '예시상회' }, form: '청구서' }), 'docx');
  assert.deepEqual(r.missing.sort(), ['공급자 대표자', '공급자 사업자등록번호', '입금 계좌', '입금 기한'].sort());
  assert.ok(JSON.stringify(r.spec).includes('(미정)'));
});

test('워드 명세: 문서 도구가 받는 꼴(title·blocks)이고 합계 줄에 한글 금액이 있다', () => {
  const { spec, totals } = buildForm(facts(), 'docx');
  assert.equal(spec.title, '견적서');
  assert.ok(spec.blocks.every((b) => ['paragraph', 'table'].includes(b.type)));
  for (const b of spec.blocks.filter((x) => x.type === 'table')) for (const row of b.rows) for (const c of b.columns) assert.ok(c.key in row, `${c.key} 칸 빠짐`);
  assert.ok(spec.blocks.some((b) => b.type === 'paragraph' && b.text.includes(totals.totalHangul) && b.text.includes('₩920,738')));
});

test('엑셀 명세: 공급가액·세액·합계가 수식이고 수식마다 계산한 값이 붙는다', () => {
  const { spec, totals } = buildForm(facts({ form: '거래명세서' }), 'xlsx');
  const sheet = spec.sheets[0];
  assert.equal(sheet.name, '거래명세서');
  assert.ok(sheet.rows.every((r) => r.date === '2026. 10. 26.'));  // 품목 일자가 없으면 거래일
  const byKey = Object.fromEntries(sheet.columnFormulas.map((f) => [f.key, f]));
  assert.deepEqual(byKey.supply.results, [800000, 37035]);
  assert.match(byKey.vat.formula, /^=ROUNDDOWN\(/u); assert.deepEqual(byKey.vat.results, [80000, 3703]);
  assert.equal(byKey.sum.results.reduce((s, n) => s + n, 0), totals.total);
  assert.deepEqual(sheet.total.columns, ['supply', 'vat', 'sum']);
  assert.throws(() => buildForm(facts({ vatBasis: 'total' }), 'xlsx'), /docx/u);
});

test('사실표 파일이 UTF-16(Windows PowerShell 저장)이어도 읽는다', () => {
  const path = join(scratch, '사실16.json');
  writeFileSync(path, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(JSON.stringify(facts()), 'utf16le')]));
  assert.equal(JSON.parse(readText(path)).form, '견적서');
});

const FORM = `# 사업계획서

과제명
대표자

## 1. 문제인식 (Problem)

※ 창업 아이템의 배경과 필요성을 작성하여 주십시오.

○○○ 시장 현황

## 2. 실현가능성 (Solution)

※ 작성 요령: 현재 구현 정도

## 3. 성장전략 (Scale-up)

## 4. 팀 구성 (Team)

| 구분 | 성명 | 주요 경력 |
| --- | --- | --- |
| 대표 |  |  |
`;

test('양식 지도: PSST 네 자리·안내 문구·자리표시·빈 표 칸을 찾는다', () => {
  const m = mapForm(FORM);
  assert.deepEqual(m.psst.map((p) => p.line), [6, 12, 16, 18]);
  assert.equal(m.guides.length, 2); assert.equal(m.placeholders.length, 1);
  assert.deepEqual(m.emptyTableCells.map((t) => t.empty), [2]);
});

test('채운 뒤 검사: 남은 안내 문구·가릴 말·학교 후보·순서·글자 수를 낸다', () => {
  const filled = FORM.replace('※ 창업 아이템의 배경과 필요성을 작성하여 주십시오.', '홍길동 대표가 서울예시대학교에서 겪은 문제다.')
    .replace('○○○ 시장 현황', '시장 현황(통계청 2025)').replace('|  |  |', '| ○○○ | 가게 운영 5년 |');
  const r = checkFilled(filled, { mask: ['홍길동'], maxChars: 50 });
  assert.equal(r.guidesLeft.length, 1);             // 실현가능성의 작성 요령이 남음
  assert.equal(r.placeholdersLeft.length, 1);       // 표의 ○○○ 는 가린 이름이라 자리표시 후보로 나온다(판단은 모델)
  assert.deepEqual(r.maskHits.map((h) => h.term), ['홍길동']);
  assert.deepEqual(r.schoolCandidates, ['서울예시대학교']);
  assert.equal(r.psst.inOrder, true); assert.ok(r.overChars > 0);
  const swapped = filled.replace('## 1. 문제인식 (Problem)', '## 1. 팀 구성 (Team) 요약').replace('## 4. 팀 구성 (Team)', '## 4. 문제인식 (Problem)');
  assert.equal(checkFilled(swapped).psst.inOrder, false);
});

test('검사 입력: read-hwp 결과 JSON(markdown)·inspect 결과 JSON(observation.text)·마크다운 모두 받는다', () => {
  const a = join(scratch, 'a.json'); writeFileSync(a, JSON.stringify({ markdown: FORM, formLabels: ['과제명'] }));
  const b = join(scratch, 'b.json'); writeFileSync(b, JSON.stringify({ observation: { text: FORM } }));
  const c = join(scratch, 'c.md'); writeFileSync(c, FORM);
  for (const p of [a, b, c]) assert.equal(readInput(p).text, FORM);
  assert.deepEqual(readInput(a).formLabels, ['과제명']);
  const d = join(scratch, 'd.json'); writeFileSync(d, JSON.stringify({ other: 1 }));
  assert.throws(() => readInput(d));
});
