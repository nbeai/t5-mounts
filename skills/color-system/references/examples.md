# 색 쓰기 예시 (4판) — 출발점이며, 이유가 있으면 바꾼다

## 1. 웹·카드·HTML — tokens.css

```html
<html lang="ko" data-palette="warm"><!-- trust formal warm learn active data night -->
<link rel="stylesheet" href="tokens.css">
<style>
  .card { background: var(--t5-surface); border: 1px solid var(--t5-line); }
  .card small { color: var(--t5-muted); }
  .btn { background: var(--t5-accent); color: var(--t5-on-accent); } /* 한 화면에 하나 */
  .chart .axis { stroke: var(--t5-line-strong); }  .chart .grid { stroke: var(--t5-line); }
  .up { color: var(--t5-up); } .up::before { content: "▲ "; }
</style>
```
어두운 화면 고정은 `data-theme="dark"`, 브랜드 색은 `--t5-accent` 등을 덮어쓴다. `light-dark()`는 2024년 이후 크롬·사파리·파이어폭스가 지원한다.

## 2. 도표 — Mermaid (차분한 신뢰, 밝음)

```
%%{init: {"theme": "base", "themeVariables": {
  "background": "#FCF9F7", "fontFamily": "Pretendard, Malgun Gothic, sans-serif",
  "primaryColor": "#F8F4F1", "secondaryColor": "#EEE8E4", "tertiaryColor": "#FCF9F7",
  "primaryBorderColor": "#CDC6C0", "lineColor": "#746D68",
  "primaryTextColor": "#312D29", "textColor": "#312D29"}}}%%
flowchart LR
  A[문의 접수] --> B[상담 예약] --> C[방문 상담] --> D[계약]
  classDef key fill:#435772,color:#FFFFFF,stroke:#435772
  class C key
```
마디 면 50·100, 마디 테두리 꾸밈선 200, 화살표 기능선 600, 핵심 마디 하나만 강조. 어두운 화면은 같은 이름에 `#1B1715`(바탕)·`#312D29`(마디)·`#A49D97`(화살표)·`#92BEE2`(핵심)를 넣는다.

## 3. 일러스트 — 이미지 생성 지시문

색 이름에 hex를 붙이고, 주조 하나 + 보조 둘로 줄인다. 바탕은 결과물 바탕 단계에 맞춘다.

1. **차분한 신뢰(상담·안내):** 「평면 일러스트, 톤 다운. 바탕은 아주 옅은 웜 그레이(#FCF9F7), 주조색은 차분한 남색(#435772), 보조는 옅은 하늘(#D6E1EE)과 따뜻한 회색(#BAB2AD). 그 밖의 색은 쓰지 않음, 그라데이션·광택 없음.」
2. **따뜻함·친근(동네 가게 소식):** 「손그림 느낌의 평면 그림. 바탕은 옅은 장밋빛(#FFF8F7), 주조색은 말린 장미 갈색(#6B4849), 보조는 연분홍(#F3D8D7)과 옅은 호박(#EBDDCA). 채도 낮게.」
3. **활기·행동(행사 알림):** 「굵은 선의 평면 그림. 바탕은 아주 옅은 웜 그레이(#FCF9F7), 주조색은 짙은 베리(#910039), 보조는 호박색(#FEAA3A)을 작은 면적에만, 나머지는 회색(#A49D97).」

음식·사람이 나오는 사진풍 그림은 색 지정을 빼고 자연광으로만 말한다(색을 바꾸면 어색해진다).

## 4. 영상 위 글자(릴스 자막·카드)

자막 띠: 바탕 `#1B1715`을 불투명도 0.8로, 글자 `#FCF9F7`. 강조어 하나만 `#FEAA3A`. 밝고 복잡한 장면은 띠, 단순한 장면은 아래 그라데이션 덮개.
