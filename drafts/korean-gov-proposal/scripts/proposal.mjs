#!/usr/bin/env node
// 정부지원사업 사업계획서 양식의 칸 지도와 채운 뒤 검사. 의존성 0(Node 내장만).
// 양식을 고치거나 그리지 않는다: 티파이브 문서 도구가 다시 읽은 글(read-hwp·inspect 결과)을 받아 사실만 낸다.
// 쓰는 법:
//   node proposal.mjs map   --input 양식.json|양식.md                          → 목차·PSST 자리·안내 문구·자리표시·빈 표 칸
//   node proposal.mjs check --input 채운본.json|.md [--mask 이름,학교,...] [--max-chars N]
//                                                                             → 남은 안내 문구·자리표시·마스킹 노출·PSST 순서·글자 수
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// PSST: 문제인식·실현가능성·성장전략·팀 구성. 양식마다 이름이 조금씩 달라 같은 뜻의 낱말을 함께 찾는다.
export const PSST = [
  { key: 'problem', label: '문제인식', words: ['문제인식', '문제 인식', 'Problem'] },
  { key: 'solution', label: '실현가능성', words: ['실현가능성', '실현 가능성', 'Solution'] },
  { key: 'scaleup', label: '성장전략', words: ['성장전략', '성장 전략', 'Scale-up', 'Scale up'] },
  { key: 'team', label: '팀 구성', words: ['팀 구성', '팀구성', '기업 구성', '기업구성', 'Team'] },
];
// 양식에 남기면 안 되는 안내 문구의 흔한 꼴. 후보만 낸다 — 지울지는 모델이 양식을 보고 정한다.
const GUIDE_PATTERNS = [
  /^\s*[※*]/u, /작성\s?요령/u, /작성\s?방법/u, /작성\s?예시/u, /\(예\s?[:：)]/u, /예시\)/u, /기재\s?(?:바랍|요망|하시|해\s?주)/u,
  /작성하여\s?주/u, /작성해\s?주/u, /삭제\s?(?:후|하고|바랍)/u, /파란\s?(?:색|글)/u, /안내\s?문구/u,
];
const PLACEHOLDER = /○{2,}|◯{2,}|〇{2,}|O{3,}|X{3,}|ㅇㅇ|△△|□□/u;
const SCHOOL = /[가-힣A-Za-z]{2,20}(?:대학교|대학원|고등학교|중학교|초등학교)/gu;

// Windows PowerShell 5 의 `>` 는 UTF-16 으로 저장한다 — 머리 표시(BOM)를 보고 같이 읽는다.
export function readText(path) {
  const bytes = readFileSync(resolve(path));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le');
  return bytes.toString('utf8').replace(/^﻿/u, '');
}

export function readInput(path) {
  const raw = readText(path);
  if (!/\.json$/iu.test(path)) return { text: raw, formLabels: null };
  const data = JSON.parse(raw);
  const text = data.markdown ?? data.observation?.text ?? data.text;
  if (typeof text !== 'string') throw new TypeError('JSON 안에 markdown·observation.text·text 가 없음(read-hwp 나 inspect 결과를 넘겨 주세요)');
  return { text, formLabels: data.formLabels ?? null };
}

const lines = (text) => text.replace(/\r\n/gu, '\n').split('\n');
const isHeading = (line) => /^\s{0,3}#{1,6}\s/u.test(line);
const plain = (line) => line.replace(/^\s{0,3}#{1,6}\s+/u, '').replace(/[|*_`>]/gu, ' ').replace(/\\(.)/gu, '$1').trim();

/** 줄마다 PSST 제목이 처음 나오는 자리. 제목 줄(#)·표 머리·번호 붙은 짧은 줄을 제목으로 본다. */
export function psstPositions(text) {
  const all = lines(text);
  return PSST.map((part) => {
    const at = all.findIndex((line) => {
      const p = plain(line); if (!p || p.length > 60) return false;
      const titled = isHeading(line) || /^\s*(?:\d+[.)]|[Ⅰ-Ⅹ]+[.)]?|[1-4]\s*\.)/u.test(p) || /^\s*\|/u.test(line) || p.length <= 20;
      return titled && part.words.some((w) => p.includes(w));
    });
    return { key: part.key, label: part.label, line: at >= 0 ? at + 1 : null };
  });
}

export function guideLines(text) {
  return lines(text).map((line, i) => ({ line: i + 1, text: plain(line) }))
    .filter(({ text: t }) => t && GUIDE_PATTERNS.some((p) => p.test(t)));
}
export function placeholderLines(text) {
  return lines(text).map((line, i) => ({ line: i + 1, text: plain(line) })).filter(({ text: t }) => PLACEHOLDER.test(t));
}

/** 마크다운 표에서 빈 칸 수(머리 줄·구분 줄 제외). */
export function emptyTableCells(text) {
  const out = []; let table = null;
  lines(text).forEach((line, i) => {
    if (!/^\s*\|.*\|\s*$/u.test(line)) { table = null; return; }
    if (/^\s*\|[\s:|-]+\|\s*$/u.test(line)) return;
    if (!table) { table = { startLine: i + 1, header: line, empty: 0 }; out.push(table); return; }
    table.empty += line.trim().slice(1, -1).split('|').filter((c) => !c.trim()).length;
  });
  return out.filter((t) => t.empty).map(({ startLine, header, empty }) => ({ startLine, header: plain(header).replace(/\s+/gu, ' '), empty }));
}

/** 읽는 글자 수: 마크다운 기호·표 구분 줄을 빼고 센다. */
export function countChars(text) {
  const body = lines(text).filter((l) => !/^\s*\|[\s:|-]+\|\s*$/u.test(l)).map(plain).join('\n');
  return { withSpaces: [...body.replace(/\n/gu, '')].length, withoutSpaces: [...body.replace(/\s/gu, '')].length };
}

export function mapForm(text, formLabels = null) {
  return {
    headings: lines(text).map((l, i) => ({ line: i + 1, l })).filter(({ l }) => isHeading(l)).map(({ line, l }) => ({ line, text: plain(l) })),
    psst: psstPositions(text), guides: guideLines(text), placeholders: placeholderLines(text),
    emptyTableCells: emptyTableCells(text), formLabels: formLabels ?? undefined, chars: countChars(text),
  };
}

export function checkFilled(text, { mask = [], maxChars = null } = {}) {
  const psst = psstPositions(text);
  const found = psst.filter((p) => p.line != null);
  const inOrder = found.every((p, i) => i === 0 || found[i - 1].line < p.line);
  const all = lines(text);
  const maskHits = mask.filter(Boolean).flatMap((term) => all.flatMap((line, i) => (line.includes(term) ? [{ term, line: i + 1, text: plain(line).slice(0, 80) }] : [])));
  const schoolCandidates = [...new Set(all.flatMap((line) => line.match(SCHOOL) ?? []))];
  const chars = countChars(text);
  const facts = {
    psst: { found: found.map((p) => p.label), missing: psst.filter((p) => p.line == null).map((p) => p.label), inOrder },
    guidesLeft: guideLines(text), placeholdersLeft: placeholderLines(text), emptyTableCells: emptyTableCells(text),
    maskHits, schoolCandidates, chars, maxChars: maxChars ?? undefined, overChars: maxChars ? Math.max(0, chars.withSpaces - maxChars) : undefined,
  };
  const problems = [];
  if (facts.guidesLeft.length) problems.push(`안내 문구로 보이는 줄 ${facts.guidesLeft.length}개`);
  if (facts.placeholdersLeft.length) problems.push(`자리표시(○○·OOO 등) 남은 줄 ${facts.placeholdersLeft.length}개`);
  if (facts.emptyTableCells.length) problems.push(`빈 표 칸 ${facts.emptyTableCells.reduce((s, t) => s + t.empty, 0)}개`);
  if (maskHits.length) problems.push(`가려야 할 말 노출 ${maskHits.length}곳`);
  if (schoolCandidates.length) problems.push(`학교 이름 후보 ${schoolCandidates.length}개(공고가 가리라면 확인)`);
  if (found.length && !inOrder) problems.push('PSST 제목 순서가 양식 표준 순서와 다름');
  if (facts.overChars) problems.push(`글자 수가 상한보다 ${facts.overChars}자 많음`);
  return { ...facts, problems };
}

function main(argv) {
  const [action, ...rest] = argv;
  const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const input = opt('--input');
  if (!input || !['map', 'check'].includes(action)) throw new TypeError('쓰는 법: proposal.mjs map|check --input 파일.json|.md [--mask 말1,말2] [--max-chars N]');
  const { text, formLabels } = readInput(input);
  if (action === 'map') return mapForm(text, formLabels);
  const maxChars = opt('--max-chars') ? Number(opt('--max-chars')) : null;
  return checkFilled(text, { mask: (opt('--mask') ?? '').split(',').map((s) => s.trim()), maxChars });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exit(1); }
}
