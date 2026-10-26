# 양식 채우기 도구 — 되는 것과 안 되는 것

2026-10-26 티파이브 본선 `d622dcd4` 의 `"$T5_DOCUMENT_CLI"`(엔진 kordoc 4.16.3)로 **직접 만든 시험용 가짜 HWPX 양식**에 돌려 확인한 사실이다. 실제 공고 양식 파일로는 돌려 보지 않았다(내려받기 0) — 실제 양식에서 다르게 나오면 도구 결과가 이긴다. 자세한 사용법은 `document-data` 방법.

| 일 | 명령 | 확인한 사실 |
|---|---|---|
| 양식 읽기 | `read-hwp 양식.hwpx` | `markdown`(제목 `#`·표 `|`)과 `formLabels` 를 준다. 두 칸짜리 이름표 표(과제명 \| 빈칸)는 표가 아니라 이름표 줄로만 읽혔고 `formLabels` 에도 없었다 — 그래도 아래 `fill-hwp` 는 그 이름표로 채웠다 |
| 이름표 빈칸 채우기 | `fill-hwp 양식.hwpx --values '{"과제명":"…"}' --output 결과.hwpx` | 과제명·대표자·기업명 세 칸이 채워지고 `formattingPreserved: true`. 남은 빈칸은 `stillEmpty` 에 나옴(표 안 「대표」 칸) |
| 안내 문구를 본문으로 | `edit-hwp 결과.hwpx --replacements '[{"find":"정확한 원래 줄","replace":"본문"}]'` | 바뀜, 서식 유지. `find` 는 `read-hwp` 글과 한 번만 맞아야 함 |
| 안내 문구만 지우기 | 같은 명령에 `"replace":""` | **거절**: 「블록 삭제는 미지원」, 아무것도 쓰지 않음 |
| 여러 줄 넣기 | `"replace":"첫 줄\n둘째 줄"` | 한 문단 안에 들어감. 다시 읽으면 공백으로 이어져 보임 — 줄바꿈으로 남는지는 확인 안 됨 |
| 문단·표 줄 늘리기 | — | `edit-hwp` 에 그런 동작이 없음. 양식이 가진 문단·줄 안에서만 채운다 |
| HWP(옛 형식) 양식 | `fill-hwp` | 같은 내용의 새 HWPX 로 나온다(`formattingPreserved: false`, `document-data` 방법에 적힌 사실). 이 확인에서는 HWP 견본이 없어 돌려 보지 않음 |
| 쪽 수 | attachment `convert_to_pdf` | 이 확인에서는 돌리지 않음(도구 경로만 `document-data` 에서 읽음) |

검사 스크립트(`proposal.mjs`)는 위 `read-hwp` 결과 JSON 이나 `inspect` 결과 JSON(`observation.text`)을 그대로 받는다.
