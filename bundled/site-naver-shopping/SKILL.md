---
name: site-naver-shopping
description: Naver Shopping (네이버쇼핑, 가격비교) site knowledge — the search URL with its own sort values (리뷰 많은순, 낮은 가격순 …), reading the result list, and what to do on an access-limit page.
metadata:
  t5Web:
    hosts: [search.shopping.naver.com, shopping.naver.com]
    keywords: [네이버쇼핑, 네이버 쇼핑, 네이버 가격비교, 네이버플러스 스토어, 스마트스토어, naver shopping]
---

# Naver Shopping

## URLs

### Naver+ Store listing (observed 2026-10-10)
- Current listing: `https://search.shopping.naver.com/ns/search?query=<URL-encoded search terms>`.
- The rendered listing used `sort=REVIEW` for **리뷰 많은순** and `priceRange=<lower>|<upper>` for a price interval (encode the pipe as `%7C`). These are the site's observed query parameters, not a separate API.
- Open the listing URL directly when those parameters express the request, then confirm the returned page, selected filters and actual order. A promotional popup on the homepage need not become a step in a search whose listing address is already known.
- Dated observations of who could open this listing (sites change; the page in front of you is the current fact):
  - 2026-10-10 and 2026-10-15: the person's everyday Chrome, driven on screen, showed the listing.
  - 2026-10-15 (night): the person's everyday Chrome reached through its approved remote debugging connection (browser_run_code in a background tab) got the 리뷰 많은순 listing with status 200, review counts on the cards, no access-limit page.
  - 2026-10-15: T5's Chrome got a page saying 「쇼핑 서비스 접속이 일시적으로 제한되었습니다」 for the listing instead of results (two runs).
- An access-limit page is not a result; it says nothing about the products.
- The site's price-filter label is not proof that every result meets the person's price condition. Rows may show an ordinary sale price and a lower coupon/member price, and the filter can include a row whose ordinary price exceeds the interval. Compare the actual row with the requested condition, exclude nonmatching rows, and use the next already observed candidates to reach the requested count.

### Finished products and the order of 리뷰 많은순 (observed 2026-10-16, the person's everyday Chrome)
- For 「전기자전거」, the keyword-only 리뷰 많은순 listing was led by accessory, parts and rental sellers (3M, 크랭크스포츠, 우도전동차렌트 …); the finished bikes with the most reviews were further down and one of the top five (에코라이즈 타이탄700, 819 reviews) was not among the first 100 cards.
- The listing's own category facet for that product type (here `categoryId=4|50002826`, 전기자전거) held the finished bikes; its cards showed the same review counts as each product's own page.
- 리뷰 많은순 is not a descending order of the review counts shown (the first card there showed 리뷰 85 while bikes with 1,393 and 819 were further down). When the person asks for the items with the most reviews, collect the cards in the scope that matches their words (scroll: the list is virtual) and order them by the count shown yourself; say which listing and how many cards you compared.

### Other surfaces and their scope
- The older price-comparison surface uses `https://search.shopping.naver.com/search/all?query=<search terms>&sort=<value>&pagingSize=40`, with lowercase `rel`, `price_asc`, `price_dsc`, `date`, `review`. Its parameters and scope differ from `/ns/search`; do not mix the two sort vocabularies.
- `https://shopping.naver.com/logistics/search?q=<search terms>` is an **N배송 subset**. Results there can answer an N배송-scoped request, but they do not establish the highest-review products across all SmartStore listings.
- The 통합검색 (`search.naver.com`) shopping block is also a sample. Use the requested surface's actual sorting and state the observed scope.
- These are dated observations. If the current page differs or requires a security check, preserve that fact; do not claim that another surface or session proves the requested page was read.

## Landmarks
- Result cards carry the product name link, the lowest price ("최저" price), the review count ("리뷰 1,234") and the mall count. Class names are generated (`product_item__…`); select with `[class*="product_item"]` or read the list region with a scoped ariaSnapshot. Ads are marked "광고".
- A card may contain both an item link and a seller link. Keep the exact observed item address for the deliverable; a seller homepage alone does not identify the item. Do not invent a product ID from its name.
- 목록 한 행에 요청한 상품명·평점·리뷰 수·가격·상품 주소가 함께 보이면 그 관측을 사용한다. 같은 사실을 반복 확인하려고 상품마다 들어갔다 나오지 않는다. 빠진 사실이 있을 때만 해당 상품을 연다.

## Boundaries
- 「접속이 일시적으로 제한」은 그 경로의 거절 사실이다. 위 대체 목록을 기존 백그라운드 탭에서 한 번 읽는다. 반복 접속·브라우저 위장·사람의 작업창 위에 새 창 띄우기는 하지 않는다. 두 목록 모두 거절되면 실제로 확인한 항목만 내고 남은 부분을 정확히 밝힌다.
