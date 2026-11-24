#!/usr/bin/env node
// naver-exposure.mjs — 네이버 첫 페이지 점유 기록 (3판)
// Node 18 이상, 설치할 패키지 없음. 2026-11-24 네이버 실제 화면(모바일 · PC)으로 맞춤.
//
//   node naver-exposure.mjs run                     설정의 키워드를 모두 확인 → 기록 · CSV · 그래프 갱신
//   node naver-exposure.mjs run --missing           오늘 아직 못 한 키워드만(매일 실행 · 캡차 뒤 이어 하기)
//   node naver-exposure.mjs run --keyword "꽃집" [--keyword "연남동 꽃집"]
//   node naver-exposure.mjs brand   list | add 이름… | remove 이름…     대조 상호(OR 조건)
//   node naver-exposure.mjs keyword list | add 키워드… | remove 키워드… | import 파일.txt
//   node naver-exposure.mjs place   list | add 이름… | remove 이름…     플레이스 등록 이름
//   node naver-exposure.mjs today | report [--month 2026-11] | csv(기록에서 CSV 다시 만들기)
//   node naver-exposure.mjs parse <html파일> --screen total|blog|place   저장된 화면으로 시험
//
// 판정: 광고 · 플레이스 · 네이버 자체 묶음(AI 브리핑 · 관련 질문 · 관련 검색어 · 이미지 · 클립)을 뺀
//       상위 N(기본 5)개 콘텐츠에 대조 상호 가운데 하나라도 있으면 「점유」, 없으면 「미점유」.
//       통합검색 · 블로그 탭을 모바일과 PC에서 따로 판정한다(순위가 다르다).

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, rmSync, renameSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, resolve } from "node:path";

const VERSION = "2026-11-24.3";
const UA = {
  mobile: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};
// 주소와 기기 표시(UA)를 함께 맞춘다(2026-11-04 · 11-24 실측). 모바일 주소는 UA와 상관없이 모바일 화면.
const SCREENS = {
  total_m: { kind: "total", device: "모바일", label: "통합검색 · 모바일", ua: "mobile", url: (q) => `https://m.search.naver.com/search.naver?ssc=tab.m.all&sm=mtb_jum&query=${q}` },
  total_pc: { kind: "total", device: "PC", label: "통합검색 · PC", ua: "desktop", url: (q) => `https://search.naver.com/search.naver?where=nexearch&sm=top_hty&query=${q}` },
  blog_m: { kind: "blog", device: "모바일", label: "블로그 탭 · 모바일", ua: "mobile", url: (q) => `https://m.search.naver.com/search.naver?ssc=tab.m_blog.all&sm=mtb_jum&query=${q}` },
  blog_pc: { kind: "blog", device: "PC", label: "블로그 탭 · PC", ua: "desktop", url: (q) => `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${q}` },
  place_pc: { kind: "place", device: "PC", label: "플레이스 · PC 지도 목록", ua: "desktop", url: (q) => `https://pcmap.place.naver.com/place/list?query=${q}` },
};
const OCC = ["total_m", "total_pc", "blog_m", "blog_pc"]; // 점유를 세는 네 화면
// 통합검색에서 「콘텐츠」로 세지 않는 네이버 자체 묶음(data-meta-ssuid)
const MODULES = { ex_csa: "AI 브리핑", fuq: "관련 질문", qra: "관련 검색어", image: "이미지", clip: "클립", rq: "연관 검색어" };

const DEFAULTS = {
  brands: [],            // 대조 상호. 여러 개면 OR — 하나라도 있으면 점유. 띄어쓰기는 무시
  placeNames: [],        // 플레이스 등록 이름(비우면 brands)
  keywords: [],          // 검색 키워드. 개수 제한 없음
  topN: 5,
  checkBody: true,       // 제목 · 요약 · 작성자에 없으면 글 본문까지 본다
  countModules: [],      // MODULES 가운데 콘텐츠로 셀 것(예: ["clip"])
  ownChannels: [],       // 우리가 직접 운영하는 주소(선택). 예: "우리가게.kr", "blog.naver.com/아이디"
  delayMs: 3000,         // 네이버 요청 사이 간격
  otherDelayMs: 1000,    // 네이버 밖 사이트 본문 요청 간격
  keepRawDays: 14,       // 받은 화면 원본 보관 일수
  chartDays: 90,         // 그래프에 보일 최근 일수(CSV에는 전부 쌓임)
  dataDir: "./exposure-data",
};

// ───────────────────────── 공용 ─────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kstDate = (d = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(d);
const kstTime = (d = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "medium" }).format(d).replace(" ", "T") + "+09:00";
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", hellip: "…" };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
// <mark> 같은 글자 안 꾸밈 태그는 띄어쓰기 없이 지운다(「연남<mark>꽃집</mark>」 → 「연남꽃집」)
const strip = (s) => decodeEntities(String(s ?? "").replace(/<\/?(?:mark|b|strong|em|i|u)\b[^>]*>/gi, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const slug = (s) => s.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60);
const argOf = (argv, k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const argsOf = (argv, k) => argv.flatMap((a, i) => (a === k && argv[i + 1] != null ? [argv[i + 1]] : []));

/** 문자열 s의 start 위치에서 시작하는 JSON 객체 하나를 읽는다(괄호 짝 맞추기). */
function jsonAt(s, start) {
  if (start < 0 || s[start] !== "{") return null;
  let depth = 0, inStr = false, esc = false;
  for (let k = start; k < s.length; k++) {
    const c = s[k];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { try { return JSON.parse(s.slice(start, k + 1)); } catch { return null; } }
  }
  return null;
}

/** 대조 상호 찾기(OR) — 글자 사이 띄어쓰기를 허용. 찾으면 {brand, evidence}. */
function findBrand(text, brands) {
  const t = strip(text);
  for (const b of brands) {
    const re = new RegExp(b.replace(/\s+/g, "").split("").map(escapeRe).join("\\s*"), "i");
    const m = re.exec(t);
    if (m) return { brand: b, evidence: t.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30) };
  }
  return null;
}

const isNaver = (u) => /^https?:\/\/([a-z0-9-]+\.)*naver\.(com|net)\//i.test(u);
let lastNaverAt = 0, lastOtherAt = 0;
async function get(url, ua, cfg) {
  const naver = isNaver(url);
  const wait = (naver ? lastNaverAt : lastOtherAt) + (naver ? cfg.delayMs : cfg.otherDelayMs) - Date.now();
  if (wait > 0) await sleep(wait);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA[ua], accept: "text/html,application/xhtml+xml", "accept-language": "ko-KR,ko;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    let charset = (/charset=([\w-]+)/i.exec(res.headers.get("content-type") || "") || [])[1];
    if (!charset) charset = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4096).toString("latin1")) || [])[1];
    let text;
    try { text = new TextDecoder((charset || "utf-8").toLowerCase()).decode(buf); } catch { text = buf.toString("utf8"); }
    return { status: res.status, finalUrl: res.url, text, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, finalUrl: url, text: "", ms: Date.now() - t0, error: String(e?.message || e) };
  } finally {
    if (naver) lastNaverAt = Date.now(); else lastOtherAt = Date.now();
  }
}
const isCaptcha = (r) => r.status === 429 || /WtmCaptcha\s*\.\s*renderCaptcha\s*\(|<head[^>]*title="captcha"|captcha\.search\.naver/i.test(r.text);

// ───────────────────────── 화면 읽기 ─────────────────────────
function apolloState(html, from = 0) {
  const i = html.indexOf("__APOLLO_STATE__", from);
  return i < 0 ? null : jsonAt(html, html.indexOf("{", i));
}
function placeLists(st) {
  if (!st?.ROOT_QUERY) return null;
  const root = st.ROOT_QUERY;
  const pick = (prefix) => { const k = Object.keys(root).find((x) => x.startsWith(prefix)); return k ? root[k] : null; };
  const list = pick("placeList("), ads = pick("adBusinesses(");
  const names = (arr) => (arr || []).map((it) => st[it.__ref] || it).filter(Boolean).map((o) => ({ id: String(o.id ?? ""), name: o.name, category: o.category ?? "" }));
  return { organic: names(list?.businesses?.items), total: list?.businesses?.total ?? null, ads: names(ads?.items) };
}
function placeRank(organic, names) {
  const want = names.map((n) => n.replace(/\s+/g, "").toLowerCase());
  const i = organic.findIndex((p) => { const n = (p.name || "").replace(/\s+/g, "").toLowerCase(); return want.some((w) => n === w || n.includes(w)); });
  return i < 0 ? null : i + 1;
}

/** 부트스트랩 JSON에서 콘텐츠 항목을 꺼낸다(웹 · 블로그/카페 후기 · 동영상 · 블로그 탭). */
function itemsFromBootstrap(j) {
  const out = [], seen = new Set();
  const push = (it) => {
    const url = (it.titleHref || it.href || it.contentHref || "").replace(/&amp;/g, "&");
    if (!/^https?:/.test(url) || seen.has(url) || it.title == null || typeof it.title === "object") return;
    seen.add(url);
    out.push({
      title: strip(it.title), url,
      snippet: strip(it.content ?? it.bodyText ?? it.description ?? ""),
      source: strip(it.sourceProfile?.title ?? it.profile?.title ?? it.profileTitle ?? ""),
      date: it.sourceProfile?.createdDate ?? it.profileCreatedDate ?? "",
      isAd: Boolean(it.sourceProfile?.isAdType || it.isAdType || it.isAd),
    });
  };
  const st = j?.data?.state;
  if (st) for (const it of Array.isArray(st.items) ? st.items : st.title != null ? [st] : []) push(it);
  if (!out.length) {
    const SKIP = /^(sourceProfile|profile|clickLog|nlogSpec|keep|refs|structure|images|replies|information)$/;
    const walk = (o, d) => {
      if (!o || typeof o !== "object" || d > 14) return;
      if (Array.isArray(o)) { for (const x of o) walk(x, d + 1); return; }
      if (typeof o.titleHref === "string" && o.title != null && typeof o.title !== "object") push(o);
      for (const [k, v] of Object.entries(o)) if (v && typeof v === "object" && !SKIP.test(k)) walk(v, d + 1);
    };
    walk(j?.body ?? j?.data, 0);
  }
  return out;
}
/** 부트스트랩에서 못 꺼낸 블록(지식iN 등) — 링크 글자로 첫 항목을 읽는다. */
function itemsFromHtml(seg) {
  const as = [...seg.matchAll(/<a\b[^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => ({ url: m[1].replace(/&amp;/g, "&"), text: strip(m[2]) }))
    .filter((a) => a.text.length >= 6 && !a.text.includes("›") && !/keep\.naver\.com|\/index\.naver|^https?:\/\/[^/]+\/?$/.test(a.url));
  if (!as.length) return [];
  const base = (u) => u.split("?")[0];
  const first = as[0], more = as.find((a, i) => i > 0 && base(a.url) === base(first.url));
  return [{ title: first.text, url: first.url, snippet: more ? more.text : "", source: "", date: "", isAd: false }];
}

/** 통합검색 한 장(모바일 · PC 같은 구조)을 화면 순서대로 읽는다. */
export function parseTotal(html) {
  const marks = [];
  for (const m of html.matchAll(/<div\b[^>]*id="(?:mobile|pc)PowerLink[^"]*"[^>]*>/g)) marks.push({ pos: m.index, type: "ad" });
  const pi = html.indexOf('id="place-main-section-root"');
  if (pi >= 0) marks.push({ pos: pi, type: "place" });
  for (const m of html.matchAll(/<div\b[^>]*id="(fdr-[0-9a-z]+)"[^>]*data-fender-root[^>]*>/g)) {
    marks.push({ pos: m.index, type: "block", id: m[1], ssuid: (/data-meta-ssuid="([^"]*)"/.exec(m[0]) || [])[1] || "unknown" });
  }
  marks.sort((a, b) => a.pos - b.pos);
  return marks.map((mk, idx) => {
    const end = idx + 1 < marks.length ? marks[idx + 1].pos : Math.min(html.length, mk.pos + 120000);
    const seg = html.slice(mk.pos, end);
    if (mk.type === "ad") {
      const sites = [...seg.matchAll(/<(?:span|a)\b[^>]*class="site"[^>]*>([^<]*)</g)].map((m) => strip(m[1])).filter(Boolean);
      const urls = [...seg.matchAll(/<(?:span|a)\b[^>]*class="(?:url|lnk_url)"[^>]*>([^<]*)</g)].map((m) => strip(m[1])).filter(Boolean);
      return { type: "ad", count: Math.max(sites.length, new Set(urls).size), sites, text: strip(seg).slice(0, 6000) };
    }
    if (mk.type === "place") return { type: "place", ...(placeLists(apolloState(html, mk.pos)) || { organic: [], ads: [], total: null }) };
    const bi = html.indexOf(`entry.bootstrap(document.getElementById("${mk.id}")`);
    const j = bi >= 0 ? jsonAt(html, html.indexOf("{", bi)) : null;
    let items = j ? itemsFromBootstrap(j) : [], layer = "bootstrap";
    if (!items.length && !MODULES[mk.ssuid]) { items = itemsFromHtml(seg); layer = "html"; } // 지식iN처럼 JSON 모양이 다른 블록
    return { type: "block", ssuid: mk.ssuid, layer, items, text: mk.ssuid === "ex_csa" && j ? strip(JSON.stringify(j.body ?? j.data ?? "")).slice(0, 20000) : undefined };
  });
}
export function parseBlog(html) {
  const out = [];
  for (const m of html.matchAll(/entry\.bootstrap\(document\.getElementById\("[^"]+"\)\s*,\s*/g)) {
    const j = jsonAt(html, m.index + m[0].length);
    if (j) out.push(...itemsFromBootstrap(j));
  }
  const seen = new Set();
  return out.filter((it) => /blog\.naver\.com/.test(it.url) && !seen.has(it.url) && seen.add(it.url));
}
export function parsePlace(html) { return placeLists(apolloState(html)) || { organic: [], ads: [], total: null }; }

// ───────────────────────── 본문 확인 ─────────────────────────
function bodyUrl(u) {
  let m = /^https?:\/\/(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_.-]+)\/(\d+)/.exec(u);
  if (m) return { url: `https://m.blog.naver.com/${m[1]}/${m[2]}`, ua: "mobile" }; // PC 글 주소는 빈 틀(iframe)
  m = /blog\.naver\.com\/PostView\.naver\?blogId=([^&]+)&logNo=(\d+)/.exec(u);
  if (m) return { url: `https://m.blog.naver.com/${m[1]}/${m[2]}`, ua: "mobile" };
  return { url: u, ua: isNaver(u) ? "mobile" : "desktop" };
}
const bodyCache = new Map(); // 한 번 실행하는 동안 같은 글은 한 번만 연다(모바일 · PC에 같은 글이 많음)
async function readBody(u, cfg) {
  const { url, ua } = bodyUrl(u);
  if (bodyCache.has(url)) return bodyCache.get(url);
  const r = await get(url, ua, cfg);
  let out = { read: false, text: "", status: r.status };
  if (r.status === 200 && r.text) {
    const metas = [...r.text.matchAll(/<meta\b[^>]*(?:name|property)="(?:description|og:description|og:title)"[^>]*content="([^"]*)"/gi)].map((m) => m[1]).join(" ");
    const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(r.text) || [])[1] || "";
    // 화면에 안 보이는 글자(주석 · 스크립트 · 스타일)는 지운 뒤 찾는다
    const body = r.text.replace(/<!--[\s\S]*?-->|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ");
    out = { read: strip(body).length >= 200, text: strip(`${title} ${metas} ${body}`), status: r.status };
  }
  bodyCache.set(url, out);
  return out;
}
async function judge(items, cfg) {
  const own = cfg.ownChannels.map((c) => c.replace(/^https?:\/\//, "").replace(/^(www|m)\./, "").toLowerCase());
  const out = [];
  for (const [i, it] of items.entries()) {
    const row = { rank: i + 1, ...it, owned: false, where: null, brand: null, evidence: null, bodyRead: null };
    for (const [where, text] of [["제목", it.title], ["요약", it.snippet], ["작성자", it.source]]) {
      const hit = findBrand(text, cfg.brands);
      if (hit) { Object.assign(row, { owned: true, where, brand: hit.brand, evidence: hit.evidence }); break; }
    }
    if (!row.owned && cfg.checkBody) {
      const b = await readBody(it.url, cfg);
      row.bodyRead = b.read;
      const hit = findBrand(b.text, cfg.brands);
      if (hit) Object.assign(row, { owned: true, where: "본문", brand: hit.brand, evidence: hit.evidence });
    }
    const hostPath = it.url.replace(/^https?:\/\//, "").replace(/^(www|m)\./, "").toLowerCase();
    row.ownChannel = own.some((o) => hostPath.startsWith(o));
    out.push(row);
  }
  return out;
}

// ───────────────────────── 한 키워드 확인 ─────────────────────────
async function checkKeyword(keyword, cfg, rawDir) {
  const q = encodeURIComponent(keyword);
  const result = { keyword, screens: {}, status: "ok", reasons: [] };
  const note = (s) => { result.reasons.push(s); if (result.status === "ok") result.status = "partial"; };

  for (const [key, sc] of Object.entries(SCREENS)) {
    const url = sc.url(q);
    const r = await get(url, sc.ua, cfg);
    const meta = { url, finalUrl: r.finalUrl, httpStatus: r.status, ms: r.ms, ua: sc.ua };
    if (r.text) writeFileSync(join(rawDir, `${slug(keyword)}_${key}.html.gz`), gzipSync(r.text));
    if (isCaptcha(r)) { result.status = "captcha"; result.reasons.push(`${sc.label}: 캡차`); result.screens[key] = { ...meta, status: "captcha" }; return finish(result); }
    if (r.status !== 200 || !r.text) { note(`${sc.label}: HTTP ${r.status} ${r.error ?? ""}`.trim()); result.screens[key] = { ...meta, status: "fail" }; continue; }

    if (sc.kind === "total") {
      const units = parseTotal(r.text);
      const blocks = units.filter((u) => u.type === "block");
      const ads = units.filter((u) => u.type === "ad");
      const place = units.find((u) => u.type === "place") || null;
      const ai = blocks.find((b) => b.ssuid === "ex_csa");
      const contentBlocks = blocks.filter((b) => !MODULES[b.ssuid] || cfg.countModules.includes(b.ssuid));
      const empty = contentBlocks.filter((b) => !b.items.length);
      const pool = contentBlocks.flatMap((b) => b.items.map((it) => ({ ...it, block: b.ssuid }))).filter((it) => !it.isAd);
      const top = await judge(pool.slice(0, cfg.topN), cfg);
      if (!blocks.length) note(`${sc.label}: 결과 블록을 하나도 못 찾음(화면 구조 바뀜 의심)`);
      if (empty.length) note(`${sc.label}: 내용을 못 읽은 블록 ${empty.length}개(${[...new Set(empty.map((b) => b.ssuid))].join(", ")})`);
      if (top.length < cfg.topN) note(`${sc.label}: 콘텐츠가 ${top.length}개뿐`);
      result.screens[key] = {
        ...meta, status: "ok",
        layout: units.map((u) => (u.type === "block" ? `${u.ssuid}${MODULES[u.ssuid] && !cfg.countModules.includes(u.ssuid) ? "(제외)" : ""}` : u.type)),
        ads: { count: ads.reduce((n, a) => n + a.count, 0), sites: ads.flatMap((a) => a.sites), brandHit: Boolean(findBrand(ads.map((a) => a.text).join(" "), cfg.brands)) },
        placeBlock: place ? { shown: place.organic.length, organic: place.organic.slice(0, 10).map((p) => p.name), ads: place.ads.map((p) => p.name), ourRank: placeRank(place.organic, cfg.placeNames) } : null,
        aiBriefing: ai ? { brandHit: Boolean(findBrand(ai.text || "", cfg.brands)) } : null,
        top, owned: top.filter((t) => t.owned).length, n: top.length,
        bodyUnread: top.filter((t) => t.bodyRead === false).length, // 카페처럼 바깥에서 본문이 안 열리는 글 — 제목 · 요약 · 작성자로만 판정
      };
    } else if (sc.kind === "blog") {
      const items = parseBlog(r.text);
      const top = await judge(items.filter((it) => !it.isAd).slice(0, cfg.topN), cfg);
      if (!items.length) note(`${sc.label}: 글을 하나도 못 찾음(화면 구조 바뀜 의심)`);
      result.screens[key] = { ...meta, status: "ok", read: items.length, adCount: items.filter((it) => it.isAd).length, top, owned: top.filter((t) => t.owned).length, n: top.length, bodyUnread: top.filter((t) => t.bodyRead === false).length };
    } else {
      const p = parsePlace(r.text);
      const rank = placeRank(p.organic, cfg.placeNames);
      if (p.total === null) note(`${sc.label}: 목록을 못 읽음`);
      result.screens[key] = { ...meta, status: "ok", total: p.total, checked: p.organic.length, top5: p.organic.slice(0, 5).map((x) => x.name), ads: p.ads.map((x) => x.name), ourRank: rank, firstPage: rank !== null && rank <= 5 };
    }
  }
  return finish(result);
}
/** 엑셀 · 달력이 쓰는 요약. 숫자가 없으면 null(빈칸). */
function finish(result) {
  const s = result.screens, sum = {};
  for (const k of OCC) { sum[k] = s[k]?.status === "ok" ? s[k].owned : null; sum[`${k}_n`] = s[k]?.status === "ok" ? s[k].n : null; }
  sum.place_pc = s.place_pc?.ourRank ?? null;                   // PC 지도 목록 순위(광고 제외)
  sum.place_pc_total = s.place_pc?.total ?? null;
  sum.place_pc_checked = s.place_pc?.checked ?? (s.place_pc?.total != null ? Math.min(s.place_pc.total, 50) : null); // 목록에서 읽은 업체 수(최대 50)
  sum.place_pcb = s.total_pc?.placeBlock?.ourRank ?? null;       // PC 통합검색 플레이스 영역 안 순위
  sum.place_pcb_shown = s.total_pc?.placeBlock?.shown ?? null;
  sum.place_m = s.total_m?.placeBlock?.ourRank ?? null;          // 모바일 통합검색 플레이스 영역 안 순위
  sum.place_m_shown = s.total_m?.placeBlock?.shown ?? null;      // 그 영역에 보인 업체 수(없으면 영역 없음)
  result.summary = sum;
  return result;
}

// ───────────────────────── 설정 ─────────────────────────
const configPath = (argv) => resolve(argOf(argv, "--config") || "exposure.config.json");
function readConfigFile(argv) { const p = configPath(argv); return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {}; }
function loadConfig(argv) {
  const cfg = { ...DEFAULTS, ...readConfigFile(argv) };
  if (!cfg.placeNames.length) cfg.placeNames = cfg.brands;
  if (!cfg.brands.length) throw new Error(`설정 파일(${configPath(argv)})에 대조 상호(brands)가 없습니다. node naver-exposure.mjs brand add 상호`);
  cfg.dataDir = resolve(cfg.dataDir);
  return cfg;
}
/** brand · keyword · place 목록 고치기. 중복 · 빈칸은 버린다. */
function editList(argv, field, label) {
  const [action, ...rest] = argv;
  const raw = readConfigFile(argv);
  const list = Array.isArray(raw[field]) ? raw[field] : [];
  const values = rest.filter((v, i) => !v.startsWith("--") && !(rest[i - 1] || "").startsWith("--")).map((v) => v.trim()).filter(Boolean);
  let next = list;
  if (action === "add") next = [...list, ...values.filter((v) => !list.includes(v))];
  else if (action === "remove") next = list.filter((v) => !values.includes(v));
  else if (action === "import") {
    const lines = readFileSync(values[0], "utf8").split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim()).filter(Boolean);
    next = [...list, ...lines.filter((v, i) => !list.includes(v) && lines.indexOf(v) === i)];
  } else if (action !== "list") throw new Error(`${label}: list | add | remove${field === "keywords" ? " | import" : ""}`);
  if (next !== list) { raw[field] = next; writeFileSync(configPath(argv), JSON.stringify({ ...DEFAULTS, ...raw }, null, 2) + "\n"); }
  console.log(`${label} ${next.length}개${next !== list ? `(바뀜: ${list.length} → ${next.length})` : ""}`);
  next.forEach((v, i) => console.log(`  ${i + 1}. ${v}`));
}

// ───────────────────────── 기록 ─────────────────────────
function readRecords(dataDir) {
  const dir = join(dataDir, "records");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort().flatMap((f) =>
    readFileSync(join(dir, f), "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((r) => r?.v >= 2 && r.screens).map(finish)); // 요약은 화면 기록에서 다시 계산(판이 바뀌어도 옛 기록을 같은 칸으로 읽음)
}
/** 날짜 · 키워드마다 마지막 시도를 대표로 쓴다(시도는 모두 남아 있음). */
function latestByDay(records) {
  const map = new Map();
  for (const r of records) map.set(`${r.date}|${r.keyword}`, r);
  return [...map.values()].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
}

// 누적 CSV 두 개 — 엑셀에서 바로 열리게 UTF-8 BOM을 붙이고, 실행할 때마다 줄을 더한다(지우거나 고치지 않음).
const csvLine = (arr) => arr.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",") + "\r\n";
const CSVS = {
  daily: {
    file: "daily.csv",
    head: ["날짜", "키워드", "시도", "상태", "통합 모바일", "통합 PC", "블로그 모바일", "블로그 PC", "상위 N", "플레이스 지도 순위", "지도 읽은 수", "지도 전체", "PC 통합 영역 순위", "PC 영역 업체 수", "모바일 통합 영역 순위", "모바일 영역 업체 수", "확인 시각", "덜 읽은 이유"],
    rows: (r) => { const s = r.summary; return [[r.date, r.keyword, r.attempt, r.status, s.total_m, s.total_pc, s.blog_m, s.blog_pc, r.topN, s.place_pc, s.place_pc_checked, s.place_pc_total, s.place_pcb, s.place_pcb_shown, s.place_m, s.place_m_shown, r.startedAt, (r.reasons || []).join(" / ")]]; },
  },
  contents: {
    file: "contents.csv",
    head: ["날짜", "키워드", "시도", "화면", "순위", "점유", "찾은 곳", "걸린 상호", "제목", "출처", "주소", "근거", "본문 읽음", "우리 채널"],
    rows: (r) => OCC.flatMap((k) => (r.screens[k]?.top || []).map((t) => [r.date, r.keyword, r.attempt, SCREENS[k].label, t.rank, t.owned ? "점유" : "미점유", t.where, t.brand, t.title, t.source, t.url, t.evidence, t.bodyRead == null ? "" : t.bodyRead ? "예" : "아니오", t.ownChannel ? "예" : ""])),
  },
};
function appendCsv(dataDir, rec) {
  for (const c of Object.values(CSVS)) {
    const p = join(dataDir, c.file), head = csvLine(c.head);
    if (existsSync(p) && readFileSync(p, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)[0] !== head.replace(/\r\n$/, "")) renameSync(p, p.replace(/\.csv$/, `_이전형식_${Date.now()}.csv`)); // 칸이 바뀐 옛 파일은 옆으로 비킴
    if (!existsSync(p)) writeFileSync(p, "\uFEFF" + head);
    appendFileSync(p, c.rows(rec).map(csvLine).join(""));
  }
}
/** 기록(records/)에서 CSV를 처음부터 다시 만든다 — CSV를 잃었거나 엑셀에서 고쳐 망가졌을 때. */
function rebuildCsv(cfg, records) {
  for (const c of Object.values(CSVS)) writeFileSync(join(cfg.dataDir, c.file), "\uFEFF" + csvLine(c.head) + records.flatMap(c.rows).map(csvLine).join(""));
  return Object.values(CSVS).map((c) => join(cfg.dataDir, c.file));
}

async function run(argv) {
  const cfg = loadConfig(argv);
  const date = kstDate();
  const prev = readRecords(cfg.dataDir);
  const picked = argsOf(argv, "--keyword");
  let keywords = picked.length ? picked : cfg.keywords;
  if (argv.includes("--missing")) keywords = keywords.filter((k) => !prev.some((r) => r.date === date && r.keyword === k && (r.status === "ok" || r.status === "partial")));
  if (!keywords.length) { console.log(picked.length || cfg.keywords.length ? "오늘 할 키워드가 없습니다(모두 끝남)." : "검색 키워드가 없습니다. node naver-exposure.mjs keyword add 키워드"); writeOutputs(cfg); return; }
  const recDir = join(cfg.dataDir, "records"), rawRoot = join(cfg.dataDir, "raw"), rawDir = join(rawRoot, date);
  mkdirSync(recDir, { recursive: true }); mkdirSync(rawDir, { recursive: true });
  console.log(`${date} 키워드 ${keywords.length}개 · 대조 상호 ${cfg.brands.join(" | ")} · 키워드 하나에 약 30초~2분`);

  for (const keyword of keywords) {
    const startedAt = kstTime();
    const attempt = prev.filter((r) => r.date === date && r.keyword === keyword).length + 1;
    const res = await checkKeyword(keyword, cfg, rawDir);
    const rec = { v: 2, tool: VERSION, date, keyword, attempt, startedAt, finishedAt: kstTime(), brands: cfg.brands, placeNames: cfg.placeNames, topN: cfg.topN, ...res };
    appendFileSync(join(recDir, `${date.slice(0, 7)}.jsonl`), JSON.stringify(rec) + "\n");
    appendCsv(cfg.dataDir, rec);
    prev.push(rec);
    console.log(line(rec));
    if (res.status === "captcha") { console.log("캡차가 나와 멈춥니다. 30분 넘게 쉰 뒤 run --missing 으로 이어 하세요."); break; }
  }
  const cut = kstDate(new Date(Date.now() - cfg.keepRawDays * 864e5));
  for (const d of existsSync(rawRoot) ? readdirSync(rawRoot) : []) if (d < cut) rmSync(join(rawRoot, d), { recursive: true, force: true });
  writeOutputs(cfg);
}
function writeOutputs(cfg) {
  if (!existsSync(cfg.dataDir)) return;
  writeReport(cfg, readRecords(cfg.dataDir), kstDate().slice(0, 7));
  console.log(`누적 CSV: ${join(cfg.dataDir, "daily.csv")} · ${join(cfg.dataDir, "contents.csv")}\n그래프 · 달력: ${join(cfg.dataDir, "report.html")}\n기록 원본: ${join(cfg.dataDir, "records")}`);
}

const fmtOcc = (s, k) => (s[k] == null ? "-" : `${s[k]}/${s[`${k}_n`]}`);
const inBlock = (rank, shown) => (rank ? `${rank}위` : shown ? `${shown}곳 밖` : "영역 없음");
const fmtPlace = (s) => `플레이스 지도 ${s.place_pc ? `${s.place_pc}위/${s.place_pc_total}` : !s.place_pc_total ? "없음" : s.place_pc_checked < s.place_pc_total ? `${s.place_pc_checked}위 밖/${s.place_pc_total}` : `없음/${s.place_pc_total}`}` +
  ` · PC 통합 ${inBlock(s.place_pcb, s.place_pcb_shown)} · 모바일 통합 ${inBlock(s.place_m, s.place_m_shown)}`;
function line(r) {
  const s = r.summary;
  return `${r.date} 「${r.keyword}」 ${r.status === "ok" ? "" : `[${r.status}] `}` +
    `통합 모바일 ${fmtOcc(s, "total_m")} · PC ${fmtOcc(s, "total_pc")} | 블로그 모바일 ${fmtOcc(s, "blog_m")} · PC ${fmtOcc(s, "blog_pc")} | ${fmtPlace(s)}` +
    (r.reasons?.length ? `\n   └ ${r.reasons.join(" / ")}` : "");
}
function today(argv) {
  const cfg = loadConfig(argv);
  const d = kstDate();
  const rows = latestByDay(readRecords(cfg.dataDir)).filter((r) => r.date === d);
  if (!rows.length) return console.log(`${d} 기록이 없습니다. run 을 먼저 돌리세요.`);
  for (const r of rows) {
    console.log(line(r));
    for (const k of OCC) for (const t of r.screens[k]?.top || [])
      console.log(`   ${SCREENS[k].label} ${t.rank}. ${t.owned ? "●" : "○"} ${t.title.slice(0, 40)}${t.owned ? ` — ${t.where}(${t.brand})` : ""}`);
  }
}

// ───────────────────────── 그래프 · 달력(report.html) ─────────────────────────
// 색은 기기(모바일 파랑 · PC 주황), 선 모양은 화면(통합 실선 · 블로그 점선 / 플레이스 지도 실선 · 통합 영역 점선).
// 색만으로 구분하지 않게 선 모양을 함께 쓴다. 두 색은 색각 이상 시뮬레이션 검사를 밝은 · 어두운 화면 모두 통과.
const SERIES = {
  total_m: { name: "통합 · 모바일", dev: "m", dash: false },
  total_pc: { name: "통합 · PC", dev: "pc", dash: false },
  blog_m: { name: "블로그 · 모바일", dev: "m", dash: true },
  blog_pc: { name: "블로그 · PC", dev: "pc", dash: true },
  place_pc: { name: "지도 목록 · PC", dev: "pc", dash: false },
  place_pcb: { name: "통합 영역 · PC", dev: "pc", dash: true },
  place_m: { name: "통합 영역 · 모바일", dev: "m", dash: true },
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
/** 꺾은선 SVG 한 장. 값이 없는 날은 선을 끊는다. 마우스를 올리면 그날 값(report.html 아래 스크립트). */
function svgChart({ dates, series, yMin, yMax, ticks, reverse = false, fmt, label, W = 560, H = 200 }) {
  const L = 36, R = 14, T = 10, B = 28, pw = W - L - R, ph = H - T - B, n = dates.length;
  const x = (i) => L + (n === 1 ? pw / 2 : (i / (n - 1)) * pw);
  const y = (v) => { const f = (v - yMin) / (yMax - yMin || 1); return reverse ? T + f * ph : T + ph - f * ph; };
  let g = "";
  for (const t of ticks) g += `<line x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="grid"/><text x="${L - 6}" y="${(y(t) + 4).toFixed(1)}" class="tick" text-anchor="end">${t}</text>`;
  g += `<line x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}" class="base"/>`;
  const step = Math.max(1, Math.ceil((n - 1) / 5));
  const xs = []; for (let i = 0; i < n; i += step) xs.push(i); if (xs.at(-1) !== n - 1) xs.push(n - 1);
  // 양 끝 날짜는 안쪽으로 붙여 그래프 밖으로 잘리지 않게
  for (const i of xs) g += `<text x="${x(i).toFixed(1)}" y="${H - 8}" class="tick" text-anchor="${n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle"}">${md(dates[i])}</text>`;
  for (const s of series) {
    let path = "", pen = false;
    s.vals.forEach((v, i) => { if (v == null) { pen = false; return; } path += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
    if (path) g += `<path d="${path}" class="ln ${SERIES[s.key].dev}${SERIES[s.key].dash ? " dash" : ""}"/>`;
    s.vals.forEach((v, i) => { // 점은 날이 적을 때 모두, 많으면 끊긴 곳과 마지막 날만
      const lone = v != null && (n <= 31 || i === n - 1 || s.vals[i - 1] == null || s.vals[i + 1] == null);
      if (lone) g += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" class="pt ${SERIES[s.key].dev}"/>`;
    });
  }
  g += `<line class="xhair" x1="0" x2="0" y1="${T}" y2="${T + ph}"/>`;
  const data = { W, xs: dates.map((_, i) => +x(i).toFixed(1)), dates, fmt, series: series.map((s) => ({ key: s.key, name: SERIES[s.key].name, dev: SERIES[s.key].dev, dash: SERIES[s.key].dash, vals: s.vals })) };
  return `<svg viewBox="0 0 ${W} ${H}"${W >= 800 ? ' class="wide"' : ""} role="img" aria-label="${esc(label)}" data-chart="${esc(JSON.stringify(data))}">${g}</svg>`;
}
const swatch = (key) => `<svg class="sw" width="26" height="10" aria-hidden="true"><line x1="1" x2="25" y1="5" y2="5" class="ln ${SERIES[key].dev}${SERIES[key].dash ? " dash" : ""}"/></svg>`;
const legendOf = (keys) => `<div class="legend">${keys.map((k) => `<span>${swatch(k)}${SERIES[k].name}</span>`).join("")}</div>`;

function writeReport(cfg, records, month) {
  const recs = latestByDay(records);
  const keywords = [...new Set([...cfg.keywords, ...recs.map((r) => r.keyword)])].filter((k) => recs.some((r) => r.keyword === k));
  const at = new Map(recs.map((r) => [`${r.date}|${r.keyword}`, r]));
  // 그래프 날짜 — 마지막 기록일부터 거꾸로 chartDays일, 하루도 빼지 않는다(기록 없는 날은 선이 끊김)
  const last = recs.at(-1)?.date, dates = [];
  if (last) for (let i = cfg.chartDays - 1; i >= 0; i--) { const d = new Date(new Date(`${last}T00:00:00Z`).getTime() - i * 864e5).toISOString().slice(0, 10); if (d >= recs[0].date) dates.push(d); }
  const vals = (kw, key) => dates.map((d) => at.get(`${d}|${kw}`)?.summary?.[key] ?? null);
  const overall = (key) => dates.map((d) => { let o = 0, n = 0; for (const kw of keywords) { const s = at.get(`${d}|${kw}`)?.summary; if (s?.[key] != null) { o += s[key]; n += s[`${key}_n`] || 0; } } return n ? Math.round((o / n) * 100) : null; });
  const N = cfg.topN, occTicks = Array.from({ length: N + 1 }, (_, i) => i);

  let body = "";
  if (dates.length) {
    body += `<section><h2>전체 점유율</h2><p class="sub">모든 키워드를 합친 점유 비율(점유 수 ÷ 본 콘텐츠 수). 최근 ${dates.length}일.</p>${legendOf(OCC)}<figure class="card">${svgChart({ dates, series: OCC.map((k) => ({ key: k, vals: overall(k) })), yMin: 0, yMax: 100, ticks: [0, 20, 40, 60, 80, 100], fmt: "{v}%", label: "전체 점유율 추이", W: 800, H: 220 })}</figure></section>`;
    body += `<section><h2>키워드별 점유</h2><p class="sub">상위 ${N}개 콘텐츠 가운데 대조 상호가 들어간 수.</p>${legendOf(OCC)}<div class="grid2">${keywords.map((kw) => `<figure class="card"><figcaption>${esc(kw)}</figcaption>${svgChart({ dates, series: OCC.map((k) => ({ key: k, vals: vals(kw, k) })), yMin: 0, yMax: N, ticks: occTicks, fmt: `{v}/${N}`, label: `${kw} 점유 추이` })}</figure>`).join("")}</div></section>`;
    const ranked = keywords.filter((kw) => ["place_pc", "place_pcb", "place_m"].some((k) => vals(kw, k).some((v) => v != null)));
    body += `<section><h2>키워드별 플레이스 순위</h2><p class="sub">위쪽이 1위. 순위 밖이거나 영역이 없는 날은 비어 있습니다.${ranked.length ? "" : " 아직 순위가 잡힌 키워드가 없습니다."}</p>${ranked.length ? legendOf(["place_pc", "place_pcb", "place_m"]) : ""}<div class="grid2">${ranked.map((kw) => {
      const ps = ["place_pc", "place_pcb", "place_m"].map((k) => ({ key: k, vals: vals(kw, k) }));
      const worst = Math.max(5, ...ps.flatMap((p) => p.vals).filter((v) => v != null)), yMax = Math.ceil(worst / 5) * 5;
      const ticks = yMax <= 10 ? Array.from({ length: yMax }, (_, i) => i + 1) : [1, ...Array.from({ length: yMax / 5 }, (_, i) => (i + 1) * 5)];
      return `<figure class="card"><figcaption>${esc(kw)}</figcaption>${svgChart({ dates, series: ps, yMin: 1, yMax, ticks, reverse: true, fmt: "{v}위", label: `${kw} 플레이스 순위 추이` })}</figure>`;
    }).join("")}</div></section>`;
  }

  // 이번 달 달력
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate(), lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // 월요일 시작
  const share = (s) => { let o = 0, n = 0; for (const k of OCC) if (s[k] != null) { o += s[k]; n += s[`${k}_n`] || 0; } return n ? o / n : null; };
  const lvl = (v) => (v == null ? "" : v >= 0.8 ? "l4" : v >= 0.6 ? "l3" : v >= 0.3 ? "l2" : v > 0 ? "l1" : "l0");
  let cells = "";
  for (let i = 0; i < lead; i++) cells += `<div class="day empty" aria-hidden="true"></div>`;
  for (let d = 1; d <= days; d++) {
    const ds = `${month}-${String(d).padStart(2, "0")}`;
    const inner = recs.filter((r) => r.date === ds).map((r) => { const s = r.summary;
      return `<li class="${lvl(share(s))}"><b>${esc(r.keyword)}</b><span>통합 모 ${fmtOcc(s, "total_m")} · PC ${fmtOcc(s, "total_pc")}</span><span>블로그 모 ${fmtOcc(s, "blog_m")} · PC ${fmtOcc(s, "blog_pc")}</span><span>${esc(fmtPlace(s))}</span>${r.status !== "ok" ? `<em>${r.status === "partial" ? "덜 읽음" : esc(r.status)}</em>` : ""}</li>`; }).join("");
    cells += `<div class="day${inner ? "" : " none"}"><span class="d">${d}</span>${inner ? `<ul>${inner}</ul>` : ""}</div>`;
  }
  body += `<section><h2>${y}년 ${m}월 달력</h2><p class="sub">날짜 칸의 왼쪽 선이 진할수록 그날 점유가 높습니다(네 화면 합계).</p><div class="cal">${["월", "화", "수", "목", "금", "토", "일"].map((w) => `<div class="wk">${w}</div>`).join("")}${cells}</div></section>`;

  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>네이버 점유 현황</title><style>
:root{--bg:#fff;--panel:#f7f7f8;--elev:#fff;--line:#e7e7e9;--fg:#29292d;--fg-strong:#17171a;--muted:#5e5e65;--faint:#6b6b72;--ok:#3b7a52;--warn:#9c5b22;--m:#2a78d6;--pc:#eb6834;--grid:#e1e0d9;--axis:#c3c2b7;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#18181b;--panel:#1d1d20;--elev:#252529;--line:#343439;--fg:#e6e6e9;--fg-strong:#f5f5f7;--muted:#b0b0b7;--faint:#9999a2;--ok:#74c391;--warn:#e0a458;--m:#3987e5;--pc:#d95926;--grid:#2c2c2a;--axis:#47474e}}
:root[data-theme="dark"]{--bg:#18181b;--panel:#1d1d20;--elev:#252529;--line:#343439;--fg:#e6e6e9;--fg-strong:#f5f5f7;--muted:#b0b0b7;--faint:#9999a2;--ok:#74c391;--warn:#e0a458;--m:#3987e5;--pc:#d95926;--grid:#2c2c2a;--axis:#47474e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:400 14px/1.43 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Malgun Gothic",sans-serif;word-break:keep-all}
main{max-width:1100px;margin:0 auto;padding:24px max(16px,env(safe-area-inset-right)) 48px max(16px,env(safe-area-inset-left));display:flex;flex-direction:column;gap:32px}
section{display:flex;flex-direction:column;gap:10px}
h1{font-size:20px;font-weight:600;color:var(--fg-strong);margin:0}h2{font-size:15px;font-weight:600;color:var(--fg-strong);margin:0}.sub{color:var(--muted);font-size:13px;margin:0}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:var(--muted)}.legend span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));gap:12px}
.card{margin:0;border:1px solid var(--line);border-radius:6px;padding:10px 10px 6px;background:var(--bg)}.card figcaption{font-size:13px;font-weight:500;color:var(--fg-strong);padding:0 4px 6px}
svg{display:block;width:100%;height:auto;overflow:visible}.grid{stroke:var(--grid);stroke-width:1}.base{stroke:var(--axis);stroke-width:1}
.tick{fill:var(--faint);font-size:11px;font-variant-numeric:tabular-nums}
.ln{fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.ln.m{stroke:var(--m)}.ln.pc{stroke:var(--pc)}.ln.dash{stroke-dasharray:6 5}
.pt{stroke:var(--bg);stroke-width:2}.pt.m{fill:var(--m)}.pt.pc{fill:var(--pc)}
.xhair{stroke:var(--axis);stroke-width:1;opacity:0;pointer-events:none}
#tip{position:fixed;z-index:10;pointer-events:none;background:var(--elev);border:1px solid var(--line);border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.07);padding:8px 10px;font-size:12px;display:flex;flex-direction:column;gap:2px;min-width:190px}
#tip b{font-weight:600;color:var(--fg-strong)}#tip span{display:flex;align-items:center;gap:6px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}#tip span em{font-style:normal;color:var(--fg-strong);margin-left:auto}
.cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border-top:1px solid var(--line);border-left:1px solid var(--line)}
.wk{font-size:12px;color:var(--faint);padding:6px 8px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--panel)}
.day{min-height:96px;padding:6px 8px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:4px;min-width:0}
.day.empty{background:var(--panel)}.d{font-size:12px;color:var(--faint);font-variant-numeric:tabular-nums}
.cal ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.cal li{font-size:12px;line-height:1.4;padding:4px 6px;border-radius:4px;border-left:3px solid var(--line);background:var(--panel);display:flex;flex-direction:column}
.cal li b{font-weight:500;color:var(--fg-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cal li span{color:var(--muted);font-variant-numeric:tabular-nums}.cal li em{font-style:normal;color:var(--warn)}
.cal li.l1{border-left-color:color-mix(in srgb,var(--ok) 30%,var(--line))}.cal li.l2{border-left-color:color-mix(in srgb,var(--ok) 55%,var(--line))}
.cal li.l3{border-left-color:color-mix(in srgb,var(--ok) 80%,var(--line))}.cal li.l4{border-left-color:var(--ok)}
.note{font-size:12px;color:var(--faint);margin:0}
@media (max-width:720px){.cal{grid-template-columns:1fr}.wk,.day.empty,.day.none{display:none}.day{min-height:0}}
@media (max-width:720px){.tick{font-size:15px}svg.wide .tick{font-size:19px}} /* 그래프가 좁아지면 눈금 글자를 키운다(SVG 글자는 그래프와 함께 줄어듦) */
</style></head><body><main>
<header><h1>네이버 첫 페이지 점유 현황</h1><p class="sub">대조 상호 ${esc(cfg.brands.join(" | "))} · 키워드 ${keywords.length}개 · ${recs[0]?.date ?? "-"} ~ ${last ?? "-"}. 광고 · 플레이스 · 네이버 자체 묶음을 뺀 상위 ${N}개 콘텐츠 중 대조 상호가 들어간 수를 모바일 · PC 따로 셉니다. 숫자는 daily.csv · contents.csv에 있습니다.</p></header>
${body || `<p class="note">아직 기록이 없습니다. run 을 먼저 돌리세요.</p>`}
<p class="note">같은 날 여러 번 돌리면 마지막 시도를 씁니다. 모든 시도는 records/ 와 CSV에 남아 있습니다. 만든 때 ${esc(kstTime())}</p>
</main><div id="tip" hidden></div>
<script>
(function(){
  var tip=document.getElementById("tip");
  function esc(s){return String(s).replace(/[&<>]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;"}[c];});}
  document.querySelectorAll("svg[data-chart]").forEach(function(svg){
    var d=JSON.parse(svg.getAttribute("data-chart")), xh=svg.querySelector(".xhair");
    function show(ev){
      var r=svg.getBoundingClientRect(), px=(ev.clientX-r.left)/r.width*d.W, i=0;
      d.xs.forEach(function(x,j){if(Math.abs(x-px)<Math.abs(d.xs[i]-px))i=j;});
      xh.setAttribute("x1",d.xs[i]);xh.setAttribute("x2",d.xs[i]);xh.style.opacity=1;
      tip.innerHTML="<b>"+esc(d.dates[i])+"</b>"+d.series.map(function(s){var v=s.vals[i];
        return '<span><svg width="20" height="8" aria-hidden="true"><line x1="1" x2="19" y1="4" y2="4" class="ln '+s.dev+(s.dash?" dash":"")+'"/></svg>'+esc(s.name)+"<em>"+(v==null?"기록 없음":esc(d.fmt.replace("{v}",v)))+"</em></span>";}).join("");
      tip.hidden=false;
      var w=tip.offsetWidth,h=tip.offsetHeight,x=ev.clientX+14,y=ev.clientY+14;
      if(x+w>innerWidth-8)x=ev.clientX-w-14; if(y+h>innerHeight-8)y=ev.clientY-h-14;
      tip.style.left=Math.max(8,x)+"px";tip.style.top=Math.max(8,y)+"px";
    }
    svg.addEventListener("pointermove",show);
    svg.addEventListener("pointerleave",function(){xh.style.opacity=0;tip.hidden=true;});
  });
})();
</script></body></html>`;
  writeFileSync(join(cfg.dataDir, "report.html"), html);
  return join(cfg.dataDir, "report.html");
}

// ───────────────────────── 시작 ─────────────────────────
const [cmd, ...argv] = process.argv.slice(2);
const main = {
  run: () => run(argv),
  today: () => today(argv),
  brand: () => editList(argv, "brands", "대조 상호(OR)"),
  keyword: () => editList(argv, "keywords", "검색 키워드"),
  place: () => editList(argv, "placeNames", "플레이스 등록 이름"),
  report: () => { const cfg = loadConfig(argv); console.log(writeReport(cfg, readRecords(cfg.dataDir), argOf(argv, "--month") || kstDate().slice(0, 7))); },
  csv: () => { const cfg = loadConfig(argv); console.log(rebuildCsv(cfg, readRecords(cfg.dataDir)).join("\n")); },
  parse: () => {
    const html = readFileSync(argv[0], "utf8"), screen = argOf(argv, "--screen") || "total";
    const out = screen === "total" ? parseTotal(html).map((u) => ({ ...u, text: undefined })) : screen === "blog" ? parseBlog(html) : parsePlace(html);
    console.log(JSON.stringify(out, null, 1));
  },
}[cmd];
if (!main) {
  console.log("사용법: node naver-exposure.mjs run [--missing] [--keyword 키워드] | brand|keyword|place list|add|remove … | keyword import 파일.txt | today | report [--month YYYY-MM] | csv | parse <파일> --screen total|blog|place");
  process.exit(cmd ? 1 : 0);
}
Promise.resolve(main()).catch((e) => { console.error("오류:", e.message); process.exit(1); });
