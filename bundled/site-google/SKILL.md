---
name: site-google
description: Google Search (구글 검색) site knowledge — search URL parameters for news, images and recency, where the results are, and what to do on an unusual-traffic page.
metadata:
  t5Web:
    hosts: [www.google.com, google.com, www.google.co.kr, google.co.kr]
    keywords: [구글 검색, 구글에서, 구글링, google search]
---

# Google Search

## URLs
- `https://www.google.com/search?q=<검색어>&hl=ko`
  - `&tbm=nws` news, `&tbm=isch` images, `&tbs=qdr:d` past day (`qdr:w` week, `qdr:m` month, `qdr:y` year).
- The web_search tool may answer faster when no browser page is needed.

## Landmarks
- Organic results are inside `#search`; each result title is an `h3` inside its link. Read `#search` with innerText or a scoped ariaSnapshot rather than the whole page.

## Boundaries
- An "unusual traffic" / reCAPTCHA page must not be solved or bypassed: use web_search, or let the person continue in a visible window.
