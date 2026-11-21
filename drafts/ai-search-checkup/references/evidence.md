# 근거 표 — 무엇이 통하고 무엇이 근거 없나

조사일 2026-11-21. 「공식」은 그 회사 문서, 「실험」은 논문·대조 실험, 「업계」는 측정 회사 자료(이해관계 있음). 바뀔 수 있으니 사람에게 말할 때 날짜를 함께 말한다.

## 근거 있는 것

| 내용 | 등급 | 출처(날짜) |
|---|---|---|
| 검색 결과의 AI 기능에 나오는 조건은 일반 검색과 같다 — 색인되고 스니펫 자격이 있으면 됨, 추가 요건 없음 | 공식 | https://developers.google.com/search/docs/appearance/ai-features |
| AI 검색을 위해 llms.txt·AI 전용 파일·특수 스키마·글 쪼개기·AI용 다시 쓰기는 필요 없고, 이상적인 글 길이도 없다. 직접 겪은 내용, 수집 허용, 의미 있는 HTML, 지역 가게는 비즈니스 프로필 | 공식 | https://developers.google.com/search/docs/fundamentals/ai-optimization-guide (2026-05-15) |
| 구조화 데이터는 AI 검색에 필수가 아니고 검색 결과 꾸밈(리치 결과)용이며, 보이는 글과 같아야 한다 | 공식 | 위 문서 |
| 가게 정보 구조화 데이터(LocalBusiness) — 필수 name·address, 권장 영업시간·전화·주소 좌표·url·가격대·메뉴 | 공식 | https://developers.google.com/search/docs/appearance/structured-data/local-business |
| 자주 묻는 질문(FAQ) 리치 결과는 정부·건강 사이트만, 방법(HowTo) 리치 결과는 없어짐 | 공식 | https://developers.google.com/search/blog/2023/08/howto-faq-changes (2023-08-08) |
| 빙 지침: 사실을 직접 쓰고, 이름을 일관되게, 한 주소 한 주제, 핵심은 위에, 노출 보장 없음, AI 조작·숨은 지시 금지 | 공식(보도) | https://www.searchenginejournal.com/bing-adds-geo-to-official-guidelines-expands-ai-abuse-definitions/ (2026-02) |
| 빙 웹마스터 도구의 AI 성과 보고 — AI 답에 인용된 내 주소를 무료로 볼 수 있음 | 공식 | https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview |
| 구글 서치 콘솔 생성형 AI 성과 보고서 — AI 요약·AI 모드 노출 수 | 공식 | https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports (2026-06-03) |
| AI 대화 서비스의 검색 노출은 그 회사의 **검색용** 수집기를 허용해야 하며(학습용 수집기와 별개), 노출 보장은 없다 | 공식 | https://developers.openai.com/api/docs/bots |
| 인용문·통계·출처를 넣은 글이 *이미 검색된 글 사이에서* 더 인용됨(약 +28~41%), 키워드 채우기는 −9% | 실험 | https://arxiv.org/abs/2311.09735 — 이미 검색된 상위 글만 놓고 잰 것이라 「검색에 걸리게 해 준다」는 뜻이 아님 |
| 대화형 검색 최적화 기법 대부분은 효과 없거나 해롭고, 여럿이 쓰면 효과가 상쇄됨 | 실험 | https://arxiv.org/abs/2506.11097 (2025-06) |
| 같은 추천 목록이 다시 나올 확률은 매우 낮고 순위는 거의 잡음 — 「나온 비율」만 쓸 만함 | 업계 | https://www.searchenginejournal.com/ai-recommendations-change-with-nearly-every-query-sparktoro/ (2026-01~02) |
| 하루 1회와 10회 측정의 평균이 거의 같았고, 횟수보다 질문 묶음 구성이 중요 | 업계 | 측정 회사 자체 연구(2026-07-08, 미국 기준) |

## 근거 없거나 약한 것 — 권하지 않는다

| 주장 | 판정 | 까닭 |
|---|---|---|
| llms.txt 가 AI 노출을 올린다 | 근거 없음 | 구글 「쓰지 않음」. 약 30만 도메인에서 인용과 상관 없음(https://seranking.com/blog/llms-txt/, 2026-10) |
| 스키마만 넣으면 AI가 인용한다 | 근거 없음 | 새로 넣은 1,885쪽 대조에서 차이가 우연과 구별 안 됨(https://ahrefs.com/blog/schema-ai-citations/, 2026-05-11) |
| 정해진 글 길이·몇천 자 긴 글 | 근거 약함 | 길이와 인용 상관 거의 0. 구글 「이상적 길이 없음」 |
| 키워드 반복 | 해로움 | 위 실험 −9%, 네이버도 스팸으로 봄 |
| 「AI 답 상위 노출 보장」 대행 | 거짓 약속 | 운영사들 「보장 없음」, 구글 「돈으로 지역 순위 못 삼」 |
| 저장·길찾기·전화 수가 플레이스 순위 요소 | 업계 상관일 뿐 | 네이버가 밝힌 요소에 없음 |

## 한국 가게 기준

- 검색 방문 비율(2026 상반기 보도): 네이버가 가장 크고 구글이 다음. 사장님에게는 네이버 → 구글 → AI 대화 서비스 순으로 보는 것이 숫자에 맞다.
- 네이버 플레이스 검색 순위 요소로 알려진 넷: 검색어와 업체 정보의 유사도, 인기도, 거리, **업체 정보 충실성**(네이버 도움말을 인용한 글로 확인, 도움말 원문은 확인 못 함).
- 네이버의 AI 요약·장소 추천은 플레이스 정보·방문자 리뷰·블로그 후기·예약을 근거로 쓴다(네이버 보도자료 2025-03·2025-08, 언론 2026-09).
- **네이버 블로그 → 바깥 AI 검색: 막혀 있다.** `https://blog.naver.com/robots.txt` 가 바깥 AI 검색·학습 수집기(GPTBot, OAI-SearchBot, PerplexityBot, Google-Extended, ClaudeBot, Claude-SearchBot 등)를 모두 `Disallow: /` 로 막고, 머리에 AI 학습·검색 보강 목적 접근 금지를 적어 두었다(2026-11-21 직접 다시 읽음). 구글 일반 검색 수집기는 따로 막지 않는다.
- 카카오맵·카카오톡 예약은 카카오 안 AI 기능과 이어진다(카카오 발표 2025-07).

## 확인 못 한 것

AI 대화 서비스들이 한국 지역 질문에 쓰는 장소 자료 출처, 네이버 서치어드바이저의 구조화 데이터 지원 목록, 네이버 블로그가 구글 AI 요약에 실제로 인용되는지(robots.txt 로는 가능하지만 실측 안 함).
