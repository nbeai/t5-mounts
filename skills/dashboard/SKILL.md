---
name: dashboard
description: Build or revise a business dashboard, status board or tracking screen from XLSX/CSV for non-developers. Profile once, write a JSON spec, then use the bundled builder and checker for an offline, mobile-ready HTML dashboard with actions, filters, KPIs and ECharts.
when_to_use: "dashboard·현황판·charts from a spreadsheet/CSV; self-contained"
metadata:
  t5Ability:
    does: 엑셀·CSV 자료로 인터넷 없이 열리는 HTML 대시보드(오늘 할 일·핵심 숫자·차트·필터)를 만들고 휴대폰·PC 화면을 점검한다
    needs: 엑셀 또는 CSV 자료
    cannot: 실시간은 아니다(원본이 바뀌면 열 때 새 판으로)
  t5Refresh:
    marker: t5-dashboard
    module: scripts/t5-refresh.mjs
---

# Dashboard

원본을 보존하고 기준 시각이 있는 대시보드를 만듭니다. 이 절차를 한 번 읽고 약 여섯 단계로 끝냅니다. The profile and checker verify source values and phone/PC renders; `document-data` and `visual-deliverables` are not needed alongside it.

## 1. Profile (one exec)

```
node "$T5_DASHBOARD_DIR/scripts/profile-data.mjs" "/abs/source.xlsx"
```
(Use the runtime Node from the terminal execution environment if `node` is not on PATH. `--sheet NAME`, `--header-row N` when needed.) It returns columns with types, exact duplicate rows, repeated keys, blanks, zeros, values of low-cardinality columns (statuses, owners), date ranges and sums with/without duplicates. Blank is not zero.

## 2. Ask only what the data cannot answer

If the user stated the rules (status groups, what counts as late, filters), ask nothing and build. Otherwise ask at most one short message about what the profile cannot show — usually what "late" or "done" means and who uses it — or build with clearly stated assumptions. Open-ended or unusual requests: read `references/design.md`.

## 3. Write the spec and build (one exec)

Write the spec under "$TMPDIR"; only the dashboard goes in the person's folder. Use a file tool or quoted heredoc (`cat > "$TMPDIR/spec.json" <<'JSON'`) to preserve literal `$today`/`$now`. Put absolute paths in the JSON, then:
```
node "$T5_DASHBOARD_DIR/scripts/build-dashboard.mjs" "$TMPDIR/spec.json" --output "/abs/대시보드.html"
```
It reads the source, removes duplicates as specified, evaluates flags at `asOf`, embeds exact rows, inlines pinned ECharts and Pretendard, and prints the computed counts, KPI values, blanks and warnings. 오류는 지정된 필드를 고칩니다. 새 판은 새 파일명, 같은 초안은 `--replace`를 씁니다.

```json
{
  "title": "영업 문의 — 오늘 할 일",
  "source": { "path": "/abs/sales.xlsx" },
  "asOf": "2026-09-25T09:00:00+09:00",
  "dedupe": { "mode": "exact" },
  "flags": [
    { "name": "진행중", "when": { "in": ["상태", ["신규", "연락중"]] } },
    { "name": "지연", "when": { "all": [ { "flag": "진행중" }, { "any": [
      { "lt": ["다음연락일", "$today"] },
      { "all": [ { "blank": "다음연락일" }, { "lt": ["접수일시", { "nowHours": -24 }] } ] } ] } ] } }
  ],
  "item": { "title": "고객사", "meta": ["문의번호", "상태", "담당자", "다음연락일"], "note": "메모" },
  "filters": [ { "column": "담당자", "blankLabel": "미배정" }, { "column": "상태", "order": ["신규", "연락중"] } ],
  "search": ["고객사", "메모"],
  "kpis": [
    { "label": "지연", "where": "지연", "tone": "alert" },
    { "label": "진행 중 예상금액", "sum": "예상금액(원)", "where": "진행중" },
    { "label": "전체 문의" }
  ],
  "lists": [ { "title": "지금 연락해야 할 문의", "where": "지연", "badge": "지연", "tone": "alert", "sort": [["다음연락일", "asc"]] } ],
  "charts": [ { "type": "bar", "title": "진행 중 상태", "groupBy": "상태", "where": "진행중" } ],
  "table": { "title": "진행 중 전체", "where": "진행중", "columns": ["고객사", "상태", "담당자", "예상금액(원)"] }
}
```

- Columns are referenced by their exact header text from the profile.
- `dedupe`: `exact` (default, drops fully identical rows), `key` with `"key": ["문의번호"]` and `"keep": "first"|"last"` (reports conflicting rows), or `none`.
- Conditions (one operator per object): `all`, `any`, `not`, `flag`, `blank`, `present`, `in`, `notIn`, `contains`, `eq`/`ne`/`lt`/`le`/`gt`/`ge` as `[column, value]`. Values: a literal, `"$today"`, `"$now"`, `{"today": days}`, `{"nowHours": hours}`, `{"column": name}`. Dates compare by day when either side is a date.
- A rule this cannot express: compute it yourself into a JSON array `[{"sourceRow": 2, "새열": ...}]` and add `"extraColumns": "file.json"`.
- `kpis`: lead with the action counts (overdue, today, open). When the source has an amount column, also show the open amount (`sum` with the open `where`), so its unknown-amount count is visible. The header always shows the deduplicated total, so a total KPI is optional.
- `kpis` fields: count (optionally `where`) or `sum` of a number column; money columns show 만/억 with the exact value and the blank count ("금액 미정 N건"). `tone`: `alert`, `warn`.
- `lists`: action lists shown first (`limit` default 30). Put overdue/today lists here for operating boards.
- `charts`: `bar`, `stackedBar` (`stackBy`), `line` (date `groupBy`, `bucket`: day/week/month), `donut` (≤6 groups). Optional `sum`, `where`, `order` (a list of values in display order, or `"asc"`/`"desc"`: number and date groups such as 월 go by their own value — 1월→12월 — and text groups by the chart value, `"desc"` = largest first; without `order`, number and date groups keep their own order and text groups go by row count). Choose by the question: compare categories → bar; composition by owner/team → stackedBar; change over time → line; share of few parts → donut.
- Filters apply to every KPI, list, chart and table. `columns: {"열": {"type": "number|date|datetime|text", "label": "보이는 이름", "format": "won"}}` overrides inference. `timezone` defaults to Asia/Seoul; omit `asOf` to use the build time.

Colors: the builder applies the T5 default color system. For user or brand colors, or a better-fitting preset from `${CLAUDE_SKILL_DIR}/../color-system/data/presets.json`, add `"colors": {"accent": "#RRGGBB", …}` (roles bg, surface, text, muted, line, accent, onAccent, series) — given roles win.

## 4. Check (one exec)

```
node "$T5_DASHBOARD_DIR/scripts/check-dashboard.mjs" "/abs/대시보드.html" --spec "$TMPDIR/spec.json"
```
It renders in the real T5 preview policy at 390px and 1440px and reports errors, network attempts, overflow, contrast, empty charts, fonts, and whether every filter option shows the KPI/list/table/chart values, chart totals and chart order re-derived from the embedded rows; with `--spec` it also re-reads the source file and compares row count and number-column sums (`source`). `ok: true` with no problems is the pass. Its report and the registration `deliverable` facts are the whole check. Fix the spec once for a reported problem and rebuild; do not loop.

## 5. Deliver

Register the checked HTML with attachment `register_output`, with `derivedFromPaths` set to the source file and the spec, so a later "update it" rebuilds from the same inputs (the same spec file, unchanged, with `--as-of now` or a stated time and a new output name when only the time moves); a rebuild of an earlier dashboard passes that dashboard's attachmentId to become its next version. If a source was read from a signed-in website, also pass `refreshRequest` (one line asking T5 to read it again) so the panel can refresh it. In the answer, state the key numbers from the build output, the as-of time, duplicates removed and blanks kept as unknown, and any assumption. Table cells the user corrects in T5's panel: see `references/edits.md`. Write edits into the source (`edit-xlsx`, with a backup) only when the user asks, then rebuild a new version. For a daily refresh or alert, create an `automation` job whose prompt reruns build and check on the source.

### 현재 결과판의 확인
사용자 목적과 현재 편집판/선택 레퍼런스의 원리를 필요한 범위만 적용한다. 이미 읽은 방법을 다시 열거나 국소 수정에 전체 조사를 반복하지 않는다. 기존 제작·내용·렌더 검사의 이름/범위/근거를 전달할 attachment/family/판/SHA와 결속한다(프로젝트·렌더판이 있으면 함께). 같은 바이트의 유효 검수는 재사용하고, 바뀐 부분은 확인을 갱신한다. 모델의 체크리스트·일반 파일 등록·기계 검사·사람의 품질 평가는 서로 대신하지 않는다. 원본과 승인된 부분은 보존하며 확인하지 못한 범위는 미측정으로 남긴다.
