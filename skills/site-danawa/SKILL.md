---
name: site-danawa
description: Danawa (다나와, 가격비교) site knowledge — the search and category list addresses, the site's own sort controls (낮은가격순 …) that act in the page, which result tab holds price-compared products, and the product address.
metadata:
  t5Web:
    hosts: [search.danawa.com, prod.danawa.com, danawa.com, www.danawa.com]
    keywords: [다나와, danawa]
---

# Danawa

## URLs
- Search: `https://search.danawa.com/dsearch.php?query=<검색어>`. The result page has tabs 통합검색 / 가격비교 (N) / 검색상품 …; the number beside 가격비교 is how many price-compared products match.
- Category list: `https://prod.danawa.com/list/?cate=<category id>` (for example 모니터 > 27~29인치 is `cate=11319543`). Category links on a list page are in queryLinks (`cate` changes).
- Product: `https://prod.danawa.com/info/?pcode=<product code>` — a row's link; the code is also the row's `@data-product-code` field.

## Sort
- The sort is a control in the page, not the address: measured 2026-09-28, `sort=priceASC` added to a category list address was ignored (the list stayed 인기상품순).
  - Category list: tabs 인기상품순 / 낮은가격순 / 높은가격순 / 신상품순 / 상품평 많은순 (structure.choices, selected marks the current one). Clicking 낮은가격순 on 27~29인치 gave 89,000원 first (인기상품순 started at 138,030원).
  - Search: links 낮은가격순 / 높은가격순 / 신상품순 / 상품평 많은순 (choices, marked = current). After clicking, the address carries `sort=priceASC`. In 통합검색 the lowest prices are 쇼핑몰 items such as monthly rental fees (월 14,500) and accessories; price-compared products are the category list or the 가격비교 tab.
- A list page shows 30–40 rows; the order of the whole result is the site's own sort, not an order of the rows loaded.

## Landmarks
- A row carries the product name, the spec line, the lowest price ("138,030 | 원", with 몰 count "53몰"), the 혜택 최저가 when shown, and the review count. Ad rows (광고) link through `prod.danawa.com/bridge/…`.
