# 판 이력 — 한국 업무 서식 (korean-business-forms)

## 0.1.0

2026-10-26 · 첫 판 · 티파이브 제작 · 검수 중(진열 안 함)

- 견적서·거래명세서·청구서: 사실표(JSON)를 받아 공급가액·세액·합계·「일금 ○○원정」 한글 금액을 계산하고, 티파이브 문서 도구(`create-docx`·`create-xlsx`)가 읽는 명세를 만드는 `scripts/forms.mjs`. 모르는 칸은 「(미정)」으로 두고 목록에 올려요.
- 공문: 기안문 프리셋(`create-hwpx --preset 기안문`)에 넣을 마크다운 틀 `templates/gongmun-gian.md` 와 표기 근거 `references/notation.md`.
- 칸마다 법정 근거와 관행을 가른 `references/form-facts.md`. 세금계산서 발급은 넣지 않았어요(홈택스 길).
- 되돌리기: 설정 › 장착 목록에서 이 항목을 빼면 돼요.
