// AI 검색 노출 점검 스크립트 시험. 결정적, 인터넷 0(site-check 는 판정 함수만 부른다).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsv, tally } from '../skills/ai-search-checkup/scripts/tally.mjs';
import { pageFacts, robotsVerdict } from '../skills/ai-search-checkup/scripts/site-check.mjs';

const HEAD = 'when,round,engine,logged_in,location,query,shown,described_ok,wrong_facts,others,sources,answer_file,note';
const rows = (...lines) => parseCsv([HEAD, ...lines].join('\n'));

test('따옴표 안 쉼표·줄바꿈을 지켜 읽는다', () => {
  const [r] = rows('t,before,네이버,yes,,"꽃집, 추천","yes","no","영업시간\n9시 → 10시",,,a.txt,');
  assert.equal(r.query, '꽃집, 추천');
  assert.equal(r.wrong_facts, '영업시간\n9시 → 10시');
});

test('「몇 번 물어 몇 번」을 세고, 못 읽은 줄은 세지 않는다', () => {
  const r = tally(rows(
    't,before,네이버,yes,,q,yes,yes,,,https://m.place.naver.com/1,a,',
    't,before,네이버,yes,,q,no,,,,,b,',
    't,before,네이버,yes,,q,,,,,,c,끊김'));
  assert.deepEqual(r.summary, [{ round: 'before', engine: '네이버', asked: 2, shown: 1, unread: 1, wrongDescribed: 0 }]);
  assert.deepEqual(r.sources, [{ round: 'before', domain: 'm.place.naver.com', count: 1 }]);
});

test('같은 조건끼리만 앞뒤를 견주고, 로그인이 바뀐 줄은 조건 다름으로 둔다', () => {
  const r = tally(rows(
    't,before,네이버,yes,연남동,q,no,,,,,a,', 't,after,네이버,yes,연남동,q,yes,yes,,,,b,',
    't,before,구글,no,,q,no,,,,,c,', 't,after,구글,yes,,q,yes,yes,,,,d,'));
  assert.deepEqual(r.compare.map((c) => [c.engine, c.before, c.after]), [['네이버', '0/1', '1/1']]);
  assert.deepEqual(r.conditionDiffers.map((c) => [c.engine, c.logged_in, c.only]), [['구글', 'no', 'before'], ['구글', 'yes', 'after']]);
});

test('틀린 묘사는 나온 답에서만 모은다', () => {
  const r = tally(rows('t,before,AI1,yes,,q,yes,no,영업시간 9시 → 10시,,,a,'));
  assert.equal(r.wrong[0].wrong, '영업시간 9시 → 10시');
  assert.equal(r.summary[0].wrongDescribed, 1);
});

const NAVER_BLOG_LIKE = `User-agent: GPTBot\nDisallow: /\nUser-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: *\nDisallow: /PostList.nhn\n`;

test('robots.txt: 이름이 적힌 무리가 먼저, 없으면 * 무리를 따른다', () => {
  assert.equal(robotsVerdict(NAVER_BLOG_LIKE, 'OAI-SearchBot').blocked, true);
  assert.equal(robotsVerdict(NAVER_BLOG_LIKE, 'Googlebot').blocked, false);
  assert.equal(robotsVerdict('', 'Googlebot').blocked, false);
  assert.equal(robotsVerdict('User-agent: *\nDisallow: /\nUser-agent: Googlebot\nAllow: /\n', 'Googlebot').blocked, false);
  assert.equal(robotsVerdict('User-agent: *\nDisallow: /\n', 'Bingbot').blocked, true);
});

test('페이지에서 제목·설명·noindex·가게 정보 구조화 데이터의 빠진 칸을 읽는다', () => {
  const html = `<html lang="ko"><head><title>꽃담 &amp; 플라워</title><meta name="description" content="연남동 꽃집"><meta name="robots" content="noindex">
  <link rel="canonical" href="https://a.kr/"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Florist","name":"꽃담"}</script></head></html>`;
  const f = pageFacts(html);
  assert.equal(f.title, '꽃담 & 플라워');
  assert.equal(f.description, '연남동 꽃집');
  assert.equal(f.robotsMeta, 'noindex');
  assert.equal(f.canonical, 'https://a.kr/');
  assert.deepEqual(f.business, [{ type: 'Florist', missing: ['address'], hasHours: false, hasPhone: false }]);
});
