---
name: document-data
description: Inspect CSV/TSV and XLSX, PDF, DOCX, PPTX or Hangul HWP/HWPX business data; create, fill or edit HWP/HWPX documents with their formatting preserved; merge, split, extract, rotate or fill PDF pages and forms; resize, convert or compress photos; reconcile source facts, corrections, and filters in spreadsheet reports or interactive HTML/web dashboards; verify results through existing file and browser tools.
when_to_use: "read, edit or convert XLSX·CSV·DOCX·PDF·HWP (엑셀 행·합계, 워드, 한글); 카드사에서 받은 내역 파일을 하나의 CSV로 합치기"
metadata:
  t5Hands:
    keywords: [.xlsx, .xls, .csv, .docx, .hwp, .hwpx, .pdf]
    tools: [exec, attachment, skill]
---

# Document and spreadsheet data

## When to use

Use when CSV/TSV, XLSX, PDF, DOCX, or PPTX files are business inputs, or when a report or interactive dashboard derives values from them. This procedure owns source-value reconciliation across output formats; the model interprets business rules and chooses the relevant checks. A dashboard made with the `dashboard` skill is reconciled by that skill's own checker, so this procedure is not needed for it. New editable PPTX results come from the `presentation_master` tool (bundled `ppt-master` pipeline). Use `ppt-template-fill` when assembling a new deck from reusable source slides. When the user keeps an existing deck and changes only selected content, use the selective-edit procedure below even if the source is called a template. Finished decks needing only notes, audio, timing, or transitions can use `native-enhance-pptx`.

## One-command reference ($T5_DOCUMENT_CLI)

Office, Hangul and PDF files are changed or made with their formatting kept by one "$T5_DOCUMENT_CLI" command each. JSON arguments are inline JSON, "-" (standard input: a heredoc in the same command) or a file path, including edit-xlsx and update-xlsx.
CHANGE AN EXISTING FILE in place (declare it as the local_change target; T5 keeps the previous version for Undo; --output NEW writes a copy only when the person asks for one):
- Excel: edit-xlsx --spec JSON_OR_PATH_OR_- --output FILE.xlsx with the spec {"expectedSha256":"<sha256 from inspect>","insertRows":[{"sheet":"10월","beforeRow":6,"rows":[["10월 5일","점심",12000]]}]} adds rows, in a command of its own: the rows below move down, a table, filter or total the rows fall inside (or that ended right above) takes them in, and formulas that read them, on any sheet, are recalculated by this computer's LibreOffice with their charts refreshed (recalculation.state values_pending means no engine recalculated them: their values are not known until the file is opened). "cells":[{"sheet","cell":"B4","value"}|{"sheet","cell","formula","result"}] changes chosen cells.
- Excel numbers: a rate, percentage or amount is a number value (or a formula returning a number) with a cell numberFormat such as 0.00% or #,##0 (edit-xlsx `cellStyles`, create-xlsx column `numberFormat`), never TEXT() or a typed "8.33%" string; inspect totals.numbersAsText and the result check (number_as_text) name such cells. Values keep the unit their header names (원 stays 원; a remembered "say amounts in 만원" shapes replies only, never cell values or prices written in a document), percentages are fractions (0.15 → 15%), and a total row is a formula (create-xlsx total). The result check names misses as unit_header_mismatch, rescaled_money, percent_scale, total_not_formula.
- Word: edit-docx FILE --edits '[{"appendParagraph":"text"}]' adds a paragraph at the end, formatted like the last one, with no inspect first ("after":"exact anchor text" places it after that paragraph). Also {"find":"exact text","replace":"new"}, {"label":"성명","value":"…"}, {"appendRow":["…"],"table"?:n}, {"insertImage":"cover.png","at":"start","pageBreakAfter":true} (a cover, logo or photo before/after an exact paragraph or at the start/end, sized to the text width).
- Hangul: fill-hwp FORM --values '{"성명":"…"}' fills form blanks by label; edit-hwp FILE --replacements '[{"find":"exact text","replace":"new text"}]' changes text in place (read-hwp FILE shows the text those replacements match).
- PDF: merge-pdf, pdf-pages (extract/remove/reorder), split-pdf, rotate-pdf, read-pdf-form, fill-pdf.
- Reading PDFs to summarize: one exec loops `"$T5_DOCUMENT_CLI" inspect FILE --max-pages N` over all the PDFs and prints only page text; don't read PDF text with attachment inspect (that shows a file) or osascript/swift.
- Card statements: merge-card-statements FILE... --output 카드이용내역_통합.csv merges files the person downloaded from card companies (Excel, CSV, HTML tables named .xls) into one CSV. Report rows, period and totals per file from its JSON, and every entry of unrecognized, duplicateFiles and warnings: when complete is false say which files were left out and why; never fill a file's rows yourself or guess its columns. It reads files only: it does not sign in to card sites, take a file password or handle a certificate; ask the person to download from the card company and attach the files.
- Photos (HEIC too): image IMG... --output/--output-dir [--max-width N] [--format jpg] [--quality 80] resizes, converts and compresses.
- Convert: convert FILE --to docx|csv|xlsx (HWP/HWPX to DOCX, a workbook to CSV per sheet, --bom for Excel, a CSV to XLSX). HWP/HWPX to PDF is convert_to_pdf of the attachment tool by filePath (it prints with the browser engine, which this confined terminal cannot start). ZIP: zip-list, unzip, zip (Korean Windows names included; declare the unzip folder as the target).
MAKE A NEW FILE (declare the output as the local_change target), with a finished business style applied by the tool:
- Excel: create-xlsx --spec SPEC --output X.xlsx, spec {"sheets":[{"name","title"?,"columns":[{"key","header","numberFormat"?}],"rows":[{key:value}],"total"?:true or {"label","labelColumn","columns":[keys]},"rowStyles"?:[{"row":"{next}","look":"total"}]}]}; header, number format, widths, frozen header and total styling come by default.
- Word: create-docx --spec SPEC --output X.docx, spec {"title","cover"?:{"subtitle"?,"lines"?:[...]} (a real cover page),"blocks":[{"type":"paragraph","text","style"?:"heading"|"heading2"|"bullet","size"?:pt,"align"?:"center"},{"type":"table","columns":[{"key","header"}],"rows":[{key:value}]},{"type":"image","path":"/abs/picture.png","widthCm"?,"caption"?}],"header"?:false|"text","pageNumbers"?:false}; A4, headings, table header, a title header and "page / pages" footer by default (not on the cover page).
- 한글: create-hwpx --markdown - (heredoc) --output X.hwpx. 사람이 .hwp를 지정하면 create-hwp --markdown - --output X.hwp로 진짜 HWP 5를 한 번에 만든다.
Every command returns the reopened content, which is the check, and the real output path. If a new Office file already has that name, it is made as "name (2).ext" unless --replace; there is no need to check names first.
DESIGN (no extra step): create-docx, create-xlsx and create-hwpx apply the person's shop brand (brand_kit: colors, title font, logo, contact phrases) and the look of the document kind — 보고서·제안서·견적서·안내문·회의록·공문, taken from the title or `--kind` — then check the structure and fix tables wider than the page, columns printed across pages, a blank last page and fonts a reader would not have, without slowing the command (add `--render-check` to also render every page). The result's `design.check.summary` says what was checked and `fixed`/`remaining` what changed; do not restyle or re-render it yourself. A deck or card image made earlier in this conversation passes its colors and fonts with `--design-from FILE`. `design.fonts` is the design (e.g. the card's Pretendard); the file itself names the reader's default Korean font so it never overflows elsewhere (`design.fileFonts`) — that already is "the same font": do not open the file to check fonts or rewrite them. "보기 좋게 정리해 줘"/디자인 다듬기 of an existing docx, xlsx, pptx, hwp or hwpx is one `polish FILE [--kind …] [--keep '["표1/r2c3"]']` (visible text never changes; places the person edited by hand stay as they are); `design-check FILE` only reports.

## Ordinary conversions and tables

When the user points at the files (by name, folder or attachment) and asks for a converted file or a new table or workbook from them — CSV to XLSX, a summary table of the documents in a folder, a comparison sheet, a report — read those files directly (File Reality `inspect` with the folder path reads a whole folder at once), write the result with `T5_DOCUMENT_CLI create-xlsx` (or `create-docx`) in one command, and check the values in the reopened content that command returns; a separate attachment `inspect` of the same file adds nothing. A file written inside this conversation's work folder appears as a result card on its own, so hand it over with `work_completion` in the next response; when the output is outside that folder (or continues an earlier result), register it with attachment `register_output` (the exec `outputHandle`, `sourceManifestId` null) in the same response as `work_completion`. Paths may be relative to the command's working directory. Specs, merged or intermediate data and check files you make only to build a result go under "$TMPDIR" (this run's own folder, removed when the work ends); the person's folder gets only the results they asked for. File Reality source binding, `evidence_graph` and `document_work` are for the evidence-backed route below; a plain conversion or summary table does not need them. The source-value checks in "Verify source-derived results" still apply to the values you write.

The creators apply a finished business style by default, so the spec carries content, not decoration: XLSX gets a filled bold header, thousands separators on large whole numbers, columns widened to their content, a frozen header row with filters, and with `"total": true` (or `{"label":"합계","columns":["amount"]}`) a bold total row whose SUM formulas carry exact results; DOCX gets an A4 page, a title, real heading styles (`style: "heading"`/`"heading2"`), bullets (`style: "bullet"`), and tables with a shaded header repeated on each page and right-aligned numbers.

## Hangul (HWP/HWPX) documents

`"$T5_DOCUMENT_CLI"` binds the bundled kordoc engine; run an action with `--help` for its exact contract.

- 본문 없이 형식만 정한 새 문서 요청은 짧은 기본 내용으로 바로 만들고, 예시라는 말은 파일 밖 답에 둔다. 표 요청에는 머리칸과 예시 자료 행을 넣고, 확인되지 않은 사람·금액·계약 사실은 지어내지 않는다.
- 새 문서: 제목·본문·목록·표를 마크다운으로 적고 같은 명령의 heredoc으로 `create-hwpx --markdown - --output NAME.hwpx`를 실행한다. 사람이 .hwp를 지정하면 `create-hwp --markdown - --output NAME.hwp`를 쓴다. HWP 5 구조 엔진이 내용 손실 0을 확인한 진짜 HWP 5를 만들므로 HWPX의 확장자만 바꾸지 않는다. `--preset 기안문|보고서|계획서|통지|회의록|개조식` applies the official-document layout when the user asks for a 공문서 form.
- Form blanks (신청서·서약서·명부): `fill-hwp FORM --values '{"label":"value"}'` fills by the label next to each blank, in place unless `--output` is given. A label that appears in several blanks (신청인·대표자 성명) is not filled with one value: it comes back in `rejected` with `occurrences`; give an array in blank order or a longer label. Check `stillEmpty` and `missingAfterReopen` before calling the form done. An HWPX keeps every style; an HWP 5 form comes back as a new HWPX with the same content (`formattingPreserved: false`) — tell the user. `unmatched` and `formLabels` show which labels exist.
- Text corrections: `edit-hwp FILE --replacements '[{"find":"exact current text","replace":"new text"}]'` changes paragraph, heading and table-cell text in place with styles untouched. `find` must match the `read-hwp` (or File Reality inspect) text exactly once, or add `"all": true`. When an edit cannot be applied with formatting preserved, nothing is written and `skipped` says why; offer a new HWPX made from the edited text instead of forcing it.
- 있는 한글 파일은 `edit-hwp`·`fill-hwp` 로만 고친다 — 바뀐 항목만 고치고, 한글X 는 바뀐 구역의 줄 배치 캐시(linesegarray)를 지워 한글이 다시 배치한다. 압축을 풀어 XML 을 직접 고치지 않는다. 쪽 그림으로 확인하지 못한 한글 결과는 `machine_unmeasured` 이니 「그림으로는 확인하지 못했다」고 말한다.
- Declare the output (or edited) file as the `local_change` target so the change can be undone, and report the reopened text the result returns rather than the command's exit alone.

## PDF pages and forms, photos

The same CLI binds the bundled pdf-lib and sharp engines; each common request is one command (`--help` gives the contract):

- Join: `merge-pdf A.pdf B.pdf --output 합본.pdf` (given order). Extract, remove, reorder: `pdf-pages FILE --pages "1-3,5,8-" --output OUT.pdf` keeps exactly the listed pages in that order — to remove pages, list the ones to keep. Split: `split-pdf FILE --output-dir DIR [--ranges "1-3;4-"]`. Rotate: `rotate-pdf FILE --degrees 90 [--pages "2,4"]`.
- Forms: `read-pdf-form FILE` lists fillable fields; `fill-pdf FILE --values '{"field":"value"}'`. Korean values are stored for the viewer to draw (`appearance: viewer_regenerates`); `--flatten` works only for values the standard PDF fonts can draw and otherwise writes nothing. `fieldCount: 0` means the blanks are printed text, not form fields.
- Photos: `image IMG... --output OUT.jpg | --output-dir DIR [--max-width N] [--format jpg|png|webp] [--quality 80]` fits inside the box without enlarging, turns photos upright, removes location/camera metadata unless `--keep-metadata`, and decodes HEIC on macOS.
- Without `--output` a PDF is rewritten in place; declare the written file as the `local_change` target so it can be undone. Encrypted PDFs are reported, not opened.

## Word edits, conversions and ZIP

- A change to an existing file the person names ("이 계약서 고쳐 줘") is made in that file itself — run the edit without `--output` and declare the file as the `local_change` target; T5 keeps the previous version for Undo. Write a separate copy only when they ask for one.
- Existing Word file: `edit-docx FILE --edits '[...]'` keeps every style, header, image and table byte-exact outside the changed text. Items (applied in order): `{"find":"exact paragraph text","replace":"new"}` (may cross bold/italic runs; add `"all":true` for every occurrence), `{"label":"성명","value":"홍길동"}` fills the empty cell right of a label cell or the `label: ____` blank, `{"appendParagraph":"text"}` adds it at the end of the document formatted like the last paragraph (or `"after":"anchor text"` to place it), `{"appendRow":["a","b"],"table":2,"afterRow":4}` (a new item goes above a total row: give `afterRow`, then change the total with a find/replace in the same edits). `{"insertImage":"PATH","at":"start","pageBreakAfter":true}` puts a picture in its own paragraph (`before`/`after` an exact paragraph text, or `at` start/end; full text width unless `widthCm`) — a cover, logo, photo or signature, including an image the `media` tool just made; the result reports the picture's size and the reopened picture count. A person's "n번째 문단" is the paragraph whose inspect `bodyNumber` is n (title, `headerLine` lines and headings are not counted); each applied replace names its `paragraph`, so check it is the one asked for and quote its first line in the answer. For find, label or after anchors read the current text with `inspect FILE` or File Reality `inspect` first; an append at the end needs no inspect, and the result returns the reopened text. `--help` is not needed. When any item does not match exactly once nothing is written and `skipped` says why. Do not rebuild an existing DOCX with `create-docx` or python-docx.
- Conversions are one command: `convert FILE --to pdf|docx` for HWP/HWPX (text, headings, tables, lists, bold and images carried; the result's `fidelity.notKept` lists what the Hangul layout loses — tell the user when layout matters), `convert BOOK.xlsx --to csv [--sheet NAME] [--bom]` (one CSV per sheet; `--bom` when the person opens it in Excel), `convert DATA.csv --to xlsx` (Korean CP949 CSV is read; phone numbers and leading zeros stay text). Office files to PDF go through attachment `convert_to_pdf`.
- ZIP on disk: `zip-list A.zip`, `unzip A.zip [--output-dir DIR]` (Korean Windows names come out right; unsafe archives and name clashes write nothing), `zip FILES_OR_FOLDERS... --output B.zip`.
- Declare the written file or folder as the `local_change` target.

## Evidence-backed results from personal files

For a request that finds several personal files and builds an evidence-backed editable XLSX, use the Personal File Intelligence route when it is available: find candidates with `file_intelligence`, re-observe and bind the exact originals with File Reality, keep the current Work Spec, connect observed source facts and calculations through `evidence_graph`, create and review with `document_work`, then register the qualified result. A candidate hit is not a source. The general `T5_DOCUMENT_CLI create-xlsx` route below remains useful for ordinary workbook authoring, but its successful file write is not the PFI source/graph/page-review receipt and must not be reported as a completed PFI result. If a dedicated step is unavailable, preserve any draft and say exactly which qualification or delivery remains.

For candidate search, draft and confirm the current `work_spec` first; include the selected root and keep non-blocking unknowns visible. After File Reality has **bound exact sources**, the shorter verified path is `document_work` action `prepare_xlsx` with that `sourceManifestId` and a model-authored `authoringPlan` JSON string. Give each source fact its manifest `sourceIndex`, exact `Sheet!Cell` locator, observed literal value and claim ID; name any `sum` or ordered `subtract` inputs, preserve each bound unknown exactly, and map every claim to an output sheet/cell. Preparation checks the actual cells and builds the current Work Spec and source→fact→transformation→claim graph without producing a file. Its returned `graphId` and `claims` feed `document_work` action `create_xlsx`; inspect every rendered page, then register and select the same qualified output SHA. The `work_spec` proposal/patch, `evidence_graph` nodes/edges and `document_work` authoringPlan/spec/claims use JSON **strings** on the provider wire; direct graph revision remains available when the shorter plan cannot express the user's calculation. A verified source summary from `integral_method` is not the requested workbook: when its result says the artifact is pending, continue authoring and registering before answering.

## Selectively edit an existing presentation

Start from a separate copy of the exact current deck and use an available Office or format-aware file-editing route that preserves its existing package. A slide-cloning or whole-deck generation route is suitable only if it actually preserves the user's required structure; a similar rendering alone does not establish preservation.

Identify the requested slide/object changes and their linked chart data, embedded workbook, labels and notes. Keep the slide roster/order, hidden flags, masters, layouts, logos, relationships and non-target notes unchanged. Apply unit corrections consistently across the requested representations. Reopen the result and compare protected parts and the reachable relationships against the source before delivering it.

For graph-only Undo, restore that graph and its linked data/units from the prior version into the current deck. Keep unrelated table corrections and the user's newer notes. If the chosen route drops notes, rebuilds protected slides or cannot preserve current edits, retain the source and switch to another suitable route. A missing optional validation program can be replaced by available native rendering and direct structure/content checks covering the same required properties; report what was actually checked.

## Observe sources

1. Locate only the files relevant to the request. Do not sweep unrelated folders.
2. Inspect selected office sources with `"$T5_DOCUMENT_CLI" inspect "ABSOLUTE_PATH"`. For CSV/TSV, use attachment `inspect` for the decoded text and table, retaining empty fields and original tokens. Use the available row, cell, or page bounds when the default projection is too broad.
3. Read the returned projection limits. If cells or pages were omitted, narrow the source or deliberately inspect with a sufficient bound; never claim unseen rows or pages were checked.
4. Trace important values to the exact source version and locations: spreadsheet cells/ranges, CSV records and columns or stable record keys, and PDF pages. Read source notes that define identities, units, exclusions, and update precedence before aggregating.

## Interpret without inventing

- Treat merged headings, hidden rows and sheets, cell number formats, formulas, and cached formula results as different facts.
- A cached formula result is not proof that the formula is logically correct. Reconcile representative calculations against their source cells.
- Do not silently combine different currencies, tax inclusion rules, quantities, units, customer identities, or periods.
- Mark conflicts and missing values explicitly. Preserve the distinction between known values (including zero), empty fields, and unknown or invalid numeric tokens; do not infer missing amounts as zero. Keep unresolved facts visible when the work can proceed, and ask only when a missing discriminator prevents the requested decision.
- A PDF with `requiresOcrOrVision: true` has no extractable text in the observed pages. Stop unless an available authorized OCR or visual method can actually read it.

## Create or revise an XLSX result

A new row in an existing sheet (an item added to a list, a table or above its total) is one call without `--help`: `edit-xlsx --spec ABSOLUTE_SPEC_JSON --output FILE` whose spec (a heredoc in the same command) is `{"expectedSha256":"<from inspect>","insertRows":[{"sheet":"…","beforeRow":<row the new rows go above>,"rows":[["10월 5일","점심",12000]]}]}`. The rows below move down; a table, filter or total range the rows fall inside, or that ended right above, takes them in; formulas that read the changed cells (on any sheet) are recalculated by the computer's LibreOffice and the charts drawing them refreshed, and the reopened workbook comes back. When `recalculation.state` is `values_pending` (no Office engine), those stored results were removed and are computed when the file is opened: report the inserted row and say the totals update on opening, without stating total values. A sheet with conditional formatting, data validation, shared formulas, a table totals row or a merge across the insertion row is refused with the reason and nothing changes.

기존 통합문서의 선택 셀이나 차트 데이터를 고칠 때는 현재 파일을 관측하고 `"$T5_DOCUMENT_CLI" edit-xlsx --help`에서 원래 명세를 확인한다. 이 작업은 관측한 SHA와 선택한 셀·차트를 결속한다. `update-xlsx`는 공급한 시트를 통째로 바꿔 빠진 행과 차트도 지운다. 아래 단계는 새 통합문서를 만들 때 쓴다.

Keep the user-facing summary and main table narrow. For a sheet wider than about eight columns, render it once and revise a layout that splits columns across pages or shrinks text until it cannot be read; fitting a page to one sheet is a printing aid, not a visual-quality verdict.

1. Keep every original file unchanged and choose a new absolute `.xlsx` output path.
2. Write a JSON specification containing one or more sheets. Each sheet uses `name`, optional `title`, `columns`, `rows`, optional `total`, and optional `formulas`. Put a total in `total` rather than as a data row, so it is styled and computed as a total.
3. Every formula entry requires `cell`, `formula`, and an independently computed `result`; the creator refuses result-less formulas because the writer does not evaluate formulas.
4. Run `"$T5_DOCUMENT_CLI" create-xlsx --spec "ABSOLUTE_SPEC_JSON" --output "ABSOLUTE_OUTPUT_XLSX"`. Existing output is not overwritten unless the current user explicitly requested replacement and `--replace` is used.
   Charts: `create-xlsx` writes none. Add native charts right after with one `edit-xlsx` call (`expectedSha256` from the create result, `addCharts`); `"$T5_DOCUMENT_CLI" create-xlsx --help` shows the chart shape and an example under `charts`, so the app source never needs reading.
5. 끝 조건: 등록 결과의 `deliverable.verdict` 가 `machine_pass`(오피스로 다시 계산한 뒤 수식 오류 0)여야 끝이다. `formula_error` 가 있으면 그 칸을 고쳐 다시 만들고 다시 확인한다. `recalculation` 이 못 잰 칸이면 값을 확정했다고 말하지 않는다.

Minimal specification shape:

```json
{
  "sheets": [{
    "name": "Monthly totals",
    "title": "Monthly totals",
    "columns": [
      {"key": "item", "header": "Item", "width": 24},
      {"key": "amount", "header": "Amount", "width": 14, "numberFormat": "#,##0"}
    ],
    "rows": [{"item": "Example", "amount": 1000}],
    "total": {"label": "합계", "columns": ["amount"]}
  }]
}
```

## Verify source-derived results

1. Re-open the actual result with the current file tool. For an interactive HTML/dashboard result, use the existing browser tools on the running result and its real controls; a static render cannot exercise scripts, filters, or file input. Use `visual-deliverables` for readability and layout.
2. Derive expected values and states from the sources before comparing the result. Confirm included/excluded records, identities, units, corrections, formulas and cached results, and observation completeness. A clean command exit proves only the observed operation.
3. Choose source-backed filter cases that distinguish the data states actually present for the requested measures: known nonzero values, known zero, unresolved-only values, mixed known/unresolved values, and no matching records. Select relevant combinations from the source records and business rules, rather than testing only a populated or convenient combination. If there are no filters, apply the same comparison to the report's actual groups.
4. Exercise those selected cases through the requested interface. Reconcile the displayed summary, detailed rows, chart values/labels, and uncertainty state with the same included source records. A matching grand total does not verify every filtered state. Keep the source version, selected conditions, observed results, and untested scope tied to the available tool evidence.
5. After a correction or source replacement, recheck the affected cases on the final version. When refresh or upload is required, exercise the actual input and its failure path; compare the displayed source/update state so a failed refresh does not present old data as current.
6. Report what was reconciled and what remains unresolved or untested. Required unobserved sources, calculations, interface behavior, or rendering remain incomplete; do not turn preparation or source inspection into execution evidence.

## Create a DOCX result

Headings and table colors follow the T5 default color system; pass `colors` for user or brand colors.

1. Keep source files unchanged and write a bounded JSON spec with `title` and ordered `blocks` (paragraphs with optional `heading`/`heading2`/`bullet` style, and tables with real rows and columns). A cover page (표지) is `cover` (`true`, or `{"subtitle":…,"lines":[…]}` with source-backed lines): the title then stands alone on page 1 and the blocks start on page 2. Without `cover` the title is only a heading above the body. `pageBreakBefore: true` starts a paragraph on a new page.
2. Run `"$T5_DOCUMENT_CLI" create-docx --spec "ABSOLUTE_SPEC_JSON" --output "ABSOLUTE_OUTPUT_DOCX"` (a heredoc writing the spec and the command go in one exec).
3. The creator writes a fixed, readable A4 business layout and immediately reopens the text and table structure; check the content there, and `pages.firstPage` for what page 1 holds.
4. A page render (attachment `inspect` of the output path) is worth its time only for a layout-sensitive document — a table wider than about six columns, or a form the person will print or submit. Otherwise register, select and complete in one response.
5. 판정 셋: 등록 결과의 `deliverable.verdict` 가 `machine_findings`·`machine_unmeasured` 면 고쳐 다시 등록해 다시 잰다. 기계 통과여도 쪽이 있는 결과는 `visual_review_required` — 같은 결과에 붙은 쪽 그림을 보고 넘침·겹침·잘림만 고쳐 다시 그린다(두 번까지). 눈으로 본 그 판(`observed_pass`)이 아니면 「눈으로 확인했다」고 말하지 않는다.

## Create an editable PPTX result

Bind the exact user sources with File Reality `bind_sources`, then call the `presentation_master` tool (find it with `tool_search` for PowerPoint, PPTX, 발표자료) with the returned `manifestId`, the user's requested slide count, template, design, images, charts, tables, notes, and export requirements. The tool runs the bundled `ppt-master` pipeline, verifies the deck, and registers the final PPTX as the Artifact. View `ppt-master` only for route selection or to explain a reported boundary; do not run its scripts through `exec`, and do not create a second lower-quality PPTX through `T5_DOCUMENT_CLI` or replace the PPTX with HTML, SVG, PNG, or PDF.


## Package accepted results for delivery

Reuse the exact latest accepted files. Keep authoritative originals and user edits intact; prepare any audience-specific cleanup in separate delivery copies. If the user excludes internal notes, inspect every delivered format that can carry those notes, including editable Office copies. Removing notes from a sharing PDF alone does not remove them from an editable file in the same delivered ZIP. Preserve non-target slide content, charts, formulas, hidden flags and other user work.

Use an archive writer that records Unicode paths portably. Reopen the final ZIP with a standard reader and compare decoded filenames and extracted file bytes against the intended delivery folder; a successful command exit or extraction by the same native tool is insufficient when names can be misdecoded elsewhere. If only packaging is wrong, reuse the verified inner files and repair the package instead of regenerating documents or PDFs. Check that included editable files reopen and sharing PDFs remain readable.
