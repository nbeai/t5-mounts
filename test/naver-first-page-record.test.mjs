// 네이버 첫 페이지 점유 기록 스크립트 시험. 결정적, 인터넷 0 — 지어 만든 화면 조각을 parse 명령으로 읽고, 설정 명령은 임시 폴더에서 돌린다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve('drafts/naver-first-page-record/scripts/naver-exposure.mjs');
const inTemp = (fn) => { const dir = mkdtempSync(join(tmpdir(), 'nfpr-')); try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };
const run = (cwd, ...args) => execFileSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
const parse = (html, screen) => inTemp((dir) => { writeFileSync(join(dir, 't.html'), html); return JSON.parse(run(dir, 'parse', 't.html', '--screen', screen)); });
const boot = (id, items) => `<script>entry.bootstrap(document.getElementById("${id}"), ${JSON.stringify({ data: { state: { items } } })})</script>`;

test('통합검색: 광고·플레이스 영역·결과 블록을 화면 순서대로 읽고 블록 종류를 남긴다', () => {
  const place = { ROOT_QUERY: { 'placeList({"q":"x"})': { businesses: { total: 2, items: [{ __ref: 'B:1' }, { __ref: 'B:2' }] } }, 'adBusinesses({"q":"x"})': { items: [{ __ref: 'B:9' }] } },
    'B:1': { id: '1', name: '연남꽃집' }, 'B:2': { id: '2', name: '옆집꽃집' }, 'B:9': { id: '9', name: '광고꽃집' } };
  const html = `<div id="pcPowerLink1"><span class="site">광고집</span><span class="url">ad.example</span></div>
<div id="place-main-section-root"></div><script>window.__APOLLO_STATE__ = ${JSON.stringify(place)};</script>
<div id="fdr-a1" data-fender-root data-meta-ssuid="qra"></div>${boot('fdr-a1', [{ title: '관련 검색어', titleHref: 'https://search.naver.com/x' }])}
<div id="fdr-b2" data-fender-root data-meta-ssuid="web"></div>${boot('fdr-b2', [{ title: '연남<mark>꽃집</mark> 후기', titleHref: 'https://example.com/a', content: '요약 글', sourceProfile: { title: '동네소식' } }])}`;
  const units = parse(html, 'total');
  assert.deepEqual(units.map((u) => u.type === 'block' ? u.ssuid : u.type), ['ad', 'place', 'qra', 'web']);
  assert.equal(units[0].count, 1);
  assert.deepEqual(units[1].organic.map((p) => p.name), ['연남꽃집', '옆집꽃집']);
  assert.deepEqual(units[1].ads.map((p) => p.name), ['광고꽃집']);
  assert.deepEqual(units[3].items[0], { title: '연남꽃집 후기', url: 'https://example.com/a', snippet: '요약 글', source: '동네소식', date: '', isAd: false });
});

test('블로그 탭: 블로그 글만, 같은 주소는 한 번, 광고 표시를 남긴다', () => {
  const html = boot('x', [
    { title: '글 하나', titleHref: 'https://blog.naver.com/a/1', content: '요약', sourceProfile: { title: '블로거', isAdType: true } },
    { title: '글 하나 또', titleHref: 'https://blog.naver.com/a/1' },
    { title: '블로그 아님', titleHref: 'https://cafe.naver.com/b/2' },
    { title: '글 둘', titleHref: 'https://blog.naver.com/c/3' }]);
  const items = parse(html, 'blog');
  assert.deepEqual(items.map((it) => [it.url, it.isAd]), [['https://blog.naver.com/a/1', true], ['https://blog.naver.com/c/3', false]]);
});

test('플레이스 지도 목록: 업체·전체 수·광고를 가른다. 목록이 없으면 전체 수가 null', () => {
  const st = { ROOT_QUERY: { 'placeList({})': { businesses: { total: 340, items: [{ __ref: 'B:1' }] } }, 'adBusinesses({})': { items: [] } }, 'B:1': { id: '1', name: '연남꽃집', category: '꽃집' } };
  assert.deepEqual(parse(`<script>window.__APOLLO_STATE__ = ${JSON.stringify(st)}</script>`, 'place'),
    { organic: [{ id: '1', name: '연남꽃집', category: '꽃집' }], total: 340, ads: [] });
  assert.deepEqual(parse('<html></html>', 'place'), { organic: [], ads: [], total: null });
});

test('설정 명령: 넣기·빼기·파일로 넣기, 같은 값은 두 번 들어가지 않는다', () => inTemp((dir) => {
  run(dir, 'brand', 'add', '연남꽃집', '연남 플라워');
  run(dir, 'brand', 'add', '연남꽃집');
  writeFileSync(join(dir, 'k.txt'), '연남동 꽃집 # 동네\n\n꽃다발\n연남동 꽃집\n');
  run(dir, 'keyword', 'add', '꽃집');
  run(dir, 'keyword', 'import', 'k.txt');
  run(dir, 'keyword', 'remove', '꽃다발');
  const cfg = JSON.parse(readFileSync(join(dir, 'exposure.config.json'), 'utf8'));
  assert.deepEqual(cfg.brands, ['연남꽃집', '연남 플라워']);
  assert.deepEqual(cfg.keywords, ['꽃집', '연남동 꽃집']);
  assert.equal(cfg.delayMs, 3000);
}));

test('대조 상호가 없으면 받으러 가지 않고 넣는 법을 말한다', () => inTemp((dir) => {
  assert.throws(() => execFileSync(process.execPath, [SCRIPT, 'run'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }),
    (error) => error.status === 1 && /brand add/.test(error.stderr));
}));
