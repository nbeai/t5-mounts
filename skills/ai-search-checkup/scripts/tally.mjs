#!/usr/bin/env node
// AI 검색 노출 기록(CSV)을 센다: 볼 곳별 「몇 번 물어 몇 번 나왔나」, AI가 근거로 쓴 출처, 틀린 묘사.
// 두 회차(before·after)가 있으면 같은 조건(볼 곳·질문·로그인·위치)끼리만 앞뒤를 견주고, 조건이 다른 줄은 따로 둔다.
// 쓰는 법: node tally.mjs <기록.csv> [<기록2.csv> ...] [--csv <결과 폴더>] [--json]
// 읽기만 한다. --csv 를 주면 그 폴더에 summary.csv·sources.csv·compare.csv 를 새로 쓴다. 인터넷 0, 의존성 0.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** 따옴표·쉼표·줄바꿈을 지키는 CSV 읽기. 첫 줄은 칸 이름. */
export function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  const src = text.replace(/^﻿/u, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const yes = (v) => /^(yes|y|예|o|1|true)$/iu.test(v);
const no = (v) => /^(no|n|아니오|아니요|x|0|false)$/iu.test(v);
const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./u, ''); } catch { return null; } };
const condKey = (r) => [r.engine, r.query, r.logged_in || '?', r.location || ''].join('\u0001');

export function tally(rows) {
  const rounds = new Map();
  for (const r of rows) {
    const round = r.round || 'before';
    if (!rounds.has(round)) rounds.set(round, []);
    rounds.get(round).push(r);
  }
  const summary = []; const sources = []; const wrong = []; const byCond = new Map();
  for (const [round, list] of rounds) {
    const engines = new Map();
    for (const r of list) {
      const e = engines.get(r.engine) ?? { asked: 0, shown: 0, unread: 0, wrongDescribed: 0 };
      if (yes(r.shown)) { e.asked += 1; e.shown += 1; } else if (no(r.shown)) e.asked += 1; else e.unread += 1;
      if (yes(r.shown) && no(r.described_ok)) { e.wrongDescribed += 1; wrong.push({ round, engine: r.engine, query: r.query, wrong: r.wrong_facts || '(적힌 내용 없음)' }); }
      engines.set(r.engine, e);
      const key = condKey(r); const c = byCond.get(key) ?? { engine: r.engine, query: r.query, logged_in: r.logged_in || '?', location: r.location || '', rounds: {} };
      const cr = c.rounds[round] ?? { asked: 0, shown: 0 };
      if (yes(r.shown)) { cr.asked += 1; cr.shown += 1; } else if (no(r.shown)) cr.asked += 1;
      c.rounds[round] = cr; byCond.set(key, c);
      for (const s of (r.sources || '').split('|').map((x) => x.trim()).filter(Boolean)) {
        const d = domainOf(s); if (d) sources.push({ round, engine: r.engine, domain: d, shown: yes(r.shown) });
      }
    }
    for (const [engine, e] of engines) summary.push({ round, engine, ...e });
  }
  const sourceCounts = new Map();
  for (const s of sources) { const k = `${s.round}\u0001${s.domain}`; sourceCounts.set(k, (sourceCounts.get(k) ?? 0) + 1); }
  const sourceRows = [...sourceCounts].map(([k, n]) => { const [round, domain] = k.split('\u0001'); return { round, domain, count: n }; })
    .sort((a, b) => a.round.localeCompare(b.round) || b.count - a.count || a.domain.localeCompare(b.domain));

  // 앞뒤 견줌: 같은 조건 열쇠에 before·after 가 둘 다 있을 때만. 한쪽만 있으면 「조건 다름」.
  const compare = []; const condDiff = [];
  if (rounds.has('before') && rounds.has('after')) {
    for (const c of byCond.values()) {
      const b = c.rounds.before; const a = c.rounds.after;
      if (b && a && b.asked && a.asked) compare.push({ engine: c.engine, query: c.query, logged_in: c.logged_in, location: c.location, before: `${b.shown}/${b.asked}`, after: `${a.shown}/${a.asked}` });
      else condDiff.push({ engine: c.engine, query: c.query, logged_in: c.logged_in, location: c.location, only: b ? 'before' : 'after' });
    }
  }
  return { rounds: [...rounds.keys()], summary, sources: sourceRows, wrong, compare, conditionDiffers: condDiff };
}

export const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/u.test(s) ? `"${s.replace(/"/gu, '""')}"` : s; };
export const toCsv = (list, keys) => `${keys.join(',')}\n${list.map((r) => keys.map((k) => csvCell(r[k])).join(',')).join('\n')}${list.length ? '\n' : ''}`;

function main() {
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const asJson = args.includes('--json'); if (asJson) args.splice(args.indexOf('--json'), 1);
const csvOut = flag('--csv');
if (!args.length) { console.error('기록 CSV 파일을 하나 이상 알려 주세요. 예: node tally.mjs before.csv after.csv'); process.exit(1); }

const rows = args.flatMap((file) => parseCsv(readFileSync(file, 'utf8')));
const result = tally(rows);

if (csvOut) {
  mkdirSync(csvOut, { recursive: true });
  writeFileSync(join(csvOut, 'summary.csv'), toCsv(result.summary.map((s) => ({ ...s, rate: s.asked ? (s.shown / s.asked).toFixed(2) : '' })), ['round', 'engine', 'asked', 'shown', 'rate', 'unread', 'wrongDescribed']));
  writeFileSync(join(csvOut, 'sources.csv'), toCsv(result.sources, ['round', 'domain', 'count']));
  writeFileSync(join(csvOut, 'compare.csv'), toCsv([...result.compare, ...result.conditionDiffers.map((c) => ({ ...c, before: c.only === 'before' ? '있음' : '', after: c.only === 'after' ? '있음' : '', note: '조건 다름' }))], ['engine', 'query', 'logged_in', 'location', 'before', 'after', 'note']));
}

if (asJson) { console.log(JSON.stringify(result, null, 2)); return; }

const out = [];
for (const round of result.rounds) {
  out.push(`[${round === 'after' ? '고친 뒤' : round === 'before' ? '고치기 전' : round}]`);
  for (const s of result.summary.filter((x) => x.round === round)) {
    out.push(`- ${s.engine}: ${s.asked}번 물어 ${s.shown}번 나왔어요${s.wrongDescribed ? ` (그중 묘사가 틀린 답 ${s.wrongDescribed}번)` : ''}${s.unread ? ` · 못 읽은 ${s.unread}번은 세지 않았어요` : ''}`);
  }
  const top = result.sources.filter((x) => x.round === round).slice(0, 5);
  if (top.length) out.push(`  답에 달린 출처: ${top.map((t) => `${t.domain} ${t.count}번`).join(', ')}`);
}
if (result.wrong.length) {
  out.push('[틀린 묘사]');
  for (const w of result.wrong) out.push(`- (${w.round}) ${w.engine} 「${w.query}」: ${w.wrong}`);
}
if (result.compare.length) {
  out.push('[같은 조건 앞뒤]');
  for (const c of result.compare) out.push(`- ${c.engine} 「${c.query}」: 앞 ${c.before} → 뒤 ${c.after}`);
}
if (result.conditionDiffers.length) {
  out.push('[조건 다름 — 견주지 않음]');
  for (const c of result.conditionDiffers) out.push(`- ${c.engine} 「${c.query}」 로그인 ${c.logged_in}${c.location ? ` 위치 ${c.location}` : ''}: ${c.only === 'before' ? '고친 뒤' : '고치기 전'} 기록이 같은 조건으로 없어요`);
}
console.log(out.join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
