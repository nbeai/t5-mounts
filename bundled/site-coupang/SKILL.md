---
name: site-coupang
description: Coupang (쿠팡) site knowledge — the search URL with its sort values, the absence of a review-count sort, reading result cards and review counts, and what to do on an access-denied page.
metadata:
  t5Web:
    hosts: [www.coupang.com, coupang.com, m.coupang.com]
    keywords: [쿠팡, coupang]
---

# Coupang

## URLs
- Search: `https://www.coupang.com/np/search?q=<검색어>&sorter=<value>&listSize=72`
  - `scoreDesc` 쿠팡 랭킹순, `salePriceAsc` 낮은가격순, `salePriceDesc` 높은가격순, `saleCountDesc` 판매량순, `latestAsc` 최신순.
- Product: `https://www.coupang.com/vp/products/<productId>`.
- There is no "리뷰 많은순" sort: read each card's review count and order the items yourself, and say that the order was computed from the counts shown.
- Pages beyond the first (observed 2026-10-16 in the person's everyday Chrome, not signed in to Coupang): `&page=2` and `&page=3` returned 200 with no product cards and a sign-in prompt, while page 1 (`listSize=72`) showed 42 products. Other sort values (`saleCountDesc`, `scoreDesc`) give other first pages. A ranking across all of Coupang is then not observable; state the pages and sorts you compared.

## Landmarks
- Result list: `#product-list > li` (older markup `li.search-product`). Each card has the name, the price, the star rating and the review count in parentheses, e.g. `(1,234)`. Ads carry an "AD"/광고 mark; leave them out when the person wants the site's own ranking.
- Markup changes; verify with a scoped ariaSnapshot of the list before extracting many fields.

## Boundaries
- An "Access Denied" or blank refusal page is the site refusing automated browsers.
- Dated observations (sites change; the page in front of you is the current fact):
  - 2026-09-28 and 2026-10-15: T5's web engine and T5's Chrome (also in a visible window) got this refusal (403).
  - 2026-09-28 and 2026-10-15: the person's everyday browser driven on screen (usual_browser) showed the search results with every card and its product address.
  - 2026-10-15 (night): the person's everyday Chrome reached through its approved remote debugging connection (browser_run_code in a background tab) got the search page with status 200, every card and its price, no refusal.
- Do not disguise a browser or loop on a refusal; if the everyday browser is refused too, tell the person.
