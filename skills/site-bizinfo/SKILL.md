---
name: site-bizinfo
description: Bizinfo (기업마당, 중소벤처기업부 지원사업 포털) site knowledge — the 지원사업 공고 list whose table already holds each notice's 신청기간 (deadline), its working search address, the detail address, and why the integrated search page is the wrong list.
metadata:
  t5Web:
    hosts: [www.bizinfo.go.kr, bizinfo.go.kr]
    keywords: [기업마당, bizinfo]
---

# Bizinfo (기업마당)

Observed 2026-11-11. The page you observe wins when it differs.

## The list to read: 지원사업 공고 (not 통합검색)
- Open notices for a word, server-rendered (web_read reads it too, no browser needed):
  `https://www.bizinfo.go.kr/sii/siia/selectSIIA200View.do?rows=15&cpage=1&schEndAt=N&condition=searchPblancNm&condition1=AND&keyword=<검색어>`
  - `schEndAt=N` = notices not yet closed (지금 신청 가능). `condition=searchPblancNm` searches the notice name.
  - All of `cpage=1`, `condition`, `condition1=AND` are needed: without them the site answers HTTP 500 「Data Access Fail」.
  - 15 rows per page whatever `rows` says; the next page is `cpage=2`. The heading line reads 「'<검색어>'(으)로 'N'건이 검색되었습니다」 — the total count.
  - Without a keyword (`…selectSIIA200View.do?rows=15&cpage=1&schEndAt=N`) it lists every open notice, newest first.
- The table (caption 「지원사업 공고에 대한 번호, 지원분야, 지원사업명, 신청기간 …」) has, per row: 번호 · 지원분야 · 지원사업명 (link) · **신청기간** · 소관부처·지자체 · 사업수행기관 · 등록일 · 조회수.
  - 신청기간 is either `YYYY-MM-DD ~ YYYY-MM-DD` (the second date is the deadline) or words such as 「예산 소진시까지」 or 「상시 접수」 (no fixed deadline — say so in the answer, do not invent a date).
  - So a request like 「신청 가능한 지원사업 N개를 마감일과 함께」 is answered from this one list page. Open a detail page only when the person asks for target, amount or how to apply.
- Do not use the integrated search (`/web/search.do`, reached from the home page's 「#소상공인」 tags or search box): it shows summaries without 신청기간, and its result links are `#` script links, so each one has to be clicked and read separately.

## Detail
- `https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_…` — the list row's link `href` carries the `pblancId`.

## One call (browser code hand)
```js
await openTab('https://www.bizinfo.go.kr/sii/siia/selectSIIA200View.do?rows=15&cpage=1&schEndAt=N&condition=searchPblancNm&condition1=AND&keyword=' + encodeURIComponent('소상공인'));
const total = (await page.locator('body').innerText()).match(/'[^']+'\(으\)로 '([\d,]+)'건/u)?.[1] ?? null;
const rows = await page.locator('table:has(caption:has-text("신청기간")) tbody tr').evaluateAll(trs => trs.map(tr => {
  const td = [...tr.querySelectorAll('td')].map(cell => cell.innerText.replace(/\s+/gu, ' ').trim());
  const link = tr.querySelector('a[href*="selectSIIA200Detail"]');
  return { 분야: td[1], 사업명: td[2], 신청기간: td[3], 소관: td[4], 수행기관: td[5], 등록일: td[6],
    주소: link ? new URL(link.getAttribute('href'), location.href).href : null };
}));
({ total, shown: rows.length, rows });
```
- `shown` and `total` tell how much of the result this page covers; read `cpage=2` when more rows are needed.
