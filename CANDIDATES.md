# 둘째 항목 후보 (조사만 — 아직 넣지 않음)

조사일 2026-10-26. 아무것도 내려받지 않았고, 공개 페이지를 읽기만 했습니다. 「확인」은 그 원 저장소 페이지를 직접 열어 본 것, 「목록 표기만」은 MCP 목록 사이트·설명서 사이트의 표기만 본 것입니다. 넣기 전에는 [CHECKLIST.md](CHECKLIST.md) 1~8을 모두 다시 봅니다.

## A. 티파이브에 이미 들어 있는 것

본선 기준 판: `t5-work-app` 커밋 `c53ec733`. 지시서가 말한 `refoundation/assurance/cli-catalog.json` 은 없고, 같은 목록이 `refoundation/config/cli-catalog.json` 에 있습니다(9개). 이것들은 티파이브가 이미 공식 배포처·고정 판·지문으로 받아 쓰므로 **이 저장소에 다시 넣을 필요는 없습니다.** 다만 진열대가 한곳에서 보이게 하려면 「검수 증명서만 있는 항목」(원형 링크·티파이브 고정 판·라이선스)으로 옮겨 적을 수 있습니다 — 오너·상담 판단.

| 이름 | 하는 일 | 원형 | 티파이브 고정 판 | 라이선스 |
|---|---|---|---|---|
| korean-law-mcp | 법제처 국가법령정보로 법령·판례·행정규칙 조회(연결) | github.com/chrisryugj/korean-law-mcp | 4.15.9 | MIT |
| remindctl | 맥 미리 알림 만들기·확인(맥 14 이상) | github.com/steipete/remindctl | 0.3.8 | MIT |
| hyperframes | HTML 장면을 MP4 영상으로 | github.com/heygen-com/hyperframes | 0.8.180 | Apache-2.0 |
| ffmpeg·ffprobe | 영상·음성 자르기·잇기, 길이·트랙 읽기 | github.com/eugeneware/ffmpeg-static | 6.1.1 | GPL-3.0-or-later |
| yt-dlp | 공개 영상 자막 확인·읽기 | github.com/yt-dlp/yt-dlp | 2026.08.19 | Unlicense |
| jq | JSON 자료 찾기·바꾸기 | github.com/jqlang/jq | 1.8.2 | MIT |
| chrome-headless-shell | 화면 없이 웹 장면 찍기 | Chrome for Testing | 152.0.7977.30 | BSD-3-Clause |
| blender | 3D 렌더(큰 앱, 약 330MB) | blender.org | 5.2.2 | GPL-3.0-or-later |

기본 연결(`refoundation/config/default-mcp-connections.js`): Context7 최신 개발 문서(원격). 서비스 연결 목록(`korea-business-connection-catalog.json`)의 노션·Apify·텔레그램 등은 티파이브 본체 연결이라 이 저장소 대상이 아닙니다.

## B. 한국 사장님이 바로 쓸 만한 공개 MCP (다섯 이내)

모두 남이 만든 것이므로 넣는다면 **원형 링크·고정 판 + 얇은 연결 설정·검수 기록만** 둡니다(원본 복사 0).

| 후보 | 사장님이 쓰는 곳 | 라이선스 | 권한·필요한 것 | 고정 판 | 확인 정도 |
|---|---|---|---|---|---|
| [data-go-mcp-servers](https://github.com/Koomook/data-go-mcp-servers) | 거래처 사업자 상태(계속·휴업·폐업) 조회, 나라장터 입찰·낙찰, 기업 재무정보, 국민연금 사업장 | Apache-2.0(원 저장소 LICENSE) | 인터넷(공공데이터포털 API), 공공데이터포털 키(사용자 발급), 이 컴퓨터에서 Python 실행(`uvx`). 외부 전송은 조회어만, 돈 없음 | 릴리스·태그 없음 → 커밋 해시로 고정해야 함 | 확인 |
| [mcp-server-naver-search](https://github.com/uju777/mcp-server-naver-search) | 네이버 쇼핑 최저가, 카페 후기, 뉴스·블로그 검색 | MIT(원 저장소 LICENSE) | 인터넷(네이버 검색 API), 네이버 개발자센터 Client ID·Secret(무료, 하루 25,000건), Python 3.10+·`uv run server.py`. 돈 없음 | 커밋 5개, 태그 없음 → 커밋 고정. 작은 개인 저장소라 관리 지속성 확인 필요 | 확인 |
| [kma-mcp](https://kma-mcp.readthedocs.io/) | 기상청 날씨·예보(야외 영업·배달·행사) | MIT(설명서 사이트 표기) | 인터넷(기상청 API 허브), 기상청 키 | 확인 안 함 | 목록 표기만 — 원 저장소 미확인 |
| [Open Data MCP](https://glama.ai/mcp/servers/@ceami/opendata-mcp/blob/5be040fd5a63996ada234b0dfce4c5404a8d7c33/README.md) | 공공데이터포털 API 를 찾아 바로 부르기(범용) | 확인 안 함(루트 LICENSE 를 따른다는 표기만) | 인터넷, 공공데이터포털 키 | 목록 사이트에 커밋 5be040fd 표기 | 목록 표기만 |

넣는다면 첫째 추천은 **data-go-mcp-servers 의 사업자 상태 조회** 하나입니다(사장님이 거래처 확인에 바로 쓰고, 라이선스가 원 저장소에서 확인되고, 돈이 나가지 않습니다). 넣기 전에 할 일: 고정 커밋 정하기, 티파이브 「연결 추가」로 붙여 「사용 중」 확인(맥·Windows), 키 입력 칸 동작, 조회 결과가 외부로 나가는 범위 확인.

조사 출처(검색 결과 목록 사이트): [typingmind 목록](https://www.typingmind.com/mcp/koomook-data-go-mcp-servers), [glama.ai](https://glama.ai/mcp/servers/b6c13uawxe), [enterprisedna 목록](https://enterprisedna.co/directories/mcp/leadbrain-korean-data-mcp), [kma-mcp 설명서](https://kma-mcp.readthedocs.io/en/latest/getting-started/).
