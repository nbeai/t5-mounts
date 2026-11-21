---
name: site-naver-news
description: Naver News (네이버 뉴스) site knowledge — section and ranking URLs, news search sort parameter, where the headline list and the article body are, and how to read a list plus several articles in one call.
metadata:
  t5Web:
    hosts: [news.naver.com, n.news.naver.com, m.news.naver.com]
    keywords: [네이버 뉴스, 네이버뉴스, naver news]
---

# Naver News

Public URL rules and page landmarks. Class names change; if one is missing, read the region with a scoped `ariaSnapshot({ mode: "ai" })` instead of guessing.

## URLs
- Section front pages: `https://news.naver.com/section/<id>` — 100 정치, 101 경제, 102 사회, 103 생활/문화, 104 세계, 105 IT/과학. The section's 헤드라인 cluster is at the top of the page ("주요 기사").
- Most viewed: `https://news.naver.com/main/ranking/popularDay.naver`
- News search: `https://search.naver.com/search.naver?where=news&query=<검색어>&sort=<0|1|2>` — 0 관련도순, 1 최신순, 2 오래된순.
- Article: `https://n.news.naver.com/mnews/article/<oid>/<aid>`.

## Landmarks
- Section list items: links `a.sa_text_title` (headline in `.sa_text_strong`), press name `.sa_text_press`.
- Article: title `#title_area`, body `#dic_area` (older layout `#newsct_article`), time `.media_end_head_info_datestamp_time` (`data-date-time` attribute).

## Fast path
With browser_run_code, one call can open the section page, take the first N headline links, open them with `page.context().newPage()` in parallel, read `#dic_area` innerText (trim each to what the summary needs), close those pages and return `[{title, press, url, time, body}]`. Summaries should come from article bodies, not headlines alone, when the person asks for a summary.
