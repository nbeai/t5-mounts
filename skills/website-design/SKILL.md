---
name: website-design
description: 새 웹페이지·홈페이지·랜딩 페이지·예약·소개 페이지를 처음부터 만들 때 여는 티파이브 입구. 같은 묶음의 원형 디자인 방법 hallmark(Nutlope, MIT)를 이 컴퓨터에서 쓰는 사실을 준다. New website, homepage or landing page from scratch.
when_to_use: "new website·홈페이지·랜딩·예약 페이지 from scratch; not editing an existing design"
---

# 새 웹페이지 만들기 — 티파이브 입구

방법 원문은 같은 묶음의 `hallmark` 스킬이다. 이 장을 읽은 뒤 `hallmark`를 열고 그 Floor·Flow·Sweep을 따른다.
원문은 다른 비서 호스트용으로 쓰였다. 아래 사실이 원문과 다르면 아래가 먼저다(원문 `references/flow.md` § Harnesses 표에서 하위 검토자·질문 도구가 없는 호스트의 열과 같은 처지).

쓰지 않는 일: 이미 있는 페이지·디자인 고치기(사람이 Hallmark를 이름으로 부르지 않았으면 원문 규칙대로 그 프로젝트 방식으로 고친다), 판매 상세 페이지(`detail-page`), 웹 발표(`html-slides`), 대시보드(`dashboard`), 문서·보고서.

## 묻기 대신 읽기 (원문 1. Ask once)
- 재료·대상·할 행동·말투는 부탁, 대화, 첨부, 작업 폴더에서 먼저 읽는다. 원문의 「go ahead」 길로 간다: 추정해서 만들고, 고른 것을 답 머리 한 줄에 적는다. 질문을 보내고 기다리지 않는다.
- 사실(숫자·후기·로고·주소·가격)은 받은 것만 쓴다. 없는 사실은 지어내지 않고 빈자리로 두고, 끝의 자료 요청에 적는다.

## 차례 (명령은 이 순서로)
1. **결과 폴더부터 만든다.** `mkdir -p "<결과 폴더>" && cd "<결과 폴더>"` 뒤에 Hallmark 명령(`theme.mjs deal`·`scaffold`·`photos --save`)을 돌린다. 원문 기록 `.hallmark/`는 명령을 돌린 폴더에 생기므로, 다른 폴더에서 돌리면 사용자 폴더에 숨은 폴더가 남는다.
2. 원문 Flow 대로 만든다(아래 한글·브라우저 검사 사실 포함). **결과는 폴더째가 기본이다:** `index.html` 이 같은 폴더의 `tokens.css`·`base.css`·`fonts/`·`images/` 를 상대 경로로 읽는다. 글꼴·사진을 base64 로 통째로 넣은 한 파일 HTML 은 사람이 「한 파일로 보내 줘」처럼 원할 때만 만든다(한 파일이 1MB 를 넘기 쉽다).
3. **넘기기 전 검사(원문 Floor 16):** 결과 폴더에서 `node <hallmark>/scripts/sloplint.mjs index.html` 을 돌려 FAIL 을 고친다. 렌더 검사 조건은 아래 「브라우저 검사」.
4. **마지막 명령은 정리:** 결과 폴더에서 `rm -rf .hallmark`. 다른 폴더에서 명령을 돌렸다면 그 폴더의 `.hallmark` 도 지운다. 다시 고칠 때 필요한 사실(테마·모양·고른 것)은 CSS 첫 줄 표식과 이 대화의 답에 남는다.
- 사람에게 보이는 답은 한국어로 쓴다. 원문의 Picks 블록도 한국어 말로 옮겨 쓴다. 결과 폴더와 첫 파일 경로를 적는다. 렌더 검사를 못 했으면(돌렸는데 실패한 것도 못 한 것이다) 완료 점검에 review_limit 로 적는다 — 답에 기계 사정 문장을 따로 넣지 않는다.

## 한글
- 48개 테마의 글꼴은 모두 라틴 글꼴이라 한글 글자가 없다. 한국어가 있는 페이지는 `tokens.css`의 글꼴 토큰마다 테마 글꼴 바로 뒤에 한글 글꼴을 잇는다.
  - 고딕: `"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR"`
  - 명조: `"Noto Serif KR", "AppleMyungjo", "Nanum Myeongjo"`
- Pretendard 부분 글꼴(OFL-1.1, 보통·굵게)은 `${CLAUDE_PLUGIN_ROOT}/../dashboard/assets/pretendard/`에 있다. 결과 폴더 `fonts/`로 `LICENSE.txt`와 함께 복사하고 `tokens.css` 위쪽 `@font-face`(`font-display: swap`)로 읽는다 — 인터넷 없이·휴대폰에서도 같은 글꼴로 열린다.
- `<html lang="ko">`를 쓰고, 본문과 제목에 `word-break: keep-all`을 둔다(제목의 `overflow-wrap: break-word`는 원문 Floor 5 그대로). 테마의 첫 글꼴은 바꾸지 않는다.

## 이 컴퓨터에서 쓰지 않는 원문 길
- `scripts/imagegen.mjs`와 comp 단계(signal 9)는 유료 Together AI 호출이라 돈이 나가는 일이다. 티파이브 명령 환경에는 그 열쇠가 없어 꺼진 길이다 — 부르지 않는다. 그림이 없으면 원문대로 라이브러리 사진이나 빈자리로 둔다.
- 원문의 설치기·편집 훅(`install.mjs`·`install-hook.mjs`·`lint-hook.mjs`)은 싣지 않았다 — 원문이 그것을 말해도 건너뛴다. `refcheck.mjs`(원형 개발용)도 쓰지 않는다. `npm i -g` 같은 전역 설치나 다른 비서 설정 폴더 쓰기를 하지 않는다.
- `scripts/photos.json`(약 450KB)은 통째로 읽지 않는다. `theme.mjs photos "<주제>" --theme <slug>`로 찾고, 쓰는 사진만 `--save`로 받는다(무료 위키미디어 공용, 출처 줄은 원문대로 바닥글에).
- 새 맥락 검토자(원문 `gates.md` § 6)를 따로 띄울 수 없으면 같은 흐름에서 검토하고 그렇게 했다고 적는다(원문 Harnesses 표의 같은 처지 열).

## 브라우저 검사
- 원문 렌더 검사(`sloplint.mjs --render`·`capture.mjs`·`picture.mjs`)는 `puppeteer-core` 와 크롬이 있어야 돈다. 이 컴퓨터에서는 둘 다 티파이브가 붙여 둔 것일 때만 쓴다: 영상 도구 `hyperframes` 안의 `puppeteer-core`, 관리 헤드리스 크롬 `chrome-headless-shell`. 이 검사만을 위해 무엇을 붙이거나 설치하지 않는다.
- `CHROME_PATH` 에 사람이 쓰는 크롬 앱 경로(`/Applications/…`, `$T5_MANAGED_CHROME`)를 넣지 않는다. 사람의 크롬은 티파이브의 평소 브라우저 손을 거쳐서만 쓴다.
- 둘 다 있는지 보고 있을 때만 렌더 검사를 돌린다:

```sh
HF_PKG=$(ls -d "$(dirname "$(command -v hyperframes)")"/../versions/hyperframes/*/pkg 2>/dev/null | tail -1)
SHELL_CHROME=$(command -v chrome-headless-shell)
if [ -n "$HF_PKG" ] && [ -n "$SHELL_CHROME" ]; then HALLMARK_PUPPETEER="$HF_PKG" CHROME_PATH="$SHELL_CHROME" node <hallmark>/scripts/sloplint.mjs index.html --render
else node <hallmark>/scripts/sloplint.mjs index.html; fi
```

- 렌더 검사를 못 했으면(위 `else`) 정적 검사 결과로 고친다. 휴대폰 폭은 티파이브 화면 확인(결과 열기)으로 본다.
