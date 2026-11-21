#!/usr/bin/env node
// 홈페이지 검색 기본 위생을 읽기만으로 잰다: robots.txt 의 검색·AI 검색 수집기 허용, 사이트맵, 제목·설명·noindex·대표 주소·언어, 가게 정보 구조화 데이터.
// 쓰는 법: node site-check.mjs <홈페이지 주소> [--json]
// 받는 것: 그 페이지 하나, 같은 사이트의 robots.txt, robots.txt 에 적힌 첫 사이트맵(머리 몇 KB). 아무것도 올리거나 바꾸지 않는다. 의존성 0.
import { pathToFileURL } from 'node:url';

const UA = 't5-ai-search-checkup/0.1 (+https://github.com/nbeai/t5-mounts)';
// 검색 노출에 쓰이는 수집기(막으면 그 검색·AI 검색에 덜 나옴)와 학습용 수집기(검색 노출과 별개)를 나눠 본다.
const SEARCH_BOTS = ['Googlebot', 'Bingbot', 'Yeti', 'OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot'];
const TRAINING_BOTS = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot'];

async function get(url, { limit = 2_000_000 } = {}) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,text/plain,application/xml;q=0.9,*/*;q=0.5' } });
    const reader = res.body?.getReader(); const chunks = []; let size = 0;
    while (reader) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); size += value.length; if (size >= limit) { await reader.cancel(); break; } }
    return { ok: res.ok, status: res.status, url: res.url, headers: res.headers, text: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8') };
  } catch (error) {
    return { ok: false, status: null, url, headers: new Headers(), text: '', error: error.name === 'AbortError' ? '15초 안에 답이 없음' : String(error.cause?.code ?? error.message) };
  } finally { clearTimeout(timer); }
}

/** robots.txt 를 무리로 나눠, 수집기 이름마다 「/ 가 막혔나」를 가장 긴 규칙 우선으로 판정한다. */
export function robotsVerdict(text, agent) {
  const groups = []; let current = null; let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.replace(/#.*$/u, '').trim(); if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/u); if (!m) continue;
    const key = m[1].toLowerCase(); const value = m[2].trim();
    if (key === 'user-agent') { if (!lastWasAgent || !current) { current = { agents: [], rules: [] }; groups.push(current); } current.agents.push(value.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if ((key === 'allow' || key === 'disallow') && current) current.rules.push({ allow: key === 'allow', path: value });
  }
  const name = agent.toLowerCase();
  const exact = groups.filter((g) => g.agents.some((a) => a !== '*' && name.startsWith(a)));
  const chosen = exact.length ? exact : groups.filter((g) => g.agents.includes('*'));
  const rules = chosen.flatMap((g) => g.rules).filter((r) => r.path !== '' && '/'.startsWith(r.path.replace(/\*$/u, '').replace(/\$$/u, '')));
  if (!rules.length) return { blocked: false, by: chosen.length ? (exact.length ? agent : '*') : '규칙 없음' };
  const best = rules.sort((a, b) => b.path.length - a.path.length || (a.allow ? -1 : 1))[0];
  return { blocked: !best.allow, by: `${exact.length ? agent : '*'} ${best.allow ? 'Allow' : 'Disallow'}: ${best.path}` };
}

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'iu'))?.slice(2).find((v) => v != null) ?? null;
const metaContent = (html, key, value) => {
  for (const tag of html.match(/<meta\b[^>]*>/giu) ?? []) if ((attr(tag, key) ?? '').toLowerCase() === value) return attr(tag, 'content');
  return null;
};
const BUSINESS = /(LocalBusiness|Restaurant|Store|Shop|Cafe|CafeOrCoffeeShop|Bakery|Florist|HairSalon|BeautySalon|DaySpa|Dentist|MedicalClinic|Hotel|LodgingBusiness|AutoRepair|FoodEstablishment|BarOrPub|HealthAndBeautyBusiness|ProfessionalService|ExerciseGym|Physician)$/u;

export function pageFacts(html) {
  const decode = (s) => s?.replace(/&amp;/gu, '&').replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&quot;/gu, '"').replace(/&#39;/gu, "'").replace(/&nbsp;/gu, ' ').replace(/&#(\d+);/gu, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/gu, ' ').trim() ?? null;
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1]?.replace(/\s+/gu, ' '));
  const canonical = (html.match(/<link\b[^>]*>/giu) ?? []).map((t) => ((attr(t, 'rel') ?? '').toLowerCase().split(/\s+/u).includes('canonical') ? attr(t, 'href') : null)).find(Boolean) ?? null;
  const lang = attr(html.match(/<html\b[^>]*>/iu)?.[0] ?? '', 'lang');
  const ld = []; const ldErrors = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/giu)) {
    try { const v = JSON.parse(m[1]); const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o['@type']) ld.push(o); if (o['@graph']) walk(o['@graph']); } }; walk(v); } catch { ldErrors.push('JSON-LD 하나가 JSON 으로 읽히지 않음'); }
  }
  const businesses = ld.filter((o) => [].concat(o['@type']).some((t) => BUSINESS.test(String(t))));
  return {
    title, description: decode(metaContent(html, 'name', 'description')), robotsMeta: metaContent(html, 'name', 'robots'), canonical, lang,
    structuredTypes: [...new Set(ld.flatMap((o) => [].concat(o['@type']).map(String)))], structuredErrors: ldErrors,
    business: businesses.map((b) => ({ type: [].concat(b['@type']).join('/'), missing: ['name', 'address'].filter((k) => !b[k]), hasHours: Boolean(b.openingHoursSpecification || b.openingHours), hasPhone: Boolean(b.telephone) })),
  };
}

async function main() {
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const target = args.find((a) => !a.startsWith('--'));
if (!target) { console.error('홈페이지 주소를 알려 주세요. 예: node site-check.mjs https://example.kr/'); process.exit(1); }

const page = await get(target);
const origin = (() => { try { return new URL(page.url || target).origin; } catch { return null; } })();
const robots = origin ? await get(`${origin}/robots.txt`, { limit: 500_000 }) : { ok: false, status: null, text: '' };
const robotsText = robots.ok ? robots.text : '';
const sitemaps = [...robotsText.matchAll(/^\s*sitemap\s*:\s*(\S+)/gimu)].map((m) => m[1]);
const sitemap = sitemaps[0] ? await get(sitemaps[0], { limit: 20_000 }) : null;
const facts = page.ok ? pageFacts(page.text) : null;
const result = {
  url: target, finalUrl: page.url, status: page.status, error: page.error ?? null,
  xRobotsTag: page.headers.get('x-robots-tag'),
  robots: { status: robots.status, found: robots.ok,
    search: Object.fromEntries(SEARCH_BOTS.map((b) => [b, robotsVerdict(robotsText, b)])),
    training: Object.fromEntries(TRAINING_BOTS.map((b) => [b, robotsVerdict(robotsText, b)])) },
  sitemap: { listed: sitemaps, firstStatus: sitemap?.status ?? null, firstLooksLikeXml: sitemap ? /<(urlset|sitemapindex)\b/iu.test(sitemap.text) : null },
  page: facts,
};
if (asJson) { console.log(JSON.stringify(result, null, 2)); return; }

const lines = [`주소: ${target}${page.url && page.url !== target ? ` → ${page.url}` : ''} (응답 ${page.status ?? '없음'}${page.error ? `, ${page.error}` : ''})`];
if (page.status == null) { lines.push('- 이 주소에 닿지 못해 아무것도 판정하지 않았어요(주소·인터넷 연결을 확인하세요).'); console.log(lines.join('\n')); process.exit(2); }
const noindex = /noindex/iu.test(result.xRobotsTag ?? '') || /noindex/iu.test(facts?.robotsMeta ?? '');
lines.push(`- 검색에서 빼는 표시(noindex): ${facts ? (noindex ? '있음 — 가게 첫 화면이면 지워야 해요' : '없음') : '페이지를 못 읽어 판정 안 함'}`);
const robotsKnown = robots.ok || robots.status === 404;
lines.push(`- robots.txt(${origin}/robots.txt): ${robots.ok ? '있음' : robots.status === 404 ? '없음(404) — 없으면 모두 허용으로 봐요' : `받지 못함(응답 ${robots.status ?? '없음'}) — 수집기 허용은 판정하지 않았어요`}`);
const blockedSearch = SEARCH_BOTS.filter((b) => result.robots.search[b].blocked);
const blockedTrain = TRAINING_BOTS.filter((b) => result.robots.training[b].blocked);
if (robotsKnown) {
  lines.push(`  검색·AI 검색 수집기: ${blockedSearch.length ? `막힘 ${blockedSearch.join(', ')}` : '모두 허용'}`);
  lines.push(`  학습용 수집기(검색 노출과 별개): ${blockedTrain.length ? `막힘 ${blockedTrain.join(', ')}` : '모두 허용'}`);
}
lines.push(`- 사이트맵: ${sitemaps.length ? `${sitemaps[0]} (응답 ${result.sitemap.firstStatus ?? '없음'}${result.sitemap.firstLooksLikeXml === false ? ', 사이트맵 꼴 아님' : ''})` : 'robots.txt 에 적힌 것 없음'}`);
if (facts) {
  lines.push(`- 제목: ${facts.title ?? '없음'}`);
  lines.push(`- 설명: ${facts.description ?? '없음'}`);
  lines.push(`- 대표 주소(canonical): ${facts.canonical ?? '없음'} · 언어: ${facts.lang ?? '없음'}`);
  lines.push(`- 구조화 데이터: ${facts.structuredTypes.length ? facts.structuredTypes.join(', ') : '없음'}${facts.structuredErrors.length ? ` (${facts.structuredErrors.join(', ')})` : ''}`);
  for (const b of facts.business) lines.push(`  가게 정보(${b.type}): ${b.missing.length ? `필수 칸 빠짐 ${b.missing.join(', ')}` : '필수 칸(name·address) 있음'} · 영업시간 ${b.hasHours ? '있음' : '없음'} · 전화 ${b.hasPhone ? '있음' : '없음'}`);
  if (!facts.business.length) lines.push('  가게 정보 구조화 데이터(LocalBusiness 등): 없음 — 홈페이지가 가게 소개면 templates/localbusiness.jsonld 를 보이는 값으로 채워 넣을 수 있어요');
} else lines.push('- 페이지를 읽지 못해 제목·설명·구조화 데이터는 보지 못했어요');
console.log(lines.join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
