# 홈페이지 검색 기본 — 근거 있는 것만

홈페이지가 있는 가게에만 한다. 고칠 파일은 사람의 홈페이지 파일이므로 **원본을 복사해 두고** 그 한 곳만 정확히 고친다. 홈페이지를 만든 업체·서비스(웹 빌더)가 따로 있으면 그 관리 화면의 칸으로 고치고, 직접 파일을 만지지 않는다.

## 1. 수집을 막지 않았나 (robots.txt)

- `https://가게주소/robots.txt` 에서 아래 수집기가 `Disallow: /` 로 막혔는지 본다. 막을 까닭이 없는데 막혔으면 푼다.
  - 일반 검색: `Googlebot`, `Bingbot`, `Yeti`(네이버)
  - AI 대화 서비스의 **검색용** 수집기: `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`
  - 학습용 수집기(`GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot`)는 검색 노출과 별개다. 막을지 말지는 사장님이 고른다 — 막아도 검색 노출은 줄지 않는다고 운영사들이 안내한다.
- 페이지의 `<meta name="robots" content="noindex">` 나 응답 머리 `X-Robots-Tag: noindex` 는 그 페이지를 검색에서 뺀다. 가게 첫 화면에 있으면 지운다.

## 2. 사이트맵

- `robots.txt` 에 `Sitemap: https://가게주소/sitemap.xml` 줄이 있고, 그 주소가 열리는지.
- 없으면 홈페이지 서비스의 사이트맵 기능을 켜거나, 페이지가 몇 장 안 되면 손으로 만든다(주소 목록만).

## 3. 제목·설명·대표 주소

- `<title>`: 「가게 이름 — 동네·업종」처럼 사람이 찾는 말로. 페이지마다 다르게.
- `<meta name="description">`: 한두 문장으로 무엇을 하는 곳인지. 키워드 나열이 아니다.
- `<link rel="canonical">`: 같은 내용이 여러 주소로 열리면 대표 주소 하나.
- `<html lang="ko">`.
- 영업시간·주소·전화·메뉴·가격은 **그림이 아니라 글자로** 보이게(그림 속 글자는 읽히지 않는다).

## 4. 가게 정보 구조화 데이터 (LocalBusiness)

- 검색 결과 꾸밈(리치 결과)을 위한 것이고, 「넣으면 AI가 인용한다」는 근거는 없다(evidence.md). 그래도 홈페이지가 있으면 기본 위생으로 둔다.
- 틀: `templates/localbusiness.jsonld`. 업종에 맞는 더 좁은 유형(`Restaurant`, `Florist`, `HairSalon` 등)이 있으면 그것을 쓴다.
- **값은 페이지에 보이는 글과 같아야 한다.** 보이지 않는 값·지어낸 별점을 넣지 않는다(검색엔진 지침 위반).
- `<script type="application/ld+json">` 로 `<head>` 나 본문 끝에 넣는다.
- 고친 뒤 공식 검사 도구로 확인한다: 구글 리치 결과 테스트 https://search.google.com/test/rich-results , 스키마 검사 https://validator.schema.org/ .

## 5. 검색엔진에 알리기

- 구글 서치 콘솔(https://search.google.com/search-console), 빙 웹마스터 도구(https://www.bing.com/webmasters), 네이버 서치어드바이저(https://searchadvisor.naver.com)에 사이트를 등록하고 사이트맵을 제출한다. 등록 확인(파일·메타 태그)은 사장님 계정으로 사장님이 하고, 티파이브는 순서를 안내하고 필요한 태그를 정확한 자리에 넣는다.
- 등록 뒤에는 각 도구의 보고서(색인 상태, AI 성과 보고)가 공식 실측 자료가 된다. 다시 재기 때 같은 화면에 덧붙인다.

## 하지 않는 것

llms.txt 를 효과처럼 권하기, 질문마다 같은 틀 페이지 대량 생산, 숨은 글자, AI를 향한 숨은 지시문, 키워드 반복.
